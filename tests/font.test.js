import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import { loadReadingFont } from '../font.js';

let font;
try { font = await readFile(new URL('../assets/reading.woff2', import.meta.url)); }
catch (err) {
  if (err.code !== 'ENOENT') throw err;
  const parts = [];
  for (let i = 1; i <= 4; i++) {
    const response = await fetch(`https://raw.githubusercontent.com/Tisyaofgit/tisya-tavern/cfc9d8c1ce4be94334c3b748addb0936802b2d2b/font/reading.part${i}.bin`, { signal: AbortSignal.timeout(120000) });
    if (!response.ok) throw Error(`Test font download failed (${response.status})`);
    parts.push(Buffer.from(await response.arrayBuffer()));
  }
  font = Buffer.concat(parts);
}
const bytes = font.buffer.slice(font.byteOffset, font.byteOffset + font.byteLength);
const local = '/user/files/tisya-font-b68d6b9e4f3607fad79ab20c744092139aa64590a0c82354d31361929aa3afcb.woff2';
function fixture({ cached = false, corrupt = false, uploadFailure = false, missingReadback = false } = {}) {
  const calls = [], states = [], faces = new Set();
  let persisted = cached;
  class Face { constructor(name, data) { this.name = name; this.data = data; } async load() { return this; } }
  const fetcher = async (url, options = {}) => {
    calls.push({ url, options });
    if (url === local) return persisted ? new Response(corrupt ? new Uint8Array([1]) : bytes) : new Response(null, { status: 404 });
    if (url === '/api/files/upload') {
      if (uploadFailure) return new Response(null, { status: 500 });
      const body = JSON.parse(options.body);
      assert.deepEqual(Buffer.from(body.data, 'base64'), font);
      assert.equal('/user/files/' + body.name, local);
      persisted = !missingReadback;
      return Response.json({ path: local });
    }
    const i = Number(url.replace('part', ''));
    return new Response(bytes.slice(i * 4194304, (i + 1) * 4194304));
  };
  return { calls, states, faces, args: { urls: ['part0', 'part1', 'part2', 'part3'], headers: () => ({ 'Content-Type': 'application/json' }), onState: s => states.push(s), fetcher, cryptoApi: webcrypto, Font: Face, fonts: faces } };
}
test('cold download saves exact original bytes, verifies readback and releases registered font', async () => {
  const f = fixture(); const release = await loadReadingFont(f.args);
  assert.equal(f.calls.length, 7); assert.equal(f.faces.size, 1);
  assert.equal(f.states.at(-1), '本地字体已启用');
  release(); assert.equal(f.faces.size, 0);
});
test('restart reuses persistent font without network download or upload', async () => {
  const f = fixture({ cached: true }); await loadReadingFont(f.args);
  assert.equal(f.calls.length, 1); assert.equal(f.faces.size, 1);
});
test('corrupt cache reports failure without replacement or activation', async () => {
  const f = fixture({ cached: true, corrupt: true });
  await assert.rejects(loadReadingFont(f.args), /校验/);
  assert.equal(f.calls.length, 1); assert.equal(f.faces.size, 0);
});
test('save failure and missing readback cannot report success', async () => {
  for (const options of [{ uploadFailure: true }, { missingReadback: true }]) {
    const f = fixture(options); await assert.rejects(loadReadingFont(f.args), /保存/);
    assert.equal(f.faces.size, 0); assert.notEqual(f.states.at(-1), '本地字体已启用');
  }
});
test('failed resource download stops before writing local storage', async () => {
  const f = fixture(), original = f.args.fetcher;
  f.args.fetcher = (url, opts) => url === 'part1' ? Promise.resolve(new Response(null, { status: 503 })) : original(url, opts);
  await assert.rejects(loadReadingFont(f.args), /下载失败/);
  assert.ok(!f.calls.some(c => c.url === '/api/files/upload')); assert.equal(f.faces.size, 0);
});
test('unload while decoding cannot register a late font', async () => {
  const f = fixture({ cached: true }), controller = new AbortController();
  f.args.signal = controller.signal;
  f.args.Font = class { async load() { controller.abort(); } };
  await assert.rejects(loadReadingFont(f.args), /取消/); assert.equal(f.faces.size, 0);
});
