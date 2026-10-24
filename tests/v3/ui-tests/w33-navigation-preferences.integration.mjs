import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {createInstallerHarness} from '../host-tests/installer-harness.mjs';
import {createApplication} from '../../../v3/application.mjs';
import {createConfigurationBook} from '../../../v3/configuration-book.mjs';
import {validateTagTemplateBank} from '../../../v3/tags.mjs';
import {mountWorkbench} from '../../../v3/workbench.mjs';
import {createRuntimePreset} from '../../../v3/preset-template.mjs';
import {projectRetained} from '../../../v3/host-runtime.mjs';
import {KEY,emptyConfig,defaultWorld,createStore,worldKey} from '../../../config/core.js';

const copy=structuredClone;
const access={readers:['读者'],knowers:[]};
const initial={id:'person',table:'objects',rev:1,values:{名称:'阿绫',类型:'character',描述:'修理铺的店主'},access,lockedFields:[]};
const proposal=changes=>({templates:[],changes,pending:[]});
const nativeJson=value=>Array.isArray(value)?value.map(nativeJson):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,nativeJson(value[key])])):value;

async function setup(t,{request}={}){
 const h=await createInstallerHarness({mvu:false,initialRows:[initial]});h.api.dispose();
 Object.assign(h.ctx,{chatId:'fixture',characterId:0,characters:[{avatar:'card.png',name:'阿绫'}],extensionSettings:{}});
 h.ctx.chatMetadata.tisya_v3_books=copy((await h.books.binding()).pointer);
 const config=emptyConfig();config.worlds[worldKey(h.ctx)]=defaultWorld();h.ctx.extensionSettings[KEY]=config;
 const handle=h.target.__TAURITAVERN__.api.chat.current.handle;
 h.target.__TAURITAVERN__.api.chat.current.handle=()=>{const current=handle();return {...current,metadata:{get:async()=>nativeJson(await current.metadata.get())}};};
 let playerId='player',app,view;const tasks=[];
 const store=createStore({getContext:()=>h.ctx,persist:async()=>{throw Error('Configuration must use its worldbook');}});
 const book=createConfigurationBook({books:h.books,store,getContext:()=>h.ctx,getPlayerId:()=>playerId,domainValidators:{tagTemplates:validateTagTemplateBank}});
 await book.hydrate({initializeIfMissing:true});
 const configHost={runtimePresetFor:createRuntimePreset,resolveConnectionFor:async()=>({settings:{},model:'fixture'}),selectedMaterialsFor:async()=>({lanes:{},ids:[]}),request:async(task,input)=>{tasks.push({task,input:copy(input)});if(!request)throw Error('No model task expected');return request(task,input);}};
 const create=async()=>{app=await createApplication({target:h.target,getContext:()=>h.ctx,store,configHost,books:h.books,configurationBook:book,native:h.native,getPlayerId:()=>playerId,readConfiguration:()=>h.config,worldbookScan:false,onError:error=>h.errors.push(error)});return app;};
 await create();const win=new Window({url:'http://localhost/'});
 const mount=async()=>{view=mountWorkbench(win.document,win.document.body,{capabilities:app.capabilities,stylesheetURL:'http://localhost/workbench.css'});await view.ready;};await mount();
 t.after(async()=>{view?.dispose();app?.dispose();await win.happyDOM.abort();});
 const button=name=>[...view.shadow.querySelectorAll('button')].find(b=>b.textContent===name||b.querySelector('strong')?.textContent===name);
 const click=async name=>{const b=button(name);assert.ok(b,'button '+name);b.click();await view.settled();};
 const fill=(name,value)=>{const field=view.shadow.querySelector('[aria-label="'+name+'"]');assert.ok(field,'input '+name);field.value=value;field.dispatchEvent(new win.Event(field.tagName==='SELECT'?'change':'input'));};
 return {h,tasks,book,click,fill,button,get app(){return app;},get view(){return view;},get shadow(){return view.shadow;},async reopen(){view.dispose();app.dispose();await create();await mount();},async selectPlayer(id){const binding=await h.books.binding();playerId=id;await app.capabilities.action('books.select',{player:{id,name:id},preferenceOwner:{kind:'player',id},expectedBindingRevision:binding.pointer.bindingRevision,operationId:'switch-'+id+'-'+binding.pointer.bindingRevision});await view.refresh();}};
}

