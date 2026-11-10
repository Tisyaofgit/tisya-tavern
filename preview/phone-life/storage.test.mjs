import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { Window } from 'happy-dom';

// Exercise the delivered application's actual functions, with only persistence
// delays / IndexedDB scheduling controlled. This is DOM and storage simulation.
const root = fileURLToPath(new URL('.', import.meta.url));
const source = await readFile(process.env.PHONE_APP_UNDER_TEST || new URL('./app.mjs', import.meta.url), 'utf8');
const hooks = `
window.__storageAudit = {
  setPending: value => { pendingImport = value; },
  gateMedia: (entered, gate) => {
    assetPut = async () => { entered(); await gate; };
    assetGet = async () => new Blob(['audio-evidence'], {type:'audio/wav'});
  }
};`;

async function boot() {
  const built = await build({ stdin: { contents: source + hooks, resolveDir: root, sourcefile: 'app.mjs' }, bundle: true, write: false, format: 'iife', target: 'es2020' });
  const w = new Window({ url: 'https://preview.invalid/storage-audit', settings: { enableJavaScriptEvaluation: true, disableJavaScriptFileLoading: true, disableCSSFileLoading: true, enableImageFileLoading: false, suppressInsecureJavaScriptEnvironmentWarning: true } });
  w.document.write((await readFile(new URL('./index.html', import.meta.url), 'utf8')).replace(/<script[\s\S]*?<\/script>/g, ''));
  w.URL.createObjectURL = () => 'blob:controlled-audio'; w.URL.revokeObjectURL = () => {};
  w.fetch = async () => ({ blob: async () => new Blob(['audio-evidence'], { type: 'audio/wav' }) });
  vm.runInContext('globalThis.structuredClone=x=>JSON.parse(JSON.stringify(x));', w);
  vm.runInContext(built.outputFiles[0].text, w);
  return { w, app: w.__TISYA_PHONE_PREVIEW__, audit: w.__storageAudit };
}

test('import cannot erase a payment acknowledged while asynchronous media import is running', async () => {
  const { w, app, audit } = await boot();
  try {
    const before = app.getState(); const incoming = structuredClone(before);
    incoming.media.songs[0].audioId = 'audited-audio';
    audit.setPending({ state: incoming, media: { 'audited-audio': 'data:audio/wav;base64,AAAA' } });
    let entered, release;
    const begun = new Promise(resolve => { entered = resolve; });
    const gate = new Promise(resolve => { release = resolve; });
    audit.gateMedia(entered, gate);
    const importing = app.handle('backup.confirm');
    await begun;
    const [payment] = await Promise.allSettled([app.dispatch({ type: 'wallet.transfer', to: 'yu', amount: 1000 })]);
    const during = app.getState(); release(); await importing;
    const after = app.getState();
    assert.equal(payment.status, 'rejected', `并发转账被确认后又被导入覆盖：during=${during.wallet.accounts[0].balance}, after=${after.wallet.accounts[0].balance}`);
    assert.match(payment.reason.message, /保存|稍候|处理中|等待/);
    assert.equal(after.wallet.accounts[0].balance, before.wallet.accounts[0].balance);
    assert.equal(after.wallet.ledger.length, before.wallet.ledger.length);
  } finally { await w.close(); }
});

test('same media ID concurrent imports cannot overwrite an already committed original', async () => {
  const start = source.indexOf('async function assetPut('), end = source.indexOf('async function assetGet(', start);
  assert.ok(start >= 0 && end > start, 'actual assetPut source must be located');
  const records = new Map();
  const db = { transaction() {
    const tx = { objectStore: () => ({
      put({ id, blob }) { records.set(id, blob); queueMicrotask(() => tx.oncomplete?.()); },
      add({ id, blob }) {
        if (records.has(id)) {
          tx.error = new Error('ConstraintError: media ID already exists');
          queueMicrotask(() => tx.onerror?.());
        } else { records.set(id, blob); queueMicrotask(() => tx.oncomplete?.()); }
      },
    }) };
    return tx;
  } };
  const context = { assetGet: async id => records.get(id) || null, openDb: async () => db, temporaryMedia: new Map(), Uint8Array };
  vm.createContext(context); vm.runInContext(source.slice(start, end) + '\nthis.auditedPut=assetPut;', context);
  const results = await Promise.allSettled([context.auditedPut('same-id', new Blob(['ORIGINAL'])), context.auditedPut('same-id', new Blob(['DIFFERENT']))]);
  assert.equal(await records.get('same-id').text(), 'ORIGINAL', '已保存媒体原件不能被同编号的不同字节覆盖');
  assert.equal(results.filter(x => x.status === 'fulfilled').length, 1);
  assert.equal(results.filter(x => x.status === 'rejected').length, 1);
});
