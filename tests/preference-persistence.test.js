import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {Window} from 'happy-dom';
import {KEY,createStore,worldKey,emptyConfig,defaultWorld,cleanExport} from '../config/core.js';
import {currentConfiguration} from '../config/compiler.js';
import {mountConfiguration} from '../config/panel.js';

function fixture({persist}={}){
 const c={chatId:'story',characterId:0,characters:[{avatar:'card.png',name:'A'}],extensionSettings:{},chatCompletionSettings:{model:'A',preset:'A'},chatMetadata:{}};
 let disk={},calls=0;
 const store=createStore({getContext:()=>c,persist:async()=>{calls++;if(persist&&await persist()!==true)return false;disk=structuredClone(c.extensionSettings);return true;}});
 const win=new Window(),box=win.document.createElement('div');win.document.body.append(box);
 const options={store,host:{connections:()=>[],presets:()=>[]},getSettings:()=>({联系人分组:{}}),initialTab:'play'};
 const mount=()=>mountConfiguration(win.document,box,options);
 return {c,store,win,mount,get disk(){return disk;},get calls(){return calls;}};
}
async function change(f,ui,label,value){const input=ui.root.shadowRoot.querySelector((typeof value==='boolean'?'input[type=checkbox]':'')+'[aria-label="'+label+'"]');assert(input,label);if(input.type==='checkbox')input.checked=value;else input.value=JSON.stringify(value);input.dispatchEvent(new f.win.Event('change'));await ui.settled();}

