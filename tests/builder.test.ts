/**
 * The index builder this plugin places in every sites and code folder (commands/cmd-tools-ragify.sh)
 * and the function file it leans on (scripts/functions/fun-rag-builder.sh).
 *
 * The builder is the core's: it takes the core's argument file and calls the core's ragify_project and
 * ragify_query_project (core/scripts/functions/fun-ragify.sh of github.com/webship/workspace). What the
 * plugin adds, and what is run here in bash, is the scope a build leaves out when the graph plugin is
 * not installed, and the record of each index it built.
 */
import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';

// Compiled, this test runs from dist/tests, so the package root is one folder further up.
const PKG = fs.existsSync(path.join(__dirname, '..', 'package.json')) ? path.join(__dirname, '..') : path.join(__dirname, '..', '..');
const read = (f: string) => fs.readFileSync(path.join(PKG, f), 'utf8');
const manifest = JSON.parse(read('package.json')).workspacePlugin;
const BUILDER = 'commands/cmd-tools-ragify.sh';
const FUNCTIONS = 'scripts/functions/fun-rag-builder.sh';

/** Run a bash snippet with the plugin's function file sourced after the given preamble. */
function bash(preamble: string, body: string, env: NodeJS.ProcessEnv = {}) {
  const script = `${preamble}\nsource ${JSON.stringify(path.join(PKG, FUNCTIONS))}\n${body}\n`;
  return spawnSync('bash', ['-c', script], { encoding: 'utf8', env: { PATH: process.env.PATH, ...env } });
}

test('the manifest places the builder in every sites and code folder, with its function file, and lets those types index', () => {
  assert.deepStrictEqual(manifest.commands, { types: ['sites', 'code'], files: [BUILDER] });
  assert.deepStrictEqual(manifest.scripts, { functions: [FUNCTIONS] });
  assert.deepStrictEqual(manifest.typeActions, { ragify: ['sites', 'code'] });
  for (const f of [BUILDER, FUNCTIONS]) assert.ok(fs.existsSync(path.join(PKG, f)), `${f} is in the package`);
  assert.ok(JSON.parse(read('package.json')).files.includes('scripts'), 'scripts/ is published with the package');
  // The workspace folder's own commands stay in rag/: the builder is not one of them.
  assert.ok(!manifest.workspace.files.includes(BUILDER), 'the builder is placed in the project folders, not in rag/ alone');
});

