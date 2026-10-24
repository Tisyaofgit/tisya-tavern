import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {mountActionChoice} from '../../../actions.js';
import {appearanceValues,appearanceOverrides,appearanceFields,withAppearanceOverrides,APPEARANCE_OWNERS} from '../../../appearance-settings.js';
import {interfaceSnapshot,validateInterfaceSettings} from '../../../tables/interface-config.js';
import {parseV3Reply} from '../../../v3/reply.mjs';
import {fullReply} from './reply-fixture.mjs';
import {mountFocusControl} from '../../../v3/focus-control.mjs';
import {createJourneyService} from '../../../v3/journey.mjs';
import {tableRegistry,createInitialState} from '../../../v3/host-runtime.mjs';
import {KEY,emptyConfig,defaultWorld,createStore,worldKey} from '../../../config/core.js';
const tick=()=>new Promise(r=>setTimeout(r,0));

test('action visibility uses the same appearance setting after remount and never changes selected input',async()=>{
 const win=new Window(),d=win.document,rows=parseV3Reply(fullReply).actions,calls=[];let settings={联系人分组:{}},writes=0;
 const getter=()=>appearanceValues(settings,'next').显示可能走向;
 const setter=async(value,expected)=>{assert.equal(getter(),expected);settings=withAppearanceOverrides(settings,'next',{...appearanceOverrides(settings,'next'),显示可能走向:value});writes++;};
 const mount=()=>mountActionChoice(d,d.body,{rows,getPossibilityVisibility:getter,setPossibilityVisibility:setter,onChoose:async(...args)=>calls.push(args)});
 let view=mount();assert.equal(getter(),true);assert.equal(d.querySelector('.action-possibility').hidden,false);
 d.querySelector('.action-possibility-toggle').click();await tick();assert.equal(writes,1);assert.equal(settings.显示区块.next.显示可能走向,false);assert.equal(d.querySelector('.action-possibility').hidden,true);assert.equal(d.querySelector('.action-possibility').textContent,rows[0].possibility);
 view.dispose();view=mount();assert.equal(d.querySelector('.action-possibility').hidden,true);d.querySelector('.action').click();await tick();assert.deepEqual(calls,[[rows[0].text,'append']]);assert.equal(fullReply.includes(rows[0].possibility),true);
 settings=withAppearanceOverrides(settings,'next',{显示可能走向:true});view.refresh();assert.equal(d.querySelector('.action-possibility').hidden,false);
 assert.equal(Object.keys(APPEARANCE_OWNERS).filter(owner=>Object.hasOwn(appearanceFields(owner),'显示可能走向')).length,1);const snapshot=interfaceSnapshot(settings);assert.equal(snapshot.choices.appearance.next.effective.显示可能走向,true);assert.throws(()=>validateInterfaceSettings({...settings,显示区块:{next:{显示可能走向:'false'}}}),/配置损坏/);
 view.dispose();await win.happyDOM.abort();
});

test('failed visibility save preserves displayed state, and empty suggestions need no toggle',async()=>{
 const win=new Window(),d=win.document,errors=[];let visible=true;const view=mountActionChoice(d,d.body,{rows:parseV3Reply(fullReply).actions,getPossibilityVisibility:()=>visible,setPossibilityVisibility:async()=>{throw Error('保存失败');},onChoose:()=>{},onError:e=>errors.push(e.message)});d.querySelector('.action-possibility-toggle').click();await tick();assert.deepEqual(errors,['保存失败']);assert.equal(d.querySelector('.action-possibility').hidden,false);assert.equal(d.querySelector('.action-possibility-toggle').disabled,false);view.dispose();const empty=mountActionChoice(d,d.body,{rows:[],onChoose:()=>{},getPossibilityVisibility:()=>visible,setPossibilityVisibility:async v=>visible=v});assert.equal(d.querySelector('.action-possibility-toggle'),null);empty.dispose();await win.happyDOM.abort();
});

