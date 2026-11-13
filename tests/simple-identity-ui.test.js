import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {proseFixture} from './fixtures/prose-identity.mjs';

async function setup(t){
 const f=await proseFixture(),window=new Window(),root=window.document.createElement('main');window.document.body.append(root);await f.mount(window.document,root);
 t.after(async()=>{f.view.dispose();await window.happyDOM.abort();});
 return Object.assign(f,{window,root,get scroll(){return root.querySelector('.tisya-identity-content');},async choose(selector,value){const node=root.querySelector(selector);assert(node,selector);node.value=value;await node.onchange();await f.view.settled();},edit(key,value){const node=root.querySelector('[data-simple-core-field='+key+']');assert(node);node.value=value;node.oninput();}});
}
async function select(f,uid='0'){await f.choose('[data-avatar-mode]','bound');await f.choose('[data-role-book]','基点书');await f.choose('[data-source-entry]',uid);}
async function requestText(f){await f.host.before('normal');const request=f.payload();await f.host.payloadReady(request);assert.equal(f.host.accepted(),true);return request.messages.map(m=>m.content).join('\n');}

test('book/character selection updates stable controls without replacing the scroller or unrelated content',async t=>{
 const f=await setup(t),content=f.scroll,heading=content.firstChild,mode=f.root.querySelector('[data-avatar-mode]'),book=f.root.querySelector('[data-role-book]'),entry=f.root.querySelector('[data-source-entry]');
 let replacements=0;const replace=content.replaceChildren.bind(content);content.replaceChildren=(...nodes)=>{replacements++;content.scrollTop=0;replace(...nodes);};content.scrollTop=420;
 await select(f);const input=f.root.querySelector('[data-simple-core-field=content]');assert.equal(input.hidden,false);assert.equal(f.view.exportDraft().sourceEditor.content,f.text);
 await f.choose('[data-source-entry]','1');assert(input===f.root.querySelector('[data-simple-core-field=content]'),'editor remains mounted');assert.equal(input.value,'不得注入的其他人物');
 assert.equal(replacements,0);assert(content.firstChild===heading,'heading remains mounted');assert(f.root.querySelector('[data-avatar-mode]')===mode,'mode stays mounted');assert(f.root.querySelector('[data-role-book]')===book,'book stays mounted');assert(f.root.querySelector('[data-source-entry]')===entry,'entry stays mounted');assert.equal(content.scrollTop,420);
 assert.equal(f.root.querySelector('[data-prose-confirm]'),null);assert.equal(f.root.querySelector('[data-database-confirm]'),null);
 assert.equal(await f.view.saveDraft(),true,f.root.textContent);assert.equal(f.host.config.read().story.userBinding.uid,1);assert.equal(content.scrollTop,420);
});

test('save keeps live contents until ready, restores scroll, open optional sections, focus and caret',async t=>{
 const f=await setup(t);await select(f);const content=f.scroll,oldHeading=content.firstChild,editor=f.root.querySelector('[data-simple-core-field=content]');
 const details=f.root.querySelector('[data-identity-advanced]');details.open=true;editor.focus();editor.setSelectionRange(3,8);content.scrollTop=525;
 let swaps=0;const replace=content.replaceChildren.bind(content);content.replaceChildren=(...nodes)=>{assert(nodes.length>1);assert(content.firstChild===oldHeading,'live content must stay mounted during reads');swaps++;content.scrollTop=0;replace(...nodes);};
 f.readHook(()=>{assert(content.firstChild===oldHeading,'live content must stay mounted during reads');assert(content.querySelector('[data-simple-core-field=content]'));});
 assert.equal(await f.view.saveDraft(),true,f.root.textContent);assert.equal(swaps,1);assert.equal(content.scrollTop,525);assert.equal(f.root.querySelector('[data-identity-advanced]').open,true);
 const active=f.window.document.activeElement;assert(active===f.root.querySelector('[data-simple-core-field=content]'),'editor focus should survive redraw');assert.equal(active.selectionStart,3);assert.equal(active.selectionEnd,8);
});

