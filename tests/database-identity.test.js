import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Window} from 'happy-dom';
import {Runtime} from '../engine/runtime.mjs';
import {initializeState} from '../engine/materials.mjs';
import {digest} from '../engine/common.mjs';
import {createStoryIdentity,projectDatabaseIdentity} from '../engine/identity.mjs';
import {createConfiguration,identitySlots} from '../engine/config.mjs';
import {mountStoryResources} from '../engine/identity-ui.mjs';
const catalog=JSON.parse(readFileSync(new URL('../engine/catalog.json',import.meta.url),'utf8'));
function fixture(){
 const ctx={extensionSettings:{},chatMetadata:{},chatId:'chat-a',characterId:0,getWorldInfoNames:async()=>['资料','缇斯亚模板书','缇斯亚扩展资料书','缇斯亚美化书']};
 const config=createConfiguration({getContext:()=>ctx,persist:async()=>true}),rt=new Runtime(initializeState(catalog));
 rt.newRecord('T_CHAR_DOSSIER',{name:'旧名字',manifest:'作者原始设定'},'dossier-a');rt.newRecord('T_SYS_ENTITIES',{kind:'character',origin_record_ref:'origin-a'},'entity-a');rt.newRecord('M_FIELD_REFERENCES',{owner_table:'T_SYS_ENTITIES',owner_row_uuid:'entity-a',owner_field:'origin_record_ref',target_table:'T_CHAR_DOSSIER',target_row_uuid:'dossier-a',reference_kind:'record'},'origin-a');rt.newRecord('T_STATIC_WORLDS',{name:'此世界'},'world-a');
 let snapshot={state:rt.data,revision:1,contextKey:'scope-a'},writes=0;const operations=new Map(),commits=[];
 const database={read:async()=>structuredClone(snapshot),commit:async patch=>{const hash=digest(patch.changes);if(operations.has(patch.operationId)){assert.equal(operations.get(patch.operationId),hash);return {...structuredClone(snapshot),receipt:{replayed:true}};}assert.equal(patch.expectedRevision,snapshot.revision,'SAVE_CONFLICT');assert.equal(patch.contextKey,snapshot.contextKey,'CONTEXT_CONFLICT');const next=new Runtime(snapshot.state);for(const c of patch.changes){for(const field of Object.keys(c.values)){const def=next.spec(c.tableId,field);assert(!def.read_only,'automatic field must not be written: '+c.tableId+'.'+field);}if(!next.rows(c.tableId)[c.recordId])next.newRecord(c.tableId,{},c.recordId);for(const [k,v]of Object.entries(c.values))next.set([c.tableId,c.recordId,k,[]],v);}snapshot={...snapshot,state:next.data,revision:snapshot.revision+1};operations.set(patch.operationId,hash);commits.push(structuredClone(patch));writes++;return {...structuredClone(snapshot),receipt:{replayed:false}};}};
 const builtins={bookNames:()=>({templates:'缇斯亚模板书',extensions:'缇斯亚扩展资料书',beauty:'缇斯亚美化书'}),update:async()=>({status:'ready',books:[],conflicts:[],errors:[]}),status:()=>({status:'ready',errors:[],conflicts:[]})};
 const roles=createStoryIdentity({config,getContext:()=>ctx,database,builtins,getHelper:()=>null});return {ctx,config,roles,database,builtins,commits,get snapshot(){return snapshot;},set snapshot(v){snapshot=v;},get writes(){return writes;}};
}
const binding={database:true,entityId:'entity-a',dossierId:'dossier-a'};

