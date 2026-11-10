import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {mountMatrixIdentity} from '../engine/identity-ui.mjs';
import {createStoryIdentity} from '../engine/identity.mjs';
import {createConfiguration} from '../engine/config.mjs';
import {createIdentityService} from '../user-identity-service.js';

const tick = () => new Promise(resolve => setImmediate(resolve));
const button = (root, text) => [...root.querySelectorAll('button')].find(node => node.textContent === text);
const input = (f, selector, value, event = 'input') => {
 const node = f.root.querySelector(selector);
 assert(node, selector);
 if (node.type === 'checkbox') node.checked = value;
 else node.value = value;
 node.dispatchEvent(new f.window.Event(event));
 return node;
};

async function fixture({rolesUnavailable = false} = {}) {
 const window = new Window(), root = window.document.createElement('div');
 window.document.body.append(root);
 const books = {'基点书': [{uid: 7, name: '【角色】已有角色', content: '原角色内容', enabled: false}]};
 let active = 'a', failSettings = false, failConfig = false, failBinding = false, failChat = false, settingsHook = () => {};
 const calls = {settings: 0, config: 0, chat: 0, worldbook: 0, profile: 0};
 const ctx = {
  extensionSettings: {}, chatMetadata: {}, chatId: 'chat-a', characterId: 0, name1: '甲',
  powerUserSettings: {
   personas: {a: '甲', b: '乙'},
   persona_descriptions: {a: {description: '甲的心愿'}, b: {description: '乙的心愿'}},
   persona_description: '甲的心愿'
  },
  loadWorldInfo: async name => ({entries: Object.fromEntries((books[name] ?? []).map(row => [row.uid, {...row, comment: row.name}]))})
 };
 const config = createConfiguration({getContext: () => ctx, persist: async () => {calls.config++; if (failConfig) throw Error('配置磁盘失败'); return true;}});
 const saveConfig = config.save;
 config.save = async next => {if (failBinding && next.story.userBinding) throw Error('绑定磁盘失败'); return saveConfig(next);};
 const helper = {
  getWorldbookNames: async () => Object.keys(books),
  getWorldbook: async name => structuredClone(books[name]),
  createWorldbook: async (name, entries) => {calls.worldbook++; books[name] = entries.map((row, uid) => ({...row, uid})); return true;},
  updateWorldbookWith: async (name, update) => {calls.worldbook++; books[name] = update(books[name]).map((row, index) => ({...row, uid: row.uid ?? index + 100}));}
 };
 const identity = createIdentityService({
  getContext: () => ctx, getAvatar: () => active,
  applyActive: (id, name) => {active = id; ctx.name1 = name; ctx.powerUserSettings.persona_description = ctx.powerUserSettings.persona_descriptions[id].description;},
  persistSettings: async () => {calls.settings++; if (failSettings) throw Error('身份磁盘失败'); await settingsHook(); return true;},
  persistChat: async () => {calls.chat++; return !failChat;}
 });
 const saveProfile = identity.saveProfile;
 identity.saveProfile = async next => {calls.profile++; return saveProfile(next);};
 const roles = rolesUnavailable
  ? {ensureBook: async () => {throw Error('世界书服务未连接');}, list: async () => {throw Error('世界书服务未连接');}}
  : createStoryIdentity({config, getContext: () => ctx, getHelper: () => helper});
 let view, closed = 0, native = 0;
 const mount = () => mountMatrixIdentity(window.document, root, {identity, config, roles, onClose: () => {assert.equal(view.requestLeave().allowed, true); closed++;}, onNative: () => {assert.equal(view.requestLeave().allowed, true); native++;}});
 view = mount(); await view.ready;
 return {
  window, root, ctx, identity, config, roles, books, calls, get view() {return view;}, active: () => active,
  closed: () => closed, native: () => native,
  failSettings: value => {failSettings = value;}, failConfig: value => {failConfig = value;},
  failBinding: value => {failBinding = value;}, failChat: value => {failChat = value;},
  onSettingsSave: callback => {settingsHook = callback;},
  async reopen() {view.dispose(); view = mount(); await view.ready;},
  async dispose() {view.dispose(); await window.happyDOM.abort();}
 };
}

