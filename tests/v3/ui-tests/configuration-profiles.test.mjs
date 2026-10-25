import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {mountWorkbench} from '../../../v3/workbench.mjs';
import {mountConfiguration} from '../../../config/panel.js';
import {createStore,defaultWorld,emptyConfig,worldKey,KEY} from '../../../config/core.js';

async function fixture({ready=true,optionsFailure=false}={}){
 const win=new Window({url:'http://localhost/'}),calls=[];let failSave=false,failHydrate=false;
 const state={ready,bookId:'core',binding:{revision:1},revision:22,domains:{configurationProfiles:{format:'tisya.configuration-profiles/1',profiles:[{id:'one',name:'原有方案',revision:1}]}},versions:Array.from({length:22},(_,i)=>({revision:i+1})),draft:null,error:null};
 const cap={getSnapshot:async()=>({capabilities:[],review:{items:[]},books:{pointer:null},...(state.ready?{}:{issue:{code:'CONFIGURATION_NOT_READY',message:'配置未就绪'}})}),async action(id,args){calls.push({id,args:structuredClone(args)});if(id==='books.list')return [{id:'core',kind:'core',displayName:'我的基点'}];if(id==='books.global')return {core:{id:'core',displayName:'我的基点'}};if(id==='books.options'){if(optionsFailure)throw Error('尚无当前故事身份');return {players:[]};}if(id==='configuration.status')return structuredClone(state);if(id==='configuration.hydrate'){if(failHydrate){state.error={message:'读取失败，可重试'};throw Error('读取失败，可重试');}state.ready=true;state.error=null;return structuredClone(state);}if(id==='configuration.saveProfile'){if(failSave){state.draft={operationId:args.operationId};state.error={message:'写入失败'};throw Error('写入失败');}const bank=state.domains.configurationProfiles.profiles,profile={id:args.id??'new',name:args.name,revision:state.revision};if(args.id)Object.assign(bank.find(p=>p.id===args.id),profile);else bank.push(profile);state.revision++;return structuredClone(state);}if(id==='configuration.previewRestore')return {token:'preview',fromRevision:args.revision,currentRevision:state.revision,changes:[]};if(id==='configuration.discardRestore')return;throw Error('unexpected '+id);}};
 const view=mountWorkbench(win.document,win.document.body,{capabilities:cap,initialPage:'books',stylesheetURL:'http://localhost/workbench.css'});await view.ready;const sh=view.shadow;
 return {win,view,sh,state,calls,set failSave(v){failSave=v;},set failHydrate(v){failHydrate=v;},async click(name){const b=[...sh.querySelectorAll('button')].find(b=>b.textContent===name);assert.ok(b,name);b.click();await view.settled();},fill(name,value){const input=sh.querySelector('[aria-label="'+name+'"]');assert.ok(input,name);input.value=value;input.dispatchEvent(new win.Event(input.tagName==='SELECT'?'change':'input'));},dispose(){view.dispose();win.happyDOM.abort();}};
}

test('profile selection and naming never save; explicit save and update preserve existing schemes',async()=>{
 const f=await fixture();assert.match(f.sh.textContent,/自动恢复记录（22 条）/);f.fill('已保存方案','one');f.fill('方案名称','原有修订');assert.equal(f.calls.filter(c=>c.id==='configuration.saveProfile').length,0);
 await f.click('更新所选方案');assert.equal(f.state.domains.configurationProfiles.profiles.length,1);assert.equal(f.state.domains.configurationProfiles.profiles[0].id,'one');assert.equal(f.calls.find(c=>c.id==='configuration.saveProfile').args.id,'one');
 f.fill('方案名称','另一偏好');await f.click('另存为新方案');assert.equal(f.state.domains.configurationProfiles.profiles.length,2);assert.equal(f.state.versions.length,22);
 f.fill('已保存方案','one');await f.click('核对并应用所选方案');assert.match(f.sh.textContent,/应用方案 · 原有修订/);assert.equal(f.calls.filter(c=>c.id==='configuration.restore').length,0);await f.click('放弃恢复');f.dispose();
});
test('profile save failure retains entered name and original scheme with a visible retry',async()=>{
 const f=await fixture();f.fill('方案名称','未保存名称');f.failSave=true;await f.click('另存为新方案');assert.equal(f.state.domains.configurationProfiles.profiles.length,1);assert.match(f.sh.textContent,/原设置与已有方案保留/);assert.ok([...f.sh.querySelectorAll('button')].some(b=>b.textContent==='重试保存这份修改'));f.dispose();
});
test('configuration recovery remains visible when story identity read fails; retry does not create a book',async()=>{
 const f=await fixture({ready:false,optionsFailure:true});assert.match(f.sh.textContent,/尚无当前故事身份/);assert.ok([...f.sh.querySelectorAll('button')].some(b=>b.textContent==='切换全局基点'));f.failHydrate=true;await f.click('载入或建立基点内配置');assert.match(f.sh.textContent,/读取失败，可重试/);f.failHydrate=false;await f.click('载入或建立基点内配置');assert.match(f.sh.textContent,/手动保存的偏好方案/);assert.equal(f.calls.filter(c=>c.id==='configuration.hydrate').length,2);assert.equal(f.calls.filter(c=>c.id==='books.create').length,0);f.dispose();
});
test('play preferences provide an accessible scheme entry after current autosave finishes',async()=>{
 const win=new Window({url:'http://localhost/'}),ctx={chatId:'chat',characterId:0,characters:[{name:'test',avatar:'test.png'}],extensionSettings:{}},data=emptyConfig(),key=worldKey(ctx);data.worlds[key]=defaultWorld();ctx.extensionSettings[KEY]=data;const store=createStore({getContext:()=>ctx,persist:async()=>true});let calls=0,view;
 view=mountConfiguration(win.document,win.document.body,{store,host:{},initialTab:'play',preserveOnClose:true,onProfiles:()=>{assert.equal(view.requestSuspend().allowed,true);calls++;}});await view.ready;const sh=view.root.shadowRoot,b=[...sh.querySelectorAll('button')].find(b=>b.textContent==='管理偏好方案');assert.ok(b);const actions=sh.querySelector('[aria-label="生成行动建议"]');actions.checked=false;actions.dispatchEvent(new win.Event('change'));b.click();await view.settled();await new Promise(r=>setTimeout(r,0));assert.equal(store.read().world.modes.narrative.actions,false);assert.equal(calls,1);view.dispose();win.happyDOM.abort();
});
