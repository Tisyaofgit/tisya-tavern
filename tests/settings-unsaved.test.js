import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {mountUnsavedPrompt} from '../settings-unsaved.js';

const click = (root, label) => [...root.querySelectorAll('button')].find(n => n.textContent === label).click();
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

test('one settings transition produces one decision and one save despite repeated navigation', async () => {
 const window = new Window(), root = window.document.body;
 let saves = 0, advances = 0, finish;
 const view = mountUnsavedPrompt(window.document, root);
 const first = view.request({save: () => { saves++; return new Promise(resolve => { finish = resolve; }); }, discard: () => {}, proceed: () => advances++});
 assert.equal(await view.request({save: () => saves++, proceed: () => advances++}), false);
 assert.equal(root.querySelectorAll('[role=dialog]').length, 1);
 click(root, '保存并切换'); click(root, '保存并切换');
 assert.equal(saves, 1); assert.equal(view.state().busy, true);
 finish(true);
 assert.equal(await first, true); assert.equal(advances, 1);
 assert.deepEqual(view.state(), {open: false, busy: false});
 view.dispose(); await window.happyDOM.abort();
});

test('a failed or refused settings save keeps its original error and draft decision open for retry', async () => {
 const window = new Window(), root = window.document.body;
 let attempt = 0;
 const view = mountUnsavedPrompt(window.document, root);
 const result = view.request({save: () => { attempt++; if (attempt === 1) throw Error('storage unavailable'); if (attempt === 2) return false; return true; }, discard: () => {}});
 click(root, '保存并切换'); await flush();
 assert.match(root.querySelector('[role=alert]').textContent, /storage unavailable/);
 assert.equal(view.state().open, true); assert.equal(view.state().busy, false);
 click(root, '保存并切换'); await flush();
 assert.match(root.querySelector('[role=alert]').textContent, /保存未完成/);
 assert.equal(root.querySelectorAll('[role=dialog]').length, 1);
 click(root, '保存并切换'); assert.equal(await result, true); assert.equal(attempt, 3);
 view.dispose(); await window.happyDOM.abort();
});

test('continue editing, Escape, and dispose all cancel navigation without mutating drafts', async () => {
 const window = new Window(), root = window.document.body;
 let changes = 0;
 const view = mountUnsavedPrompt(window.document, root), callbacks = {save: () => changes++, discard: () => changes++};
 const first = view.request(callbacks); click(root, '继续编辑'); assert.equal(await first, false);
 const second = view.request(callbacks); root.querySelector('[role=dialog]').dispatchEvent(new window.KeyboardEvent('keydown', {key: 'Escape', bubbles: true})); assert.equal(await second, false);
 const third = view.request(callbacks); view.dispose(); assert.equal(await third, false);
 assert.equal(changes, 0); assert.equal(root.querySelector('[role=dialog]'), null);
 await window.happyDOM.abort();
});

test('disposing during persistence never runs a late navigation callback', async () => {
 const window = new Window(), root = window.document.body;
 let complete, advances = 0;
 const view = mountUnsavedPrompt(window.document, root);
 const result = view.request({save: () => new Promise(resolve => { complete = resolve; }), discard: () => {}, proceed: () => advances++});
 click(root, '保存并切换'); view.dispose();
 assert.equal(await result, false);
 complete(true); await flush();
 assert.equal(advances, 0); assert.equal(root.querySelector('[role=dialog]'), null);
 await window.happyDOM.abort();
});
