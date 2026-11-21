/**
 * The RAG menu of a project row (src/index.ts) and what it reads (src/lib/rag.ts).
 *
 * Against a temporary workspace tree (a sites folder with two projects and the index builder, a server
 * folder in rag/, the rag settings, a record of one built index) and a stand-in Milvus that answers the
 * REST calls the menu makes. The dashboard is a stand-in too: the api a plugin is handed, recording what
 * the plugin registers.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { AddressInfo } from 'net';

import { ago, captionOf, createRag, IndexState, register, sessionName } from '../src/index';
import { collectionName, hostPort, Milvus, readRecord, readSettings, restBase } from '../src/lib/rag';

const HOUR = 3600 * 1000;
const NOW = Date.parse('2026-11-21T12:00:00Z');

// ---- the stand-in Milvus ----------------------------------------------------------------------

const collections = new Map<string, number>();
const calls: { path: string; body: any; auth?: string }[] = [];
const milvusServer = http.createServer((req, res) => {
  let data = '';
  req.on('data', (c) => { data += c; });
  req.on('end', () => {
    const body = data ? JSON.parse(data) : {};
    calls.push({ path: String(req.url), body, auth: req.headers.authorization });
    const ok = (d: unknown) => res.end(JSON.stringify({ code: 0, data: d }));
    switch (req.url) {
      case '/v2/vectordb/collections/list': return ok([...collections.keys()]);
      case '/v2/vectordb/collections/describe':
        if (!collections.has(body.collectionName)) return res.end(JSON.stringify({ code: 100, message: 'collection not found' }));
        return ok({ collectionName: body.collectionName, fields: [{ name: 'id' }, { name: 'path' }, { name: 'text' }, { name: 'sparse' }], functions: [{ name: 'text_bm25' }] });
      case '/v2/vectordb/collections/get_stats': return ok({ rowCount: collections.get(body.collectionName) || 0 });
      case '/v2/vectordb/entities/search':
        if (body.data[0] === 'nothing at all') return ok([]);
        return ok([{ distance: 12.2, path: 'recipes/default/config/queue.yml', start_line: 1, end_line: 25, text: 'recipes/default/config/queue.yml\nid: featured\nlabel: <b>Featured</b>' }]);
      case '/v2/vectordb/collections/drop': collections.delete(body.collectionName); return ok({});
      default: res.statusCode = 404; return res.end('{}');
    }
  });
});
let MILVUS = '';
const DOWN = 'http://127.0.0.1:1';

// ---- the tree ---------------------------------------------------------------------------------

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rag-menu-'));
const config = path.join(root, 'core', 'config');
const SETTINGS = (extra = '') => `doc:\n  name: rag\n\nmilvus:\n  # the default server\n  project: "srv1"\n  grpc_port: 19530\n${extra}\nrag:\n  collection_prefix: ws\n  embedding: bm25\ntype: sites\n`;

function writeRecord(project: string, builtAt: number, extra: Record<string, unknown> = {}) {
  const f = path.join(root, 'rag', '.indexes', 'dev', `${project}.json`);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify({ workspace: 'dev', project, collection: `ws_dev_${project.replace(/-/g, '_')}`, server: 'srv1', scope: 'contrib', retrieval: 'bm25', appended: false, built: new Date(builtAt).toISOString(), ...extra }));
}

before(async () => {
  fs.mkdirSync(config, { recursive: true });
  fs.writeFileSync(path.join(config, 'workspace.rag.settings.yml'), SETTINGS());
  for (const p of ['site-one', 'plain']) fs.mkdirSync(path.join(root, 'dev', p), { recursive: true });
  fs.writeFileSync(path.join(root, 'dev', 'cmd-tools-ragify.sh'), '#!/usr/bin/env bash\n');
  fs.mkdirSync(path.join(root, 'modules', 'm1'), { recursive: true });
  fs.mkdirSync(path.join(root, 'rag', 'srv1', '.ddev'), { recursive: true });
  fs.writeFileSync(path.join(root, 'rag', 'srv1', '.ddev', 'docker-compose.milvus.yaml'), 'services:\n  milvus-standalone:\n    ports:\n      - "19590:19530"\n');
  fs.writeFileSync(path.join(root, 'rag', 'cmd-tools-ragify.sh'), '#!/usr/bin/env bash\n');
  await new Promise<void>((resolve) => milvusServer.listen(0, '127.0.0.1', () => resolve()));
  MILVUS = `http://127.0.0.1:${(milvusServer.address() as AddressInfo).port}`;
});

after(() => {
  milvusServer.close();
  fs.rmSync(root, { recursive: true, force: true });
});

function reset() {
  collections.clear();
  collections.set('ws_dev_site_one', 75);
  calls.length = 0;
  fs.rmSync(path.join(root, 'rag', '.indexes'), { recursive: true, force: true });
  writeRecord('site-one', NOW - 2 * HOUR);
  fs.writeFileSync(path.join(config, 'workspace.rag.settings.yml'), SETTINGS());
}

// ---- the stand-in dashboard -------------------------------------------------------------------

const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function dashboard(opts: { lazy?: boolean; sessions?: string[]; base?: string } = {}) {
  const menus: Record<string, { spec: any; fn: (ctx: any) => any }> = {};
  const actions: Record<string, (ctx: any) => any> = {};
  const fragments: ((ctx: any) => any)[] = [];
  const contexts: string[] = [];
  const started: any[] = [];
  const api: any = {
    name: 'rag', config: {},
    capabilities: new Set(opts.lazy === false ? [] : ['row-menu-body']),
    appliesTo: () => true,
    lib: {
      esc, ROOT: root, CONFIG_DIR: config,
      workspaceDir: (k: string) => path.join(root, k),
      isValidWorkspace: (k: string) => ['dev', 'modules', 'rag'].includes(k),
      listProjects: (dir: string) => fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith('.')).map((e) => e.name),
      NAME_RE: /^[a-zA-Z0-9_-]+$/,
      findScript: (dir: string, patterns: RegExp[]) => { const f = fs.readdirSync(dir).find((n) => patterns.some((p) => p.test(n))); return f ? path.join(dir, f) : null; },
      humanTime: (d: Date) => d.toISOString(),
      wsUrl: (k: string) => `/${k}`,
      tildePath: (p: string) => p.replace(root, '~/workspace'),
      typeAllows: (_k: string, a: string) => a === 'ragify',
      screensCached: () => (opts.sessions || []).map((session) => ({ session })),
      startInScreen: async (o: any) => { started.push(o); return { ok: true, session: sessionName(o.workspace, o.project, o.verb) }; },
      screenStartedHtml: (r: any, label: string, project: string) => `<div class="msg">${label} started on ${project}${r.watch ? ' (watched)' : ''}</div>`,
    },
    addRowMenu: (slot: string, spec: any, fn: any) => { menus[slot] = { spec, fn }; },
    addFragment: (fn: any) => fragments.push(fn),
    addAction: (name: string, fn: any) => { actions[name] = fn; },
    addAssistantContext: (fn: () => string) => contexts.push(fn()),
  };
  const rag = createRag(api, { base: () => opts.base || MILVUS, now: () => NOW });
  const vals = (extra = '') => `hx-vals='{"workspace":"dev","projectName":"x"${extra}}'`;
  const row = (key: string, project: string, allowed = ['ragify']) => menus.rag.fn({ key, project, dir: path.join(root, key), meta: {}, allowed: new Set(allowed), vals });
  const fragment = async (rest: string) => {
    let out = { status: 0, html: '' };
    await fragments[0]({ rest, req: {}, res: {}, searchParams: new URLSearchParams(), send: (html: string, status = 200) => { out = { status, html }; } });
    return out;
  };
  const act = async (name: string, form: Record<string, string>, workspace = 'dev') => {
    let out = { status: 0, html: '' };
    const headers: Record<string, string> = {};
    await actions[name]({ form, workspace, pathname: `/actions/p/rag/${name}`, res: { setHeader: (k: string, v: string) => { headers[k] = v; } }, send: (html: string, status = 200) => { out = { status, html }; } });
    return { ...out, headers };
  };
  return { api, rag, menus, actions, contexts, started, row, fragment, act };
}

// ---- what the row says -----------------------------------------------------------------------

test('the caption says built and when, or none; the server wins over the record once it has answered', () => {
  assert.strictEqual(ago(new Date(NOW - 20 * 1000).toISOString(), NOW), 'just now');
  assert.strictEqual(ago(new Date(NOW - 5 * 60 * 1000).toISOString(), NOW), '5 min ago');
  assert.strictEqual(ago(new Date(NOW - 2 * HOUR).toISOString(), NOW), '2 h ago');
  assert.strictEqual(ago(new Date(NOW - 3 * 24 * HOUR).toISOString(), NOW), '3 d ago');
  assert.strictEqual(ago(new Date(NOW - 90 * 24 * HOUR).toISOString(), NOW), 'on 2026-08-23');
  const rec = { workspace: 'dev', project: 'p', collection: 'ws_dev_p', server: 's', built: new Date(NOW - 2 * HOUR).toISOString() };
  const base: IndexState = { workspace: 'dev', project: 'p', server: 's', collection: 'ws_dev_p', record: rec, up: null, built: null, busy: false };
  assert.strictEqual(captionOf(base, NOW), 'built 2 h ago', 'not asked yet: the record speaks');
  assert.strictEqual(captionOf({ ...base, up: false }, NOW), 'built 2 h ago', 'server down: the index is still in its volume');
  assert.strictEqual(captionOf({ ...base, up: true, built: false }, NOW), 'none', 'the server has no such collection');
  assert.strictEqual(captionOf({ ...base, record: null, up: true, built: true }, NOW), 'built', 'built outside the builder: no when');
  assert.strictEqual(captionOf({ ...base, record: null }, NOW), 'none');
  assert.strictEqual(captionOf({ ...base, busy: true }, NOW), 'building…');
});

test("a build's screen session has the name the dashboard gives it", () => {
  assert.strictEqual(sessionName('dev', 'site-one'), 'dev--site-one--ragify');
  assert.strictEqual(sessionName('dev', 'My Site'), 'dev--my-site--ragify');
  const long = sessionName('site-templates', 'a-very-long-project-name-that-goes-on-and-on-and-on');
  assert.ok(long.length <= 60 && long.startsWith('site-templates--a-very-long-') && long.endsWith('--ragify'), long);
});

test('the rag settings, the collection name, the port and the address are read the way the commands read them', () => {
  reset();
  assert.deepStrictEqual(readSettings(config), { server: 'srv1', prefix: 'ws', token: '' });
  fs.writeFileSync(path.join(config, 'workspace.rag.settings.yml'), SETTINGS('  authorization: true\n  token: root:Milvus  # changed after the first start'));
  assert.strictEqual(readSettings(config).token, 'root:Milvus', 'the token, when authorization is on');
  fs.writeFileSync(path.join(config, 'workspace.rag.settings.yml'), SETTINGS('  authorization: true\n  token: CHANGE_ME'));
  assert.strictEqual(readSettings(config).token, '', 'a placeholder is no token');
  assert.deepStrictEqual(readSettings(path.join(root, 'nowhere')), { server: 'milvus', prefix: 'ws', token: '' }, 'no settings: the defaults');
  assert.strictEqual(collectionName('ws', 'site-templates', 'my.site'), 'ws_site_templates_my_site');
  assert.strictEqual(hostPort(root, 'srv1'), 19590, 'the port the build published');
  assert.strictEqual(hostPort(root, 'gone'), 19530);
  assert.strictEqual(restBase(root, 'srv1', false), 'http://127.0.0.1:19590', 'from the machine: the published port');
  assert.strictEqual(restBase(root, 'srv1', true), 'http://ddev-srv1-milvus-standalone:19530', 'from the container: the server by name');
  fs.writeFileSync(path.join(root, 'rag', '.indexes', 'dev', 'broken.json'), '{not json');
  assert.strictEqual(readRecord(root, 'dev', 'broken'), null);
  reset();
});

test('the menu is on the rows of the folders the builder is in, and never on the servers of rag/', () => {
  reset();
  const d = dashboard();
  assert.deepStrictEqual(d.menus.rag.spec, { label: 'RAG', row: 1 });
  assert.strictEqual(d.row('rag', 'srv1'), null, 'a server is not a project to index');
  assert.strictEqual(d.row('modules', 'm1'), null, 'a folder without cmd-tools-ragify.sh');
  assert.strictEqual(d.row('dev', 'site-one', ['build']), null, 'a type that does not index');
});

test('a row carries the button and the caption; the menu body is asked for when it opens', () => {
  reset();
  const d = dashboard();
  const answer = d.row('dev', 'site-one');
  assert.strictEqual(answer.caption, 'built 2 h ago');
  assert.strictEqual(answer.body, '/fragments/p/rag/menu/dev/site-one');
  assert.match(answer.html, /^<button class="uk-button uk-button-default uk-button-small" type="button" aria-haspopup="true" aria-label="RAG index: built 2 h ago"/);
  assert.match(answer.html, / RAG <span uk-icon="icon: chevron-down/);
  assert.strictEqual(d.row('dev', 'plain').caption, 'none');
  // A dashboard that cannot load a body when the menu opens gets the whole menu, as before.
  const inline = dashboard({ lazy: false }).row('dev', 'site-one');
  assert.match(inline, /^<span class="act-with-status"><div class="uk-inline act-menu act-menu-rag">/);
  assert.match(inline, /<div uk-dropdown="mode: click; pos: bottom-right"><ul class="uk-nav uk-dropdown-nav">/);
  assert.match(inline, /<span class="act-status uk-text-meta">built 2 h ago<\/span><\/span>$/);
});

test('opened on a built index: rebuild, search, describe, the RAG workspace, and remove behind the confirm dialog', async () => {
  reset();
  const d = dashboard();
  const { status, html } = await d.fragment('menu/dev/site-one');
  assert.strictEqual(status, 200);
  assert.match(html, /<li class="uk-nav-header" data-group="index">Built 2 h ago · 75 passages<\/li>/);
  assert.match(html, /<li data-entry="build the index"><a href hx-post="\/actions\/p\/rag\/ragify" hx-vals='\{&quot;workspace&quot;:&quot;dev&quot;,&quot;projectName&quot;:&quot;site-one&quot;}' hx-target="#webship-workspace-output" hx-swap="innerHTML" [^>]*>.* Rebuild the index<\/a><\/li>/);
  assert.match(html, /<li data-entry="search the index"><a href hx-get="\/fragments\/p\/rag\/search\/dev\/site-one" hx-target="#editor-modal-body" hx-swap="innerHTML">.* Search the index…<\/a><\/li>/);
  assert.match(html, /<li data-entry="describe the index"><a href hx-get="\/fragments\/p\/rag\/describe\/dev\/site-one" hx-target="#editor-modal-body"/);
  assert.match(html, /<li class="uk-nav-header" data-group="server">srv1 · running<\/li>/);
  assert.match(html, /<li data-entry="open the rag workspace"><a href="\/rag">.* Open the RAG workspace<\/a><\/li>/);
  const remove = /<li data-entry="remove the index">(.*?)<\/li>/.exec(html);
  assert.ok(remove, 'remove is offered');
  assert.match(remove![1], /class="uk-text-danger arm-step" title="Remove the RAG index of site-one" hx-post="\/actions\/p\/rag\/remove"/);
  assert.match(remove![1], /&quot;projectName&quot;:&quot;site-one&quot;,"confirm":"yes"}'/, 'it posts the confirmation the dialog gave');
  assert.match(remove![1], /hx-trigger="confirmed-remove"/, 'only after the confirm dialog');
  for (const icon of html.match(/<span uk-icon="[^"]+"[^>]*>/g) || []) assert.match(icon, /aria-hidden="true"/, 'icons are not read out');
});

test('opened on a project with no index: build it, and the RAG workspace; nothing to search, describe or remove', async () => {
  reset();
  const { html } = await dashboard().fragment('menu/dev/plain');
  assert.match(html, /data-group="index">No index yet</);
  assert.match(html, /hx-post="\/actions\/p\/rag\/ragify"[^>]*>.* Build the index</);
  for (const entry of ['search the index', 'describe the index', 'remove the index']) assert.ok(!html.includes(`data-entry="${entry}"`), `no ${entry}`);
});

test('with the server down the menu says so, sends you to start it, and offers nothing that would fail', async () => {
  reset();
  const d = dashboard({ base: DOWN });
  assert.strictEqual(d.row('dev', 'site-one').caption, 'built 2 h ago', 'the record still speaks for the index');
  const { html } = await d.fragment('menu/dev/site-one');
  assert.match(html, /data-group="server">srv1 · not running</);
  assert.match(html, /<a href class="uk-disabled uk-text-meta" aria-disabled="true" tabindex="-1">.* Rebuild the index once the server runs<\/a>/, 'disabled, and it looks it and says why');
  assert.match(html, /<a href="\/rag">.* Start it in the RAG workspace<\/a>/);
  for (const entry of ['search the index', 'describe the index', 'remove the index']) assert.ok(!html.includes(`data-entry="${entry}"`), `no ${entry}`);
  const r = await d.act('ragify', { projectName: 'site-one' });
  assert.strictEqual(r.status, 409);
  assert.match(r.html, /srv1 RAG server is not running/);
  assert.strictEqual(d.started.length, 0, 'nothing was started');
});

test('a record of an index the server no longer has is dropped once the server says so', async () => {
  reset();
  collections.clear();
  const d = dashboard();
  const { html } = await d.fragment('menu/dev/site-one');
  assert.match(html, /No index yet/);
  assert.strictEqual(readRecord(root, 'dev', 'site-one'), null, 'the stale record is gone');
  assert.strictEqual(d.row('dev', 'site-one').caption, 'none', 'and the row says none');
});

test('while the build runs, the row says so and the menu leads to its screen session', async () => {
  reset();
  const d = dashboard({ sessions: ['dev--site-one--ragify'] });
  assert.strictEqual(d.row('dev', 'site-one').caption, 'building…');
  const { html } = await d.fragment('menu/dev/site-one');
  assert.match(html, /data-group="index">Building the index…</);
  assert.match(html, /<a href="\/screens\?session=dev--site-one--ragify">.* Follow the build in Screens<\/a>/);
  assert.ok(!html.includes('data-entry="remove the index"'), 'no remove while it builds');
  const r = await d.act('remove', { projectName: 'site-one', confirm: 'yes' });
  assert.strictEqual(r.status, 409);
});

test('build runs cmd-tools-ragify.sh in a screen session on the project, and the lists are asked again when it is done', async () => {
  reset();
  const d = dashboard();
  const r = await d.act('ragify', { projectName: 'site-one' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.html, '<div class="msg">ragify started on site-one (watched)</div>');
  assert.strictEqual(d.started.length, 1);
  const s = d.started[0];
  assert.strictEqual(s.cmdLine, `bash '${path.join(root, 'dev', 'cmd-tools-ragify.sh')}' 'site-one'`, 'single-quoted words: nothing a shell would expand');
  assert.deepStrictEqual([s.workspace, s.project, s.verb, s.projectDir, s.ownerDir], ['dev', 'site-one', 'ragify', path.join(root, 'dev'), path.join(root, 'dev', 'site-one')]);
  assert.strictEqual((await d.act('ragify', { projectName: 'nope' })).status, 400, 'an unknown project');
  assert.strictEqual((await d.act('ragify', { projectName: 'm1' }, 'modules')).status, 400, 'a folder with no builder');
});

test('search answers with the passages, escaped, each with its file and lines; or says nothing matched', async () => {
  reset();
  const d = dashboard();
  const r = await d.act('search', { projectName: 'site-one', query: 'featured queue' });
  assert.match(r.html, /1 passage for <strong>featured queue<\/strong>, best first\./);
  assert.match(r.html, /<code>recipes\/default\/config\/queue\.yml<\/code> <span class="uk-text-meta">lines 1–25<\/span>/);
  assert.match(r.html, /id: featured\nlabel: &lt;b&gt;Featured&lt;\/b&gt;/, 'the passage without its path line, escaped');
  const sent = calls.find((c) => c.path === '/v2/vectordb/entities/search');
  assert.deepStrictEqual(sent!.body, { collectionName: 'ws_dev_site_one', data: ['featured queue'], annsField: 'sparse', limit: 8, outputFields: ['path', 'start_line', 'end_line', 'text'] });
  assert.match((await d.act('search', { projectName: 'site-one', query: 'nothing at all' })).html, /Nothing in the index of site-one matches/);
  assert.match((await d.act('search', { projectName: 'site-one', query: '  ' })).html, /Type what you are looking for first/);
});

test('the dialogs: a search form a keyboard and a screen reader can use, and a description of the index', async () => {
  reset();
  const d = dashboard();
  const search = (await d.fragment('search/dev/site-one')).html;
  assert.match(search, /<h3 class="uk-modal-title">Search the index of site-one<\/h3>/, 'the heading names the dialog');
  assert.match(search, /<form class="rag-search-form" hx-post="\/actions\/p\/rag\/search" hx-target="#rag-search-results"[^>]*role="search" aria-label="Search the index of site-one">/);
  assert.match(search, /<label class="uk-form-label" for="rag-search-query">/);
  assert.match(search, /<input id="rag-search-query" class="uk-input" type="search" name="query" required/);
  assert.match(search, /<div id="rag-search-results" class="uk-margin-top" role="status" aria-live="polite">/, 'the answer is announced');
  assert.match(search, /uk-width-1-1 uk-width-expand@s/, 'the field and the button stack on a phone');
  const describe = (await d.fragment('describe/dev/site-one')).html;
  assert.match(describe, /<h3 class="uk-modal-title">The index of site-one<\/h3>/);
  assert.match(describe, /<dt class="uk-text-meta">Collection<\/dt><dd class="uk-margin-remove-left uk-margin-small-bottom" style="overflow-wrap:anywhere"><code>ws_dev_site_one<\/code><\/dd>/);
  assert.match(describe, /<dt class="uk-text-meta">Server<\/dt><dd class="uk-margin-remove-left uk-margin-small-bottom" style="overflow-wrap:anywhere">srv1 · running/);
  assert.match(describe, /<dt class="uk-text-meta">Built<\/dt><dd class="uk-margin-remove-left uk-margin-small-bottom" style="overflow-wrap:anywhere">2026-11-21T10:00:00\.000Z \(2 h ago\), scope <code>contrib<\/code><\/dd>/);
  assert.match(describe, /<dt class="uk-text-meta">Passages<\/dt><dd class="uk-margin-remove-left uk-margin-small-bottom" style="overflow-wrap:anywhere">75<\/dd>/);
  assert.match(describe, /<dt class="uk-text-meta">Fields<\/dt><dd class="uk-margin-remove-left uk-margin-small-bottom" style="overflow-wrap:anywhere"><code>id, path, text, sparse<\/code><\/dd>/);
  assert.match(describe, /cd ~\/workspace\/dev &amp;&amp; bash cmd-tools-ragify\.sh site-one/);
  const none = (await d.fragment('describe/dev/plain')).html;
  assert.match(none, /There is no index of plain on the srv1 server yet/);
  assert.strictEqual((await d.fragment('menu/dev/nope')).status, 404);
  assert.strictEqual((await d.fragment('menu/../site-one')).status, 404);
});

test('remove asks for the confirmation, drops the collection and the record, and refreshes the lists', async () => {
  reset();
  const d = dashboard();
  assert.strictEqual((await d.act('remove', { projectName: 'site-one' })).status, 400, 'no confirmation, no removal');
  assert.ok(collections.has('ws_dev_site_one'));
  const r = await d.act('remove', { projectName: 'site-one', confirm: 'yes' });
  assert.strictEqual(r.status, 200);
  assert.match(r.html, /Removed the index of <strong>site-one<\/strong>/);
  assert.strictEqual(r.headers['HX-Trigger'], 'refresh-projects');
  assert.ok(!collections.has('ws_dev_site_one'), 'the collection is dropped');
  assert.strictEqual(readRecord(root, 'dev', 'site-one'), null, 'and the record');
  assert.match((await d.act('remove', { projectName: 'site-one', confirm: 'yes' })).html, /There was no index of <strong>site-one<\/strong>/, "Milvus's drop says yes to a name it does not have: checked first");
  assert.strictEqual((await dashboard({ base: DOWN }).act('remove', { projectName: 'site-one', confirm: 'yes' })).status, 409);
});

test('a server with authentication on is asked with its token', async () => {
  reset();
  fs.writeFileSync(path.join(config, 'workspace.rag.settings.yml'), SETTINGS('  authorization: true\n  token: root:Milvus'));
  await dashboard().fragment('menu/dev/site-one');
  assert.ok(calls.length > 0 && calls.every((c) => c.auth === 'Bearer root:Milvus'));
  reset();
});

test("a server's collections are asked once for a whole page, and again after a few seconds", async () => {
  reset();
  const m = new Milvus({ base: () => MILVUS, token: () => '', ttlMs: 5000 });
  const [a, b] = await Promise.all([m.collections('srv1'), m.collections('srv1')]);
  assert.strictEqual(a, b);
  await m.collections('srv1');
  assert.strictEqual(calls.filter((c) => c.path === '/v2/vectordb/collections/list').length, 1, 'one request for three askings');
  m.invalidate('srv1');
  await m.collections('srv1');
  assert.strictEqual(calls.filter((c) => c.path === '/v2/vectordb/collections/list').length, 2, 'asked again once forgotten');
});

test('register() adds the RAG menu, its dialogs and actions, and the assistant context', () => {
  const d = dashboard();
  const seen: string[] = [];
  const api = { ...d.api, addRowMenu: (slot: string) => seen.push(`menu:${slot}`), addFragment: () => seen.push('fragment'), addAction: (n: string) => seen.push(`action:${n}`), addAssistantContext: (fn: () => string) => seen.push(`context:${/RAG menu on a project row/.test(fn())}`) };
  register(api);
  assert.deepStrictEqual(seen, ['menu:rag', 'fragment', 'action:ragify', 'action:search', 'action:remove', 'context:true']);
});
