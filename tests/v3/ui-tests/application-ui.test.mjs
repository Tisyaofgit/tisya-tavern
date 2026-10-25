import test from 'node:test';import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {createInstallerHarness} from '../host-tests/installer-harness.mjs';
import {createApplication} from '../../../v3/application.mjs';
import {mountWorkbench} from '../../../v3/workbench.mjs';
import {CAPABILITIES} from '../../../v3/capabilities.mjs';
import {KEY,emptyConfig,defaultWorld,createStore,worldKey} from '../../../config/core.js';
import {projectRetained} from '../../../v3/host-runtime.mjs';
import {createRuntimePreset} from '../../../v3/preset-template.mjs';
const tick=()=>new Promise(r=>setTimeout(r,0));
test('opening the real workbench with no import task leaves legacy originals untouched and displays preset status',async()=>{
 const h=await createInstallerHarness({mvu:false});h.api.dispose();h.ctx.chat[2].mes='</think><body>她走进房间。</body>';
 Object.assign(h.ctx,{chatId:'fixture',characterId:0,characters:[{avatar:'card.png',name:'阿绫'}],extensionSettings:{}});
 const config=emptyConfig();config.worlds[worldKey(h.ctx)]=defaultWorld();h.ctx.extensionSettings[KEY]=config;
 const store=createStore({getContext:()=>h.ctx,persist:async()=>true});
 const configHost={runtimePresetFor:stage=>createRuntimePreset(stage),resolveConnectionFor:async()=>({settings:{},model:'fixture'}),selectedMaterialsFor:async()=>({lanes:{},ids:[]}),request:async()=>{throw Error('Browsing must not call a model');}};
 const runtime={pluginVersion:'fixture-version',preset:{status:'current',version:'preset-version',requiredVersion:'preset-version',selectedName:'Other',installation:{status:'updated',backup:'Tisya backup fixture'}}};
 const app=await createApplication({target:h.target,getContext:()=>h.ctx,store,configHost,books:h.books,native:h.native,worldbookScan:false,onError:e=>h.errors.push(e),readConfiguration:()=>h.config,runtimeStatus:()=>runtime});
 const win=new Window({url:'http://localhost/'}),view=mountWorkbench(win.document,win.document.body,{capabilities:app.capabilities,stylesheetURL:'http://localhost/workbench.css'});
 try{
  await view.ready;const s=await app.getSession();
  assert.equal(!!view.shadow.querySelector('[role=alert]'),false);
  assert.deepEqual(await s.system.originals.listMetadata({scope:s.scope}),[]);
  assert.match(view.shadow.textContent,/主预设 Tisya · 版本一致/);assert.match(view.shadow.textContent,/fixture-version/);assert.match(view.shadow.textContent,/当前原生预设：Other/);assert.match(view.shadow.textContent,/Tisya backup fixture/);
  for(const page of ['settings','review','archives','home'])await view.navigate(page);
  assert.equal(!!view.shadow.querySelector('[role=alert]'),false);assert.deepEqual(await s.system.originals.listMetadata({scope:s.scope}),[]);assert.equal(h.requests.length,0);assert.equal(h.errors.length,0);
  runtime.preset.status='missing';runtime.preset.version=null;
  await [...view.shadow.querySelectorAll('button')].find(b=>b.textContent==='重新检查版本').onclick();await view.settled();
  assert.match(view.shadow.textContent,/主预设 Tisya · 尚未安装/);
 }finally{view.dispose();app.dispose();await win.happyDOM.abort();}
});
test('production application capability chain drives real archive, configuration and separate chat through shared UI',async()=>{
 const initial={id:'person',table:'objects',rev:1,values:{名称:'阿绫',类型:'character',描述:'修理铺的店主'},access:{readers:[],knowers:[]},lockedFields:[]};
 const h=await createInstallerHarness({mvu:false,initialRows:[initial],provider:({stage})=>{assert.equal(stage,'companion');return '嗯？你要干什么呀。';}});h.api.dispose();Object.assign(h.ctx.eventTypes,{WORLDINFO_ENTRIES_LOADED:'worldinfo_entries_loaded',WORLDINFO_SCAN_DONE:'worldinfo_scan_done'});
 Object.assign(h.ctx,{chatId:'fixture',characterId:0,characters:[{avatar:'card.png',name:'阿绫'}],extensionSettings:{}});const config=emptyConfig();config.worlds[worldKey(h.ctx)]=defaultWorld();h.ctx.extensionSettings[KEY]=config;let configWrites=0;const store=createStore({getContext:()=>h.ctx,persist:async()=>{configWrites++;return true;}}),requests=[];
 const configHost={resolveConnectionFor:async()=>({settings:{},model:'fixture'}),selectedMaterialsFor:async()=>({lanes:{},ids:[]}),request:async(task,input)=>{requests.push({task,input});if(task==='tableAssistant')return {answer:'两项调整已准备',changes:[{path:'/world/context/history',value:15,reason:'用户要求'},{path:'/world/modes/narrative/actions',value:false,reason:'用户要求'}],backfill:null,genesisGoal:''};if(task==='communication')return '嗯？你要干什么呀。';throw Error('Unexpected task '+task);}};
 const app=await createApplication({target:h.target,getContext:()=>h.ctx,store,configHost,books:h.books,native:h.native,onError:e=>{throw e;},readConfiguration:()=>h.config,routes:Object.fromEntries(CAPABILITIES.map(c=>[c.id,async()=>{}]))});
 const win=new Window({url:'http://localhost/'}),d=win.document,view=mountWorkbench(d,d.body,{capabilities:app.capabilities,stylesheetURL:'http://localhost/workbench.css'});const click=async name=>{const button=[...view.shadow.querySelectorAll('button')].find(b=>b.textContent===name||b.textContent.startsWith(name));assert.ok(button,name);button.click();await view.settled();await tick();};
 try{await view.ready;assert.equal(view.shadow.querySelector('[role=alert]'),null);await view.navigate('archives');await click('表格编辑');await click('阿绫');await click('手动编辑');const input=view.shadow.querySelector('[aria-label="描述 · 值"]');assert.ok(input);input.value='修好灯后才肯休息的店主';input.dispatchEvent(new win.Event('input'));const session=await app.getSession(),before=await session.storage.read();await click('保存档案');const after=await session.storage.read();assert.equal(after.commits.length,before.commits.length+1);assert.equal(projectRetained(after,session.getScope().activeSourceKeys).rows.find(r=>r.id==='person').values.描述,input.value);await view.navigate('assistant');const ask=view.shadow.querySelector('[aria-label="想调整什么"]');ask.value='历史改成15条，关闭行动建议';ask.dispatchEvent(new win.Event('input'));await click('交给小缇整理');assert.equal(configWrites,0);await click('应用这些调整');assert.equal(configWrites,1);assert.equal(store.read().world.context.history,15);assert.equal(store.read().world.modes.narrative.actions,false);const length=h.ctx.chat.length;await view.navigate('chat');const chat=view.shadow.querySelector('[aria-label="说点什么"]');assert.ok(chat);chat.value='小缇在吗';chat.dispatchEvent(new win.Event('input'));await click('发送给小缇');assert.ok(view.shadow.textContent.includes('嗯？你要干什么呀。'));assert.equal(h.ctx.chat.length,length);assert.equal(configWrites,1);assert.deepEqual(requests.map(r=>r.task),['tableAssistant']);assert.equal(h.requests.length,1);assert.ok(h.requests[0].messages.some(m=>m.content.includes('[CONVERSATION]')));assert.equal(h.errors.length,0);
 }finally{view.dispose();app.dispose();win.happyDOM.abort();}
});