test('renaming a selected character preserves original line endings, UID, unrelated entries and unknown metadata',async t=>{
 const f=await setup(t),before=structuredClone(f.data.books),database=await f.host.readDatabase();await select(f);f.edit('name','新名称');assert.equal(await f.view.saveDraft(),true,f.root.textContent);
 const row=f.data.books.基点书[0];assert.equal(row.uid,0);assert.equal(row.name,'【角色】新名称');assert.equal(row.content,f.text);assert.deepEqual(row.vendor,before.基点书[0].vendor);assert.deepEqual(f.data.books.基点书[1],before.基点书[1]);assert.equal(f.host.config.read().story.userBinding.name,'新名称');assert.deepEqual(await f.host.readDatabase(),database);
 f.makeHost();await f.mount(f.window.document,f.root);assert.equal(f.root.querySelector('[data-simple-core-field=name]').value,'新名称');assert.equal(f.view.state().dirty,false);assert.equal((await requestText(f)).split(f.text).length-1,1);
});

test('inline prose edit saves and rebinds its new digest in one action, surviving a cold reopen',async t=>{
 const f=await setup(t);await select(f);assert.equal(await f.view.saveDraft(),true);const old=f.host.config.read().story.userBinding.sourceDigest;
 f.edit('content','修改后的完整原文\n第二行');assert.equal(await f.view.saveDraft(),true,f.root.textContent);assert.notEqual(f.host.config.read().story.userBinding.sourceDigest,old);assert.equal(f.data.books.基点书.length,2);
 f.makeHost();await f.mount(f.window.document,f.root);assert.equal(f.root.querySelector('[data-simple-core-field=content]').value,'修改后的完整原文\n第二行');assert((await requestText(f)).includes('修改后的完整原文\n第二行'));assert.equal(f.view.state().dirty,false);
});

test('custom character creates and binds in one save; binding failure retries the same saved UID',async t=>{
 const f=await setup(t),before=await f.host.readDatabase();let writes=0;const update=f.helper.updateWorldbookWith;f.helper.updateWorldbookWith=async(...args)=>{writes++;return update(...args);};await select(f,'__custom__');
 f.edit('name','自定义阿墨');f.edit('content','自定义完整原文');f.failSave(true);assert.equal(await f.view.saveDraft(),false);assert.equal(f.data.books.基点书.length,3);const uid=f.data.books.基点书[2].uid;assert.equal(f.root.querySelector('[data-simple-core-field=content]').value,'自定义完整原文');assert.equal(f.host.config.read().story.userBinding,null);assert.equal(f.view.state().dirty,true);
 f.failSave(false);assert.equal(await f.view.saveDraft(),true,f.root.textContent);assert.equal(writes,1);assert.equal(f.data.books.基点书.length,3);assert.equal(f.host.config.read().story.userBinding.uid,uid);assert.equal(f.host.config.read().story.userBinding.name,'自定义阿墨');assert.deepEqual(await f.host.readDatabase(),before);assert.equal((await requestText(f)).split('自定义完整原文').length-1,1);
});

test('source conflicts keep inline edits and saved binding; cancel restores the saved selection',async t=>{
 const f=await setup(t);await select(f);assert.equal(await f.view.saveDraft(),true);const binding=f.host.config.read().story.userBinding;f.edit('content','尚未保存的输入');f.data.books.基点书[0].content='其他位置的改动';
 assert.equal(await f.view.saveDraft(),false);assert.equal(f.root.querySelector('[data-simple-core-field=content]').value,'尚未保存的输入');assert.deepEqual(f.host.config.read().story.userBinding,binding);assert.equal(f.data.books.基点书[0].content,'其他位置的改动');
 assert.equal(await f.view.discardDraft(),true);assert.equal(f.root.querySelector('[data-simple-core-field=content]').value,'其他位置的改动');assert.equal(f.view.state().dirty,false);
});

test('failed source read leaves the previous selection, controls and input intact',async t=>{
 const f=await setup(t);await select(f);const input=f.root.querySelector('[data-simple-core-field=content]');f.readHook(()=>{throw Error('暂时无法读取');});await f.choose('[data-source-entry]','1');assert.equal(f.root.querySelector('[data-source-entry]').value,'0');assert(f.root.querySelector('[data-simple-core-field=content]')===input,'editor stays mounted on read failure');assert.equal(f.view.exportDraft().sourceEditor.content,f.text);assert.equal(f.view.exportDraft().profile.source.uid,0);assert.match(f.root.textContent,/暂时无法读取/);
});

test('choosing empty custom then another character requires no discard or extra confirmation',async t=>{
 const f=await setup(t);await select(f,'__custom__');await f.choose('[data-source-entry]','0');assert.equal(f.view.exportDraft().authorDraft,null);assert.equal(f.view.exportDraft().profile.source.uid,0);assert.equal(await f.view.saveDraft(),true,f.root.textContent);
});
