/**
 * The RAG workspace for Webship Workspace: the `rag/` folder as a plugin, and the RAG menu of every
 * project row.
 *
 * What the package carries is placed by the installer from the manifest (the folder's settings file,
 * its commands, its docs and its AI items, each in the folder of its kind; the index builder
 * cmd-tools-ragify.sh in every sites and code folder, and its function file) and listed by --activate;
 * the dashboard draws the workspace from the settings file like any other.
 *
 * At run time the plugin draws the RAG menu on the rows of the folders the builder lands in: the state of
 * the project's index under the button (built, and when, or none), and in the menu Build or Rebuild (in a
 * screen session), Search (a small form in the dialog), Describe, Remove (after the confirm dialog) and a
 * way to the RAG workspace. Everything is asked of the dashboard through `api`, and of Milvus over its REST
 * API (src/lib/rag.ts).
 */

import crypto from 'crypto';
import path from 'path';
import type { ActionContext, FragmentContext, PluginApi, RowContext } from '@webship.co/workspace-plugin-api';
import { IndexRecord, Milvus, RagSettings, collectionName, readRecord, readSettings, removeRecord, restBase, serverFor } from './lib/rag';

export const WORKSPACE_KEY = 'rag';

/** The AI items the installer places, each in the workspace folder of its kind (ai/ in this package). */
export const AGENTS = ['rag-index-keeper'];
export const SKILLS = ['rag-workflow'];
export const AI_COMMANDS = ['rag-search'];
export const PROMPTS = ['rag-start-and-search'];

/** What the RAG menu knows about one project's index when it is drawn. */
export interface IndexState {
  workspace: string;
  project: string;
  server: string;
  collection: string;
  /** What the index builder recorded when it built the index: rag/.indexes/<workspace>/<project>.json. */
  record: IndexRecord | null;
  /** Whether the server answers; null when it has not been asked yet. */
  up: boolean | null;
  /** Whether the collection is in the server; null when that is not known. */
  built: boolean | null;
  /** How many passages the index holds, when the server said. */
  chunks?: number | null;
  /** Whether the project's build is running now, in its screen session. */
  busy: boolean;
}

/** How long ago, in a few characters: what the caption under the button has room for. */
export function ago(iso: string, now = Date.now()): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const s = Math.max(0, Math.floor((now - t) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  if (d < 60) return `${d} d ago`;
  return `on ${new Date(t).toISOString().slice(0, 10)}`;
}

/**
 * The caption under the RAG button. What the server says wins; until it has been asked, or while it is
 * not running, the builder's record speaks for the index (the collection stays in the server's volume).
 */
export function captionOf(s: IndexState, now = Date.now()): string {
  if (s.busy) return 'building…';
  const built = s.up === true ? s.built === true : !!s.record;
  if (!built) return 'none';
  return s.record ? `built ${ago(s.record.built, now)}` : 'built';
}

/** The screen session the build of a project runs in: the name the dashboard gives it (screenSessionName in jobs.js). */
export function sessionName(workspace: string, project: string, verb = 'ragify'): string {
  const clean = (s: string) => String(s || '').toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/-{3,}/g, '--').replace(/^-+|-+$/g, '');
  const name = clean([workspace, project, verb].filter(Boolean).join('--'));
  if (name.length <= 60) return name;
  const hash = crypto.createHash('sha1').update(name).digest('hex').slice(0, 6);
  const ws = clean(workspace);
  const vb = clean(verb);
  const room = 60 - (ws ? ws.length + 2 : 0) - (vb ? vb.length + 2 : 0) - 7;
  if (room >= 4) return [ws, `${clean(project).slice(0, room).replace(/[-.]+$/, '')}-${hash}`, vb].filter(Boolean).join('--');
  return `${name.slice(0, 53).replace(/[-.]+$/, '')}-${hash}`;
}