test('binding hydration observers do not start a runtime against an intermediate binding',async()=>{
 const h=await createInstallerHarness({mvu:false});h.api.dispose();
 Object.assign(h.ctx,{chatId:'fixture',characterId:0,characters:[{avatar:'card.png',name:'阿绫'}],extensionSettings:{}});
 const config=emptyConfig();config.worlds[worldKey(h.ctx)]=defaultWorld();h.ctx.extensionSettings[KEY]=config;
 const store=createStore({getContext:()=>h.ctx,persist:async()=>true});
 let release,app,reads=0;const gate=new Promise(r=>release=r);
 const books={...h.books,readRuntime:async()=>{reads++;await gate;return h.books.readRuntime();}};
 const configurationBook={read:()=>({ready:true}),saveDomain:async()=>{throw Error('No config write');},hydrate:async()=>{const refresh=app.progress.refresh();await tick();try{assert.equal(app.host.busy(),false);assert.equal(reads,0);}finally{release();}await refresh;}};
 const configHost={runtimePresetFor:createRuntimePreset,resolveConnectionFor:async()=>({settings:{},model:'fixture'}),selectedMaterialsFor:async()=>({lanes:{},ids:[]}),request:async()=>{throw Error('No model call');}};
 app=await createApplication({target:h.target,getContext:()=>h.ctx,store,configHost,books,native:h.native,worldbookScan:false,configurationBook,onError:e=>h.errors.push(e),readConfiguration:()=>h.config});
 try{await app.books.select({player:{id:'player'},preferenceOwner:{kind:'player',id:'player'},expectedBindingRevision:0,operationId:'binding-observer'});assert.equal(app.isBindingTransition(),false);assert.equal(h.errors.length,0);}finally{release();app.dispose();}
});

test('initialized progress avoids redundant catalog binding loads but still rejects a changed durable binding',async()=>{
 const h=await createInstallerHarness({mvu:false});h.api.dispose();Object.assign(h.ctx,{chatId:'fixture',characterId:0,characters:[{avatar:'card.png',name:'阿绫'}],extensionSettings:{}});
 const config=emptyConfig();config.worlds[worldKey(h.ctx)]=defaultWorld();h.ctx.extensionSettings[KEY]=config;const store=createStore({getContext:()=>h.ctx,persist:async()=>true});let bindingReads=0;
 const books={...h.books,binding:async()=>{bindingReads++;return h.books.binding();}};const configHost={runtimePresetFor:createRuntimePreset,resolveConnectionFor:async()=>({settings:{},model:'fixture'}),selectedMaterialsFor:async()=>({lanes:{},ids:[]}),request:async()=>{throw Error('No model call');}};
 const app=await createApplication({target:h.target,getContext:()=>h.ctx,store,configHost,books,native:h.native,worldbookScan:false,onError:e=>h.errors.push(e),readConfiguration:()=>h.config});
 try{await app.getSession();bindingReads=0;await app.progress.refresh();assert.equal(bindingReads,0);const prior=await h.books.binding();await h.books.select({player:{id:'other-player'},preferenceOwner:{kind:'player',id:'other-player'},expectedBindingRevision:prior.pointer.bindingRevision,operationId:'outside-switch'});await assert.rejects(app.progress.refresh(),e=>['RUNTIME_BINDING_CHANGED','BOOK_CONTEXT_CHANGED','CONTEXT_CHANGED'].includes(e.code));}finally{app.dispose();}
});