test('Matrix identity has one persistent save/cancel pair including unavailable role sources', async () => {
 for (const rolesUnavailable of [false, true]) {
  const f = await fixture({rolesUnavailable});
  try {
   assert.equal(f.root.querySelectorAll('footer').length, 1);
   assert.deepEqual([...f.root.querySelector('footer').querySelectorAll('button')].map(node => node.textContent), ['取消修改', '保存']);
   assert.equal([...f.root.querySelectorAll('button')].filter(node => /保存|创建并绑定|继续完成身份切换|使用此用户身份/.test(node.textContent)).length, 1);
   assert.equal(f.view.state().dirty, false);
   if (rolesUnavailable) assert.match(f.root.textContent, /基点书读取失败：世界书服务未连接/);
  } finally {await f.dispose();}
 }
});

test('native identity scope options remain drafts and save character and global bindings once',async()=>{
 const f=await fixture();try{
  f.ctx.characters=[{avatar:'card.png'}];await f.view.discardDraft();
  input(f,'[data-identity-picker]','b','change');await tick();input(f,'[data-identity-scope="character"]',true,'change');input(f,'[data-identity-scope="global"]',true,'change');
  assert.equal(f.active(),'a');assert.equal(f.ctx.powerUserSettings.default_persona,undefined);assert.equal(f.ctx.powerUserSettings.persona_descriptions.b.connections,undefined);assert.equal(f.calls.settings,0);
  assert.equal(await f.view.saveDraft(),true,f.root.textContent);assert.equal(f.active(),'b');assert.equal(f.ctx.chatMetadata.persona,'b');assert.equal(f.ctx.powerUserSettings.default_persona,'b');assert.deepEqual(f.ctx.powerUserSettings.persona_descriptions.b.connections,[{type:'character',id:'card.png'}]);assert.equal(f.view.state().dirty,false);
  const writes=f.calls.settings;assert.equal(await f.view.saveDraft(),true);assert.equal(f.calls.settings,writes);
 }finally{await f.dispose();}
});

test('scope binding recovery completes the same submission without reapplying native selection',async()=>{
 const f=await fixture();try{
  f.ctx.groupId=11;await f.view.discardDraft();let selections=0;const select=f.identity.select;f.identity.select=async input=>{selections++;return select(input);};
  input(f,'[data-identity-picker]','b','change');await tick();input(f,'[data-identity-scope="character"]',true,'change');input(f,'[data-identity-scope="global"]',true,'change');f.failChat(true);
  assert.equal(await f.view.saveDraft(),false);assert.equal(selections,1);assert.equal(f.ctx.powerUserSettings.tisya_identity_pending.id,'b');assert.equal(f.view.state().dirty,true);
  f.failChat(false);assert.equal(await f.view.saveDraft(),true,f.root.textContent);assert.equal(selections,1);assert.equal(f.ctx.powerUserSettings.tisya_identity_pending,undefined);assert.deepEqual(f.ctx.powerUserSettings.persona_descriptions.b.connections,[{type:'group',id:11}]);assert.equal(f.ctx.powerUserSettings.default_persona,'b');assert.equal(f.view.state().dirty,false);
 }finally{await f.dispose();}
});

test('one save commits name, wish choices and existing role binding and reads them back on reopen', async () => {
 const f = await fixture();
 try {
  input(f, '[data-identity-name]', '新的甲');
  input(f, '[data-identity-wish]', '完整新心愿\n空格 与标点。');
  input(f, '[data-wish-option="W00"]', true, 'change');
  input(f, '[data-avatar-mode]', 'bound', 'change');
  input(f, '[data-role-entry]', '7', 'change');
  assert.deepEqual(f.calls, {settings: 0, config: 0, chat: 0, worldbook: 0, profile: 0});
  assert.equal(await f.view.saveDraft(), true);
  assert.equal(f.ctx.powerUserSettings.personas.a, '新的甲');
  assert.equal(f.ctx.powerUserSettings.persona_descriptions.a.description, '完整新心愿\n空格 与标点。');
  assert.deepEqual(f.config.read().story.play.choices.W, ['W00', 'W07']);
  assert.deepEqual(f.config.read().story.userBinding, {book: '基点书', uid: 7});
  assert.equal(f.view.state().dirty, false);
  await f.reopen();
  assert.equal(f.root.querySelector('[data-identity-name]').value, '新的甲');
  assert.equal(f.root.querySelector('[data-identity-wish]').value, '完整新心愿\n空格 与标点。');
  assert.equal(f.root.querySelector('[data-role-entry]').value, '7');
 } finally {await f.dispose();}
});

