import {sha256Utf16,projectRetained,prepareCommit} from './host-runtime.mjs';
import {parseV3Reply} from './reply.mjs';
import {openingMaterial,nativeCardMaterial} from './host-materials.mjs';
import {readTurnDirection} from '../communication.js';
import {calendarTime} from '../tables/ledger.js';
import {nativeBranches,bridgeInput,hasNativeUpdate} from '../tables/native-bridge.js';

export const HOST_META='tisya_v3_host';
const clone=structuredClone;
const fail=(code,message)=>{throw Object.assign(Error(message),{code});};
const isAssistant=m=>m&&!m.is_user&&!m.is_system&&m.role!=='tool';
const access={readers:[],knowers:[]};
export function nativeInitialRows(context,runtime){
 if(!runtime)return [];
 let data;for(let i=context.chat.length-1;i>=0;i--){const candidate=runtime.getMvuData({type:'message',message_id:i});if(candidate?.stat_data){data=candidate;break;}}
 if(!data)fail('MVU_BASELINE','原卡尚未提供有效 MVU 初始快照');
 return nativeBranches(data.stat_data).map(({path,value})=>({id:'native:'+encodeURIComponent(path),table:'native_cells',rev:1,values:{名称:path.slice(1),路径:path,值:value,启用:true},access:clone(access),source:null,lockedFields:[],updatedAt:new Date().toISOString()}));
}
export function createSourceChain({getContext,system,getNative,configuration,guard,persist}){
 let current=[],pendingSource=null;
 const meta=()=>{const c=getContext();let value=c.chatMetadata[HOST_META];if(value===undefined){value={schema:'tisya.host-sources/1',outputs:{},active:[]};c.chatMetadata[HOST_META]=value;}if(value.schema!=='tisya.host-sources/1'||!value.outputs||!Array.isArray(value.active))fail('V3_SOURCE_METADATA','原文来源索引损坏');return value;};
 async function sourceRecord(floor,{read=false}={}){
  guard();const c=getContext(),message=c.chat[floor],identity=await system.identities.resolve(floor);guard();
  if(!message||message.is_system||message.role==='tool')return null;
  const fullHash=await sha256Utf16(String(message.mes??''));
  if(message.is_user){const turnDirection=readTurnDirection(message);return {role:'user',floor,identity,key:`user:${identity.messageId}:${fullHash}`,fullHash,text:String(message.mes??''),turnDirection,directionKey:turnDirection?`direction:${identity.messageId}:${await sha256Utf16(turnDirection)}`:null};}
  const output=meta().outputs[identity.messageId+':'+fullHash];
  const historical=!output&&!/<think\b[^>]*\bphase\s*=/i.test(message.mes);
  // Browsing only computes source identities. Validation and original writes
  // belong to a requested generation/import or an explicit source mutation.
  const bodies=historical?[]:[...String(message.mes).matchAll(/<body\b[^>]*>([\s\S]*?)<\/body\s*>/gi)];
  const body=historical?String(message.mes):bodies.length===1?bodies[0][1]:String(message.mes),bodyHash=await sha256Utf16(body),entryId=await system.originals.entryIdFor(identity);
  let prior;try{prior=await system.originals.metadata({entryId,scope:{chatId:identity.chatId,branchId:identity.branchId},includeDeleted:true});}catch(e){if(e.code!=='SOURCE_NOT_FOUND')throw e;}
  const revision=prior&&!prior.deleted&&prior.hash===bodyHash?prior.sourceRevision:`host:${fullHash}`;
  if(!read){
   const unchanged=prior&&!prior.deleted&&prior.hash===bodyHash&&prior.format===(historical?'historical':'numbered');
   const sourceRevision=(prior?.revision??0)+(unchanged?0:1);
   return {role:'assistant',floor,identity,key:`original:${entryId}:${sourceRevision}`,fullHash,entryId,
    reference:unchanged?{entryId,revision:prior.revision,hash:prior.hash,paragraphs:[]}:null,
    requestKey:output?.requestKey??null,time:storyTime(message.mes)};
  }
  let item;
  try{
   if(!historical)parseV3Reply(message.mes);
   item=await system.sourceBridge.archiveSource({floor,sourceRevision:revision,operationId:`source:${identity.branchId}:${identity.messageId}:${fullHash}`,historical,enableNativeBridge:configuration().nativeBridge===true&&!historical});
  }catch(error){
   error.floor=floor;
   error.message=`聊天第 ${floor+1} 条（楼层 ${floor}）无法作为本轮原文：${error.code==='HISTORY_CONTROL_BLOCK'?'旧回复含有未配对的控制标签':error.message}。原聊天未修改。`;
   throw error;
  }
  item.storyTime=storyTime(message.mes);
  return {role:'assistant',floor,identity,key:item.archiveSource.key,fullHash,entryId:item.originalReference.entryId,reference:item.originalReference,requestKey:output?.requestKey??null,time:storyTime(message.mes),...(read?{item}:{})};
 }
 async function scan({before=Infinity,read=false}={}){
  const result=[];for(let floor=0;floor<getContext().chat.length&&floor<before;floor++){
   const m=getContext().chat[floor];if(m.is_system||m.role==='tool')continue;
   // Unstructured opener is character setup, never disguised as archived numbered prose.
   if(floor===0&&openingMaterial(getContext()))continue;
   const row=await sourceRecord(floor,{read});if(row)result.push(row);
  }return result;
 }
 const keys=rows=>rows.flatMap(row=>[...(row.requestKey?['request:'+row.requestKey]:[]),row.key,...(row.directionKey?[row.directionKey]:[])]);
 async function build({requestKey,generationType='normal',before=Infinity,instruction}){
  const rows=await scan({before,read:true}),active=keys(rows),requestSource='request:'+requestKey;active.push(requestSource);

  const state=await system.storage.read(),view=projectRetained(state,active),done=new Set(view.commits.filter(c=>c.kind==='archive'&&!c.archiveSkipped).map(c=>c.source)),processed=new Set(view.commits.filter(c=>c.kind==='archive').map(c=>c.source)),nativeDone=new Set(view.commits.filter(c=>c.kind==='archive'&&['applied','original-owned'].includes(c.nativeReceipt?.phase)).map(c=>c.source));
  const archiveSources=[];let users=[];for(const row of rows){if(row.role==='user'){users.push({key:row.key,text:row.text});continue;}if(!(configuration().archiveEnabled===false?processed:done).has(row.key)){row.item.userSources=clone(users);row.item.nativeBridge.nativeAlready=nativeDone.has(row.key);archiveSources.push(row.item);}users=[];}
  const lastUser=rows.findLast(r=>r.role==='user'),config=configuration(),onstageObjects=config.onstageObjects??view.rows.find(r=>r.table==='scene')?.values.参与者??[],effective={...config,onstageObjects},worldWindow=typeof config.worldWindow?.ready==='boolean'?config.worldWindow:worldWindowFor(view,rows,archiveSources,effective);
  const preferenceSources=lastUser?[{key:lastUser.key,text:lastUser.text,kind:'user'},...(lastUser.turnDirection?[{key:lastUser.directionKey,text:lastUser.turnDirection,kind:'turn-direction'}]:[])]:[];
  // Repeated explicit feedback is analyzed once per stable user source.
  const used=new Set([...(state.preferenceRows??[]).map(r=>r.preferenceSource),...(state.preferenceDrafts??[]).flatMap(d=>(d.contributions??[]).map(c=>c.source))]);
  current=rows;pendingSource=requestSource;
  return {requestKey,generationType,archiveEnabled:config.archiveEnabled!==false,plotEnabled:config.plotEnabled!==false,activeSourceKeys:active,currentSourceKey:generationType==='advanced-reroll'?requestSource:(lastUser?.directionKey??lastUser?.key??requestSource),archiveSources,preferenceSources:preferenceSources.filter(s=>!used.has(s.key)),currentUser:instruction??lastUser?.text??'',currentRequest:{turnDirection:lastUser?.turnDirection??'',sourceKey:lastUser?.directionKey??null},additionalInput:{...(lastUser?.turnDirection?{directives:lastUser.turnDirection,kind:'turn-direction',sourceKey:lastUser.directionKey}:{}),cardSetup:nativeCardMaterial(getContext())},worldWindow,queryCatalog:['list_archive','describe_fields','search_archive','read_archive'],playerObjects:config.playerObjects??[],onstageObjects,focusText:config.focusText??config.worldWindow?.focusText??'',focusObjects:config.focusObjects??[],nativeRules:config.nativeRules??'',...config.preflightControls};
 }
 async function invalidate(event){
  guard();const previous=[...meta().active];const before=event.reason==='delete'?event.fromFloor:event.fromFloor;
  const retained=await scan({before,read:false}),active=keys(retained);
  // Keep this explicit request's context while removing the replaced candidate.
  if(['advanced-reroll','reroll'].includes(event.reason)&&pendingSource)active.push(pendingSource);
  const runtime=getNative();let nativeRestore=null;
  if(runtime&&getContext().chat.length){
   const context=getContext(),deletedTail=event.reason==='delete'&&event.fromFloor>=context.chat.length;
   const index=Math.min(event.fromFloor,context.chat.length-1);let snapshotIndex=index,data;
   if(event.reason==='swipe'){
    data=runtime.getMvuData({type:'message',message_id:index});
    if(!data?.stat_data){if(hasNativeUpdate(context.chat[index]?.mes))fail('MVU_SELECTED_SNAPSHOT','选中候选的原卡变量尚未结算');const baseline=bridgeInput(context,runtime,index);data=baseline.data;snapshotIndex=baseline.snapshotIndex;}
   }else {
    for(snapshotIndex=deletedTail?index:index-1;snapshotIndex>=0;snapshotIndex--){data=runtime.getMvuData({type:'message',message_id:snapshotIndex});if(data?.stat_data)break;}
    if(!data?.stat_data)fail('MVU_PREDECESSOR','找不到被保留的前驱 MVU 快照');
    // A trailing deletion leaves the retained predecessor untouched.
    if(!deletedTail){guard();await runtime.replaceMvuData(clone(data),{type:'message',message_id:index});guard();if(JSON.stringify(runtime.getMvuData({type:'message',message_id:index})?.stat_data)!==JSON.stringify(data.stat_data))fail('MVU_RESTORE_READBACK','MVU 前驱恢复未确认');}
   }
   nativeRestore={index,snapshotIndex,hash:await sha256Utf16(JSON.stringify(data.stat_data))};
  }
  if(event.reason==='delete'){
   const id=await system.originals.entryIdFor(event.identity);let old;try{old=await system.originals.metadata({entryId:id,scope:event.identity,includeDeleted:true});}catch(e){if(e.code!=='SOURCE_NOT_FOUND')throw e;}
   if(old&&!old.deleted)await system.originals.remove({entryId:id,scope:event.identity,expectedVersion:old.version,operationId:event.id});
  }
  meta().active=active;await persist();
  return {activeSourceKeys:active,invalidatedSourceKeys:previous.filter(k=>!active.includes(k)),...(nativeRestore?{nativeRestore}:{})};
 }
 async function recordOutput({floor,requestKey}){const identity=await system.identities.resolve(floor),hash=await sha256Utf16(getContext().chat[floor].mes);meta().outputs[identity.messageId+':'+hash]={requestKey};await persist();}
 async function refresh(){current=await scan({read:false});meta().active=keys(current);await persist();return [...meta().active];}
 async function detectChange(){
  guard();await system.identities.sync();const context=getContext(),live=[];
  for(let floor=0;floor<context.chat.length;floor++){const message=context.chat[floor];if(message.is_system||message.role==='tool'||floor===0&&openingMaterial(context))continue;const identity=await system.identities.resolve(floor),hash=await sha256Utf16(String(message.mes??''));live.push({floor,identity,hash,turnDirection:message.is_user?readTurnDirection(message):''});}
  const before=current,oldById=new Map(before.map(r=>[r.identity.messageId,r])),liveIds=new Set(live.map(r=>r.identity.messageId)),deleted=before.filter(r=>!liveIds.has(r.identity.messageId));
  const changed=live.filter(r=>{const old=oldById.get(r.identity.messageId);return old&&((old.fullHash??old.key.slice(old.key.lastIndexOf(':')+1))!==r.hash||old.role==='user'&&old.turnDirection!==r.turnDirection);});
  if(!deleted.length&&!changed.length)return null;
  const first=[...deleted,...changed].sort((a,b)=>a.floor-b.floor)[0];return {fromFloor:first.floor,identity:first.identity,deleted,changed};
 }
 return {build,invalidate,recordOutput,scan,refresh,detectChange,materialize:floor=>floor===0&&openingMaterial(getContext())?null:sourceRecord(floor,{read:true}),activeKeys:()=>[...meta().active],current:()=>clone(current),metadata:meta};
}
function storyTime(message){const title=String(message).match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1];const time=title?.trim().split('|')[1]?.trim();return calendarTime(time)!==null?time:null;}
function worldWindowFor(view,rows,sources,config){
 if(config.worldEnabled===false||config.worldWindow?.plot===false&&config.worldWindow?.offstage===false)return null;
 const scene=view.rows.find(r=>r.table==='scene'),last=rows.findLast(r=>r.role==='assistant'&&sources.some(s=>s.archiveSource.key===r.key));
 if(!scene||!last?.time||calendarTime(scene.values.当前时间)===null||calendarTime(last.time)<=calendarTime(scene.values.当前时间))return null;
 const excluded=new Set([...(config.playerObjects??[]),...(config.onstageObjects??[]),...(scene.values.参与者??[])]);
 const actors=(config.offstageEnabled===false||config.worldWindow?.offstage===false?[]:view.rows).filter(r=>r.table==='objects'&&['character','organization'].includes(r.values.类型)&&!excluded.has(r.id)).map(r=>r.id);
 return {ready:true,from:scene.values.当前时间,to:last.time,scene:scene.id,source:last.key,actors};
}
