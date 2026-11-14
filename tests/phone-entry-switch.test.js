import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

// Run with TISYA_ENTRY_SOURCE pointing at the product checkout. Actual product
// factory/entry functions execute below; no copied replacement implementation.
// Context navigation, database transport waits, and the DOM are explicit fakes.
// V2 starts cache barriers only when production actually consumes the cache
// thenable. V1 began a native promise eagerly and could reject it unobserved.
const sourceRoot=process.env.TISYA_ENTRY_SOURCE??new URL('..',import.meta.url).pathname;
const at=relative=>pathToFileURL(path.join(sourceRoot,relative)).href;
const {createMatrixHost}=await import(at('engine/host.mjs'));
const {chatKey}=await import(at('engine/controller.mjs'));
const {createPhoneService}=await import(at('phone-core.mjs'));
const {createPhoneDatabaseStorage}=await import(at('engine/phone-database.mjs'));
const entry=fs.readFileSync(path.join(sourceRoot,'index.js'),'utf8');
const catalog=JSON.parse(fs.readFileSync(path.join(sourceRoot,'engine/catalog.json'),'utf8'));
const clone=value=>structuredClone(value);
const seed={accounts:{me:{name:'合成入口测试本人',role:'self'}},documents:[]};
const changed=error=>['CHAT_CHANGED','PHONE_CONTEXT_CHANGED'].includes(error?.code)||/聊天已切换/.test(error?.message??'');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function extracted(start,end){const a=entry.indexOf(start),b=entry.indexOf(end,a);assert.ok(a>=0&&b>a,`Production source boundaries ${start} / ${end}`);return entry.slice(a,b).replaceAll('import.meta.url',JSON.stringify(at('index.js')));}

async function fixture(){
 const disk=new Map(),chat=[];let live={chatId:'A',characterId:1,groupId:null,chatMetadata:{integrity:'A-integrity'},extensionSettings:{}};
 let writes=0,saves=0,waitNextPeek=null;
 const context=()=>({...live,chat,saveChat:async()=>{saves++;return true;}});
 const storage={get:async id=>clone(disk.get(id)),set:async(id,v)=>{writes++;disk.set(id,clone(v));},commit:async(id,revision,v)=>{if((disk.get(id)?.local_revision??0)!==revision)return false;writes++;disk.set(id,clone(v));return true;}};
 const host=createMatrixHost({getContext:context,getSource:()=>({}),loadCatalog:async()=>catalog,storage,persistSettings:async()=>true,persistMetadata:async()=>true});
 const deps={context,phoneChatKey:chatKey,matrixDatabase:{peek:async()=>{const value=await host.peekDatabase();const wait=waitNextPeek;waitNextPeek=null;if(wait){wait.begun.resolve();await wait.hold.promise;}return value;}},nativeGenerationOpen:false,isGenerating:()=>false,revisionController:{active:()=>false},fetch:async()=>({ok:true,json:async()=>clone(seed)}),ensureMatrixDatabase:()=>host.ensureDatabase(),createPhoneDatabaseStorage,matrixHost:host,createPhoneService,window:{dispatchEvent:()=>{}},CustomEvent:class {constructor(type){this.type=type;}},appearance:null,pet:null};
 const body=extracted('const phoneServices=new Map();','\nconst phoneTurn=');
 const {getPhoneService,phoneServices}=Function(...Object.keys(deps),body+'\nreturn {getPhoneService,phoneServices};')(...Object.values(deps));
 function select(id,metadata={integrity:id+'-integrity'},messages=[{is_user:false,mes:'合成开场白 '+id}]){
  live={...live,chatId:id,chatMetadata:metadata};for(let i=0;i<messages.length;i++)chat[i]=clone(messages[i]);chat.length=messages.length;
 }
 function pausePeek(){const wait={begun:deferred(),hold:deferred()};waitNextPeek=wait;return {begun:wait.begun.promise,release:()=>wait.hold.resolve()};}
 const ui={pages:[],frames:[],closures:0};const nodes=new Map();
 const document={createElement(tag){return {tag,style:{},setAttribute(){},contentWindow:null,remove(){}};}};
 const uiDeps={mayLeaveUtility:async()=>true,getPhoneService,initializeLifeForCurrentSelection:async()=>{},close:()=>{ui.closures++;},closeNativeDrawers:()=>{},hideAllPanels:()=>{},document,renderEpoch:0,page:(title,html)=>ui.pages.push({title,html,key:chatKey(context())}),esc:value=>String(value),query:selector=>{if(!nodes.has(selector))nodes.set(selector,{append:node=>ui.frames.push({src:node.src,key:chatKey(context())})});return nodes.get(selector);},openIdentity:async()=>{},hidePage:()=>{},error:()=>{},phoneChatKey:chatKey,context,utility:null};
 const openVirtualPhone=Function(...Object.keys(uiDeps),extracted('async function openVirtualPhone(','\nasync function openWorldSeed(')+'\nreturn openVirtualPhone;')(...Object.values(uiDeps));
 select('A');await host.ensureDatabase();const a=await getPhoneService();
 return {host,context,select,disk,getPhoneService,phoneServices,pausePeek,ui,openVirtualPhone,a,writes:()=>writes,saves:()=>saves};
}