test('identity selection is a draft until save and cancellation performs no persistence', async () => {
 const f = await fixture();
 try {
  input(f, '[data-identity-picker]', 'b', 'change'); await tick();
  assert.equal(f.active(), 'a'); assert.equal(f.calls.settings, 0); assert.equal(f.calls.chat, 0);
  assert.equal(f.root.querySelector('[data-identity-wish]').value, '乙的心愿');
  assert.equal(f.view.state().dirty, true);
  await f.view.discardDraft();
  assert.equal(f.root.querySelector('[data-identity-picker]').value, 'a');
  assert.equal(f.active(), 'a'); assert.equal(f.view.state().dirty, false);
  input(f, '[data-identity-picker]', 'b', 'change'); await tick();
  assert.equal(await f.view.saveDraft(), true);
  assert.equal(f.active(), 'b'); assert.equal(f.ctx.chatMetadata.persona, 'b');
 } finally {await f.dispose();}
});

test('switching identities and leaving use one prompt, preserve drafts on stay, and do not auto-commit the next identity', async () => {
 const f = await fixture();
 try {
  input(f, '[data-identity-wish]', '甲的未保存内容');
  input(f, '[data-identity-picker]', 'b', 'change'); await tick();
  assert.equal(f.root.querySelectorAll('[role="dialog"]').length, 1);
  assert.equal(await f.view.confirmLeave(), false);
  assert.equal(f.root.querySelectorAll('[role="dialog"]').length, 1);
  await button(f.root, '继续编辑').onclick(); await tick();
  assert.equal(f.root.querySelector('[data-identity-wish]').value, '甲的未保存内容');
  assert.equal(f.root.querySelector('[data-identity-picker]').value, 'a');
  input(f, '[data-identity-picker]', 'b', 'change'); await tick();
  await button(f.root, '保存并切换').onclick(); await tick();
  assert.equal(f.ctx.powerUserSettings.persona_descriptions.a.description, '甲的未保存内容');
  assert.equal(f.active(), 'a');
  assert.equal(f.root.querySelector('[data-identity-picker]').value, 'b');
  assert.equal(f.view.state().dirty, true);
  const leaving = button(f.root, '返回').onclick(); await tick();
  await button(f.root, '放弃修改').onclick();
  assert.equal(await leaving, true); assert.equal(f.closed(), 1); assert.equal(f.active(), 'a');
 } finally {await f.dispose();}
});

test('cancel discards every unsaved field without changing source data or creating roles', async () => {
 const f = await fixture();
 try {
  input(f, '[data-identity-name]', '未存姓名'); input(f, '[data-identity-wish]', '未存心愿');
  input(f, '[data-wish-option="W00"]', true, 'change');
  input(f, '[data-avatar-mode]', 'ensemble', 'change');
  input(f, '[data-role-name]', '新角色'); input(f, '[data-role-content]', '未存角色原文');
  assert.equal(await f.view.discardDraft(), true);
  assert.equal(f.root.querySelector('[data-identity-name]').value, '甲');
  assert.equal(f.root.querySelector('[data-role-name]').value, '');
  assert.equal(f.root.querySelector('[data-avatar-mode]').value, 'unbound');
  assert.equal(f.root.querySelector('[data-wish-option="W00"]').checked, false);
  assert.deepEqual(f.calls, {settings: 0, config: 0, chat: 0, worldbook: 0, profile: 0});
 } finally {await f.dispose();}
});