test('the builder bootstraps like every command, reads its own folder\'s settings and runs the core\'s builder', () => {
  const src = read(BUILDER);
  assert.match(src, /^#!\/usr\/bin\/env bash\n/);
  assert.ok(src.includes('WORKSPACE_SCRIPTS="${WORKSPACE_SCRIPTS:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../core/scripts" && pwd)}";'), 'it finds the workspace from its own path');
  assert.ok(src.includes('source ${WORKSPACE_SCRIPTS}/bootstrap.sh || exit 1 ;'));
  // __WORKSPACE__ is filled with the folder's key by the installer: each copy reads its own folder's file.
  assert.ok(src.includes('eval $(parse_yaml ${WORKSPACE_CONFIG}/workspace.__WORKSPACE__.settings.yml);'));
  assert.ok(src.includes('source ${WORKSPACE_SCRIPTS}/args/arg-ragify.sh || exit 1 ;'), "the core's argument file: every flag it documents works");
  assert.match(src, /shift \$#;\n\n(#[^\n]*\n)?ragify_use_rag_settings ;\n/, "the rag folder's milvus settings are loaded before the build and the query alike");
  assert.match(src, /ragify_query_project ;/);
  assert.match(src, /ragify_project \|\| exit 1 ;\n\s*ragify_record_index "\$\{doc_name\}" "\$\{PROJECT_NAME\}" ;/, 'a failed build records nothing');
  // What the installer writes for the dev folder still parses.
  const placed = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ragify-')), 'cmd-tools-ragify.sh');
  fs.writeFileSync(placed, src.split('__WORKSPACE__').join('dev'));
  assert.strictEqual(spawnSync('bash', ['-n', placed]).status, 0);
  assert.ok(fs.readFileSync(placed, 'utf8').includes('workspace.dev.settings.yml'));
});

// The core's own definition, as fun-ragify.sh has it: sourced before the plugin's file, as bootstrap does.
const CORE_SCOPE = 'function ragify_scope_excludes() { graphify_scope_excludes "$1" ; }';

test('without the graph plugin, --scope leaves out what it says and nothing complains', () => {
  const r = bash(CORE_SCOPE, 'for s in contrib custom all; do printf "%s=[%s]\\n" "$s" "$(ragify_scope_excludes "$s")"; done');
  assert.strictEqual(r.status, 0, r.stderr);
  assert.strictEqual(r.stderr, '', 'no "graphify_scope_excludes: command not found"');
  const out = Object.fromEntries(r.stdout.trim().split('\n').map((l) => [l.split('=')[0], l.slice(l.indexOf('[') + 1, -1).split(' ').filter(Boolean)]));
  for (const dir of ['vendor', 'node_modules', 'web/libraries', 'web/sites/default/files', 'web/core']) {
    assert.ok(out.contrib.includes(dir), `contrib (the default) leaves out ${dir}`);
    assert.ok(out.custom.includes(dir), `custom leaves out ${dir}`);
  }
  assert.ok(!out.contrib.includes('web/modules/contrib'), 'contrib keeps the contrib modules: on a built site they are what it behaves like');
  for (const dir of ['web/modules/contrib', 'web/themes/contrib', 'web/profiles/contrib']) assert.ok(out.custom.includes(dir), `custom leaves out ${dir}`);
  assert.deepStrictEqual(out.all, [], 'all leaves out nothing');
});

test('with the graph plugin installed, its lists are the ones used', () => {
  const r = bash(`${CORE_SCOPE}\nfunction graphify_scope_excludes() { printf 'graph-lists-for-%s' "$1" ; }`, 'ragify_scope_excludes custom');
  assert.strictEqual(r.status, 0, r.stderr);
  assert.strictEqual(r.stdout, 'graph-lists-for-custom');
});

test("the rag folder's milvus block is loaded where the core's functions read it, and nothing else of it", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ragify-settings-'));
  fs.writeFileSync(path.join(root, 'workspace.rag.settings.yml'), 'doc:\n  name: rag\n');
  // What parse_yaml answers for the rag folder's file (core/scripts/libs/bash-yaml.sh): name=("value") lines.
  const parse = "function parse_yaml() { printf '%s\\n' 'doc_name=(\"rag\")' 'milvus_project=(\"ragproof\")' 'milvus_authorization=(\"true\")' 'milvus_token=(\"root:secret\")' 'rag_embedding=(\"bm25\")' ; }";
  const r = bash(`${parse}\ndoc_name=dev`, 'ragify_use_rag_settings ; printf "%s|%s|%s|%s|%s" "$doc_name" "$milvus_project" "$milvus_authorization" "$milvus_token" "${rag_embedding:-unset}"', { WORKSPACE_CONFIG: root });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.strictEqual(r.stdout, 'dev|ragproof|true|root:secret|unset', 'the milvus keys are there, doc_name is still the folder\'s own');
  // No rag settings file (the plugin is not configured yet): nothing changes, nothing fails.
  const none = bash(parse, 'ragify_use_rag_settings && printf "%s" "${milvus_project:-unset}"', { WORKSPACE_CONFIG: path.join(root, 'nowhere') });
  assert.strictEqual(none.stdout, 'unset');
});

// The core functions the record reads, as stubs: the collection name, the server, the settings reader.
const STUBS = [
  "function rag_collection_name() { printf 'ws_%s_%s' \"$1\" \"$2\" ; }",
  "function rag_resolve_instance() { printf 'milvus-a' ; }",
  "function milvus_setting() { printf '%s' \"$1\" ; }",
  "function parse_yaml() { echo 'rag_rec_rag_embedding=bm25' ; }",
].join('\n');

test('a built index is recorded in rag/.indexes/<workspace>/<project>.json, beside the servers and never in the project', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ragify-root-'));
  const r = bash(STUBS, 'ragify_record_index dev my-site', { WORKSPACE_ROOT: root, WORKSPACE_CONFIG: root, SCOPE: 'custom', EMBEDDING: '_settings_', ALL: '', APPEND: '' });
  assert.strictEqual(r.status, 0, r.stderr);
  const file = path.join(root, 'rag', '.indexes', 'dev', 'my-site.json');
  const rec = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.deepStrictEqual({ ...rec, built: '' }, { workspace: 'dev', project: 'my-site', collection: 'ws_dev_my-site', server: 'milvus-a', scope: 'custom', retrieval: 'bm25', appended: false, built: '' });
  assert.match(rec.built, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/, 'when, in UTC');
  assert.ok(Math.abs(Date.parse(rec.built) - Date.now()) < 60000, 'just now');
  assert.match(r.stdout, /Recorded in rag\/\.indexes\/dev\/my-site\.json/, 'it says where, relative to the workspace');
  assert.deepStrictEqual(fs.readdirSync(path.dirname(file)), ['my-site.json'], 'no temporary file is left behind');
});

test('the record says what was asked: --all is the scope all, a given --embedding wins, --append is noted', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ragify-root-'));
  const r = bash(STUBS, 'ragify_record_index modules webform', { WORKSPACE_ROOT: root, WORKSPACE_CONFIG: root, SCOPE: 'contrib', ALL: 'yes', EMBEDDING: 'openai', APPEND: 'yes' });
  assert.strictEqual(r.status, 0, r.stderr);
  const rec = JSON.parse(fs.readFileSync(path.join(root, 'rag', '.indexes', 'modules', 'webform.json'), 'utf8'));
  assert.strictEqual(rec.scope, 'all');
  assert.strictEqual(rec.retrieval, 'openai');
  assert.strictEqual(rec.appended, true);
});

test('a value that is not plain text cannot break the record', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ragify-root-'));
  const r = bash(STUBS.replace("printf 'milvus-a'", "printf 'a\"b\\\\c'"), 'ragify_record_index dev site', { WORKSPACE_ROOT: root, WORKSPACE_CONFIG: root, SCOPE: 'contrib' });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(root, 'rag', '.indexes', 'dev', 'site.json'), 'utf8')).server, 'a"b\\c');
});