test('play preference changes persist without a separate save, through model/preset changes and a new process',async()=>{
 const f=fixture();let ui=f.mount();const temp=mkdtempSync(join(tmpdir(),'tisya-preferences-'));
 try{await ui.ready;
  await change(f,ui,'生成行动建议',false);await change(f,ui,'角色自主',false);await change(f,ui,'默认语言','繁体中文');
  assert.equal(f.calls,3);assert.equal(ui.requestLeave().allowed,true);const before=JSON.stringify(f.disk[KEY]);
  for(const model of ['B','C'])for(const preset of ['B','A']){f.c.chatCompletionSettings={model,preset,prompts:[],extensions:{}};ui.dispose();ui=f.mount();await ui.ready;
   assert.equal(ui.root.shadowRoot.querySelector('[aria-label="生成行动建议"]').checked,false);assert.equal(ui.root.shadowRoot.querySelector('[aria-label="角色自主"]').checked,false);assert.equal(ui.root.shadowRoot.querySelector('[aria-label="默认语言"]').value,'"繁体中文"');assert.equal(JSON.stringify(f.disk[KEY]),before);}
  const file=join(temp,'settings.json');writeFileSync(file,JSON.stringify(f.disk));const module=new URL('../config/core.js',import.meta.url).href;
  const result=execFileSync(process.execPath,['--input-type=module','-e',`import fs from 'node:fs';import {createStore} from ${JSON.stringify(module)};const store=createStore({getContext:()=>({chatId:'story',characterId:0,characters:[{avatar:'card.png'}],extensionSettings:JSON.parse(fs.readFileSync(process.argv[1]))}),persist:()=>{throw Error('Reopen must not write')}});console.log(JSON.stringify(store.read().world.modes.narrative));`,file],{encoding:'utf8'});
  const restored=JSON.parse(result);assert.equal(restored.actions,false);assert.equal(restored.narrative.缇斯亚叙事角色自主,false);assert.equal(restored.narrative.缇斯亚叙事语言,'繁体中文');
 }finally{ui.dispose();await f.win.happyDOM.abort();rmSync(temp,{recursive:true,force:true});}
});
test('failed preference save keeps visible draft and previous persistent values, then explicit retry succeeds',async()=>{
 let ok=true;const f=fixture({persist:async()=>ok}),ui=f.mount();try{await ui.ready;await change(f,ui,'生成行动建议',false);const before=JSON.stringify(f.disk);ok=false;
  await change(f,ui,'角色自主',false);assert.equal(ui.requestLeave().allowed,false);assert.equal(ui.root.shadowRoot.querySelector('[aria-label="角色自主"]').checked,false);assert.equal(JSON.stringify(f.disk),before);assert.equal(ui.root.shadowRoot.querySelector('[role="alert"]').textContent.includes('未确认保存'),true);
  ok=true;await ui.root.shadowRoot.querySelector('footer button:last-child').onclick();assert.equal(ui.requestLeave().allowed,true);assert.equal(f.disk[KEY].游玩偏好.narrative.缇斯亚叙事角色自主,false);
 }finally{ui.dispose();await f.win.happyDOM.abort();}
});
test('incomplete language drafts do not overwrite saved preference and can be completed',async()=>{
 const f=fixture(),ui=f.mount();try{await ui.ready;await change(f,ui,'默认语言','繁体中文');const before=JSON.stringify(f.disk);await change(f,ui,'默认语言','other');assert.equal(JSON.stringify(f.disk),before);assert.equal(ui.requestLeave().allowed,false);
  const input=ui.root.shadowRoot.querySelector('[aria-label="填写默认语言"]');input.value='日本語';input.dispatchEvent(new f.win.Event('change'));await ui.settled();assert.equal(ui.requestLeave().allowed,true);assert.deepEqual(f.disk[KEY].游玩偏好.narrative.缇斯亚叙事语言配置,['日本語']);
 }finally{ui.dispose();await f.win.happyDOM.abort();}
});
test('transient missing configuration, world or card identity cannot turn into initial values or be saved over',async()=>{
 const f=fixture(),first=f.store.read();first.world.modes.narrative.actions=false;await f.store.save(first.data,first.revision,first.key);const saved=structuredClone(f.disk);const count=f.calls;
 delete f.c.extensionSettings[KEY];assert.throws(()=>f.store.read(),/未重新初始化/);assert.equal(f.calls,count);
 f.c.extensionSettings=structuredClone(saved);delete f.c.extensionSettings[KEY].worlds[first.key];assert.throws(()=>f.store.read(),/未重新初始化/);
 f.c.extensionSettings=structuredClone(saved);f.c.characters=[];assert.throws(()=>f.store.read(),/身份尚未就绪/);assert.equal(f.calls,count);
 f.c.characters=[{avatar:'card.png'}];assert.equal(f.store.read().world.modes.narrative.actions,false);f.c.chatId='another';assert.equal(f.store.read().world.modes.narrative.actions,true);f.c.chatId='story';assert.equal(f.store.read().world.modes.narrative.actions,false);await f.win.happyDOM.abort();
});
test('automatic preference save does not commit unfinished edits from another settings page',async()=>{
 const f=fixture(),ui=f.mount();try{await ui.ready;const root=ui.root.shadowRoot,category=root.querySelector('[aria-label="配置分类"]');category.value='api';await category.onchange();const model=root.querySelector('[aria-label="通用 模型"]');model.value='unfinished';model.dispatchEvent(new f.win.Event('change'));category.value='play';await category.onchange();await change(f,ui,'生成行动建议',false);assert.equal(f.calls,0);assert.equal(ui.requestLeave().allowed,false);assert.match(root.querySelector('footer').textContent,/草稿/);
 }finally{ui.dispose();await f.win.happyDOM.abort();}
});