test('identity projects the current canonical dossier through actual origin reference instead of a stale source book',async()=>{
 const f=fixture();await f.roles.bind({dossierId:'dossier-a'});assert.deepEqual(f.config.read().story.userBinding,binding);const p=projectDatabaseIdentity(f.snapshot,binding);assert.equal(p.name,'旧名字');assert.match(p.text,/作者原始设定/);assert.equal(f.writes,0);const slots=await identitySlots(f.ctx,f.config.read(),'',f.snapshot);assert.match(slots.tisya_user_identity,/作者原始设定/);
});
test('dossier editing is zero-write until confirmation and only changes the canonical owner',async()=>{
 const f=fixture(),before=(await f.roles.list()).entries[0],draft=await f.roles.previewEdit({dossierId:'dossier-a',values:{name:'新名字'},before});assert.equal(f.writes,0);assert.equal(draft.changes.length,1);assert.equal(draft.changes[0].tableId,'T_CHAR_DOSSIER');await f.roles.commitEdit(draft);assert.equal(f.writes,1);assert.equal(f.snapshot.state.tables.T_CHAR_DOSSIER['dossier-a'].values.manifest,'作者原始设定');assert.equal(f.snapshot.state.tables.T_SYS_ENTITIES['entity-a'].values.name,undefined);assert.equal(projectDatabaseIdentity(f.snapshot,binding).name,'新名字');
});
test('stale, cross-chat and tampered edits cannot change current records',async()=>{
 const f=fixture(),before=(await f.roles.list()).entries[0],draft=await f.roles.previewEdit({dossierId:'dossier-a',values:{name:'新名字'},before});const changed=structuredClone(draft);changed.changes[0].values.name='伪造';await assert.rejects(f.roles.commitEdit(changed),/已改变/);f.snapshot={...f.snapshot,revision:2};await assert.rejects(f.roles.commitEdit(draft),/SAVE_CONFLICT/);await assert.rejects(f.roles.previewEdit({dossierId:'dossier-a',values:{name:'另一个'},before}),/表单已变化/);f.ctx.chatId='chat-b';await assert.rejects(f.roles.commitEdit(draft),/聊天已切换/);assert.equal(f.writes,0);
});
test('typed character creation preserves author input as source, commits normalized links and retries once',async()=>{
 const f=fixture();await assert.rejects(f.roles.previewCreate({name:'新人物',content:'给定原文'}),/先交给助手提炼/);assert.equal(f.writes,0);
 const draft=await f.roles.previewCreate({name:'新人物',content:'给定原文',values:{public_identity:'原文已明确的公开身份'}});assert.equal(f.writes,0);assert.equal(draft.changes.length,3);assert(!draft.changes.some(c=>Object.hasOwn(c.values,'entity_id')||c.tableId==='T_SYS_ENTITIES'&&Object.hasOwn(c.values,'name')));assert.equal(draft.changes[0].values.manifest,undefined);const result=await f.roles.commitEdit(draft);assert.equal(f.writes,1);assert.equal(result.name,'【角色】新人物');assert(projectDatabaseIdentity(f.snapshot,f.config.read().story.userBinding).text.includes('原文已明确的公开身份'));assert.equal(f.commits[0].source.text,'给定原文');await f.roles.commitEdit(draft);assert.equal(f.writes,1);
});
test('DB save plus failed selection save reports its preserved partial result and retry does not duplicate',async()=>{
 const f=fixture(),draft=await f.roles.previewCreate({name:'新人物'}),save=f.config.save;f.config.save=async()=>{throw Error('设置写入失败');};await assert.rejects(f.roles.commitEdit(draft),/角色表单已保存.*绑定尚未确认/);assert.equal(f.writes,1);f.config.save=save;await f.roles.commitEdit(draft);assert.equal(f.writes,1);assert.equal(f.config.read().story.userBinding.entityId,draft.binding.entityId);
});
test('resources save per-chat DB locators and expose no regenerated initialization block',async()=>{
 const f=fixture();await f.roles.bind({dossierId:'dossier-a'});await f.roles.saveResources({referenceBooks:['资料'],phoneWorld:{database:true,worldId:'world-a'}});const p=await f.roles.phoneProfile();assert.equal(p.database,true);assert.equal(p.worldId,'world-a');assert.equal(p.worldText,undefined);assert.equal(p.characterText,undefined);assert.equal(f.writes,0);await assert.rejects(f.roles.saveResources({referenceBooks:['缇斯亚美化书']}),/资料书选择无效/);await assert.rejects(f.roles.saveResources({phoneWorld:{book:'旧世界',uid:1}}),/表单中实际世界/);
});
test('database UI preserves untouched empty fields and requires preview before committing edits',async()=>{
 const f=fixture();await f.roles.bind({dossierId:'dossier-a'});const win=new Window(),root=win.document.createElement('main');win.document.body.append(root);const view=mountStoryResources(win.document,root,{config:f.config,roles:f.roles});await view.ready;const name=root.querySelector('[data-role-edit-name]');assert(name);name.value='界面新名字';name.dispatchEvent(new win.Event('input'));const click=label=>[...root.querySelectorAll('button')].find(b=>b.textContent===label).click(),settle=()=>new Promise(r=>setTimeout(r,10));click('预览档案变更');await settle();assert.equal(f.writes,0);assert(root.textContent.includes('旧名字'));const confirm=root.querySelector('[data-database-confirm]');confirm.checked=true;confirm.dispatchEvent(new win.Event('change'));click('保存');await settle();assert.equal(f.writes,1);assert.deepEqual(f.commits[0].changes[0].values,{name:'界面新名字'});view.dispose();win.happyDOM.abort();
});
test('empty database sends creation to the same assistant without making identity selection a second writer',async()=>{
 const f=fixture();f.database.read=async()=>null;let requested=0,saved=0;const routes=[],creator={draft:async()=>{requested++;},save:async()=>{saved++;}};const roles=createStoryIdentity({config:f.config,getContext:()=>f.ctx,database:f.database,builtins:f.builtins,creator,getHelper:()=>null});const win=new Window(),root=win.document.createElement('main');win.document.body.append(root);const view=mountStoryResources(win.document,root,{config:f.config,roles,onCreate:input=>routes.push(structuredClone(input))});await view.ready;assert.equal(root.querySelector('[data-creation-goal]'),null);const button=label=>[...root.querySelectorAll('button')].find(b=>b.textContent===label);button('前往缇斯亚助手创建世界').click();await view.settled();assert.deepEqual(routes,[{kind:'world',destination:{book:'',newBook:true}}]);assert.equal(requested,0);assert.equal(saved,0);assert.equal(f.config.read().story.userBinding,null);view.dispose();win.happyDOM.abort();
});