test('creation requires explicit confirmation and validates the complete page before any persistent write', async () => {
 const f = await fixture();
 try {
  input(f, '[data-identity-name]', '待存姓名'); input(f, '[data-role-name]', '待建角色');
  assert.equal(await f.view.saveDraft(), false);
  assert.equal(f.calls.profile, 0); assert.equal(f.calls.config, 0); assert.equal(f.calls.worldbook, 0);
  input(f, '[data-role-content]', '完整角色原文');
  assert.equal(await f.view.saveDraft(), false); assert.equal(f.calls.profile, 0);
  input(f, '[data-role-create-confirm]', true, 'change');
  assert.equal(await f.view.saveDraft(), true);
  assert.equal(f.books.基点书.length, 2);
  assert.equal(f.books.基点书[1].name, '【角色】待建角色');
  assert.equal(f.books.基点书[1].content, '完整角色原文');
  assert.equal(f.books.基点书[1].enabled, false);
  assert.equal(f.config.read().story.userName, '待建角色');
  assert.equal(f.root.querySelector('[data-role-name]').value, '');
 } finally {await f.dispose();}
});

test('partial profile success preserves the rest of the draft and retry does not write the profile twice', async () => {
 const f = await fixture();
 try {
  input(f, '[data-identity-wish]', '已确认的心愿'); input(f, '[data-wish-option="W00"]', true, 'change');
  input(f, '[data-avatar-mode]', 'ensemble', 'change');
  f.failConfig(true);
  assert.equal(await f.view.saveDraft(), false);
  assert.equal(f.calls.profile, 1); assert.equal(f.ctx.powerUserSettings.persona_descriptions.a.description, '已确认的心愿');
  assert.equal(f.root.querySelector('[data-avatar-mode]').value, 'ensemble');
  assert.equal(f.view.state().dirty, true); assert.match(f.root.querySelector('footer').textContent, /已保存.*心愿/);
  f.failConfig(false);
  assert.equal(await f.view.saveDraft(), true); assert.equal(f.calls.profile, 1);
  assert.equal(f.config.read().story.userMode, 'ensemble'); assert.equal(f.view.state().dirty, false);
 } finally {await f.dispose();}
});

test('role creation followed by binding failure retains its exact source and safe retry creates no duplicate', async () => {
 const f = await fixture();
 try {
  input(f, '[data-identity-wish]', '同次心愿');
  input(f, '[data-role-name]', '重试角色'); input(f, '[data-role-content]', '原文不重建');
  input(f, '[data-role-create-confirm]', true, 'change');
  f.failBinding(true);
  assert.equal(await f.view.saveDraft(), false);
  assert.equal(f.books.基点书.length, 2); assert.equal(f.calls.worldbook, 1);
  assert.match(f.root.querySelector('footer').textContent, /角色已保存.*绑定未完成/);
  assert.equal(f.root.querySelector('[data-role-name]').value, '重试角色');
  assert.equal(f.root.querySelector('[data-role-content]').value, '原文不重建');
  f.failBinding(false);
  assert.equal(await f.view.saveDraft(), true);
  assert.equal(f.calls.profile, 1); assert.equal(f.calls.worldbook, 1); assert.equal(f.books.基点书.length, 2);
  assert.equal(f.config.read().story.userName, '重试角色');
 } finally {await f.dispose();}
});

test('concurrent configuration changes reject the entire save before changing the native profile', async () => {
 const f = await fixture();
 try {
  input(f, '[data-identity-name]', '不能覆盖'); input(f, '[data-avatar-mode]', 'ensemble', 'change');
  const external = f.config.read(); external.tags.body = 'externalbody'; await f.config.save(external);
  assert.equal(await f.view.saveDraft(), false);
  assert.equal(f.calls.profile, 0); assert.equal(f.ctx.powerUserSettings.personas.a, '甲');
  assert.equal(f.root.querySelector('[data-identity-name]').value, '不能覆盖');
  assert.equal(f.config.read().tags.body, 'externalbody');
  await f.view.discardDraft(); assert.equal(f.view.state().dirty, false);
 } finally {await f.dispose();}
});

