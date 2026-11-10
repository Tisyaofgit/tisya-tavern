import {readFileSync} from 'node:fs';
import {Runtime} from '../engine/runtime.mjs';
import {initializeState} from '../engine/materials.mjs';
import{contractorMessages}from'../engine/contractor.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import {Window}from'happy-dom';
import {createStoryIdentity}from'../engine/identity.mjs';import{mountMatrixIdentity}from'../engine/identity-ui.mjs';import{createConfiguration,identitySlots,baseline,compilePrompts}from'../engine/config.mjs';import{PREFERENCE_GROUPS}from'../engine/preferences.mjs';
function setup(){
 let books={},globals=[],writes=0,snapshot={state:initializeState(identityCatalog),revision:0,contextKey:'current'};const receipts=new Map();
 const ctx={extensionSettings:{},chatMetadata:{},chatId:'a',characterId:0,loadWorldInfo:async name=>({entries:Object.fromEntries((books[name]??[]).map(e=>[e.uid,{...e,comment:e.name}]))})};
 const config=createConfiguration({getContext:()=>ctx,persist:async()=>true});
 const h={getGlobalWorldbookNames:async()=>globals,getWorldbookNames:async()=>Object.keys(books),getWorldbook:async n=>structuredClone(books[n]),rebindGlobalWorldbooks:async names=>{globals=names;}};
 const database={read:async()=>structuredClone(snapshot),commit:async input=>{if(receipts.has(input.operationId))return structuredClone(receipts.get(input.operationId));assert.equal(input.expectedRevision,snapshot.revision);const rt=new Runtime(snapshot.state);for(const c of input.changes){if(!rt.rows(c.tableId)[c.recordId])rt.newRecord(c.tableId,{},c.recordId);for(const [key,value] of Object.entries(c.values))rt.set([c.tableId,c.recordId,key,[]],value,c.states?.[key]??'known');}snapshot={...snapshot,state:rt.data,revision:snapshot.revision+1};const result={...snapshot,receipt:{replayed:false}};receipts.set(input.operationId,structuredClone(result));return structuredClone(result);}};
 ctx.tisyaReadDatabase=database.read;const builtins={update:async()=>({status:'ready',books:[],conflicts:[],errors:[]}),status:()=>({status:'ready',errors:[],conflicts:[]}),bookNames:()=>({templates:'缇斯亚模板书',beauty:'缇斯亚美化书'})};
 const roles=createStoryIdentity({config,getContext:()=>ctx,getHelper:()=>h,database,builtins});return {ctx,config,roles,h,books,database,writes:()=>writes,globals:()=>globals,get current(){return snapshot;},set current(value){snapshot=value;}};
}

const identityCatalog=JSON.parse(readFileSync(new URL('../engine/catalog.json',import.meta.url),'utf8'));
async function useCurrentIdentity(f,name,content){const rt=new Runtime(initializeState(identityCatalog));rt.newRecord('T_CHAR_DOSSIER',{name,public_identity:content},'dossier');rt.newRecord('T_SYS_ENTITIES',{kind:'character',origin_record_ref:'origin'},'entity');rt.newRecord('M_FIELD_REFERENCES',{owner_table:'T_SYS_ENTITIES',owner_row_uuid:'entity',owner_field:'origin_record_ref',target_table:'T_CHAR_DOSSIER',target_row_uuid:'dossier',reference_kind:'record'},'origin');f.current={state:rt.data,revision:1,contextKey:'current'};f.ctx.tisyaReadDatabase=async()=>structuredClone(f.current);const v=f.config.read();v.story.userBinding={database:true,entityId:'entity',dossierId:'dossier'};v.story.userName=name;v.story.userMode='bound';await f.config.save(v);}
test('original persona description enters only the wish; selected original wish preset remains exact',async()=>{const f=setup();await useCurrentIdentity(f,'阿青','角色条目自己的身份');let v=f.config.read();v.story.wish='旧独立入口的补充';v.story.play={choices:{W:['W00','W07']}};await f.config.save(v);const original='原身份描述\n标点、空格 不改。',slots=await identitySlots(f.ctx,f.config.read(),original);assert.equal(slots.tisya_contractor_wish.split(original).length-1,1);assert(!slots.tisya_contractor_wish.includes('旧独立入口'));assert(slots.tisya_contractor_wish.includes(PREFERENCE_GROUPS.find(g=>g.id==='W').options.find(o=>o.id==='W00').effect));assert(!slots.tisya_user_identity.includes(original));assert.match(slots.tisya_user_identity,/角色条目自己的身份/);f.current.state.tables.T_CHAR_DOSSIER.dossier.values.name='改名后';const renamed=await identitySlots(f.ctx,f.config.read(),original);assert.match(renamed.tisya_user_identity,/故事主角：改名后/);assert(compilePrompts(baseline,f.config.read(),renamed).prompts.some(p=>p.content?.includes('改名后')));});
test('native persona injection is disabled in the saved preset and relocated from depth or author note without changing history',()=>{
 for(const order of baseline.prompt_order)assert.equal(order.order.find(p=>p.identifier==='personaDescription').enabled,false);
 const wish={role:'user',content:'[CONTRACTOR.WISH]\n原身份描述\n[/CONTRACTOR.WISH]'},history={role:'user',content:'真实历史原话'};
 for(const position of [0,4,2,3]){const value=[2,3].includes(position)?'保留作者注\n原身份描述':'原身份描述',ctx={powerUserSettings:{persona_description_position:position},extensionPrompts:{PERSONA_DESCRIPTION:{value,role:0},'2_floating_prompt':{value,role:0}},chat:[{is_user:true,mes:history.content}]},input=[wish,{role:'system',content:value},history];const out=contractorMessages(input,ctx,'原身份描述');assert.deepEqual(out.at(-1),history);assert.equal(out.map(m=>m.content).join('\n').split('原身份描述').length-1,1);if(position===2||position===3)assert(out.some(m=>m.content==='保留作者注'));assert.equal(input[1].content,value);}
 const ctx={powerUserSettings:{persona_description_position:4},extensionPrompts:{PERSONA_DESCRIPTION:{value:'同文',role:1}},chat:[{is_user:true,mes:'同文'}]};assert.throws(()=>contractorMessages([{role:'user',content:'同文'}],ctx,'同文'),/未改动历史/);
});

