/** TauriTavern 2.4.0 worldbook A adapter. No cross-window CAS is claimed. */
const KEY = 'tisyaOriginal';
const copy = value => value == null ? value : structuredClone(value);
const stable = value => value && typeof value === 'object' ? Array.isArray(value) ? value.map(stable) : Object.fromEntries(Object.keys(value).sort().map(k => [k, stable(value[k])])) : value;
const same = (a, b) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));

export class HostAdapterError extends Error {
  constructor(code, message, details = {}) { super(message); this.name = 'HostAdapterError'; this.code = code; this.details = details; }
}
const require = (condition, code, message, details) => { if (!condition) throw new HostAdapterError(code, message, details); };

/** Use host module functions for write serialization, direct /api read for disk readback. */
export function createTauriWorldbookTransport({ worldInfo, fetch: fetchImpl, getRequestHeaders = () => ({ 'Content-Type': 'application/json' }) }) {
  require(typeof worldInfo?.saveWorldInfo === 'function' && typeof worldInfo?.createWorldInfoEntry === 'function' && typeof worldInfo?.discardWorldInfoDocument === 'function', 'HOST_DEPENDENCY', 'World-info save, entry factory and working-document discard exports are required');
  require(typeof fetchImpl === 'function', 'HOST_DEPENDENCY', 'Host fetch is required');
  const reads = new Map();
  async function readDocument(name) {
      const response = await fetchImpl('/api/worldinfo/get', { method: 'POST', headers: getRequestHeaders(), body: JSON.stringify({ name }), cache: 'no-cache' });
      if (response.status === 404) return null;
      require(response.ok, 'WORLD_READ_FAILED', `Worldbook read failed (${response.status})`, { name });
      const data = await response.json();
      require(data && typeof data === 'object' && data.entries && typeof data.entries === 'object' && !Array.isArray(data.entries), 'WORLD_FORMAT', 'Worldbook entries must be an object', { name });
      // TT 2.4.0 returns HTTP 200 + {entries:{}} for a missing file. An
      // existing empty book has the same body; only the fresh inventory can
      // distinguish them. Never overwrite an empty book by guessing.
      if (Object.keys(data.entries).length === 0) {
        const inventory = await fetchImpl('/api/settings/get', { method: 'POST', headers: getRequestHeaders(), body: '{}', cache: 'no-cache' });
        require(inventory.ok, 'WORLD_INVENTORY_FAILED', '无法核对资料书目录，未创建或覆盖资料', { name, status: inventory.status });
        const settings = await inventory.json();
        require(Array.isArray(settings.world_names) && settings.world_names.every(x => typeof x === 'string'), 'WORLD_INVENTORY_FORMAT', '资料书目录格式无效', { name });
        if (!settings.world_names.includes(name)) return null;
      }
      return data;
  }
  return Object.freeze({
    async readFresh(name) {
      let job = reads.get(name);
      if (!job) { job = readDocument(name); reads.set(name, job); }
      try { return copy(await job); }
      finally { if (reads.get(name) === job) reads.delete(name); }
    },
    async save(name, data) {
      reads.delete(name);
      try { await worldInfo.saveWorldInfo(name, data, true); }
      catch (error) { worldInfo.discardWorldInfoDocument(name); throw error; }
      finally { reads.delete(name); }
    },
    createEntry(name, data) { return worldInfo.createWorldInfoEntry(name, data); },
  });
}

/** Load the host's actual save protocol; missing cleanup is not an older-protocol fallback. */
export async function loadWorldbookHostModules() {
  let worldInfo;
  async function load(path, stage) {
    try { return await import(path); }
    catch (cause) {
      const error = new HostAdapterError('HOST_WORLDINFO_MODULE_LOAD',
        `宿主世界书${stage === 'world-info' ? '模块' : '保存组件'}无法加载（${path.split('/').at(-1)}）。本次尚未开始世界书写入；请完整重启宿主并核对安装版本。原始错误：${cause?.message ?? String(cause)}`,
        { stage, modulePath: path, loadedCapabilities: worldInfo ? ['saveWorldInfo', 'createWorldInfoEntry', 'flushWorldInfoSaves', 'discardWorldInfoDocument'].filter(key => typeof worldInfo[key] === 'function') : [] });
      error.cause = cause;
      throw error;
    }
  }
  worldInfo = await load('/scripts/world-info.js', 'world-info');
  // A host may expose the complete protocol from its public module. Otherwise
  // the verified TT split-module cleanup remains required before any writes.
  const persistence = typeof worldInfo.discardWorldInfoDocument === 'function'
    ? worldInfo : await load('/scripts/world-info-persistence.js', 'persistence');
  require(typeof persistence.discardWorldInfoDocument === 'function', 'HOST_DEPENDENCY', '宿主缺少世界书失败清理接口，未开始写入；请核对宿主版本', { capability: 'discardWorldInfoDocument' });
  return { worldInfo, persistence };
}