test('a chat switch during role preflight preserves drafts and cannot save them into the next chat', async () => {
 const f = await fixture();
 try {
  input(f, '[data-identity-name]', '原聊天草稿'); input(f, '[data-avatar-mode]', 'bound', 'change');
  input(f, '[data-role-entry]', '7', 'change');
  const list = f.roles.list;
  f.roles.list = async book => {const rows = await list(book); f.ctx.chatId = 'chat-b'; return rows;};
  assert.equal(await f.view.saveDraft(), false);
  assert.equal(f.calls.profile, 0); assert.equal(f.calls.config, 0); assert.equal(f.calls.chat, 0);
  assert.equal(f.root.querySelector('[data-identity-name]').value, '原聊天草稿');
  assert.equal(f.config.read().story.userBinding, null);
 } finally {await f.dispose();}
});

test('interrupted identity switching resumes through the same save button after reopen', async () => {
 const f = await fixture();
 try {
  input(f, '[data-identity-picker]', 'b', 'change'); await tick(); f.failChat(true);
  assert.equal(await f.view.saveDraft(), false); assert.equal(f.identity.hasPending(), true);
  assert.equal(f.view.state().dirty, true);
  await f.reopen();
  assert.equal(f.root.querySelectorAll('footer button').length, 2);
  assert.equal(button(f.root, '继续完成身份切换'), undefined);
  f.failChat(false); assert.equal(await f.view.saveDraft(), true);
  assert.equal(f.identity.hasPending(), false); assert.equal(f.ctx.chatMetadata.persona, 'b');
  assert.equal(f.view.state().dirty, false);
 } finally {await f.dispose();}
});

test('unavailable role sources still allow the native identity draft to be saved', async () => {
 const f = await fixture({rolesUnavailable: true});
 try {
  input(f, '[data-identity-picker]', 'b', 'change'); await tick();
  assert.equal(f.active(), 'a'); assert.equal(await f.view.saveDraft(), true); assert.equal(f.active(), 'b');
  assert.match(f.root.textContent, /基点书读取失败：世界书服务未连接/);
 } finally {await f.dispose();}
});

test('failed native profile persistence retains the complete draft and retries the same values', async () => {
 const f = await fixture();
 try {
  input(f, '[data-identity-name]', '重试姓名'); input(f, '[data-identity-wish]', '重试心愿');
  input(f, '[data-wish-option="W00"]', true, 'change'); input(f, '[data-avatar-mode]', 'ensemble', 'change');
  f.failSettings(true); assert.equal(await f.view.saveDraft(), false);
  assert.equal(f.ctx.powerUserSettings.personas.a, '甲');
  assert.equal(f.ctx.powerUserSettings.persona_description, '甲的心愿');
  assert.equal(f.calls.config, 0); assert.equal(f.root.querySelector('[data-identity-name]').value, '重试姓名');
  assert.equal(f.root.querySelector('[data-avatar-mode]').value, 'ensemble');
  f.failSettings(false); assert.equal(await f.view.saveDraft(), true);
  assert.equal(f.ctx.powerUserSettings.personas.a, '重试姓名');
  assert.equal(f.ctx.powerUserSettings.persona_description, '重试心愿');
  assert.equal(f.config.read().story.userMode, 'ensemble'); assert.equal(f.view.state().dirty, false);
 } finally {await f.dispose();}
});

test('a confirmed profile save followed by chat change retains the receipt and blocks accidental retry in the next chat', async () => {
 const f = await fixture();
 try {
  input(f, '[data-identity-name]', '已确认姓名'); input(f, '[data-avatar-mode]', 'ensemble', 'change');
  f.onSettingsSave(() => {f.ctx.chatId = 'chat-b';});
  assert.equal(await f.view.saveDraft(), false);
  assert.equal(f.ctx.powerUserSettings.personas.a, '已确认姓名'); assert.equal(f.calls.config, 0);
  assert.equal(f.view.state().reviewRequired, true); assert.deepEqual(f.view.state().receipts, ['姓名与心愿']);
  assert.match(f.root.querySelector('footer').textContent, /已保存.*姓名与心愿/);
  assert.equal(await f.view.saveDraft(), false); assert.equal(f.calls.profile, 1);
  await f.view.discardDraft(); assert.equal(f.view.state().reviewRequired, false);
  assert.equal(f.root.querySelector('[data-identity-name]').value, '已确认姓名');
  assert.equal(f.config.read().story.userMode, undefined);
 } finally {await f.dispose();}
});

