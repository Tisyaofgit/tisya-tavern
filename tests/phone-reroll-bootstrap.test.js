import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const root=process.env.TISYA_REROLL_SOURCE??new URL('..',import.meta.url).pathname;
const at=p=>pathToFileURL(path.join(root,p)).href;
const {currentPhoneHost,matrixMemoryStorage}=await import(at('tests/fixtures/phone-host-current.mjs'));
const {createPhoneService}=await import(at('phone-core.mjs'));
const {createPhoneTurnHost,phoneSource}=await import(at('phone-turn-host.js'));
const {chatKey,NS}=await import(at('engine/controller.mjs'));
const {getDoc}=await import(at('social-suite-core.mjs'));
const seed=JSON.parse(fs.readFileSync(path.join(root,'phone-seed.json'),'utf8'));
const time='2026-11-11T16:51:00Z',clone=v=>structuredClone(v);
const user=(id,text='合成用户输入')=>({is_user:true,mes:text,extra:{[NS]:{uid:id}}});
const assistant=(id,text='合成普通正文')=>({is_user:false,mes:text,extra:{[NS]:{uid:id}},swipe_id:0,swipes:[text],swipe_info:[{extra:{[NS]:{uid:id}}}]});
const raw=(requestId,acks=[],text='合成回包')=>`<reply><body>${text}</body><extra><phone>${JSON.stringify({requestId,acks,blocks:[{type:'inbox',thread:'inbox-main',items:[{id:'item-'+text,by:'system',text}]}],markers:[]})}</phone></extra></reply>`;
const frozenView=value=>({frame:value.frame,documents:value.suite.documents,accounts:value.suite.accounts,markers:value.markers,life:value.life,lifeBoundary:value.lifeBoundary});
async function fixture(){
 const c={chatId:'reroll-bootstrap',characterId:1,chatMetadata:{integrity:'reroll-bootstrap'},extensionSettings:{},chat:[user('u0'),assistant('a0')],saveChat:async()=>true};let writes=0,ids=0;const errors=[];
 const storage=matrixMemoryStorage({onWrite:async()=>{writes++;}}),db=await currentPhoneHost({context:c,storage});
 const make=()=>createPhoneService({contextKey:chatKey(c),seed,storage:db.phoneStorage,now:()=>time,idFactory:()=>`id-${++ids}`});
 const service=make();await service.init();
 const turn=createPhoneTurnHost({getContext:()=>c,phoneService:service,isGenerating:()=>false,onError:e=>errors.push({code:e.code,message:e.message})});
 return {c,db,make,service,turn,errors,writes:()=>writes,stored:()=>storage.get(c.chatMetadata[NS].chat_uid)};
}
function selectCandidate(m,text){m.swipes.push(text);m.swipe_info.push({extra:clone(m.extra)});m.swipe_id=m.swipes.length-1;m.mes=text;}
async function addTurn(f,label){const action=await f.service.dispatch({kind:'search',query:'查询-'+label}),request=await f.turn.begin('normal');f.c.chat.push(user('u-'+label));await f.turn.directions();const m=assistant('a-'+label,raw(request.requestId,[action.actionId],label));f.c.chat.push(m);const result=await f.turn.finished({accepted:true});assert.ok(result.snapshot);return {m,request,action,source:phoneSource(m)};}

for(const type of ['swipe','regenerate'])test(`${type} of a story-only initialization floor does not invent an earlier phone request`,async()=>{
 const f=await fixture(),m=f.c.chat.at(-1),original=m.mes,action=await f.service.dispatch({kind:'search',query:'发生在原回复之后'}),before=f.service.getState();
 assert.equal(await f.turn.begin(type),undefined);assert.deepEqual(await f.turn.directions(),[]);
 assert.deepEqual(f.service.getState(),before,'preparing a story-only reroll must not alter the current phone or send its later actions');
 selectCandidate(m,'无手机附加的真实新候选');assert.equal(await f.turn.finished({accepted:true}),undefined);await f.db.host.controller.event('CHAT_CHANGED');
 const cold=f.make();await cold.init();assert.equal((await f.db.host.readDatabase()).phoneDetached,false);
 assert.equal(cold.getState().actions.find(a=>a.id===action.actionId).status,'detached');assert.equal(getDoc(cold.getState().suite,'inbox-main').items.length,0);
 await f.service.refresh();const next=await f.turn.begin('normal'),input=JSON.parse(next.messages[1].content);assert.deepEqual(input.actions,[],'the next normal request must not enqueue discarded future actions');await f.turn.stopped();
 m.swipe_id=0;m.mes=original;await f.db.host.sync();await f.service.refresh();assert.equal(f.service.getState().actions.find(a=>a.id===action.actionId).status,'queued');
});