test('homepage initialization, history import and archive entries execute actual application services with native metadata ordering',async t=>{
 const source='旧灯放在修理铺的柜台上。',history='1 阿绫在桥头交出旧钥匙。';
 const f=await setup(t,{request:(task,input)=>{
  if(task==='templateInit'){assert.equal(input.sourceCard,source);return {templates:[],schemaChanges:[],notes:[],base:proposal([{id:'new:lamp',table:'objects',expected:0,values:{名称:'旧灯',类型:'item',描述:source},access,evidence:source}]),initial:proposal([])};}
  if(task==='historyImport'){assert.equal(input.sourceHistory,history);return proposal([{id:'new:handoff',table:'events',expected:0,values:{名称:'桥头交接',经过:'阿绫在桥头交出旧钥匙。',参与者:['person']},access,evidence:'阿绫在桥头交出旧钥匙。'}]);}
  throw Error('Unexpected task '+task);
 }});
 const session=await f.app.getSession(),before=await session.storage.read();
 await f.click('初始化／从资料提炼');assert.equal(f.view.getState().page,'archives');assert.ok(f.shadow.querySelector('[aria-label="待整理的资料"]'));
 f.fill('资料来源','manual');f.fill('待整理的资料',source);await f.click('生成设定草案');assert.equal(f.shadow.querySelector('[role="alert"]')?.textContent??'', '');assert.equal((await session.storage.read()).commits.length,before.commits.length);
 await f.click('保存已选设定');let rows=projectRetained(await session.storage.read(),session.getScope().activeSourceKeys).rows;assert.ok(rows.some(row=>row.values.名称==='旧灯'));
 await f.view.navigate('home');await f.click('历史补录');f.fill('资料来源','manual');assert.ok(f.shadow.querySelector('[aria-label="完整历史原文"]'));f.fill('完整历史原文',history);
 const originalsBefore=await session.system.originals.listMetadata({scope:session.scope});await f.click('生成历史补录草案');assert.deepEqual(await session.system.originals.listMetadata({scope:session.scope}),originalsBefore);
 await f.click('保存已选设定');rows=projectRetained(await session.storage.read(),session.getScope().activeSourceKeys).rows;const event=rows.find(row=>row.values.名称==='桥头交接');assert.ok(event);assert.ok(event.values.原文引用);
 const saved=await session.system.originals.read({entryId:event.values.原文引用.entryId,scope:session.scope,purpose:'archive-task'});assert.equal(saved.content,history);
 await f.view.navigate('home');await f.click('世界档案');await f.click('表格编辑');assert.match(f.shadow.textContent,/旧灯/);assert.equal(f.shadow.querySelector('[role="alert"]'),null);
 assert.deepEqual(f.tasks.map(item=>item.task),['templateInit','historyImport']);assert.equal(f.h.requests.length,0);assert.equal(f.h.errors.length,0);
});

test('preference UI retries failed native persistence, reopens the same bank and isolates selected player',async t=>{
 const f=await setup(t);await f.app.capabilities.action('tags.apply',{selections:[{tagId:'plot.offstage',polarity:'encourage',weight:3}],operationId:'visual-preference'});
 const session=await f.app.getSession();assert.equal((await session.preferences.project()).groups.length,0);
 await f.click('用户偏好');await f.click('场外暗线');f.h.host.failure.saveOnce();await f.click('确认偏好');
 assert.match(f.shadow.textContent,/Worldbook save failed|Injected native save failure/);assert.equal((await session.preferences.project()).groups.length,0);assert.equal((await session.preferences.list()).drafts.find(d=>d.tagSelection?.operationId==='visual-preference').status,'pending');
 await f.click('确认偏好');assert.equal((await session.preferences.project()).groups[0].net,3);assert.match(f.shadow.querySelector('.preference-group').textContent,/鼓励 \+3/);
 await f.reopen();await f.click('用户偏好');assert.equal((await (await f.app.getSession()).preferences.project()).groups[0].net,3);assert.equal(f.shadow.querySelectorAll('.preference-group').length,1);
 await f.selectPlayer('another-player');await f.view.navigate('preferences');assert.equal((await (await f.app.getSession()).preferences.project()).groups.length,0);assert.doesNotMatch(f.shadow.querySelector('main').textContent,/场外暗线/,'the prior player contribution must not appear under another identity');
 await f.selectPlayer('player');await f.view.navigate('preferences');assert.equal(f.shadow.querySelectorAll('.preference-group').length,1);assert.match(f.shadow.querySelector('.preference-group').textContent,/鼓励 \+3/);assert.equal(f.h.requests.length,0);
});

