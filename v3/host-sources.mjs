import {archiveToolDefinitions} from '../tables/archive-tools.js';
import {messageWorkspace} from '../message-workspace.js';
import {sha256Utf16,projectRetained,prepareCommit,parseHistoricalBody} from './host-runtime.mjs';
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
const sourceFormatError=error=>/^TISYA_V3_REPLY_/.test(error?.code??'')||['HISTORY_CONTROL_BLOCK','REPLY_FORMAT','EMPTY_BODY','UNNUMBERED_BODY','UNNUMBERED_PREFIX','UNNUMBERED_PARAGRAPH','NUMBER_SEQUENCE','EMPTY_PARAGRAPH','INVALID_NUMBER','UNCLOSED_FENCE'].includes(error?.code);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function nativeInitialRows(context,runtime){
 if(!runtime)return [];
 let data;for(let i=context.chat.length-1;i>=0;i--){const candidate=runtime.getMvuData({type:'message',message_id:i});if(candidate?.stat_data){data=candidate;break;}}
 if(!data)fail('MVU_BASELINE','原卡尚未提供有效 MVU 初始快照');
 return nativeBranches(data.stat_data).map(({path,value})=>({id:'native:'+encodeURIComponent(path),table:'native_cells',rev:1,values:{名称:path.slice(1),路径:path,值:value,启用:true},access:clone(access),source:null,lockedFields:[],updatedAt:new Date().toISOString()}));
}
export function createSourceChain({getContext,system,getNative,configuration,guard,persist,deferMetadata=null,workspace=messageWorkspace}){
 let current=[],pendingSource=null;
 const digest=text=>workspace.read(text,'sha256:utf16',()=>sha256Utf16(text));
 const meta=()=>{const c=getContext();let value=c.chatMetadata[HOST_META];if(value===undefined){value={schema:'tisya.host-sources/1',outputs:{},active:[]};c.chatMetadata[HOST_META]=value;}if(value.schema!=='tisya.host-sources/1'||!value.outputs||!Array.isArray(value.active))fail('V3_SOURCE_METADATA','原文来源索引损坏');return value;};
 async function persistFields(fields,{nativeMessagesChanged=false}={}){
  const metadata=getContext().chatMetadata,target=meta(),before=Object.fromEntries(Object.keys(fields).map(key=>[key,{present:Object.hasOwn(target,key),value:target[key]}]));
  if(!nativeMessagesChanged&&Object.entries(fields).every(([key,value])=>same(target[key],value)))return;
  Object.assign(target,fields);
  const rollback=()=>{
   // Failed saves must not become the comparison baseline for a later retry.
   // Restore only fields still owned by this write, never a newly opened chat.
   if(getContext().chatMetadata===metadata&&metadata[HOST_META]===target)for(const [key,value]of Object.entries(fields))if(target[key]===value){if(before[key].present)target[key]=before[key].value;else delete target[key];}
  };
  try{if(!nativeMessagesChanged&&deferMetadata?.(rollback)===true)return;await persist({nativeMessagesChanged});}catch(error){rollback();throw error;}
 }
 async function sourceRecord(floor,{read=false,allowUnavailable=false,knownIdentity=null,originalIndex=null,expectedFullHash=null,scanGuarded=false}={}){
  // A read-only scan verifies one frozen chat at its boundaries. Each row has
  // no writes, so it need not rebuild the same configuration several times.
  const checkScope=scanGuarded&&!read?()=>{}:guard;
  checkScope();const c=getContext(),message=c.chat[floor],identity=knownIdentity??await system.identities.resolve(floor);checkScope();
  if(!message||message.is_system||message.role==='tool')return null;
  const fullHash=await digest(String(message.mes??''));checkScope();if(expectedFullHash!==null&&fullHash!==expectedFullHash)fail('SOURCE_CHANGED','聊天在原文读取与保存之间已改变');
  if(message.is_user){const turnDirection=readTurnDirection(message);return {role:'user',floor,identity,key:`user:${identity.messageId}:${fullHash}`,fullHash,text:String(message.mes??''),turnDirection,directionKey:turnDirection?`direction:${identity.messageId}:${await digest(turnDirection)}`:null};}
  const output=(scanGuarded?c.chatMetadata[HOST_META]?.outputs:meta().outputs)?.[identity.messageId+':'+fullHash];
  const historical=!output&&!/<think\b[^>]*\bphase\s*=/i.test(message.mes);
  // Browsing only computes source identities. Validation and original writes
  // belong to a requested generation/import or an explicit source mutation.
  const text=String(message.mes),body=historical?text:workspace.read(text,'host:body-v1',()=>{const bodies=[...text.matchAll(/<body\b[^>]*>([\s\S]*?)<\/body\s*>/gi)];return bodies.length===1?bodies[0][1]:text;}),bodyHash=await digest(body),entryId=await system.originals.entryIdFor(identity);
  let prior;if(originalIndex)prior=originalIndex.get(identity.messageId);else try{prior=await system.originals.metadata({entryId,scope:{chatId:identity.chatId,branchId:identity.branchId},includeDeleted:true});}catch(e){if(e.code!=='SOURCE_NOT_FOUND')throw e;}
  const revision=prior&&!prior.deleted&&prior.hash===bodyHash?prior.sourceRevision:`host:${fullHash}`;
  const unchanged=prior&&!prior.deleted&&prior.hash===bodyHash&&prior.format===(historical?'historical':'numbered');
   const sourceRevision=(prior?.revision??0)+(unchanged?0:1);
   const record={role:'assistant',floor,identity,key:`original:${entryId}:${sourceRevision}`,fullHash,entryId,
    reference:unchanged?{entryId,revision:prior.revision,hash:prior.hash,paragraphs:[]}:null,
    requestKey:output?.requestKey??null,time:storyTime(message.mes)};
  if(!read)return record;
  let item;
  try{
   if(historical)parseHistoricalBody(String(message.mes??''));else parseV3Reply(message.mes);
  }catch(error){
   error.floor=floor;
   error.message=`聊天第 ${floor+1} 条（楼层 ${floor}）无法作为本轮原文：${error.code==='HISTORY_CONTROL_BLOCK'?'旧回复含有未配对的控制标签':error.message}。原聊天未修改。`;
   // A retained legacy message is not a newly generated reply. A local parsing
   // issue leaves this source pending; it must not veto sending or deleting.
   // Storage/identity/readback failures remain fatal and are never downgraded.
   if(allowUnavailable&&sourceFormatError(error))return {...record,diagnostic:{floor,messageId:identity.messageId,sourceKey:record.key,fullHash,code:error.code,status:'pending',message:`第 ${floor+1} 条旧聊天暂未归档：${error.code==='HISTORY_CONTROL_BLOCK'?'控制标签不完整':error.message}。原文保留；可在历史补录中核对，本轮聊天继续。`}};
   throw error;
  }
  // Keep storage/bridge errors outside the legacy format diagnostic catch.
  item=await system.sourceBridge.archiveSource({floor,sourceRevision:revision,operationId:`source:${identity.branchId}:${identity.messageId}:${fullHash}`,historical,enableNativeBridge:configuration().nativeBridge===true&&!historical});
  item.storyTime=storyTime(message.mes);
  return {role:'assistant',floor,identity,key:item.archiveSource.key,fullHash,entryId:item.originalReference.entryId,reference:item.originalReference,requestKey:output?.requestKey??null,time:storyTime(message.mes),...(read?{item}:{})};
 }
 async function scan({before=Infinity,read=false,allowUnavailable=true}={}){
  guard();const context=getContext(),messages=context.chat.map(message=>({message,text:message.mes,swipeId:message.swipe_id??0}));
  // Reuse one verified identity/metadata snapshot per scan, never across scans.
  // Per-floor resolve otherwise copies the complete chat and reads the same book N times.
  const identities=typeof system.identities.sync==='function'?await system.identities.sync():null;guard();
  const originalIndex=identities&&typeof system.originals.listMetadata==='function'?new Map((await system.originals.listMetadata({scope:{chatId:identities.chatId,branchId:identities.branchId},includeDeleted:true})).map(item=>[item.identity.messageId,item])):null;guard();
  const result=[],pending=[];for(let floor=0;floor<messages.length&&floor<before;floor++){
   const m=messages[floor].message;if(m.is_system||m.role==='tool')continue;
   // Unstructured opener is character setup, never disguised as archived numbered prose.
   if(floor===0&&openingMaterial(context))continue;
   const messageId=identities?.order?.[floor],knownIdentity=messageId?{chatId:identities.chatId,branchId:identities.branchId,messageId}:null;
   const job=sourceRecord(floor,{read,allowUnavailable,knownIdentity,originalIndex,scanGuarded:!!identities&&!!originalIndex&&!read});
   if(read){const row=await job;if(row)result.push(row);}else pending.push(job);
  }
  if(!read)result.push(...(await Promise.all(pending)).filter(Boolean));
  guard();if(getContext().chat!==context.chat||context.chat.length!==messages.length||messages.some((entry,i)=>context.chat[i]!==entry.message||entry.message.mes!==entry.text||(entry.message.swipe_id??0)!==entry.swipeId))fail('SOURCE_CHANGED','聊天在读取来源期间已改变');
  return result;
 }
 const keys=rows=>rows.flatMap(row=>[...(row.requestKey?['request:'+row.requestKey]:[]),row.key,...(row.directionKey?[row.directionKey]:[])]);
 async function build({requestKey,generationType='normal',before=Infinity,instruction,standalone=false}){
  const rows=await scan({before,read:false}),active=keys(rows),requestSource='request:'+requestKey;active.push(requestSource);

  const state=await system.storage.read(),view=projectRetained(state,active),done=new Set(view.commits.filter(c=>c.kind==='archive'&&!c.archiveSkipped).map(c=>c.source)),processed=new Set(view.commits.filter(c=>c.kind==='archive').map(c=>c.source)),nativeDone=new Set(view.commits.filter(c=>c.kind==='archive'&&['applied','original-owned'].includes(c.nativeReceipt?.phase)).map(c=>c.source));
  const automatic=configuration().auxiliaryEnabled===true,acceptedBefore=standalone?Infinity:(rows.findLast(r=>r.role==='user')?.floor??-1);
  const preflightSkipped=standalone?null:!automatic?'disabled':!rows.some(r=>r.role==='assistant'&&r.floor>0&&r.floor<acceptedBefore)?'first-turn':null;
  const archiveSources=[];let users=[];for(const row of rows){if(row.role==='user'){users.push({key:row.key,text:row.text});continue;}if(!preflightSkipped&&(standalone||row.floor>0&&row.floor<acceptedBefore)&&!(configuration().archiveEnabled===false?processed:done).has(row.key)){
   const materialized=await sourceRecord(row.floor,{read:true,allowUnavailable:true,knownIdentity:row.identity,expectedFullHash:row.fullHash});if(materialized.key!==row.key||materialized.fullHash!==row.fullHash)fail('SOURCE_CHANGED','原文保存期间来源修订已改变');Object.assign(row,materialized);
   if(row.item){row.item.userSources=clone(users);row.item.nativeBridge.nativeAlready=nativeDone.has(row.key);archiveSources.push(row.item);}
  }users=[];}
  const lastUser=rows.findLast(r=>r.role==='user'),config=configuration(view),onstageObjects=config.onstageObjects??view.rows.find(r=>r.table==='scene')?.values.参与者??[],effective={...config,onstageObjects},worldWindow=preflightSkipped?null:typeof config.worldWindow?.ready==='boolean'?config.worldWindow:worldWindowFor(view,rows,archiveSources,effective);
  const preferenceSources=lastUser?[{key:lastUser.key,text:lastUser.text,kind:'user'},...(lastUser.turnDirection?[{key:lastUser.directionKey,text:lastUser.turnDirection,kind:'turn-direction'}]:[])]:[];
  // Repeated explicit feedback is analyzed once per stable user source.
  const used=new Set([...(state.preferenceRows??[]).map(r=>r.preferenceSource),...(state.preferenceDrafts??[]).flatMap(d=>(d.contributions??[]).map(c=>c.source))]);
  const sourceDiagnostics=rows.filter(row=>row.diagnostic).map(row=>row.diagnostic);if(!same(meta().sourceDiagnostics??[],sourceDiagnostics))await persistFields({sourceDiagnostics});
  current=rows;pendingSource=requestSource;
  return {requestKey,generationType,...(preflightSkipped?{preflightSkipped}:{}),archiveEnabled:config.archiveEnabled!==false,plotEnabled:config.plotEnabled!==false,activeSourceKeys:active,currentSourceKey:standalone?(rows.at(-1)?.key??requestSource):generationType==='advanced-reroll'?requestSource:(lastUser?.directionKey??lastUser?.key??requestSource),archiveSources,preferenceSources:preferenceSources.filter(s=>!used.has(s.key)),currentUser:instruction??lastUser?.text??'',currentRequest:{turnDirection:lastUser?.turnDirection??'',sourceKey:lastUser?.directionKey??null},additionalInput:{...(sourceDiagnostics.length?{sourceDiagnostics:clone(sourceDiagnostics)}:{}),...(lastUser?.turnDirection?{directives:lastUser.turnDirection,kind:'turn-direction',sourceKey:lastUser.directionKey}:{}),cardSetup:nativeCardMaterial(getContext())},worldWindow,queryCatalog:archiveToolDefinitions().map(({method,description,parameters})=>({method,description,parameters})),playerObjects:config.playerObjects??[],onstageObjects,focusText:config.focusText??config.worldWindow?.focusText??'',focusObjects:config.focusObjects??[],nativeRules:config.nativeRules??'',...config.preflightControls};
 }
 async function invalidate(event){
  guard();const previous=[...meta().active];const before=event.reason==='delete'?event.fromFloor:event.fromFloor;
  const retained=await scan({before,read:false}),active=keys(retained);
  // Keep this explicit request's context while removing the replaced candidate.
  if(['advanced-reroll','reroll'].includes(event.reason)&&pendingSource)active.push(pendingSource);
  const runtime=getNative();let nativeRestore=null,nativeMessagesChanged=false;
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
    if(!deletedTail){nativeMessagesChanged=true;guard();await runtime.replaceMvuData(clone(data),{type:'message',message_id:index});guard();if(JSON.stringify(runtime.getMvuData({type:'message',message_id:index})?.stat_data)!==JSON.stringify(data.stat_data))fail('MVU_RESTORE_READBACK','MVU 前驱恢复未确认');}
   }
   nativeRestore={index,snapshotIndex,hash:await sha256Utf16(JSON.stringify(data.stat_data))};
  }
  if(event.reason==='delete'){
   const id=await system.originals.entryIdFor(event.identity);let old;try{old=await system.originals.metadata({entryId:id,scope:event.identity,includeDeleted:true});}catch(e){if(e.code!=='SOURCE_NOT_FOUND')throw e;}
   if(old&&!old.deleted)await system.originals.remove({entryId:id,scope:event.identity,expectedVersion:old.version,operationId:event.id});
  }
  await persistFields({active,sourceDiagnostics:(meta().sourceDiagnostics??[]).filter(d=>retained.some(row=>row.identity.messageId===d.messageId&&row.fullHash===d.fullHash))},{nativeMessagesChanged});
  return {activeSourceKeys:active,invalidatedSourceKeys:previous.filter(k=>!active.includes(k)),...(nativeRestore?{nativeRestore}:{})};
 }
 async function recordOutput({floor,requestKey,beforePersist=null}){
  guard();const context=getContext(),metadata=context.chatMetadata,identity=await system.identities.resolve(floor);guard();
  const hash=await sha256Utf16(context.chat[floor].mes);guard();
  if(getContext().chat!==context.chat||getContext().chatMetadata!==metadata)fail('SOURCE_CHANGED','登记输出时当前聊天已变化');
  const target=meta(),outputs=target.outputs,key=identity.messageId+':'+hash,present=Object.hasOwn(outputs,key),previous=outputs[key],value={requestKey};outputs[key]=value;
  try{await beforePersist?.();guard();await persist({nativeMessagesChanged:true});}
  catch(error){if(getContext().chatMetadata===metadata&&metadata[HOST_META]===target&&target.outputs===outputs&&outputs[key]===value){if(present)outputs[key]=previous;else delete outputs[key];}throw error;}
 }
 async function refresh(){
  const rows=await scan({read:false}),active=keys(rows),metadata=meta(),diagnostics=(metadata.sourceDiagnostics??[]).filter(d=>rows.some(row=>row.identity.messageId===d.messageId&&row.fullHash===d.fullHash));
  if(!same(metadata.active,active)||!same(metadata.sourceDiagnostics??[],diagnostics))await persistFields({active,...metadata.sourceDiagnostics!==undefined||diagnostics.length?{sourceDiagnostics:diagnostics}:{}});
  current=rows;return [...meta().active];
 }
 async function detectChange(){
  const live=(await scan({read:false})).map(row=>({floor:row.floor,identity:row.identity,hash:row.fullHash,turnDirection:row.turnDirection??''}));
  const before=current,oldById=new Map(before.map(r=>[r.identity.messageId,r])),liveIds=new Set(live.map(r=>r.identity.messageId)),deleted=before.filter(r=>!liveIds.has(r.identity.messageId));
  const changed=live.filter(r=>{const old=oldById.get(r.identity.messageId);return old&&((old.fullHash??old.key.slice(old.key.lastIndexOf(':')+1))!==r.hash||old.role==='user'&&old.turnDirection!==r.turnDirection);});
  if(!deleted.length&&!changed.length)return null;
  const first=[...deleted,...changed].sort((a,b)=>a.floor-b.floor)[0];return {fromFloor:first.floor,identity:first.identity,deleted,changed};
 }
 return {build,invalidate,recordOutput,scan,refresh,detectChange,materialize:floor=>floor===0&&openingMaterial(getContext())?null:sourceRecord(floor,{read:true,allowUnavailable:true}),activeKeys:()=>[...meta().active],current:()=>clone(current),metadata:meta};
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
