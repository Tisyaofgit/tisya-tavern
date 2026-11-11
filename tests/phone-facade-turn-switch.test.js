import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

// Exact product entry extraction and real host/phone/turn modules. Explicit
// synthetic navigation and promise barriers reproduce only the stated races.
const sourceRoot=process.env.TISYA_ENTRY_SOURCE??new URL('..',import.meta.url).pathname;
const at=file=>pathToFileURL(path.join(sourceRoot,file)).href;
const {createMatrixHost}=await import(at('engine/host.mjs'));
const {chatKey}=await import(at('engine/controller.mjs'));
const {createPhoneDatabaseStorage}=await import(at('engine/phone-database.mjs'));
const {createPhoneService}=await import(at('phone-core.mjs'));
const {createPhoneTurnHost}=await import(at('phone-turn-host.js'));
const entry=fs.readFileSync(path.join(sourceRoot,'index.js'),'utf8');
const catalog=JSON.parse(fs.readFileSync(path.join(sourceRoot,'engine/catalog.json'),'utf8'));
const clone=v=>structuredClone(v),changed=e=>['CHAT_CHANGED','PHONE_CONTEXT_CHANGED'].includes(e?.code);
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
async function fixture(){
 const disk=new Map(),chat=[],saves=[];let live={chatId:'A',characterId:1,groupId:null,chatMetadata:{integrity:'A-integrity'},extensionSettings:{}},waitGet=null,afterService=null;
 const context=()=>({...live,chat,saveChat:async()=>{saves.push({key:chatKey(context()),chat:clone(chat)});return true;}});
 const storage={get:async id=>{const value=clone(disk.get(id)),wait=waitGet;waitGet=null;if(wait){wait.begun.resolve();await wait.hold.promise;}return value;},set:async(id,v)=>{disk.set(id,clone(v));},commit:async(id,revision,v)=>{if((disk.get(id)?.local_revision??0)!==revision)return false;disk.set(id,clone(v));return true;}};
 const host=createMatrixHost({getContext:context,getSource:()=>({}),loadCatalog:async()=>catalog,storage,persistSettings:async()=>true,persistMetadata:async()=>true});
 const deps={context,phoneChatKey:chatKey,matrixDatabase:{peek:()=>host.peekDatabase()},nativeGenerationOpen:false,isGenerating:()=>false,revisionController:{active:()=>false},fetch:async()=>({ok:true,json:async()=>({accounts:{me:{name:'合成队列本人',role:'self'}},documents:[]})}),ensureMatrixDatabase:()=>host.ensureDatabase(),createPhoneDatabaseStorage,matrixHost:host,createPhoneService,window:{dispatchEvent:()=>{}},CustomEvent:class {constructor(type){this.type=type;}},appearance:null,pet:null};
 const start=entry.indexOf('const phoneServices=new Map();'),end=entry.indexOf('\nconst phoneTurn=',start);assert.ok(start>=0&&end>start);
 const getPhoneService=Function(...Object.keys(deps),entry.slice(start,end).replaceAll('import.meta.url',JSON.stringify(at('index.js')))+'\nreturn getPhoneService;')(...Object.values(deps));
 const phoneTurn=createPhoneTurnHost({getContext:context,phoneService:async c=>{const service=await getPhoneService(c);const action=afterService;afterService=null;if(action)queueMicrotask(action);return service;}});
 const facadeCode=entry.match(/service:(async\(\)=>\{[^\n]+?return service;\}),snapshot:/)?.[1];assert.ok(facadeCode);
 const facade=Function('phoneTurn','isGenerating','revisionController','context','phoneChatKey','return '+facadeCode)(phoneTurn,deps.isGenerating,deps.revisionController,context,chatKey);
 function select(id,metadata={integrity:id+'-integrity'},messages=[{is_user:false,mes:'合成 '+id}]){live={...live,chatId:id,chatMetadata:metadata};for(let i=0;i<messages.length;i++)chat[i]=clone(messages[i]);chat.length=messages.length;phoneTurn.contextChanged();}
 select('B');await host.ensureDatabase();await getPhoneService();const bPayload={metadata:clone(context().chatMetadata),messages:clone(chat)};
 select('A');await host.ensureDatabase();const a=await getPhoneService();
 function pauseGet(){const wait={begun:deferred(),hold:deferred()};waitGet=wait;return {begun:wait.begun.promise,release:()=>wait.hold.resolve()};}
 return {context,host,disk,saves,phoneTurn,facade,a,select,pauseGet,bPayload,switchAfterService:action=>{afterService=action;}};
}

test('phone facade rejects A service when its queued reconciliation runs after switch to B',async()=>{
 const f=await fixture(),before=clone([...f.disk]),wait=f.pauseGet(),realReconcile=f.phoneTurn.reconcile;
 const first=realReconcile().then(()=>({ok:true}),error=>({error}));await wait.begun;
 const queued=deferred();f.phoneTurn.reconcile=(...args)=>{const task=realReconcile(...args);queued.resolve();return task;};
 const pending=f.facade().then(service=>({service}),error=>({error}));await queued.promise;
 f.select('B',f.bPayload.metadata,f.bPayload.messages);wait.release();await first;
 const outcome=await pending;assert.ok(changed(outcome.error),JSON.stringify({returnedService:outcome.service?.getState().contextKey,current:chatKey(f.context()),error:outcome.error?.message}));
 assert.deepEqual([...f.disk],before);
});

test('phone turn checks captured owner before assigning message identities after service await',async()=>{
 const f=await fixture(),before=clone([...f.disk]),nativeSaves=f.saves.length;
 f.switchAfterService(()=>f.select('B-fresh',{integrity:'fresh-B'},[{is_user:false,mes:'B尚未接入'}]));
 await assert.rejects(f.phoneTurn.reconcile(),changed);
 assert.equal(f.context().chat[0].extra?.tisya_engine?.uid,undefined,'obsolete A reconciliation must not assign B message identities');
 assert.equal(f.saves.length,nativeSaves,'obsolete A reconciliation must not call native saveChat after switching to B');assert.deepEqual([...f.disk],before);
});