test('discarding fresh edits keeps a durable pending identity recovery and still allows leaving', async () => {
 const f = await fixture();
 try {
  input(f, '[data-identity-picker]', 'b', 'change'); await tick(); f.failChat(true);
  assert.equal(await f.view.saveDraft(), false); assert.equal(f.identity.hasPending(), true);
  input(f, '[data-identity-name]', '不需要保留的新名字');
  const leaving = button(f.root, '返回').onclick(); await tick();
  await button(f.root, '放弃修改').onclick();
  assert.equal(await leaving, true); assert.equal(f.closed(), 1);
  assert.equal(f.identity.hasPending(), true); assert.equal(f.ctx.powerUserSettings.personas.b, '乙');
 } finally {await f.dispose();}
});

test('cancelling fresh edits does not force saving an existing legacy wish migration before leaving', async () => {
 const f = await fixture();
 try {
  const legacy = f.config.read(); legacy.story.wish = '既有旧心愿'; await f.config.save(legacy); await f.reopen();
  assert.equal(f.root.querySelector('[data-identity-wish]').value, '甲的心愿\n\n既有旧心愿');
  assert.equal(f.view.state().draftDirty, false); assert.equal(f.view.requestLeave().allowed, true);
  input(f, '[data-identity-name]', '取消的名字');
  const leaving = button(f.root, '返回').onclick(); await tick(); await button(f.root, '放弃修改').onclick();
  assert.equal(await leaving, true); assert.equal(f.calls.profile, 0);
  assert.equal(f.config.read().story.wish, '既有旧心愿');
  assert.equal(f.ctx.powerUserSettings.persona_descriptions.a.description, '甲的心愿');
  assert.equal(await f.view.saveDraft(), true);
  assert.equal(f.ctx.powerUserSettings.persona_descriptions.a.description, '甲的心愿\n\n既有旧心愿');
  assert.equal(f.config.read().story.wish, '');
 } finally {await f.dispose();}
});

test('a failed source read can be retried without clearing profile or creation drafts and saves to that exact source', async () => {
 const f = await fixture();
 try {
  f.books.第二书 = []; await f.reopen();
  input(f, '[data-identity-name]', '同页姓名'); input(f, '[data-identity-wish]', '同页心愿');
  input(f, '[data-role-name]', '异源角色'); input(f, '[data-role-content]', '精确来源原文');
  input(f, '[data-role-create-confirm]', true, 'change');
  const list = f.roles.list; let sourceUnavailable = true;
  f.roles.list = async book => {if (sourceUnavailable && book === '第二书') throw Error('第二书读取失败'); return list(book);};
  input(f, '[data-role-book]', '第二书', 'change'); await f.view.settled();
  assert.equal(f.root.querySelector('[data-role-book]').value, '第二书');
  assert.equal(f.root.querySelector('[data-identity-name]').value, '同页姓名');
  assert.equal(f.root.querySelector('[data-role-content]').value, '精确来源原文');
  assert.equal(button(f.root, '重试读取资料来源').hidden, false);
  assert.equal(await f.view.saveDraft(), false); assert.equal(f.calls.profile, 0); assert.equal(f.calls.worldbook, 0);
  sourceUnavailable = false; await button(f.root, '重试读取资料来源').onclick();
  assert.equal(await f.view.saveDraft(), true);
  assert.equal(f.books.基点书.length, 1); assert.equal(f.books.第二书.length, 1);
  assert.equal(f.books.第二书[0].content, '精确来源原文');
  assert.equal(f.config.read().story.userBinding.book, '第二书');
 } finally {await f.dispose();}
});

test('a non-binding mode retains the explicitly selected source after save and reopen', async () => {
 const f = await fixture();
 try {
  f.books.另一资料书 = []; await f.reopen();
  input(f, '[data-avatar-mode]', 'generic', 'change');
  input(f, '[data-role-book]', '另一资料书', 'change'); await f.view.settled();
  assert.equal(await f.view.saveDraft(), true); await f.reopen();
  assert.equal(f.config.read().story.userBinding, null);
  assert.equal(f.root.querySelector('[data-avatar-mode]').value, 'generic');
  assert.equal(f.root.querySelector('[data-role-book]').value, '另一资料书');
 } finally {await f.dispose();}
});
