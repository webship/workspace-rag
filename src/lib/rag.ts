/**
 * What the RAG menu of a project row reads: which Milvus server holds a project's index, what its
 * collection is called, what the index builder recorded about it, and what the server itself says.
 *
 * Every rule here is the one the bash side keeps (core/scripts/functions/fun-rag.sh and fun-milvus.sh of
 * github.com/webship/workspace, and this plugin's scripts/functions/fun-rag-builder.sh), so the row and
 * `cmd-tools-ragify.sh` / `cmd-tools-rag.sh` always mean the same server and the same collection.
 *
 * The server is asked over its REST API (Milvus answers REST and gRPC on one port): from the dashboard's
 * container by the server's container name on DDEV's shared network, from a dashboard run on the machine
 * by the port the server publishes there.
 */

import fs from 'fs';
import http from 'http';
import path from 'path';

/** The keys of the rag folder's settings this plugin reads. */
export interface RagSettings {
  /** The default server: milvus.project. */
  server: string;
  /** What a collection's name starts with: rag.collection_prefix. */
  prefix: string;
  /** The token when milvus.authorization is on, else ''. */
  token: string;
}

/** What cmd-tools-ragify.sh records about an index it built: rag/.indexes/<workspace>/<project>.json. */
export interface IndexRecord {
  workspace: string;
  project: string;
  collection: string;
  server: string;
  scope?: string;
  retrieval?: string;
  appended?: boolean;
  built: string;
}

/** What one server said about its collections, and when. */
export interface ServerState {
  up: boolean;
  list: string[];
  at: number;
}

const unquote = (v: string) => v.trim().replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');

/**
 * The rag folder's settings, read line by line rather than with a YAML parser: the file is written by
 * hand and keeps its comments, and two levels of keys are all that is read.
 */