test('one global preference bank follows new/existing cards, chats and groups without copying story data',async()=>{
 const f=fixture();f.c.extensionSettings[KEY]=emptyConfig();const first=worldKey(f.c),second=JSON.stringify(['card','b.png','b-story']);
 const a=defaultWorld(),b=defaultWorld();a.switches.boundary='A only';a.context.history=0;a.controller='persona:a';a.modes.narrative.nativeMvu='off';a.modes.narrative.selected=[];a.modes.narrative.routes.main={model:'A-route'};a.tables={enabled:false,originBook:'origin A',sessionBook:'session A'};
 b.switches.boundary='B only';b.context.history=123;b.modes.narrative.actions=true;b.modes.narrative.角色主动性='主动推进';b.tables={enabled:false,originBook:'origin B',sessionBook:'session B'};
 f.c.extensionSettings[KEY].worlds={[first]:a,[second]:b};let ui=f.mount();try{await ui.ready;await change(f,ui,'生成行动建议',false);await change(f,ui,'默认语言','繁体中文');await change(f,ui,'char 主动性','');
  assert.equal(f.disk[KEY].游玩偏好.actions,false);for(const w of Object.values(f.disk[KEY].worlds))assert.equal(Object.hasOwn(w.modes.narrative,'narrative'),false,'only global bank stores preferences');
  const saved=JSON.stringify(f.disk);const cases=[{chatId:'story',avatar:'card.png',boundary:'A only',history:0,origin:'origin A'},{chatId:'b-story',avatar:'b.png',boundary:'B only',history:123,origin:'origin B'},{chatId:'new-story',avatar:'new.png',boundary:'',history:50},{chatId:'other',avatar:'card.png',boundary:'',history:50},{chatId:'group-story',avatar:'card.png',groupId:'group-1',boundary:'',history:50}];
  for(const row of cases){Object.assign(f.c,{chatId:row.chatId,groupId:row.groupId,characters:[{avatar:row.avatar}]});const world=f.store.read().world;assert.equal(world.modes.narrative.actions,false);assert.equal(world.modes.narrative.narrative.缇斯亚叙事语言,'繁体中文');assert.equal(world.modes.narrative.角色主动性,undefined);assert.equal(world.context.history,row.history);assert.equal(world.switches.boundary,row.boundary);if(row.origin)assert.equal(world.tables.originBook,row.origin);else assert.equal(world.tables,undefined);assert.deepEqual(currentConfiguration(f.c).world,world);}
  assert.equal(JSON.stringify(f.disk),saved);assert.equal(f.disk[KEY].worlds[first].modes.narrative.routes.main.model,'A-route');assert.equal(f.disk[KEY].worlds[first].modes.narrative.nativeMvu,'off');
  const backup=JSON.parse(JSON.stringify(cleanExport(f.store.read().data)));f.c.extensionSettings={[KEY]:backup.configuration};assert.equal(createStore({getContext:()=>f.c,persist:async()=>true}).read().world.modes.narrative.actions,false);
 }finally{ui.dispose();await f.win.happyDOM.abort();}
});
test('existing preferences can be promoted explicitly; opening a page never writes or migrates',async()=>{
 const f=fixture(),old=defaultWorld();old.modes.narrative.actions=false;old.modes.narrative.narrative.缇斯亚叙事基调='诙谐';f.c.extensionSettings[KEY]={...emptyConfig(),worlds:{[worldKey(f.c)]:old}};
 const before=JSON.stringify(f.c.extensionSettings),ui=f.mount();try{await ui.ready;assert.equal(f.calls,0);assert.equal(JSON.stringify(f.c.extensionSettings),before);const promote=[...ui.root.shadowRoot.querySelectorAll('button')].find(n=>n.textContent==='将当前偏好全局保存');assert(promote);await promote.onclick();await ui.settled();assert.equal(f.calls,1);f.c.chatId='new';assert.equal(f.store.read().world.modes.narrative.actions,false);assert.equal(f.store.read().world.modes.narrative.narrative.缇斯亚叙事基调,'诙谐');
 }finally{ui.dispose();await f.win.happyDOM.abort();}
});
test('advanced narrative edits update the same global bank; stale pages cannot overwrite it',async()=>{
 const f=fixture();let ui=f.mount();try{await ui.ready;await change(f,ui,'生成行动建议',false);const stale=f.store.read(),root=ui.root.shadowRoot,category=root.querySelector('[aria-label="配置分类"]');category.value='mode';await category.onchange();await change(f,ui,'思维链详细程度','format');await change(f,ui,'公开创作摘要',false);
  f.c.chatId='new';assert.equal(f.store.read().world.modes.narrative.workflowDetail,'format');assert.equal(f.store.read().world.modes.narrative.summary,false);f.c.chatId='story';await assert.rejects(f.store.save(stale.data,stale.revision,stale.key),/其他页面/);
  const now=f.store.read();now.world.modes.narrative.actions=true;await f.store.save(now.data,now.revision,now.key);f.c.chatId='new';assert.equal(f.store.read().world.modes.narrative.actions,true);
 }finally{ui.dispose();await f.win.happyDOM.abort();}
});