/** A word in single quotes, for a shell line: JSON's double quotes still expand $ and backticks. */
const shq = (s: string) => `'${String(s).replace(/'/g, `'\\''`)}'`;

/** What the plugin can be handed in place of the real thing, for its tests. */
export interface RagDeps {
  /** Where a server's REST API answers. */
  base?: (server: string) => string;
  now?: () => number;
}

export function register(api: PluginApi): void {
  createRag(api);
}

/** Everything register() sets up, with what the tests replace. */
export function createRag(api: PluginApi, deps: RagDeps = {}) {
  const lib = api.lib as any;
  const { esc, ROOT, CONFIG_DIR, workspaceDir, isValidWorkspace, listProjects, NAME_RE, startInScreen, screenStartedHtml, findScript, humanTime, wsUrl } = lib;
  const now = deps.now || (() => Date.now());
  const tilde = (p: string) => (typeof lib.tildePath === 'function' ? lib.tildePath(p) : p);
  const post = (name: string) => `/actions/p/${api.name}/${name}`;
  const fragment = (rest: string) => `/fragments/p/${api.name}/${rest}`;
  const findRagifyScript = (dir: string): string | null => findScript(dir, [/^cmd-tools?-ragify\.sh$/]);

  // The settings are read for every row of a page: kept for two seconds, like the dashboard's own.
  let settingsCache: { at: number; value: RagSettings } | null = null;
  const settings = (): RagSettings => {
    if (!settingsCache || now() - settingsCache.at > 2000) settingsCache = { at: now(), value: readSettings(CONFIG_DIR) };
    return settingsCache.value;
  };
  const milvus = new Milvus({ base: deps.base || ((server) => restBase(ROOT, server)), token: () => settings().token });

  /** Whether a row gets the menu: a folder the builder is in, a type that indexes, and never the servers' own folder. */
  const applies = (key: string, dir: string, allowed: Set<string>) => key !== WORKSPACE_KEY
    && (typeof api.appliesTo !== 'function' || api.appliesTo(key))
    && allowed.has('ragify') && !!findRagifyScript(dir);

  const busy = (key: string, project: string): boolean => {
    if (typeof lib.screensCached !== 'function') return false;
    const name = sessionName(key, project);
    try { return (lib.screensCached() || []).some((s: any) => s && s.session === name); } catch (_) { return false; }
  };

  /** What is known right now, without waiting: the record, and the last thing the server said. */
  function stateNow(key: string, project: string): IndexState {
    const s = settings();
    const server = serverFor(ROOT, s, key, project);
    const collection = collectionName(s.prefix, key, project);
    const seen = milvus.peek(server);
    // Asked in the background when the last answer is old, so the next drawing of the row has it.
    if (milvus.stale(server)) milvus.collections(server).catch(() => { /* a server that does not answer is down */ });
    return {
      workspace: key, project, server, collection, record: readRecord(ROOT, key, project),
      up: seen ? seen.up : null, built: seen && seen.up ? seen.list.includes(collection) : null, busy: busy(key, project),
    };
  }

  /** The state as the server says it now, for a menu being opened or a dialog. */
  async function stateFresh(key: string, project: string, withChunks = false): Promise<IndexState> {
    const s = stateNow(key, project);
    const answer = await milvus.collections(s.server);
    s.up = answer.up;
    s.built = answer.up ? answer.list.includes(s.collection) : null;
    // A record of an index the server no longer has (dropped from Attu or the command line, or the server
    // rebuilt) would keep saying "built": the server is the truth, so it goes.
    if (answer.up && !s.built && s.record) { removeRecord(ROOT, key, project); s.record = null; }
    if (withChunks && s.built) {
      const d = await milvus.describe(s.server, s.collection);
      s.chunks = d ? d.chunks : null;
    }
    return s;
  }

  const rowVals = (key: string, project: string) => (extra = '') => `hx-vals='${esc(JSON.stringify({ workspace: key, projectName: project }).slice(0, -1))}${extra}}' hx-target="#webship-workspace-output" hx-swap="innerHTML"`;
  const icon = (name: string) => `<span uk-icon="icon: ${name}; ratio: .7" aria-hidden="true"></span>`;
  const modalLink = (rest: string) => `hx-get="${esc(fragment(rest))}" hx-target="#editor-modal-body" hx-swap="innerHTML"`;
  const where = (key: string, project: string) => `${encodeURIComponent(key)}/${encodeURIComponent(project)}`;

  /** The button that opens the menu: its name says the state too, for a screen reader. */
  function buttonHtml(s: IndexState, caption: string): string {
    const when = s.record ? ` (${humanTime(new Date(s.record.built))})` : '';
    return `<button class="uk-button uk-button-default uk-button-small" type="button" aria-haspopup="true" aria-label="RAG index: ${esc(caption)}"`
      + ` title="${esc(`The RAG index of ${s.project} on the ${s.server} server: ${caption}${when}`)}">${icon('database')} RAG <span uk-icon="icon: chevron-down; ratio: .6" aria-hidden="true"></span></button>`;
  }

  /** The menu's items for one project, as it stands. */
  function menuBody(s: IndexState, vals: (extra?: string) => string): string {
    const items: string[] = [];
    const known = s.up === true;
    const built = known ? s.built === true : !!s.record;
    const state = s.busy ? 'Building the index…'
      : built ? [s.record ? `Built ${ago(s.record.built, now())}` : 'Built', s.chunks != null ? `${s.chunks} passages` : ''].filter(Boolean).join(' · ')
        : 'No index yet';
    items.push(`<li class="uk-nav-header" data-group="index">${esc(state)}</li>`);
    if (s.busy) {
      items.push(`<li data-entry="build the index"><a href="/screens?session=${encodeURIComponent(sessionName(s.workspace, s.project))}">${icon('laptop')} Follow the build in Screens</a></li>`);
    } else if (s.up === false) {
      // Said in the item itself: a disabled item gets no hover, so a title would never be read.
      items.push(`<li data-entry="build the index"><a href class="uk-disabled uk-text-meta" aria-disabled="true" tabindex="-1">${icon('play')} ${built ? 'Rebuild the index' : 'Build the index'} once the server runs</a></li>`);
    } else {
      items.push(`<li data-entry="build the index"><a href hx-post="${post('ragify')}" ${vals()} title="Runs cmd-tools-ragify.sh in a screen session">${icon(built ? 'refresh' : 'play')} ${built ? 'Rebuild the index' : 'Build the index'}</a></li>`);
    }
    if (known && s.built) {
      items.push(`<li data-entry="search the index"><a href ${modalLink(`search/${where(s.workspace, s.project)}`)}>${icon('search')} Search the index…</a></li>`);
      items.push(`<li data-entry="describe the index"><a href ${modalLink(`describe/${where(s.workspace, s.project)}`)}>${icon('info')} Describe the index</a></li>`);
    }
    items.push('<li class="uk-nav-divider"></li>');
    items.push(`<li class="uk-nav-header" data-group="server">${esc(s.server)} · ${s.up === true ? 'running' : s.up === false ? 'not running' : 'not asked yet'}</li>`);
    items.push(`<li data-entry="open the rag workspace"><a href="${esc(wsUrl(WORKSPACE_KEY))}">${icon('server')} ${s.up === false ? 'Start it in the RAG workspace' : 'Open the RAG workspace'}</a></li>`);
    if (known && s.built && !s.busy) {
      items.push('<li class="uk-nav-divider"></li>');
      items.push(`<li data-entry="remove the index"><a href class="uk-text-danger arm-step" title="${esc(`Remove the RAG index of ${s.project}`)}" hx-post="${post('remove')}" ${vals(',"confirm":"yes"')} hx-trigger="confirmed-remove">${icon('trash')} Remove the index</a></li>`);
    }
    return `<ul class="uk-nav uk-dropdown-nav">${items.join('')}</ul>`;
  }

  // A dashboard since 1.0.0-rc2 fetches a row menu's body when the menu opens (`row-menu-body`): the page
  // carries the button and the caption, and the body is asked of the server then. An older dashboard gets
  // the whole menu inline, from what is known when the row is drawn.
  const lazy = !!(api.capabilities && api.capabilities.has('row-menu-body'));

  api.addRowMenu('rag', { label: 'RAG', row: 1 }, ({ key, project, dir, allowed, vals }: RowContext) => {
    if (!applies(key, dir, allowed)) return null;
    const s = stateNow(key, project);
    const caption = captionOf(s, now());
    if (lazy) return { html: buttonHtml(s, caption), body: fragment(`menu/${where(key, project)}`), caption };
    return `<span class="act-with-status"><div class="uk-inline act-menu act-menu-rag">
      ${buttonHtml(s, caption)}
      <div uk-dropdown="mode: click; pos: bottom-right">${menuBody(s, vals)}</div>
    </div><span class="act-status uk-text-meta">${esc(caption)}</span></span>`;
  });

  /** A project of a folder the menu is drawn in, or null. */
  function projectOf(ws: string, project: string): string | null {
    if (!isValidWorkspace(ws) || !NAME_RE.test(project)) return null;
    const dir = workspaceDir(ws);
    if (!listProjects(dir).includes(project)) return null;
    return dir;
  }

  const closeButton = '<button type="button" class="uk-button uk-button-default uk-modal-close">Close</button>';
  const retrievalText = (r: string | undefined) => (r === 'openai'
    ? 'BM25 and OpenAI embeddings together: the chunks were sent to the OpenAI API when it was built'
    : 'BM25: matched by words inside Milvus, with no model and nothing sent off this machine');

  /** The dialog that searches the index. */
  function searchDialog(s: IndexState): string {
    return `<h3 class="uk-modal-title">Search the index of ${esc(s.project)}</h3>
    <p class="uk-text-meta"><code>${esc(s.collection)}</code> on ${esc(s.server)}${s.record ? `, built ${esc(humanTime(new Date(s.record.built)))}` : ''}. Matched by words (BM25), on this machine.</p>
    <form class="rag-search-form" hx-post="${post('search')}" hx-target="#rag-search-results" hx-swap="innerHTML" hx-vals='${esc(JSON.stringify({ workspace: s.workspace, projectName: s.project }))}' role="search" aria-label="Search the index of ${esc(s.project)}">
      <label class="uk-form-label" for="rag-search-query">What are you looking for?</label>
      <div class="uk-grid-small uk-flex-middle uk-margin-small-top" uk-grid>
        <div class="uk-width-1-1 uk-width-expand@s"><input id="rag-search-query" class="uk-input" type="search" name="query" required maxlength="500" autocomplete="off" placeholder="where is the front page configured"></div>
        <div class="uk-width-1-1 uk-width-auto@s"><button class="uk-button uk-button-primary uk-width-1-1" type="submit">${icon('search')} Search</button></div>
      </div>
    </form>
    <div id="rag-search-results" class="uk-margin-top" role="status" aria-live="polite"><p class="uk-text-meta">The passages that match come back here, best first, each with its file and lines.</p></div>
    <div class="uk-margin-top uk-text-right">${closeButton}</div>`;
  }

  /** The dialog that describes the index. */
  function describeDialog(s: IndexState, d: { chunks: number | null; fields: string[]; functions: string[] } | null): string {
    const dir = workspaceDir(s.workspace);
    const rows: [string, string][] = [
      ['Collection', `<code>${esc(s.collection)}</code>`],
      ['Server', `${esc(s.server)} · running · <a href="${esc(wsUrl(WORKSPACE_KEY))}">the RAG workspace</a>`],
      ['Built', s.record ? `${esc(humanTime(new Date(s.record.built)))} (${esc(ago(s.record.built, now()))})${s.record.scope ? `, scope <code>${esc(s.record.scope)}</code>` : ''}${s.record.appended ? ', added to the index before it' : ''}` : 'outside the RAG menu: there is no record of when'],
      ['Passages', d && d.chunks != null ? `${d.chunks}` : 'not known'],
      ['Retrieval', esc(retrievalText(s.record ? s.record.retrieval : undefined))],
      ['Fields', d ? `<code>${esc(d.fields.join(', '))}</code>` : 'not known'],
      ['Rebuild it by hand', `<code>cd ${esc(tilde(dir))} &amp;&amp; bash cmd-tools-ragify.sh ${esc(s.project)}</code>`],
    ];
    return `<h3 class="uk-modal-title">The index of ${esc(s.project)}</h3>
    <dl class="rag-index-facts">${rows.map(([k, v]) => `<dt class="uk-text-meta">${esc(k)}</dt><dd class="uk-margin-remove-left uk-margin-small-bottom" style="overflow-wrap:anywhere">${v}</dd>`).join('')}</dl>
    <div class="uk-margin-top uk-flex uk-flex-wrap uk-flex-right" style="gap:.5rem">
      <button type="button" class="uk-button uk-button-primary" ${modalLink(`search/${where(s.workspace, s.project)}`)}>${icon('search')} Search the index</button>
      ${closeButton}
    </div>`;
  }

  /** What a dialog says when the index cannot be read right now. */
  const notReadable = (s: IndexState) => `<h3 class="uk-modal-title">The index of ${esc(s.project)}</h3>
    <p>${s.up === false ? `The ${esc(s.server)} server is not running. Start it in the <a href="${esc(wsUrl(WORKSPACE_KEY))}">RAG workspace</a>, then open this again.` : `There is no index of ${esc(s.project)} on the ${esc(s.server)} server yet: build it from the RAG menu of its row.`}</p>
    <div class="uk-margin-top uk-text-right">${closeButton}</div>`;

  api.addFragment(async ({ send, rest }: FragmentContext) => {
    const m = /^(menu|search|describe)\/([a-z0-9_-]+)\/([a-zA-Z0-9_-]+)$/.exec(rest);
    const dir = m ? projectOf(m[2], m[3]) : null;
    if (!m || !dir) return send('<ul class="uk-nav uk-dropdown-nav"><li class="uk-nav-header">No such project.</li></ul>', 404);
    const [, what, key, project] = m;
    const s = await stateFresh(key, project, what !== 'search');
    if (what === 'menu') return send(menuBody(s, rowVals(key, project)));
    if (!(s.up && s.built)) return send(notReadable(s));
    if (what === 'search') return send(searchDialog(s));
    return send(describeDialog(s, await milvus.describe(s.server, s.collection)));
  });

  // ---- Actions ----------------------------------------------------------------------------------

  /** The project an action names, or the refusal it was answered with. */
  function target({ form, send, workspace }: ActionContext): { dir: string; project: string } | null {
    const project = String(form.projectName || '');
    const dir = projectOf(String(workspace || ''), project);
    if (!dir) { send('<div class="msg error">Unknown project.</div>', 400); return null; }
    return { dir, project };
  }

  api.addAction('ragify', async (ctx: ActionContext) => {
    const t = target(ctx);
    if (!t) return;
    const { send, workspace } = ctx;
    const script = findRagifyScript(t.dir);
    const allowed = typeof lib.typeAllows !== 'function' || lib.typeAllows(workspace, 'ragify');
    if (!script || !allowed) return send('<div class="msg error">This folder has no index builder (cmd-tools-ragify.sh).</div>', 400);
    const s = await stateFresh(workspace, t.project);
    if (!s.up) return send(`<div class="msg error">The ${esc(s.server)} RAG server is not running: start it in the <a href="${esc(wsUrl(WORKSPACE_KEY))}">RAG workspace</a> first.</div>`, 409);
    milvus.invalidate(s.server);
    // A screen session, like every command of the dashboard: the notice links to it, and the lists are
    // asked again once it is done (watch), so the caption says "built just now" without a reload.
    const started = await startInScreen({ workspace, project: t.project, projectDir: t.dir, ownerDir: path.join(t.dir, t.project), verb: 'ragify',
      cmdLine: `bash ${shq(script)} ${shq(t.project)}`, label: 'ragify' });
    return send(screenStartedHtml({ ...started, watch: true }, 'ragify', t.project), started.ok ? 200 : (started.already ? 409 : 500));
  });

  api.addAction('search', async (ctx: ActionContext) => {
    const t = target(ctx);
    if (!t) return;
    const { form, send, workspace } = ctx;
    const query = String(form.query || '').trim().slice(0, 500);
    if (!query) return send('<p class="uk-text-meta">Type what you are looking for first.</p>');
    const s = stateNow(workspace, t.project);
    const found = await milvus.search(s.server, s.collection, query, 8);
    if (!found.ok) return send(`<div class="msg error">The ${esc(s.server)} server did not answer the search${found.message ? `: ${esc(found.message)}` : ''}.</div>`);
    if (!found.hits.length) return send(`<p>Nothing in the index of ${esc(t.project)} matches <strong>${esc(query)}</strong>. Try the words the project itself would use.</p>`);
    const cards = found.hits.map((h, i) => `<article class="uk-card uk-card-default uk-card-small uk-card-body uk-margin-small" aria-label="Passage ${i + 1} of ${found.hits.length}">
        <h4 class="uk-h5 uk-margin-remove" style="overflow-wrap:anywhere"><code>${esc(h.path)}</code> <span class="uk-text-meta">lines ${esc(String(h.start))}–${esc(String(h.end))}</span></h4>
        <pre class="uk-margin-small-top" style="white-space:pre-wrap;overflow-wrap:anywhere;max-height:16rem;overflow:auto"><code>${esc(h.text.split('\n').slice(0, 24).join('\n'))}</code></pre>
      </article>`).join('');
    return send(`<p class="uk-text-meta">${found.hits.length} passage${found.hits.length === 1 ? '' : 's'} for <strong>${esc(query)}</strong>, best first.</p>${cards}`);
  });

  api.addAction('remove', async (ctx: ActionContext) => {
    const { form, send, workspace, res } = ctx;
    if (form.confirm !== 'yes') return send('<div class="msg error">Removing the index asks for confirmation.</div>', 400);
    const t = target(ctx);
    if (!t) return;
    const s = stateNow(workspace, t.project);
    if (s.busy) return send('<div class="msg error">The index is being built: remove it once the build is done.</div>', 409);
    const done = await milvus.drop(s.server, s.collection);
    if (done === 'down') return send(`<div class="msg error">The ${esc(s.server)} server did not answer: nothing was removed.</div>`, 409);
    removeRecord(ROOT, workspace, t.project);
    (res as any).setHeader('HX-Trigger', 'refresh-projects');
    return send(done === 'missing'
      ? `<div class="msg assistant">There was no index of <strong>${esc(t.project)}</strong> on ${esc(s.server)} to remove.</div>`
      : `<div class="msg assistant">Removed the index of <strong>${esc(t.project)}</strong> (<code>${esc(s.collection)}</code>). The project is untouched; build the index again from the RAG menu.</div>`);
  });

  api.addAssistantContext(() => `The rag/ workspace is the RAG workspace (a plugin, @webship.co/workspace-rag); its commands are the cmd-*.sh scripts in that folder. A project is indexed from its own workspace folder with cmd-tools-ragify.sh <project> (the plugin places it in every sites and code folder; --query asks the index), and each build leaves a record in rag/.indexes/<workspace>/<project>.json. The RAG menu on a project row shows whether the project has an index and when it was built, and builds or rebuilds it (in a screen session), searches it, describes it, removes it, or opens the RAG workspace. It comes with AI items for work in this folder: the agent \`rag-index-keeper\` (ai-agents/), the skill \`rag-workflow\` (ai-skills/), the command \`/rag-search\` (ai-commands/) and the prompt \`rag-start-and-search\` (ai-prompts/).`);

  return { milvus, stateNow, stateFresh, menuBody, captionOf };
}
