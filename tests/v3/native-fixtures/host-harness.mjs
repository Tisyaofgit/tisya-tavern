/** Test-only harness: executes extracted 2.4.0 frontend modules, simulates native storage. */
import vm from 'node:vm';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const sourceRoot = fileURLToPath(new URL('./extracted/', import.meta.url));
const copy = value => value == null ? value : structuredClone(value);

export async function createExtractedHostHarness() {
  if (!vm.SourceTextModule) throw new Error('Run with node --experimental-vm-modules');
  const disk = new Map(), sessions = new Map(), routes = new Map(), calls = [], logs = [], sources = [];
  let sessionCounter = 0, failNextSave = false;
  const encoder = new TextEncoder();
  const sandbox = vm.createContext({
    structuredClone, TextEncoder, TextDecoder, Uint8Array, ArrayBuffer, Response, FormData, Blob, Buffer,
    console: { debug() {}, trace() {}, log() {}, warn(...args) { logs.push(args.join(' ')); }, error(...args) { logs.push(args.map(String).join(' ')); } },
    localStorage: { getItem: () => null }, toastr: { error: message => logs.push(message) },
    btoa: text => Buffer.from(text, 'binary').toString('base64'),
    atob: text => Buffer.from(text, 'base64').toString('binary'),
  });
  const native = {
    async safeInvoke(command, args) {
      calls.push(command);
      if (command === 'get_world_info') {
        if (!disk.has(args.dto.name)) { const error = new Error('Worldbook not found'); error.status = 404; throw error; }
        return encoder.encode(JSON.stringify(disk.get(args.dto.name)));
      }
      if (command === 'delete_world_info') { disk.delete(args.dto.name); return; }
      throw new Error(`Unimplemented native command: ${command}`);
    },
    async invokeTransport(command, args, options) {
      calls.push(command);
      if (command === 'begin_world_info_commit') { const sessionId = String(++sessionCounter); sessions.set(sessionId, []); return { sessionId, maxFrameBytes: 64 }; }
      if (command === 'append_world_info_commit_chunk') {
        const id = options.headers['session-id'], frames = sessions.get(id);
        const offset = frames.reduce((n, frame) => n + frame.length, 0);
        if (offset !== Number(options.headers.offset)) throw new Error('Native offset mismatch');
        const bytes = options.headers['chunk-encoding'] === 'base64' ? Buffer.from(args.data, 'base64') : Buffer.from(args);
        frames.push(bytes); return offset + bytes.length;
      }
      if (command === 'finish_world_info_commit') {
        const frames = sessions.get(args.sessionId); sessions.delete(args.sessionId);
        if (failNextSave) { failNextSave = false; throw new Error('Injected native save failure'); }
        const bytes = Buffer.concat(frames);
        if (bytes.length !== args.expectedSize) throw new Error('Native commit size mismatch');
        const payload = JSON.parse(bytes.toString('utf8')); disk.set(payload.name, payload.data); return {};
      }
      if (command === 'abort_world_info_commit') { sessions.delete(args.sessionId); return; }
      throw new Error(`Unimplemented native transport: ${command}`);
    },
  };
  const fetchImpl = async (url, options = {}) => {
    const route = routes.get(url);
    if (!route) throw new Error(`Unimplemented route: ${url}`);
    try { return await route.handler({ body: route.options?.body === 'text' ? options.body : JSON.parse(options.body ?? '{}') }); }
    catch (error) { return new Response(JSON.stringify({ error: error.message }), { status: error.status ?? 500 }); }
  };
  sandbox.fetch = fetchImpl;
  const stubs = new Map([
    ['/script.js', 'export function getRequestHeaders(){return {"Content-Type":"application/json"};}'],
    ['/scripts/constants.js', 'export const debounce_timeout={relaxed:0};'],
    ['/scripts/utils.js', 'export function debounce(fn){return ()=>{};} export function cancelDebounce(){}'],
    ['/scripts/util/host-identity.js', 'export function hostPlatform(){return "android";}'],
    ['/tauri/main/services/lifecycle/lifecycle-flush-service.js', 'export function registerLifecycleFlushHandler(){}'],
  ]);
  const cache = new Map();
  async function moduleAt(identifier) {
    if (cache.has(identifier)) return cache.get(identifier);
    const code = stubs.has(identifier) ? stubs.get(identifier) : await fs.readFile(path.join(sourceRoot, identifier), 'utf8');
    if (!stubs.has(identifier)) sources.push({ path: identifier, sha256: createHash('sha256').update(code).digest('hex') });
    const module = new vm.SourceTextModule(code, { context: sandbox, identifier }); cache.set(identifier, module);
    await module.link((specifier, parent) => moduleAt(path.posix.resolve(path.posix.dirname(parent.identifier), specifier)));
    return module;
  }
  const routeModule = await moduleAt('/tauri/main/routes/worldinfo-routes.js'); await routeModule.evaluate();
  routeModule.namespace.registerWorldInfoRoutes({ post: (url, handler, options) => routes.set(url, { handler, options }) }, native, { jsonResponse: (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } }) });
  const persistence = await moduleAt('/scripts/world-info-persistence.js'); await persistence.evaluate();
  const worldSource = await fs.readFile(path.join(sourceRoot, 'scripts/world-info.js'), 'utf8');
  const definitions = worldSource.slice(worldSource.indexOf('export const newWorldInfoEntryDefinition'), worldSource.indexOf('async function renameWorldInfo'));
  const freeUid = worldSource.slice(worldSource.indexOf('export function getFreeWorldEntryUid'), worldSource.indexOf('/**\n * Generates a free world name'));
  const capsule = new vm.SourceTextModule('const world_info_logic={AND_ANY:0};const DEFAULT_DEPTH=4,DEFAULT_WEIGHT=100;const GENERATION_TYPE_TRIGGERS=[];\n' + definitions + '\n' + freeUid, { context: sandbox, identifier: '/world-info-factory-excerpt.js' });
  await capsule.link(() => { throw new Error('Unexpected factory import'); }); await capsule.evaluate();
  sources.push({ path: '/scripts/world-info.js', sha256: createHash('sha256').update(worldSource).digest('hex'), executed: 'newWorldInfoEntryDefinition/template/createWorldInfoEntry/getFreeWorldEntryUid source excerpts; constants injected' });
  const events = cache.get('/scripts/events.js').namespace;
  return {
    worldInfo: { ...persistence.namespace, createWorldInfoEntry: capsule.namespace.createWorldInfoEntry },
    fetch: fetchImpl, events, calls, logs, sources, disk,
    failure: { saveOnce: () => { failNextSave = true; } },
    nativeBoundary: 'simulated Android base64 byte commit and native storage; no APK/native execution',
    putDisk: (name, data) => disk.set(name, copy(data)),
  };
}
