import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {preserveNativePanels} from '../native-panels.js';

const publicSource = '<html><body><p>公开状态</p><script>window.neutralStatus=1;</script></body></html>';
const privateSource = '<html><body><p>PRIVATE_SOURCE</p><script>window.privateStatus=1;</script></body></html>';

function setup(source) {
 const w = new Window({settings: {disableIframePageLoading: true}}), d = w.document;
 d.head.innerHTML = '<style>body.tisya-active .tisya-source-concealed{display:none!important}</style>';
 d.body.className = 'tisya-active';
 d.body.innerHTML = '<div class="mes_block"><div class="mes_text tisya-source-concealed"><p class="raw">PRIVATE_RAW</p><div class="TH-render"><pre><code></code></pre><iframe id="TH-message--0--0"></iframe></div></div></div>';
 const native = d.querySelector('.mes_text'), root = native.querySelector('.TH-render'), code = root.querySelector('code'), frame = root.querySelector('iframe');
 code.textContent = source;
 const keeper = preserveNativePanels(d, native, {extraPanels: [{id: 'public-status', ruleName: 'status', html: publicSource}]});
 return {w, d, native, root, code, frame, keeper};
}

test('a sole connected TH frame with unrelated source cannot become a public status panel', async () => {
 const {w, native, root, frame, keeper} = setup(privateSource), realm = frame.contentWindow;
 try {
  for (let i = 0; i < 3; i++) {
   keeper.refresh();
   assert.equal(w.getComputedStyle(native).display, 'none');
   assert.equal(root.classList.contains('tisya-native-panel-root'), false);
   assert.equal(keeper.status().mounted, 0);
   assert.equal(keeper.hasMounted(), false);
   assert.equal(frame.parentElement, root);
   assert.equal(frame.contentWindow, realm);
  }
 } finally { keeper.dispose(); await w.happyDOM.abort(); }
});

test('reusing a live wrapper with different source revokes its former public display without recreating its iframe', async () => {
 const {w, native, root, code, frame, keeper} = setup(publicSource), realm = frame.contentWindow;
 try {
  assert.equal(keeper.status().mounted, 1);
  assert.notEqual(w.getComputedStyle(native).display, 'none');
  code.textContent = privateSource;
  keeper.refresh();
  assert.equal(keeper.status().mounted, 0);
  assert.equal(w.getComputedStyle(native).display, 'none');
  assert.equal(root.classList.contains('tisya-native-panel-root'), false);
  assert.equal(frame.parentElement, root);
  assert.equal(frame.contentWindow, realm);
 } finally { keeper.dispose(); await w.happyDOM.abort(); }
});

test('host-equivalent public documents still cannot claim one ambiguous live frame', async () => {
 const encoded = '<html><body><script>window.label=\'&quot;\';</script></body></html>';
 const decoded = '<html><body><script>window.label=\'"\';</script></body></html>';
 const {w, d, native, code, keeper: initial} = setup(decoded); initial.dispose();
 const keeper = preserveNativePanels(d, native, {extraPanels: [
  {id: 'first', ruleName: 'first', html: encoded}, {id: 'second', ruleName: 'second', html: decoded},
 ]});
 try {
  assert.equal(keeper.status().expected, 2);
  assert.equal(keeper.status().mounted, 0);
  assert.equal(w.getComputedStyle(native).display, 'none');
  assert.equal(code.textContent, decoded);
 } finally { keeper.dispose(); await w.happyDOM.abort(); }
});

test('source matching does not recursively decode entities or erase meaningful spacing', async () => {
 const nested = '<html><body><script>window.label=\'&amp;quot;\';</script></body></html>';
 const meaningful = '<html><body><script>window.label=\'two  spaces\';</script></body></html>';
 for (const [expected, actual] of [
  [nested, '<html><body><script>window.label=\'"\';</script></body></html>'],
  [meaningful, '<html><body><script>window.label=\'two spaces\';</script></body></html>'],
 ]) {
  const {w, d, native, keeper: initial} = setup(actual); initial.dispose();
  const keeper = preserveNativePanels(d, native, {extraPanels: [{id: 'public', ruleName: 'public', html: expected}]});
  try {
   assert.equal(keeper.status().mounted, 0);
   assert.equal(w.getComputedStyle(native).display, 'none');
  } finally { keeper.dispose(); await w.happyDOM.abort(); }
 }
});

test('matching public content cannot override a source container hidden by its host', async () => {
 const {w, native, frame, keeper} = setup(publicSource), realm = frame.contentWindow;
 try {
  native.hidden = true;
  keeper.refresh();
  assert.equal(keeper.status().mounted, 1);
  assert.equal(w.getComputedStyle(native).display, 'none');
  assert.equal(native.hidden, true);
  assert.equal(frame.contentWindow, realm);
  native.hidden = false;
  keeper.refresh();
  assert.notEqual(w.getComputedStyle(native).display, 'none');
  assert.equal(frame.contentWindow, realm);
 } finally { keeper.dispose(); await w.happyDOM.abort(); }
});