test('archive navigation exposes an actual native read failure and retries from unchanged storage',async t=>{
 const f=await setup(t);await f.app.getSession();const disk=f.h.host.disk,before=copy([...disk.entries()]),get=disk.get;
 let attempted=0;disk.get=function(name){attempted++;throw Error('W33 injected native read failure');};
 await f.click('世界档案');assert.ok(attempted>0);assert.match(f.shadow.querySelector('main').textContent,/读取未完成/);assert.match(f.shadow.textContent,/Worldbook read failed \(500\)/);assert.doesNotMatch(f.shadow.querySelector('main').textContent,/让故事继续向前/);assert.equal(f.view.getState().busy,false);
 disk.get=get;await f.click('重新读取此页');await f.click('表格编辑');assert.match(f.shadow.querySelector('main').textContent,/阿绫/);assert.equal(f.shadow.querySelector('[role="alert"]'),null);assert.deepEqual([...disk.entries()],before);assert.equal(f.h.requests.length,0);
});

test('unconfirmed preference stays with its player bank across identity switches and rejects a foreign confirmation',async t=>{
 const f=await setup(t),draft=await f.app.capabilities.action('tags.apply',{selections:[{tagId:'plot.offstage',polarity:'avoid',weight:2}],operationId:'pending-owner'});
 const original=copy((await (await f.app.getSession()).storage.read()).preferenceDrafts.find(item=>item.id===draft.draftId));
 assert.equal((await f.app.capabilities.getSnapshot()).progress.counts.pending,1);
 await f.click('用户偏好');assert.match(f.shadow.querySelector('main').textContent,/场外暗线/);assert.equal((await (await f.app.getSession()).preferences.project()).groups.length,0);
 await f.selectPlayer('another-player');await f.view.navigate('preferences');
 assert.equal((await f.app.capabilities.getSnapshot()).progress.counts.pending,0);
 const other=await f.app.getSession();await assert.rejects(other.preferences.confirm(draft.draftId),/另一用户身份|归属|bank|owner/i);assert.deepEqual((await other.storage.read()).preferenceDrafts.find(item=>item.id===draft.draftId),original);assert.equal((await other.preferences.project()).groups.length,0);assert.doesNotMatch(f.shadow.querySelector('main').textContent,/场外暗线/);
 await f.selectPlayer('player');await f.view.navigate('preferences');assert.equal((await f.app.capabilities.getSnapshot()).progress.counts.pending,1);assert.match(f.shadow.querySelector('main').textContent,/场外暗线/);
 f.h.config.preferencesEnabled=false;await f.app.progress.refresh();assert.equal((await f.app.capabilities.getSnapshot()).progress.counts.pending,0);f.h.config.preferencesEnabled=true;await f.app.progress.refresh();assert.equal((await f.app.capabilities.getSnapshot()).progress.counts.pending,1);
 await f.click('场外暗线');await f.click('确认偏好');assert.equal((await (await f.app.getSession()).preferences.project()).groups[0].net,-2);assert.equal((await f.app.capabilities.getSnapshot()).progress.counts.pending,0);assert.equal(f.h.requests.length,0);
});

test('an unmarked pre-W33 candidate is preserved with an explicit unresolved ownership notice',async t=>{
 const f=await setup(t),result=await f.app.capabilities.action('tags.apply',{selections:[{tagId:'plot.offstage',polarity:'encourage',weight:4}],operationId:'legacy-candidate'}),session=await f.app.getSession();
 // Recreate the persisted pre-W33 draft shape through the real owned fixture
 // storage. Only the new ownership marker is absent; all original text remains.
 const before=await session.storage.read(),legacy=copy(before);delete legacy.preferenceDrafts.find(item=>item.id===result.draftId).preferenceBankId;legacy.revision++;
 await session.storage.compareAndWrite(before.revision,legacy);const candidate=copy(legacy.preferenceDrafts.find(item=>item.id===result.draftId));
 await f.click('用户偏好');assert.match(f.shadow.querySelector('main').textContent,/1 项旧候选缺少身份归属记录/);assert.doesNotMatch(f.shadow.querySelector('main').textContent,/场外暗线/);assert.equal(f.shadow.querySelectorAll('.preference-group').length,0);
 await assert.rejects(session.preferences.confirm(result.draftId),/旧偏好候选缺少身份归属/);assert.deepEqual((await session.storage.read()).preferenceDrafts.find(item=>item.id===result.draftId),candidate);assert.equal((await session.preferences.project()).groups.length,0);assert.equal(f.h.requests.length,0);
});