export async function loadBrowserWorldbookTransport(hostWindow = window) {
  const { worldInfo, persistence } = await loadWorldbookHostModules();
  const context = hostWindow.SillyTavern?.getContext?.();
  require(context && typeof context.getRequestHeaders === 'function', 'HOST_DEPENDENCY', 'SillyTavern context is unavailable');
  return createTauriWorldbookTransport({ worldInfo: { ...worldInfo, discardWorldInfoDocument: persistence.discardWorldInfoDocument }, fetch: hostWindow.fetch.bind(hostWindow), getRequestHeaders: context.getRequestHeaders });
}

function decode(wire, bookId) {
  const meta = wire?.extensions?.[KEY];
  if (!meta) return null;
  require(meta.bookId === bookId && typeof meta.id === 'string', 'WORLD_CORRUPT', 'Original metadata identity is invalid');
  require(wire.disable === true && wire.constant === false && Array.isArray(wire.key) && wire.key.length === 0 && Array.isArray(wire.keysecondary) && wire.keysecondary.length === 0 && wire.probability === 0,
    'ORIGINAL_ACTIVATION_RISK', 'Original archive entry activation flags changed', { id: meta.id });
  return { ...copy(meta), content: wire.content };
}

function locate(data, bookId, id) {
  const matches = Object.entries(data?.entries ?? {}).filter(([, wire]) => wire?.extensions?.[KEY]?.id === id);
  require(matches.length <= 1, 'DUPLICATE_ORIGINAL_ID', 'Duplicate original IDs in worldbook', { id });
  if (!matches.length) return null;
  const [uid, wire] = matches[0];
  return { uid, wire, entry: decode(wire, bookId) };
}

/** One instance owns one serialized writer. External edits are checked, never retried over. */
export function createWorldbookOriginalAdapter({ transport }) {
  require(['readFresh', 'save', 'createEntry'].every(key => typeof transport?.[key] === 'function'), 'HOST_DEPENDENCY', 'Worldbook transport is incomplete');
  let tail = Promise.resolve();
  const observed = new Map();
  const key = (bookId, id) => JSON.stringify([bookId, id]);
  const serial = work => { const task = tail.then(work); tail = task.catch(() => {}); return task; };
  const read = ({ bookId, id }) => serial(async () => {
    const data = await transport.readFresh(bookId);
    const found = locate(data, bookId, id);
    observed.set(key(bookId, id), found ? copy(found.entry) : null);
    return copy(found?.entry ?? null);
  });
  async function write({ bookId, id, expectedVersion, entry }, creating) {
    require(entry?.bookId === bookId && entry?.id === id && entry.disable === true && entry.constant === false && entry.probability === 0 && entry.key?.length === 0 && entry.keysecondary?.length === 0, 'INVALID_ORIGINAL', 'Original entry identity or activation flags are invalid');
    const data = await transport.readFresh(bookId) ?? { entries: {} };
    const found = locate(data, bookId, id);
    const current = found?.entry ?? null;
    require((current?.version ?? 0) === expectedVersion && Boolean(current) !== creating && entry.version === expectedVersion + 1,
      'VERSION_CONFLICT', 'Worldbook original version changed', { id, expectedVersion, actualVersion: current?.version ?? 0 });
    const observedKey = key(bookId, id);
    require(observed.has(observedKey), 'READ_BEFORE_WRITE', 'Read the original before writing it');
    require(same(current, observed.get(observedKey)), 'EXTERNAL_CHANGE', 'Original changed after it was read', { id });
    const wire = found?.wire ?? transport.createEntry(bookId, data);
    require(wire && Number.isInteger(wire.uid), 'WORLD_UID', 'Host did not allocate a worldbook UID');
    const { content, ...metadata } = copy(entry);
    Object.assign(wire, { content, disable: true, constant: false, vectorized: false, key: [], keysecondary: [], probability: 0, useProbability: true, excludeRecursion: true, preventRecursion: true, comment: id });
    wire.extensions = { ...(wire.extensions ?? {}), [KEY]: metadata };
    await transport.save(bookId, data);
    const saved = locate(await transport.readFresh(bookId), bookId, id)?.entry;
    require(same(saved, entry), 'WRITE_READBACK_MISMATCH', 'Worldbook original readback differs from its write', { id });
    observed.set(observedKey, copy(saved));
    return { id, version: saved.version };
  }
  return Object.freeze({
    capabilities: Object.freeze({ uniqueIds: true, conditionalWrites: false, managedSingleWriter: true, consistencyScope: 'single-controller', crossWindowAtomicity: false }),
    read,
    list: ({ bookId, scope }) => serial(async () => {
      const data = await transport.readFresh(bookId);
      const result = [], ids = new Set();
      for (const wire of Object.values(data?.entries ?? {})) {
        const entry = decode(wire, bookId);
        if (!entry) continue;
        require(!ids.has(entry.id), 'DUPLICATE_ORIGINAL_ID', 'Duplicate original IDs in worldbook', { id: entry.id });
        ids.add(entry.id);
        if (scope && Object.entries(scope).some(([k, v]) => entry.original?.identity?.[k] !== v)) continue;
        result.push(entry);
      }
      return result;
    }),
    create: request => serial(() => write(request, true)),
    update: request => serial(() => write(request, false)),
  });
}