async function journeyFixture(){
 const context={chatId:'chat-file',characterId:0,characters:[{avatar:'actor.png'}],chatMetadata:{},extensionSettings:{},chat:[]},data=emptyConfig(),key=worldKey(context);data.worlds[key]=defaultWorld();data.worlds[key].tables={focusObjects:['missing']};context.extensionSettings[KEY]=data;let writes=0;const store=createStore({getContext:()=>context,persist:async()=>{writes++;return true;}});
 let scope={chatId:'stable-chat',branchId:'branch-1',bindingId:'archive',activeSourceKeys:['body:1']};const rows=[{id:'person',table:'objects',rev:1,values:{名称:'掌灯人',类型:'character',描述:'每夜清点灯火。'},access:{readers:['读者'],knowers:[]},source:'body:1',lockedFields:[]}],state=createInitialState({registry:tableRegistry,rows}),session={getScope:()=>structuredClone(scope),storage:{read:async()=>structuredClone(state)},guard:()=>{}};
 const service=createJourneyService({getSession:async()=>session,store,getContext:()=>context});return {service,store,writes:()=>writes,setScope:s=>scope=s,getScope:()=>scope};
}

test('character focus control commits actual config CAS with stable object ID and removes missing IDs',async()=>{
 const f=await journeyFixture(),win=new Window(),d=win.document;let view=await f.service.read();const control=mountFocusControl(d,d.body,{character:view.characters[0],getView:()=>view,focus:f.service.focus,onChange:v=>view=v});d.querySelector('button').click();await tick();await tick();assert.equal(f.writes(),1);assert.deepEqual(f.store.read().world.tables.focusObjects,['missing','person']);assert.equal(d.querySelector('button').getAttribute('aria-pressed'),'true');assert.equal((await f.service.read()).characters[0].focused,true);
 control.dispose();const missing=mountFocusControl(d,d.body,{character:view.missingFocus[0],getView:()=>view,focus:f.service.focus,onChange:v=>view=v});assert.equal(d.querySelector('button').textContent,'移除失效关注');d.querySelector('button').click();await tick();await tick();assert.deepEqual(f.store.read().world.tables.focusObjects,['person']);assert.equal(d.querySelector('button').disabled,true);missing.dispose();await win.happyDOM.abort();
});

test('stale focus controls cannot write a new branch or pretend a failed focus succeeded',async()=>{
 const f=await journeyFixture(),win=new Window(),d=win.document,errors=[];let view=await f.service.read();const control=mountFocusControl(d,d.body,{character:view.characters[0],getView:()=>view,focus:f.service.focus,onChange:v=>view=v,onError:e=>errors.push(e.message)});f.setScope({...f.getScope(),branchId:'another'});d.querySelector('button').click();await tick();await tick();assert.equal(f.writes(),0);assert.equal(errors.length,1);assert.match(errors[0],/切换/);assert.equal(d.querySelector('button').getAttribute('aria-pressed'),'false');control.dispose();await win.happyDOM.abort();
});

import {mountMessageVisual} from '../../../message-ui.js';
import {mountMessageReader} from '../../../reader.js';
test('chat and independent reader consumers both persist the canonical next appearance field',async()=>{
 const win=new Window({url:'http://localhost/'}),d=win.document,calls=[],chosen=[];let settings={};const getAppearance=owner=>appearanceValues(settings,owner),saveDisplayPreference=async(field,value,expected,owner)=>{calls.push({field,value,expected,owner});assert.equal(getAppearance(owner)[field],expected);settings=withAppearanceOverrides(settings,owner,{[field]:value});};const container=d.createElement('div');d.body.append(container);const visual=mountMessageVisual(d,container,{source:fullReply,name:'温榆',formatBody:s=>s,getMotion:()=>false,getAppearance,saveDisplayPreference,onChooseAction:text=>chosen.push(text)});const shadow=visual.host.shadowRoot;shadow.querySelector('.action-possibility-toggle').click();await tick();assert.deepEqual(calls,[{field:'显示可能走向',value:false,expected:true,owner:'next'}]);assert.equal(shadow.querySelector('.action-possibility').hidden,true);visual.dispose();const reader=mountMessageReader(d,container,{source:fullReply,initialTab:'actions',formatBody:s=>s,getAppearance,saveDisplayPreference,onChooseAction:text=>chosen.push(text)});assert.equal(container.querySelector('.action-possibility').hidden,true);container.querySelector('.action-possibility-toggle').click();await tick();assert.deepEqual(calls[1],{field:'显示可能走向',value:true,expected:false,owner:'next'});container.querySelector('.action').click();await tick();assert.deepEqual(chosen,[parseV3Reply(fullReply).actions[0].text]);reader.dispose();await win.happyDOM.abort();
});