test('binding and ensemble mode drive the same original N01 contract despite stale legacy choices and IDs',async()=>{
 const f=setup();let v=f.config.read();v.playDefaults={choices:{N01:'N01-C'},parameters:{active_avatar_dossier_id:'WRONG_LEGACY_ID'}};await f.config.save(v);
 await useCurrentIdentity(f,'统一角色','只属于统一角色的原文');v=f.config.read();const slots=await identitySlots(f.ctx,v,'原身份心愿');const compiled=compilePrompts(baseline,v,slots),n=compiled.prompts.find(p=>p.identifier==='tisya_pref_narrative').content;
 assert.match(n,/dossier \[T_CHAR_DOSSIER#dossier\]/);assert(!n.includes('WRONG_LEGACY_ID'));assert.equal(n.split('@AVATAR.BIND :=').length-1,1);assert.match(slots.tisya_user_identity,/统一角色的原文/);
 await f.roles.bind({mode:'ensemble'});v=f.config.read();const zero=await identitySlots(f.ctx,v,'原身份心愿');assert.equal(zero.tisya_user_identity,'');assert.match(compilePrompts(baseline,v,zero).prompts.find(p=>p.identifier==='tisya_pref_narrative').content,/Zero-avatar ensemble/);assert.equal(v.playDefaults.parameters.active_avatar_dossier_id,'WRONG_LEGACY_ID');
 f.ctx.chatId='b';assert.equal(f.config.read().story.userBinding,null);f.ctx.chatId='a';assert.equal(f.config.read().story.userMode,'ensemble');
});
test('legacy select-dossier mode requires an actual selected entry instead of a typed ID fallback',async()=>{
 const f=setup();const v=f.config.read();v.story.play={choices:{N01:'N01-B'},parameters:{active_avatar_dossier_id:'typed-but-unbound'}};await f.config.save(v);
 await assert.rejects(()=>identitySlots(f.ctx,f.config.read(),''),/选择基点书/);assert.throws(()=>compilePrompts(baseline,f.config.read(),{}),/选择基点书/);
});
test('empty native persona registry still displays the wish slot, opt-in W00 and every builtin wish',async()=>{
 const {createIdentityService}=await import('../user-identity-service.js');const f=setup();f.ctx.powerUserSettings={personas:{},persona_descriptions:{},persona_description:'保留原身份描述'};f.ctx.name1='用户';const identity=createIdentityService({getContext:()=>f.ctx,getAvatar:()=>'',persistSettings:async()=>true,persistChat:async()=>true});
 const w=new Window(),root=w.document.createElement('div');w.document.body.append(root);const ui=mountMatrixIdentity(w.document,root,{identity,config:f.config,roles:f.roles,onClose(){},onNative(){}});await ui.ready;
 assert.equal(root.querySelector('[data-identity-wish]').value,'保留原身份描述');assert(root.querySelector('[data-wish-module="0"] [data-wish-option="W00"]'));assert.equal(root.querySelectorAll('[data-builtin-wishes] [data-wish-option]').length,6);
 const c=root.querySelector('[data-wish-option="W00"]');c.checked=true;c.dispatchEvent(new w.Event('change'));const text=root.querySelector('[data-identity-wish]');text.value='修改后的原身份描述';text.dispatchEvent(new w.Event('input'));[...root.querySelectorAll('button')].find(b=>b.textContent==='保存').click();await new Promise(r=>setTimeout(r,10));
 assert.equal(f.ctx.powerUserSettings.persona_description,'修改后的原身份描述');assert.deepEqual(f.ctx.powerUserSettings.personas,{});assert.equal(f.writes(),0);assert.equal(f.books.基点书,undefined);
 const slots=await identitySlots(f.ctx,f.config.read(),f.ctx.powerUserSettings.persona_description),wish=PREFERENCE_GROUPS.find(g=>g.id==='W');assert(slots.tisya_contractor_wish.includes(wish.base_effect));assert(slots.tisya_contractor_wish.includes(wish.options.find(o=>o.id==='W00').effect));assert.equal(slots.tisya_contractor_wish.split('修改后的原身份描述').length-1,1);ui.dispose();await w.happyDOM.abort();
});
test('base and optional wishes remain absent when the original description is empty and every module is off',async()=>{const f=setup(),v=f.config.read();v.story.play={choices:{W:[]}};await f.config.save(v);assert.equal((await identitySlots(f.ctx,f.config.read(),'')).tisya_contractor_wish,'');});

test('current identity never reads or changes native global worldbook activation',async()=>{
 const f=setup();f.h.getGlobalWorldbookNames=()=>{throw Error('must not read global activation');};f.h.rebindGlobalWorldbooks=()=>{throw Error('must not change global activation');};
 await useCurrentIdentity(f,'甲','只注入选中的角色');assert.equal((await f.roles.list()).entries.length,1);const slots=await identitySlots(f.ctx,f.config.read(),'心愿直通原文');assert.match(slots.tisya_user_identity,/只注入选中的角色/);assert.equal(f.writes(),0);assert.deepEqual(f.globals(),[]);
});
test('identity service refuses the retired book-only fallback without touching source books',()=>{let reads=0;assert.throws(()=>createStoryIdentity({config:{},getContext:()=>({}),getHelper:()=>{reads++;return {};}}),/统一表单/);assert.equal(reads,0);});
test('identity picker drafts the selection before a shared save; interrupted binding is recoverable on this page',async()=>{
 const {createIdentityService}=await import('../user-identity-service.js');const f=setup();let active='a',failChat=false;
 Object.assign(f.ctx,{name1:'甲',chatMetadata:{},powerUserSettings:{personas:{a:'甲',b:'乙'},persona_descriptions:{a:{description:'甲的心愿'},b:{description:'乙的心愿'}},persona_description:'甲的心愿'}});
 const identity=createIdentityService({getContext:()=>f.ctx,getAvatar:()=>active,applyActive:(id,name)=>{active=id;f.ctx.name1=name;f.ctx.powerUserSettings.persona_description=f.ctx.powerUserSettings.persona_descriptions[id].description;},persistSettings:async()=>true,persistChat:async()=>!failChat});
 const w=new Window(),root=w.document.createElement('div');w.document.body.append(root);const mount=()=>mountMatrixIdentity(w.document,root,{identity,config:f.config,roles:f.roles,onClose(){},onNative(){}});let ui=mount();await ui.ready;
 const change=async id=>{const picker=root.querySelector('[data-identity-picker]');picker.value=id;picker.dispatchEvent(new w.Event('change'));await new Promise(r=>setImmediate(r));};
 await change('b');assert.equal(active,'a');assert.equal(f.ctx.chatMetadata.persona,undefined);assert.equal(root.querySelector('[data-identity-wish]').value,'乙的心愿');
 assert.equal(await ui.saveDraft(),true);assert.equal(active,'b');assert.equal(f.ctx.chatMetadata.persona,'b');
 const wish=root.querySelector('[data-identity-wish]');wish.value='未保存的草稿';wish.dispatchEvent(new w.Event('input'));await change('a');assert.equal(active,'b');assert.equal(root.querySelector('[data-identity-wish]').value,'未保存的草稿');
 assert.equal(root.querySelectorAll('[role=dialog]').length,1);await [...root.querySelectorAll('button')].find(b=>b.textContent==='继续编辑').onclick();await new Promise(r=>setImmediate(r));await ui.discardDraft();
 failChat=true;await change('a');assert.equal(await ui.saveDraft(),false);assert(identity.hasPending());assert(root.textContent.includes('使用底部保存继续核对'));ui.dispose();ui=mount();await ui.ready;failChat=false;
 assert.equal(await ui.saveDraft(),true);assert.equal(identity.hasPending(),false);assert.equal(f.ctx.chatMetadata.persona,'a');
 ui.dispose();await w.happyDOM.abort();
});
test('unavailable worldbook service leaves persona switching usable and its error visible',async()=>{
 const f=setup(),w=new Window(),root=w.document.createElement('div');w.document.body.append(root);let active='a';const identity={read:()=>({active,revision:1,scope:{chatId:'a'},personas:[{id:'a',name:'甲',descriptor:{}},{id:'b',name:'乙',descriptor:{}}]}),select:async({id})=>{active=id;}};
 const roles={...f.roles,sourceChoices:async()=>{throw Error('helper unavailable');}};const ui=mountMatrixIdentity(w.document,root,{identity,roles,config:f.config,onClose(){},onNative(){}});await ui.ready;
 const picker=root.querySelector('[data-identity-picker]');picker.value='b';picker.dispatchEvent(new w.Event('change'));await new Promise(r=>setImmediate(r));assert.equal(active,'a');assert.equal(await ui.saveDraft(),true);assert.equal(active,'b');assert(root.textContent.includes('helper unavailable'));ui.dispose();await w.happyDOM.abort();
});

test('one custom wish editor merges both existing sources exactly, persists one source and does not duplicate on partial-save retry',async()=>{
 const f=setup(),v=f.config.read();v.story.wish='下面旧心愿';await f.config.save(v);let profile={id:'p',name:'我',descriptor:{description:'上面旧自定义'}};
 const identity={read:()=>({active:'p',revision:1,personas:[structuredClone(profile)],scope:{chatId:'a'}}),saveProfile:async p=>{profile.descriptor.description=p.description;}};
 const w=new Window(),root=w.document.createElement('div');w.document.body.append(root);const mount=()=>mountMatrixIdentity(w.document,root,{identity,config:f.config,roles:f.roles,onClose(){},onNative(){}});let ui=mount();await ui.ready;
 assert.equal(root.querySelectorAll('[data-identity-wish]').length,1);assert.equal(root.querySelector('[data-identity-wish]').value,'上面旧自定义\n\n下面旧心愿');assert.equal(root.querySelector('[data-wish-option=W07]'),null);
 const save=f.config.save;f.config.save=async()=>{throw Error('模拟配置保存失败');};[...root.querySelectorAll('button')].find(b=>b.textContent==='保存').click();await new Promise(r=>setTimeout(r,5));ui.dispose();ui=mount();await ui.ready;
 assert.equal(root.querySelector('[data-identity-wish]').value,'上面旧自定义\n\n下面旧心愿');f.config.save=save;[...root.querySelectorAll('button')].find(b=>b.textContent==='保存').click();await new Promise(r=>setTimeout(r,5));assert.equal(f.config.read().story.wish,'');
 const slot=(await identitySlots(f.ctx,f.config.read(),profile.descriptor.description)).tisya_contractor_wish;assert.equal(slot.split('上面旧自定义').length-1,1);assert.equal(slot.split('下面旧心愿').length-1,1);assert(f.config.read().story.play.choices.W.includes('W07'));
 const text=root.querySelector('[data-identity-wish]');text.value='';text.dispatchEvent(new w.Event('input'));[...root.querySelectorAll('button')].find(b=>b.textContent==='保存').click();await new Promise(r=>setTimeout(r,5));assert(!f.config.read().story.play.choices.W.includes('W07'));ui.dispose();await w.happyDOM.abort();
});

test('identity page allows its own clean return and native-manager navigation',async()=>{
 const f=setup(),w=new Window(),root=w.document.createElement('div');w.document.body.append(root);let ui,count=0;const navigate=()=>{assert.equal(ui.requestLeave().allowed,true);count++;};
 ui=mountMatrixIdentity(w.document,root,{identity:{read:()=>({active:'',revision:1,personas:[],scope:{chatId:'a'}})},config:f.config,roles:f.roles,onClose:navigate,onNative:navigate});await ui.ready;
 for(const label of ['返回','原生身份管理']){[...root.querySelectorAll('button')].find(b=>b.textContent===label).click();await new Promise(r=>setImmediate(r));}assert.equal(count,2);ui.dispose();await w.happyDOM.abort();
});