test('an existing phone reply rerolls its frozen request and preserves the old frozen page',async()=>{
 const f=await fixture(),first=await addTurn(f,'第一轮'),frozen=clone(frozenView(f.service.snapshot(first.source.sourceId))),later=await f.service.dispatch({kind:'search',query:'晚于被重骰回复'});
 const request=await f.turn.begin('swipe');assert.equal(request.requestId,first.request.requestId);assert.deepEqual(request.messages,first.request.messages);await f.turn.directions();selectCandidate(first.m,raw(request.requestId,[first.action.actionId],'新候选'));
 const result=await f.turn.finished({accepted:true});assert.ok(result.snapshot);assert.deepEqual(frozenView(f.service.snapshot(first.source.sourceId)),frozen);
 assert.equal(getDoc(f.service.getState().suite,'inbox-main').items.at(-1).text,'新候选');assert.equal(f.service.getState().actions.find(a=>a.id===later.actionId).status,'detached');
 first.m.swipe_id=0;first.m.mes=first.source.raw;await f.turn.reconcile();assert.equal(getDoc(f.service.getState().suite,'inbox-main').items.at(-1).text,'第一轮');
});

test('rollback of two later replies continues from the real predecessor and retains frozen sources',async()=>{
 const f=await fixture();await addTurn(f,'第一轮');const second=await addTurn(f,'第二轮'),frozen=clone(frozenView(f.service.snapshot(second.source.sourceId)));
 f.c.chat.splice(3);await f.turn.reconcile();assert.deepEqual(frozenView(f.service.snapshot(second.source.sourceId)),frozen);
 assert.equal(f.service.getState().selectedSources.length,0);assert.equal((await f.db.host.readDatabase()).phoneDetached,false);
 const next=await addTurn(f,'回退后新轮');assert.ok(f.service.snapshot(next.source.sourceId));assert.deepEqual(frozenView(f.service.snapshot(second.source.sourceId)),frozen);
});

test('rerolling the initialization floor after later phone rounds keeps those frames as history through sync and cold open',async()=>{
 const f=await fixture(),first=await addTurn(f,'后来手机轮'),frozen=clone(frozenView(f.service.snapshot(first.source.sourceId))),originalMessages=clone(f.c.chat),initializer=(await f.stored()).manual_edits[0];
 f.c.chat.splice(2);selectCandidate(f.c.chat[1],'初始化楼的新候选');await f.db.host.sync();const cold=f.make();await cold.init();
 assert.deepEqual(frozenView(cold.snapshot(first.source.sourceId)),frozen);assert.deepEqual(cold.getState().selectedSources,[]);assert.equal(getDoc(cold.getState().suite,'inbox-main').items.length,0);
 assert.deepEqual((await f.stored()).manual_edits[0],initializer,'the original initialization evidence remains byte-for-byte intact');
 f.c.chat.splice(0,f.c.chat.length,...originalMessages);await f.db.host.sync();await cold.refresh();assert.equal(getDoc(cold.getState().suite,'inbox-main').items.at(-1).text,'后来手机轮');assert.deepEqual(frozenView(cold.snapshot(first.source.sourceId)),frozen);
});

test('a real deletion before the initialization floor remains unavailable without inventing an earlier state',async()=>{
 const f=await fixture(),before=await f.stored();f.c.chat.pop();assert.equal((await f.db.host.readDatabase()).phoneDetached,true);
 await assert.rejects(f.service.refresh(),e=>e.code==='PHONE_DATABASE_DETACHED');assert.deepEqual(await f.stored(),before);
});