export function readSettings(configDir: string): RagSettings {
  const out: RagSettings = { server: 'milvus', prefix: 'ws', token: '' };
  let text = '';
  try { text = fs.readFileSync(path.join(configDir, 'workspace.rag.settings.yml'), 'utf8'); } catch (_) { return out; }
  let block = '';
  let authorization = false;
  let token = '';
  for (const line of text.split('\n')) {
    const top = line.match(/^([A-Za-z_][A-Za-z0-9_-]*):\s*(?:#.*)?$/);
    if (top) { block = top[1]; continue; }
    if (/^\S/.test(line)) { block = ''; continue; }
    const m = line.match(/^ {2}([A-Za-z_][A-Za-z0-9_-]*):\s*([^#\n]*?)\s*(?:#.*)?$/);
    if (!m) continue;
    const value = unquote(m[2]);
    if (block === 'milvus' && m[1] === 'project' && /^[A-Za-z0-9_-]+$/.test(value)) out.server = value;
    if (block === 'milvus' && m[1] === 'authorization') authorization = value === 'true';
    if (block === 'milvus' && m[1] === 'token') token = value;
    if (block === 'rag' && m[1] === 'collection_prefix' && /^[A-Za-z0-9_]+$/.test(value)) out.prefix = value;
  }
  if (authorization && token && token !== 'CHANGE_ME') out.token = token;
  return out;
}

/** rag/bindings.yml: one line per project bound to a server of its own, `<workspace>/<project>: <server>`. */
export function readBindings(root: string): Map<string, string> {
  const map = new Map<string, string>();
  let text = '';
  try { text = fs.readFileSync(path.join(root, 'rag', 'bindings.yml'), 'utf8'); } catch (_) { return map; }
  for (const line of text.split('\n')) {
    const m = line.match(/^([a-z0-9_-]+\/[A-Za-z0-9_.-]+):\s*([A-Za-z0-9_-]+)\s*$/);
    if (m) map.set(m[1], m[2]);
  }
  return map;
}

/** The server a project's index lives in: its binding, else the default. */
export function serverFor(root: string, settings: RagSettings, workspace: string, project: string): string {
  return readBindings(root).get(`${workspace}/${project}`) || settings.server;
}

/** Every server built in the rag folder: a folder holding the compose file cmd-milvus-project.sh writes. */
export function listServers(root: string): string[] {
  const base = path.join(root, 'rag');
  let entries: fs.Dirent[] = [];
  try { entries = fs.readdirSync(base, { withFileTypes: true }); } catch (_) { return []; }
  return entries
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(base, e.name, '.ddev', 'docker-compose.milvus.yaml')))
    .map((e) => e.name)
    .sort();
}

/** `<prefix>_<workspace>_<project>`, with all Milvus does not allow in a name folded to `_` (rag_collection_name). */
export function collectionName(prefix: string, workspace: string, project: string): string {
  return `${prefix}_${workspace}_${project}`.replace(/[^A-Za-z0-9_]/g, '_');
}

/** Where cmd-tools-ragify.sh records an index it built: in the rag folder, never in the project. */
export function recordFile(root: string, workspace: string, project: string): string {
  return path.join(root, 'rag', '.indexes', workspace, `${project}.json`);
}

/** The record of a project's index, or null when there is none (or it cannot be read). */
export function readRecord(root: string, workspace: string, project: string): IndexRecord | null {
  try {
    const rec = JSON.parse(fs.readFileSync(recordFile(root, workspace, project), 'utf8'));
    if (!rec || typeof rec !== 'object' || typeof rec.built !== 'string' || Number.isNaN(Date.parse(rec.built))) return null;
    return rec as IndexRecord;
  } catch (_) { return null; }
}

export function removeRecord(root: string, workspace: string, project: string): void {
  try { fs.rmSync(recordFile(root, workspace, project), { force: true }); } catch (_) { /* nothing to remove */ }
}

/**
 * The port a server publishes Milvus on, on the machine: from the compose file the build wrote (a server
 * built while 19530 was taken is on the next free one), else 19530.
 */
export function hostPort(root: string, server: string): number {
  try {
    const compose = fs.readFileSync(path.join(root, 'rag', server, '.ddev', 'docker-compose.milvus.yaml'), 'utf8');
    const m = compose.match(/^\s*-\s*"(\d+):19530"\s*$/m);
    if (m) return Number(m[1]);
  } catch (_) { /* no compose file: the default */ }
  return 19530;
}

/** Whether this process runs in a container (the dashboard's DDEV web container): the rule milvus_uri() keeps. */
export function inContainer(): boolean {
  return fs.existsSync('/.dockerenv') || !!process.env.DDEV_SITENAME;
}

/** Where the dashboard reaches a server's REST API. */
export function restBase(root: string, server: string, container = inContainer()): string {
  return container ? `http://ddev-${server}-milvus-standalone:19530` : `http://127.0.0.1:${hostPort(root, server)}`;
}

/** A Milvus REST answer: `code` 0 is success. */
export interface MilvusAnswer { code?: number; message?: string; data?: any }

/**
 * The servers, asked over REST. A server's list of collections is kept for a few seconds and asked once
 * however many rows want it: a page re-renders on every poll, and a stopped server must cost one refused
 * connection per page, not one per row.
 */
export class Milvus {
  private cache = new Map<string, ServerState>();
  private inFlight = new Map<string, Promise<ServerState>>();
  constructor(private opts: { base: (server: string) => string; token: () => string; ttlMs?: number }) {}

  /** POST a REST call to a server; null when it does not answer (stopped, unknown, too slow). */
  post(server: string, pathname: string, body: unknown, timeoutMs = 4000): Promise<MilvusAnswer | null> {
    return new Promise((resolve) => {
      let url: URL;
      try { url = new URL(this.opts.base(server) + pathname); } catch (_) { return resolve(null); }
      const payload = JSON.stringify(body || {});
      const headers: Record<string, string | number> = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) };
      const token = this.opts.token();
      if (token) headers.Authorization = `Bearer ${token}`;
      const req = http.request({ hostname: url.hostname, port: url.port, path: url.pathname, method: 'POST', timeout: timeoutMs, headers }, (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { data += chunk; if (data.length > 8 * 1024 * 1024) req.destroy(); });
        res.on('end', () => { try { resolve(JSON.parse(data)); } catch (_) { resolve(null); } });
      });
      req.on('error', () => resolve(null));
      req.on('timeout', () => { req.destroy(); resolve(null); });
      req.end(payload);
    });
  }

  /** The last answer of a server, however old, without asking: what a row drawn right now can use. */
  peek(server: string): ServerState | null {
    return this.cache.get(server) || null;
  }

  /** Whether the last answer is older than the cache keeps one. */
  stale(server: string): boolean {
    const hit = this.cache.get(server);
    return !hit || Date.now() - hit.at >= (this.opts.ttlMs ?? 5000);
  }

  /** A server's collections, asked at most once per few seconds. */
  collections(server: string): Promise<ServerState> {
    const hit = this.cache.get(server);
    if (hit && !this.stale(server)) return Promise.resolve(hit);
    let pending = this.inFlight.get(server);
    if (!pending) {
      pending = this.post(server, '/v2/vectordb/collections/list', {}).then((body) => {
        const up = !!body && body.code === 0;
        const state: ServerState = { up, list: up && Array.isArray(body!.data) ? body!.data.map(String) : [], at: Date.now() };
        this.cache.set(server, state);
        this.inFlight.delete(server);
        return state;
      });
      this.inFlight.set(server, pending);
    }
    return pending;
  }

  /** Forget what a server said (after an index was built or removed), or every server's. */
  invalidate(server?: string): void {
    if (server) this.cache.delete(server); else this.cache.clear();
  }

  async describe(server: string, collection: string): Promise<{ chunks: number | null; fields: string[]; functions: string[] } | null> {
    const described = await this.post(server, '/v2/vectordb/collections/describe', { collectionName: collection });
    if (!described || described.code !== 0 || !described.data) return null;
    const stats = await this.post(server, '/v2/vectordb/collections/get_stats', { collectionName: collection });
    const rows = stats && stats.code === 0 && stats.data ? Number(stats.data.rowCount) : NaN;
    return {
      chunks: Number.isFinite(rows) ? rows : null,
      fields: (described.data.fields || []).map((f: any) => String(f.name)),
      functions: (described.data.functions || []).map((f: any) => String(f.name)),
    };
  }

  /** BM25 search on the sparse field: Milvus tokenises the question itself, so it goes in as text. */
  async search(server: string, collection: string, query: string, limit = 8): Promise<{ ok: boolean; message?: string; hits: { path: string; start: number; end: number; score: number; text: string }[] }> {
    const body = await this.post(server, '/v2/vectordb/entities/search', {
      collectionName: collection, data: [query], annsField: 'sparse', limit,
      outputFields: ['path', 'start_line', 'end_line', 'text'],
    }, 20000);
    if (!body || body.code !== 0) return { ok: false, message: body && body.message ? String(body.message) : '', hits: [] };
    const hits = (Array.isArray(body.data) ? body.data : []).map((h: any) => {
      // The path is indexed as the chunk's first line, so a file name matches even where its words do
      // not appear in it: the passage is what follows.
      const text = String(h.text || '');
      const nl = text.indexOf('\n');
      return { path: String(h.path || ''), start: Number(h.start_line) || 0, end: Number(h.end_line) || 0, score: Number(h.distance) || 0, text: nl === -1 ? text : text.slice(nl + 1) };
    });
    return { ok: true, hits };
  }

  /** Drop a collection. Milvus's drop answers success for a name it does not have, so it is checked first. */
  async drop(server: string, collection: string): Promise<'dropped' | 'missing' | 'down'> {
    const list = await this.post(server, '/v2/vectordb/collections/list', {});
    if (!list || list.code !== 0) return 'down';
    if (!(Array.isArray(list.data) && list.data.includes(collection))) return 'missing';
    const body = await this.post(server, '/v2/vectordb/collections/drop', { collectionName: collection });
    this.invalidate(server);
    return body && body.code === 0 ? 'dropped' : 'down';
  }
}
