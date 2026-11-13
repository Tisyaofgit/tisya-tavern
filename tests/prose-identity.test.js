import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {proseFixture} from './fixtures/prose-identity.mjs';
import {proseIdentityReference} from '../engine/identity.mjs';
import {identitySlots} from '../engine/config.mjs';
async function ui(t){const f=await proseFixture(),window=new Window(),root=window.document.createElement('main');window.document.body.append(root);await f.mount(window.document,root);t.after(async()=>{f.view.dispose();await window.happyDOM.abort();});return Object.assign(f,{window,root,async pick(selector,value){const n=root.querySelector(selector);assert(n);n.value=value;await n.onchange();await f.view.settled();},async click(label){const n=[...root.querySelectorAll('button')].find(n=>n.textContent===label);assert(n,label);n.click();await f.view.settled();}});}
async function preview(f){await f.pick('[data-role-book]','基点书');await f.pick('[data-source-entry]','0');}
test('prose selection exposes exact text for editing, saves without model/table creation, cold reopens and reaches final payload once',async t=>{
 const f=await ui(t),state=await f.host.readDatabase(),books=structuredClone(f.data.books);await preview(f);
 assert.equal(f.view.exportDraft().sourceEditor.content,f.text);assert.equal(f.root.querySelector('[data-prose-confirm]'),null);assert(![...f.root.querySelectorAll('button')].some(n=>n.textContent==='预览使用此人物'));assert.equal(f.host.config.read().story.userBinding,null);
 assert.equal(await f.view.saveDraft(),true,f.root.textContent);
 const binding=f.host.config.read().story.userBinding;assert.equal(binding.uid,0);assert.equal(binding.sourceMode,'prose');assert.equal(binding.content,undefined);assert.equal(binding.database,undefined);
 assert.deepEqual(f.data.books,books);assert.deepEqual(await f.host.readDatabase(),state);assert.equal(f.view.state().dirty,false);
 f.makeHost();await f.mount(f.window.document,f.root);assert.match(f.root.textContent,/当前人物使用基点原文：原文旅人/);assert.equal(f.view.state().dirty,false);
 await f.host.before('normal');const lore={globalLore:[{...books.基点书[0],world:'基点书'},{...books.基点书[1],world:'基点书'}],characterLore:[],personaLore:[],chatLore:[]};await f.host.entriesLoaded(lore);assert.equal(lore.globalLore.length,0);
 const request=f.payload();await f.host.payloadReady(request);const text=request.messages.map(m=>m.content).join('\n');assert.equal(text.split(f.text).length-1,1);assert(!text.includes('不得注入的其他人物'));assert.equal(f.host.accepted(),true);assert.deepEqual(f.data.books,books);
});
test('prose preflight rejects edited source and cross-chat work while retaining draft and existing state',async t=>{
 const f=await ui(t);await preview(f);f.data.books.基点书[0].content='外部修订';assert.equal(await f.view.saveDraft(),false);assert.match(f.root.textContent,/原文已变化/);assert.equal(f.view.exportDraft().prosePreview.content,f.text);assert.equal(f.host.config.read().story.userBinding,null);
 f.data.books.基点书[0].content=f.text;f.ctx.chatId='other';assert.equal(await f.view.saveDraft(),false);assert.equal(f.host.config.read().story.userBinding,null);f.ctx.chatId='prose-chat';assert.equal(await f.view.saveDraft(),true,f.root.textContent);
});
test('failed configuration acknowledgement keeps prose draft and retries without source or table writes',async t=>{
 const f=await ui(t),state=await f.host.readDatabase();await preview(f);f.failSave(true);assert.equal(await f.view.saveDraft(),false);assert.equal(f.host.config.read().story.userBinding,null);assert.equal(f.view.exportDraft().prosePreview.content,f.text);f.failSave(false);assert.equal(await f.view.saveDraft(),true,f.root.textContent);assert.deepEqual(await f.host.readDatabase(),state);assert.equal(f.data.books.基点书[0].content,f.text);
});
test('final request rejects source mutation or deletion after preparation without using cached prose',async()=>{
 for(const change of ['text','delete']){const f=await proseFixture(),roles=f.roles(),raw=await roles.readSource({book:'基点书',uid:0});await roles.bind({source:proseIdentityReference(raw)});await f.host.before('normal');const request=f.payload(),before=structuredClone(request);
 if(change==='text')f.data.books.基点书[0].content='改后原文';else f.data.books.基点书.shift();await assert.rejects(()=>f.host.payloadReady(request),/原文已变化|不存在/);assert.equal(f.host.accepted(),false);assert.deepEqual(request,before);}
});
test('adoption guards asynchronous chat switch and rejects definition or unreviewed raw binding',async()=>{
 const f=await proseFixture(),roles=f.roles(),raw=await roles.readSource({book:'基点书',uid:0}),source=proseIdentityReference(raw);f.readHook(async()=>{f.ctx.chatId='changed';});await assert.rejects(()=>roles.bind({source}),/聊天已切换/);assert.equal(f.host.config.read().story.userBinding,null);
 assert.throws(()=>proseIdentityReference({...raw,definition:{kind:'character'}}),/原文/);f.readHook(null);await assert.rejects(()=>roles.bind({source:{book:'基点书',uid:0}}),/原文已变化/);
});
test('prose provenance survives native wrapper metadata and changes are explicitly re-adopted',async t=>{
 const f=await ui(t);await preview(f);assert.equal(await f.view.saveDraft(),true);f.data.books.基点书[0].vendor.keep='metadata update';const slots=await identitySlots(f.ctx,f.host.config.read(),'');assert(slots.tisya_user_identity.includes(f.text));f.data.books.基点书[0].content='明确更新后的原文';await assert.rejects(()=>identitySlots(f.ctx,f.host.config.read(),''),/原文已变化/);await preview(f);assert.equal(await f.view.saveDraft(),true,f.root.textContent);assert((await identitySlots(f.ctx,f.host.config.read(),'')).tisya_user_identity.includes('明确更新后的原文'));
});
test('cancel and switching to ensemble discard binding changes without creating an empty dossier',async t=>{
 const f=await ui(t),state=await f.host.readDatabase();await preview(f);assert.equal(await f.view.discardDraft(),true);assert.equal(f.host.config.read().story.userBinding,null);await preview(f);await f.pick('[data-avatar-mode]','ensemble');assert.equal(await f.view.saveDraft(),true,f.root.textContent);assert.equal(f.host.config.read().story.userBinding,null);assert.equal(f.host.config.read().story.userMode,'ensemble');assert.deepEqual(await f.host.readDatabase(),state);
});
