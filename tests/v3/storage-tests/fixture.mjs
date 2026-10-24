import assert from 'node:assert/strict';
import {createBookManager} from '../../../v3/books.mjs';
const copy=v=>structuredClone(v),code=wanted=>error=>error.code===wanted;
const owner={chatId:'chat-1',branchId:'branch-1'},player={id:'player-1'},preferenceOwner={kind:'player',id:'player-1'};
/** In-memory host fixture, not an Android or Tauri persistence claim. */
export function fixture(overrides={}) {
 const docs=new Map(),pointers=new Map(),calls=[],fail={};let globalPointer=null;let id=0,ctx={owner:copy(owner),playerId:player.id,epoch:1},native={locator:'native-1'};
 const key=()=>JSON.stringify(ctx.owner);
 const transport={
  async readFresh(name){calls.push(['read',name]);return docs.has(name)?copy(docs.get(name)):null;},
  async save(name,data){calls.push(['save',name]);if(fail.save)throw Error('save failed');docs.set(name,copy(data));if(fail.corruptReadback)docs.get(name).corrupt=true;},
  createEntry(name,data){const uid=Object.keys(data.entries).map(Number).reduce((max,x)=>Math.max(max,x),-1)+1;const wire={uid,extensions:{},hostDefault:'kept'};data.entries[uid]=wire;return wire;},
 };
 const opts={transport,listNames:async()=>[...docs.keys()],getContext:()=>copy(ctx),assertIdle:()=>{if(fail.busy)throw Error('generation is running');return true;},
  readGlobalMetadata:async()=>copy(globalPointer),saveGlobalMetadata:async(value,{expected})=>{assert.deepEqual(globalPointer,expected);globalPointer=copy(value);},
  readMetadata:async()=>copy(pointers.get(key())??null),saveMetadata:async(pointer,{expected})=>{assert.deepEqual(pointers.get(key())??null,expected);if(fail.pointerBefore)throw Error('pointer failed');pointers.set(key(),copy(pointer));if(fail.pointerAfter)throw Error('ack lost');},
  saveCurrentBranch:async args=>{calls.push(['saveCurrentBranch',copy(args)]);if(fail.draft)return {saved:true,draftSaved:false};return {saved:true,draftSaved:true,nativeCheckpoint:copy(native)};},
  activateChat:async({owner})=>{calls.push(['activateChat',copy(owner)]);if(fail.chat)throw Error('chat failed');ctx.owner=copy(owner);ctx.epoch++;},
  activateUser:async({player})=>{calls.push(['activateUser',copy(player)]);if(fail.user)throw Error('persona failed');ctx.playerId=player.id;},
  restoreNative:async({checkpoint})=>{calls.push(['restoreNative',copy(checkpoint)]);if(fail.native)throw Error('native failed');native=copy(checkpoint);},
  readNative:async()=>copy(native),invalidate:async args=>calls.push(['invalidate',args]),projectLedger:async({state})=>({rows:state.baseView?.rows??[]}),uuid:()=>`test-${++id}`,now:()=> '2026-10-24T06:00:00Z',...overrides};
 const manager=createBookManager(opts);
 return {manager,docs,pointers,transport,opts,calls,fail,get ctx(){return ctx;},set ctx(value){ctx=value;},get native(){return native;},set native(value){native=value;}};
}
export async function setup(f=fixture()) {
 const origin=await f.manager.create({kind:'origin',name:'世界初稿',operationId:'origin-create'});
 const core=await f.manager.create({kind:'core',name:'核心',operationId:'core-create'});await f.manager.selectGlobalCore({coreId:core.id,expectedRevision:null,operationId:'global-initial'});
 const archive=await f.manager.create({kind:'archive',name:'存档甲',origin:{bookId:origin.id},core:{bookId:core.id},player,preferenceOwner,operationId:'archive-create'});
 await f.manager.select({archiveId:archive.id,expectedBindingRevision:null,operationId:'select-initial'});
 return {...f,f,origin,core,archive,runtime:await f.manager.readRuntime()};
}
