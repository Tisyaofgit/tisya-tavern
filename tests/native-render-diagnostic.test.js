import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {inspectNativeRender} from '../native-render-diagnostic.js';

function setup(html) {
 const w = new Window({settings: {disableIframePageLoading: true, disableJavaScriptEvaluation: true, disableJavaScriptFileLoading: true, disableCSSFileLoading: true}}), d = w.document;
 d.body.innerHTML = '<div class="mes"><div class="mes_block">' + html + '</div></div>';
 return {w, d, node: d.querySelector('.mes')};
}

test('diagnostic is observational and excludes source, URLs, variables and arbitrary supplied status', async () => {
 const {w, d, node} = setup('<div class="mes_text tisya-native-beauty" data-secret="PRIVATE_ATTRIBUTE"><div class="TH-render"><pre><code>PRIVATE_SOURCE</code></pre><iframe id="TH-message--0--PRIVATE_ID" src="https://private.invalid/PRIVATE_URL" srcdoc="PRIVATE_DOCUMENT"></iframe></div>PRIVATE_CHAT</div><div class="mes_buttons">PRIVATE_BUTTON</div>');
 const frame = d.querySelector('iframe'), before = node.outerHTML, observer = new w.MutationObserver(() => {});
 observer.observe(node, {subtree: true, childList: true, attributes: true, characterData: true});
 try {
  const result = inspectNativeRender(d, node, {version: '0.2.0-alpha.31-candidate.16', structured: false, managed: false,
   projection: {source: 'PRIVATE_PROJECTION'}, panelStatus: {expected: 2, mounted: 1, status: 'PRIVATE_STATUS', variables: {secret: 'PRIVATE_VARIABLE'}}});
  assert.equal(result.runtime.state, 'iframe-present'); assert.equal(result.runtime.activeIframeCount, 1);
  assert.equal(result.state.nativeBeauty, true); assert.equal(result.state.projectionReported, null);
  assert.deepEqual(result.publicPanels, {expected: 2, mounted: 1, status: null});
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_|private\.invalid|srcdoc|https:/);
  assert.equal(node.outerHTML, before); assert.equal(d.querySelector('iframe'), frame);
  assert.equal(observer.takeRecords().length, 0); assert.equal(d.querySelectorAll('iframe').length, 1);
 } finally { observer.disconnect(); await w.happyDOM.abort(); }
});

test('code toggle, host placeholder and ghost each remain distinct from an active iframe', async () => {
 for (const [extra, state] of [['', 'code-only'], ['<button class="tt-runtime-placeholder"></button>', 'placeholder'], ['<div class="tt-runtime-ghost"></div>', 'ghost']]) {
  const {w, d, node} = setup('<div class="mes_text"><div class="TH-render"><pre><code>SECRET</code></pre><div class="TH-collapse-code-block-button"></div>' + extra + '</div></div>');
  try {
   const before = node.outerHTML, result = inspectNativeRender(d, node, {panelStatus: {body: {expected: 1, mounted: 0, status: 'waiting'}, extra: {expected: 0, mounted: 0}}});
   assert.equal(result.runtime.state, state); assert.equal(result.runtime.activeIframeCount, 0);
   assert.equal(result.counts.codeToggles, 1); assert.equal(result.counts.helperFrames, 0);
   assert.equal(result.publicPanels.body.status, 'waiting'); assert.equal(result.publicPanels.body.mounted, 0);
   assert.match(result.runtime.note, /尚无活跃页面/); assert.equal(node.outerHTML, before);
  } finally { await w.happyDOM.abort(); }
 }
});

test('source concealment and ancestor hiding are reported without treating a CSS-overridden hidden attribute as proof', async () => {
 const {w, d, node} = setup('<div class="mes_text tisya-source-concealed" hidden style="display:block;visibility:visible"><div class="TH-render" style="display:none"><iframe id="TH-message--0--0" style="visibility:hidden"></iframe></div></div>');
 try {
  const result = inspectNativeRender(d, node, {structured: true, projection: true, managed: true});
  assert.equal(result.state.sourceConcealed, true); assert.equal(result.source.hiddenAttribute, true);
  assert.equal(result.source.display, 'block'); assert.equal(result.source.hiddenByStyles, false);
  assert.equal(result.frames[0].hiddenByStyles, true);
  assert(result.frames[0].reasons.some(item => item.depth === 1 && item.reason === 'display:none'));
  assert(result.frames[0].reasons.some(item => item.depth === 0 && item.reason === 'visibility:hidden'));
  assert.equal(result.runtime.activeIframeCount, 1, 'a connected but concealed iframe is different from no runtime node');
 } finally { await w.happyDOM.abort(); }
});

test('toolbar evidence distinguishes actual content after it from CSS column ordering', async () => {
 const {w, d, node} = setup('<div class="mes_text"></div><div class="tisya-message-visual"></div><div class="tisya-actions"><div class="mes_buttons"></div></div><div class="tisya-message-actions-tail"></div>');
 try {
  const initial = inspectNativeRender(d, node);
  assert.equal(initial.toolbar.domLast, false); assert.equal(initial.toolbar.last, false); assert.equal(initial.toolbar.laterContentCount, 1);
  d.querySelector('.mes_block').style.cssText = 'display:flex;flex-direction:column';
  d.querySelector('.tisya-actions').style.order = '40'; d.querySelector('.tisya-message-actions-tail').style.order = '30';
  const before = node.outerHTML, ordered = inspectNativeRender(d, node);
  assert.equal(ordered.toolbar.domLast, false); assert.equal(ordered.toolbar.last, true); assert.equal(ordered.toolbar.orderBasis, 'flex-column');
  assert.equal(node.outerHTML, before);
 } finally { await w.happyDOM.abort(); }
});

test('a hidden toolbar in a visible header does not make the actual trailing actions look misplaced', async () => {
 const {w, d, node} = setup('<header><div class="mes_buttons" style="display:none"></div></header><div class="mes_text"></div><div class="tisya-message-visual"></div><div class="tisya-message-actions-tail"></div><div class="tisya-actions"></div>');
 try {
  const before = node.outerHTML, result = inspectNativeRender(d, node);
  assert.equal(result.toolbar.count, 2);
  assert.equal(result.toolbar.domLast, false, 'DOM position still includes the hidden original toolbar');
  assert.equal(result.toolbar.last, true, 'visible flow excludes the hidden original toolbar before mapping its ancestor');
  assert.equal(result.toolbar.laterContentCount, 0);
  assert.equal(node.outerHTML, before);
 } finally { await w.happyDOM.abort(); }
});
