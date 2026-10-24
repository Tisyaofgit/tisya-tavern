import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { createExtractedHostHarness } from '../native-fixtures/host-harness.mjs';

const adapterURL = new URL('../../../v3/runtime-source/host/worldbook-adapter.mjs', import.meta.url);

async function browserLoader(exportsByPath) {
  const imports = [];
  const context = vm.createContext({ structuredClone });
  const module = new vm.SourceTextModule(await fs.readFile(adapterURL, 'utf8'), {
    context,
    identifier: adapterURL.href,
    async importModuleDynamically(specifier) {
      imports.push(specifier);
      const exports = exportsByPath[specifier];
      if (!exports) throw new TypeError(`Failed to fetch dynamically imported module: http://tauri.localhost${specifier}`);
      const names = Object.keys(exports);
      const loaded = new vm.SyntheticModule(names, function () {
        for (const name of names) this.setExport(name, exports[name]);
      }, { context, identifier: specifier });
      await loaded.link(() => { throw new Error('Unexpected dependency'); });
      await loaded.evaluate();
      return loaded;
    },
  });
  await module.link(() => { throw new Error('Unexpected static dependency'); });
  await module.evaluate();
  return { load: module.namespace.loadBrowserWorldbookTransport, imports };
}

test('browser worldbook loader uses a complete public save protocol without a redundant private import', async () => {
  const disk = new Map(), cache = new Map();
  const worldInfo = {
    worldInfoCache: cache,
    async saveWorldInfo(name, data, immediately) {
      assert.equal(immediately, true);
      cache.set(name, structuredClone(data));
      disk.set(name, structuredClone(data));
    },
    createWorldInfoEntry(_name, data) { return data.entries[0] = { uid: 0 }; },
    discardWorldInfoDocument(name) { cache.delete(name); },
  };
  const loader = await browserLoader({ '/scripts/world-info.js': worldInfo });
  const target = {
    SillyTavern: { getContext: () => ({ getRequestHeaders: () => ({ 'Content-Type': 'application/json' }) }) },
    async fetch(_url, init) { return new Response(JSON.stringify(disk.get(JSON.parse(init.body).name))); },
  };
  const transport = await loader.load(target);
  const document = { entries: { 0: { uid: 0, content: '保存后从实际读端口核对' } } };
  await transport.save('example', document);
  assert.deepEqual(await transport.readFresh('example'), document);
  assert.deepEqual(loader.imports, ['/scripts/world-info.js']);
});

test('missing split module is reported with the exact failed stage and original cause before writing', async () => {
  let saves = 0;
  const worldInfo = {
    async saveWorldInfo() { saves++; }, createWorldInfoEntry() {}, flushWorldInfoSaves() {},
  };
  const loader = await browserLoader({ '/scripts/world-info.js': worldInfo });
  await assert.rejects(loader.load({}), error => {
    assert.equal(error.code, 'HOST_WORLDINFO_MODULE_LOAD');
    assert.equal(error.details.stage, 'persistence');
    assert.equal(error.details.modulePath, '/scripts/world-info-persistence.js');
    assert.deepEqual([...error.details.loadedCapabilities], ['saveWorldInfo', 'createWorldInfoEntry', 'flushWorldInfoSaves']);
    assert.match(error.message, /尚未开始世界书写入/);
    assert.match(error.cause.message, /Failed to fetch dynamically imported module/);
    return true;
  });
  assert.equal(saves, 0);
  assert.deepEqual(loader.imports, ['/scripts/world-info.js', '/scripts/world-info-persistence.js']);
});

test('split host keeps native save/readback and discards a failed pending document before later flush', async () => {
  const host = await createExtractedHostHarness();
  const { discardWorldInfoDocument, ...publicWorldInfo } = host.worldInfo;
  const loader = await browserLoader({
    '/scripts/world-info.js': publicWorldInfo,
    '/scripts/world-info-persistence.js': { discardWorldInfoDocument },
  });
  const transport = await loader.load({
    fetch: host.fetch,
    SillyTavern: { getContext: () => ({ getRequestHeaders: () => ({ 'Content-Type': 'application/json' }) }) },
  });
  const saved = { entries: { 0: { uid: 0, content: 'keep me' } } };
  await transport.save('preserved', saved);
  assert.deepEqual(await transport.readFresh('preserved'), saved);
  host.failure.saveOnce();
  await assert.rejects(transport.save('preserved', { entries: { 0: { uid: 0, content: 'failed candidate' } } }), /Injected native save failure/);
  assert.equal(host.worldInfo.worldInfoCache.has('preserved'), false);
  await host.worldInfo.flushWorldInfoSaves('test-after-failure');
  assert.deepEqual(await transport.readFresh('preserved'), saved);
  assert.deepEqual(loader.imports, ['/scripts/world-info.js', '/scripts/world-info-persistence.js']);
});

test('a loaded module without cleanup cannot start a save', async () => {
  let saves = 0;
  const loader = await browserLoader({
    '/scripts/world-info.js': { saveWorldInfo() { saves++; }, createWorldInfoEntry() {} },
    '/scripts/world-info-persistence.js': {},
  });
  await assert.rejects(loader.load({}), error => error.code === 'HOST_DEPENDENCY' && error.details.capability === 'discardWorldInfoDocument');
  assert.equal(saves, 0);
});