test('entry cache rejects A after completed peek is delayed until navigation to B',async()=>{
 const f=await fixture(),before=clone([...f.disk]),wait=f.pausePeek();const old=f.getPhoneService();await wait.begun;
 f.select('B');wait.release();await assert.rejects(old,changed);
 assert.deepEqual([...f.disk],before);assert.deepEqual(f.context().chatMetadata,{integrity:'B-integrity'});
});

test('entry cache rejects when the same chat key reloads a different metadata object',async()=>{
 const f=await fixture(),oldMeta=f.context().chatMetadata,wait=f.pausePeek();const old=f.getPhoneService();await wait.begun;
 f.select('A',clone(oldMeta),f.context().chat);wait.release();await assert.rejects(old,changed);
 assert.notEqual(f.context().chatMetadata,oldMeta);
});

test('entry cache rechecks ownership after an existing cache promise resolves',async()=>{
 const f=await fixture(),gate=deferred(),begun=deferred(),row=f.phoneServices.get(chatKey(f.context()));
 const actual=row.promise;row.promise={then(resolve,reject){begun.resolve();gate.promise.then(()=>actual).then(resolve,reject);}};
 const old=f.getPhoneService();await begun.promise;f.select('B');gate.resolve();await assert.rejects(old,changed);
 assert.deepEqual(f.context().chatMetadata,{integrity:'B-integrity'});
});

test('late successful A opening leaves B page untouched and does not create a B iframe',async()=>{
 const f=await fixture(),wait=f.pausePeek(),old=f.openVirtualPhone();await wait.begun;f.select('B');wait.release();
 const outcome=await Promise.allSettled([old]);assert.ok(outcome[0].status==='fulfilled'||changed(outcome[0].reason));
 assert.deepEqual(f.ui.pages,[]);assert.deepEqual(f.ui.frames,[]);assert.equal(f.ui.closures,0);
});

test('late failed A opening leaves B page untouched instead of painting A error there',async()=>{
 const f=await fixture(),gate=deferred(),begun=deferred(),row=f.phoneServices.get(chatKey(f.context()));
 const actual=row.promise;row.promise={then(resolve,reject){begun.resolve();gate.promise.then(()=>actual).then(()=>reject(Object.assign(Error('明确合成的A读取失败'),{code:'SYNTHETIC_A_READ_FAILURE'})),reject);}};
 const old=f.openVirtualPhone();await begun.promise;f.select('B');gate.resolve();
 await Promise.allSettled([old]);assert.deepEqual(f.ui.pages,[]);assert.deepEqual(f.ui.frames,[]);assert.equal(f.ui.closures,0);
});

test('stable A to independently loaded B initializes B and keeps A bundle unchanged',async()=>{
 const f=await fixture(),aOwner=f.context().chatMetadata.tisya_engine.chat_uid,aBundle=clone(f.disk.get(aOwner));
 f.select('B');await f.host.ensureDatabase();const b=await f.getPhoneService();assert.notEqual(b,f.a);assert.equal(b.getState().contextKey,chatKey(f.context()));assert.equal((await f.host.readDatabase()).phoneDetached,false);assert.deepEqual(f.disk.get(aOwner),aBundle);
});

test('genuine B history detachment is retained without reinitializing or altering stored evidence',async()=>{
 const f=await fixture();f.select('B');await f.host.ensureDatabase();await f.getPhoneService();const key=chatKey(f.context());
 f.context().chat[0].mes='合成的真实历史修改';await f.host.sync();const before=clone([...f.disk]),writes=f.writes();f.phoneServices.delete(key);
 await assert.rejects(f.getPhoneService(),error=>error?.code==='PHONE_DATABASE_DETACHED'&&error.details.initializationSources.some(row=>row.index===0&&row.messageUid===f.context().chat[0].extra.tisya_engine.uid&&row.reason==='content-changed'&&row.mismatchIndex===0&&!JSON.stringify(row).includes('合成的真实历史修改')));
 await f.openVirtualPhone();assert.match(f.ui.pages.at(-1).html,/查看初始化楼层/);assert.match(f.ui.pages.at(-1).html,/第 1 楼/);assert.equal(f.writes(),writes);assert.deepEqual([...f.disk],before);
});