test('main identity projection preserves source text and does not revive a stale derived name',()=>{
 const f=fixture(),dossier=f.snapshot.state.tables.T_CHAR_DOSSIER['dossier-a'];dossier.values.manifest='人物正文\n<手机初态>{"钱包":1}</手机初态>';dossier.values.name=null;dossier.states.name='unknown';f.snapshot.state.tables.T_SYS_ENTITIES['entity-a'].values.name='过期副本';const actual=projectDatabaseIdentity(f.snapshot,binding);assert.equal(actual.name,'dossier-a');assert.match(actual.text,/人物正文/);assert(actual.text.includes('钱包'));assert(!actual.text.includes('过期副本'));
});

test('ordinary prose extraction preserves exact UID, digest and raw seed in an extraction handoff without fake manifest completion',async()=>{
 const f=fixture();let source={entries:{6:{uid:6,comment:'【角色】旧档案人物',content:'原叙述\n<手机初态>{"钱包":{"余额":999}}</手机初态>',custom:{keep:true}}}};f.builtins.readSourceBook=async()=>structuredClone(source);let value=f.config.read();value.story.userBinding={book:'基点书',uid:6};value.story.userMode='bound';await f.config.save(value);
 const draft=await f.roles.previewSourceExtraction(f.config.read().story.userBinding);assert.equal(f.writes,0);assert.equal(draft.requiresExtraction,true);assert.equal(draft.source.uid,6);assert.match(draft.source.digest,/^[a-f0-9]{64}$/);assert.equal(draft.changes,undefined);assert(draft.source.entry.content.includes('钱包'));assert.deepEqual(draft.destination,{book:'基点书',uid:6});
 await assert.rejects(f.roles.commitEdit(draft),/草稿已改变/);source.entries[6].content+='别处修改';const fresh=await f.roles.previewSourceExtraction(f.config.read().story.userBinding);assert.notEqual(fresh.source.digest,draft.source.digest);assert.equal(fresh.source.entry.content,source.entries[6].content);assert.equal(f.writes,0);assert.deepEqual(f.config.read().story.userBinding,{book:'基点书',uid:6});
});
