import {messageWorkspace} from '../message-workspace.js';

export const SESSION_WORKSPACE_SCHEMA='tisya.session-workspace/1';
export const SESSION_WORKSPACE_CODE='message-derived-w45/1';
const SOURCE_STATUS='observed-settled-host',MARKER='tisya_w24_floor';
const copy=structuredClone;
const fail=(code,message)=>{throw Object.assign(Error(message),{code});};
const text=value=>typeof value==='string'&&value.length>0;
const same=(a,b)=>{
 if(Object.is(a,b))return true;
 if(!a||!b||typeof a!=='object'||typeof b!=='object')return false;
 if(a instanceof Date||b instanceof Date)return a instanceof Date&&b instanceof Date&&a.getTime()===b.getTime();
 if(Array.isArray(a)!==Array.isArray(b))return false;
 const ak=Object.keys(a),bk=Object.keys(b);
 return ak.length===bk.length&&(!Array.isArray(a)||a.length===b.length)&&ak.every(key=>Object.hasOwn(b,key)&&same(a[key],b[key]));
};
const identity=owner=>JSON.stringify([owner.account,owner.cardId,owner.chatId??null]);
export function sessionWorkspaceKey(owner,kind,id=null){
 return JSON.stringify([SESSION_WORKSPACE_SCHEMA,owner.account??'local',owner.cardId,['card','configuration'].includes(kind)?null:owner.chatId??null,kind,id]);
}
function normalizedOwner(value){
 if(!value||!text(value.cardId))fail('SESSION_WORKSPACE_OWNER','当前工作区缺少稳定卡身份');
 const owner=copy(value);if(!Object.hasOwn(owner,'account'))owner.account='local';owner.cardName=text(owner.cardName)?owner.cardName:owner.cardId;
 if(!text(owner.account))fail('SESSION_WORKSPACE_OWNER','当前工作区缺少账号身份');
 if(owner.chatId!==undefined&&!text(owner.chatId))fail('SESSION_WORKSPACE_OWNER','当前工作区存档身份无效');
 if(owner.chatId!==undefined)owner.chatName=text(owner.chatName)?owner.chatName:owner.chatId;
 else delete owner.chatName;
 return owner;
}
function cardOwner(owner){const {chatId,chatName,...card}=owner;return card;}
const markerId=(message,index)=>text(message?.[MARKER]?.id)?['marker',message[MARKER].id]:['native',message?.send_date??null,message?.name??null,index];
const payload=data=>({schema:SESSION_WORKSPACE_SCHEMA,codeVersion:SESSION_WORKSPACE_CODE,sourceStatus:SOURCE_STATUS,...data});
const valid=(record,kind,owner)=>record?.kind===kind&&record.state==='saved'&&identity(record.owner)===identity(owner)&&record.data?.schema===SESSION_WORKSPACE_SCHEMA&&record.data?.codeVersion===SESSION_WORKSPACE_CODE&&record.data?.sourceStatus===SOURCE_STATUS;
const manifestOrder=record=>{const order=record.data.order;if(!Array.isArray(order)||order.some(key=>typeof key!=='string'))fail('SESSION_WORKSPACE_MANIFEST','消息工作区目录格式无效，未自动重置');return order;};
function mergeSnapshots(previous,next){
 if(!previous)return next;
 const allowed=new Set(next.order),messages=new Map([...previous.messages,...next.messages].filter(([key])=>allowed.has(key)));
 return {...next,messages,full:previous.full||next.full};
}

/** Complete, incremental working copies. These records are never host save
 * receipts, initialization authority, or replacements for native chat arrays.
 * Hydration restores only pure calculations for byte/field-equal live messages.
 */
export function createSessionWorkspace({cache,getContext,getOwner,getConfiguration=()=>null,workspace=messageWorkspace,onError=()=>{},isBusy=()=>false}={}){
 if(!cache?.get||!cache?.put||!cache?.remove||typeof getContext!=='function'||typeof getOwner!=='function')fail('SESSION_WORKSPACE_DEPENDENCY','消息工作区缺少保存或宿主接口');
 let disposed=false,generation=0,sequence=0,timer=null,tail=Promise.resolve();
 const scheduled=new Map(),deferred=new Map(),failed=new Map(),cardVersions=new Map(),coveredKeys=new Map(),coverageVersions=new Map(),pendingFull=new Map();
 const report=error=>{try{onError(error);}catch{}return error;};
 const assertOpen=()=>{if(disposed)fail('SESSION_WORKSPACE_DISPOSED','消息工作区已关闭');};
 const serial=fn=>{const job=tail.then(fn);tail=job.catch(()=>{});return job;};
 const enqueuePersist=snap=>{const tracked=snap.full;if(tracked)pendingFull.set(snap.id,(pendingFull.get(snap.id)??0)+1);return serial(()=>persist(snap)).finally(()=>{if(tracked){const left=(pendingFull.get(snap.id)??1)-1;if(left)pendingFull.set(snap.id,left);else pendingFull.delete(snap.id);}});};
 const scopeNow=()=>normalizedOwner(getOwner());
 const options=(input={})=>{const floors=new Set(input.floors??[]);if(input.floor!==undefined){if(!Number.isInteger(input.floor)||input.floor<0)fail('SESSION_WORKSPACE_FLOOR','消息楼层无效');floors.add(input.floor);}return {full:input.full===true,floors};};
 const mergeOptions=(a,b)=>({full:!!a?.full||b.full,floors:new Set([...(a?.floors??[]),...b.floors])});
 function derived(source){
  if(typeof source!=='string'||typeof workspace.snapshot!=='function')return [];
  const slots=copy(workspace.snapshot(source)),result=[{source,slots}];
  const body=slots.find?.(row=>row?.[0]==='host:body-v1')?.[1];
  if(typeof body==='string'&&body!==source)result.push({source:body,slots:copy(workspace.snapshot(body))});
  return result;
 }
 function snapshot(input={}){
  assertOpen();if(isBusy())fail('SESSION_WORKSPACE_BUSY','当前消息仍在结算，请完成后保存工作区');
  const owner=scopeNow(),ctx=getContext(),chosen=options(input),chat=Array.isArray(ctx?.chat)?ctx.chat:[],order=[],messages=new Map(),seen=new Set();
  for(let floor=0;floor<chat.length;floor++){
   const key=sessionWorkspaceKey(owner,'message',markerId(chat[floor],floor));
   if(seen.has(key))fail('SESSION_WORKSPACE_MESSAGE_ID','消息身份重复，未覆盖工作区记录');seen.add(key);order.push(key);
  }
  const covered=pendingFull.has(identity(owner))?undefined:coveredKeys.get(identity(owner));
  chosen.full=chosen.full||!covered||[...covered].some(key=>!seen.has(key));
  const targets=chosen.floors.size?[...chosen.floors]:chat.length?[chat.length-1]:[];
  const floors=chosen.full?chat.map((_,i)=>i):[...new Set([...targets,...order.flatMap((key,floor)=>covered.has(key)?[]:[floor])])];
  for(const floor of floors){
   if(!chat[floor])fail('SESSION_WORKSPACE_FLOOR','待保存的消息已不存在，请按完整存档重新同步');
   const message=copy(chat[floor]);messages.set(order[floor],payload({floor,message,derived:derived(message.mes),label:'第 '+(floor+1)+' 条消息'}));
  }
  const character=ctx?.characters?.[ctx.characterId]??ctx?.groups?.find?.(group=>String(group.id)===String(ctx.groupId));
  const configuration=getConfiguration(),ready=configuration?.ready===true&&!configuration.draft;
  const result={owner,id:identity(owner),generation,sequence:++sequence,chat:ctx?.chat,metadata:copy(ctx?.chatMetadata??{}),order,messages,full:chosen.full,card:character===undefined?null:payload({card:copy(character)}),configuration:ready?payload({configuration:copy(configuration)}):null};
  if(identity(scopeNow())!==result.id||getContext()?.chat!==ctx?.chat)fail('SESSION_WORKSPACE_CHANGED','读取工作区时当前存档已变化');
  coverageVersions.set(result.id,result.sequence);
  if(result.full)coveredKeys.delete(result.id);
  return result;
 }
 async function putChanged(key,value,expectedGeneration,cardSequence){
  if(expectedGeneration!==generation)return;
  if(cardSequence!==undefined){if((cardVersions.get(key)??0)>cardSequence)return;cardVersions.set(key,cardSequence);}
  const old=await cache.get(key);
  if(expectedGeneration!==generation)return;
  if(old?.state==='saved'&&!old.deletePending&&old.kind===value.kind&&same(old.owner,value.owner)&&same(old.data,value.data)&&same(old.sourceRevision,value.sourceRevision))return old;
  return cache.put(key,value);
 }
 async function persist(snap){
  if(snap.generation!==generation)return {cancelled:true};
  const previous=failed.get(snap.id),item=mergeSnapshots(previous,snap),owner=item.owner,card=cardOwner(owner),sourceRevision=SESSION_WORKSPACE_CODE;
  if(item.full)coveredKeys.delete(item.id);
  try{
   const old=owner.chatId?await cache.get(sessionWorkspaceKey(owner,'chat')):null;
   if(item.generation!==generation)return {cancelled:true};
   if(item.card)await putChanged(sessionWorkspaceKey(owner,'card'),{kind:'card',owner:card,data:item.card,sourceRevision},item.generation,item.sequence);
   if(item.configuration)await putChanged(sessionWorkspaceKey(owner,'configuration'),{kind:'configuration',owner:card,data:item.configuration,sourceRevision},item.generation,item.sequence);
   let capturedMessages=0,removedMessages=0;
   if(owner.chatId){
    for(const [key,data]of item.messages){if(item.generation!==generation)return {cancelled:true};await putChanged(key,{kind:'message',owner,data,sourceRevision},item.generation);capturedMessages++;}
    if(item.full&&valid(old,'chat',owner)){
     const current=new Set(item.order);
     for(const key of manifestOrder(old))if(!current.has(key)){
      const record=await cache.get(key);
      if(item.generation!==generation)return {cancelled:true};
      if(record?.kind==='message'&&identity(record.owner)===item.id){await cache.remove(key);removedMessages++;}
     }
    }
    if(item.generation!==generation)return {cancelled:true};
    await putChanged(sessionWorkspaceKey(owner,'chat'),{kind:'chat',owner,data:payload({metadata:item.metadata,order:item.order,messageCount:item.order.length}),sourceRevision},item.generation);
   }
   if(item.generation!==generation)return {cancelled:true};
   if(owner.chatId&&coverageVersions.get(item.id)===item.sequence)coveredKeys.set(item.id,new Set(item.order));
   failed.delete(item.id);return {owner:copy(owner),capturedMessages,removedMessages,sourceStatus:SOURCE_STATUS};
  }catch(error){if(item.generation===generation)failed.set(item.id,item);throw error;}
 }
 function capture(input={}){
  try{const id=identity(scopeNow()),requested=mergeOptions(deferred.get(id),options(input)),snap=snapshot(requested),merged=mergeSnapshots(scheduled.get(id),snap);scheduled.delete(id);deferred.delete(id);return enqueuePersist(merged).catch(error=>{throw report(error);});}
  catch(error){report(error);return Promise.reject(error);}
 }
 async function hydrate(){
  assertOpen();const owner=scopeNow(),id=identity(owner),epoch=generation,ctx=getContext(),chat=copy(ctx?.chat??[]),card=cardOwner(owner);
  const coverageSequence=++sequence;coverageVersions.set(id,coverageSequence);
  const live=()=>!disposed&&generation===epoch&&identity(scopeNow())===id&&getContext()?.chat===ctx?.chat;
  try{return await serial(async()=>{
   coveredKeys.delete(id);
   const [cardRecord,configRecord,manifest]=await Promise.all([cache.get(sessionWorkspaceKey(owner,'card')),cache.get(sessionWorkspaceKey(owner,'configuration')),owner.chatId?cache.get(sessionWorkspaceKey(owner,'chat')):null]);
   if(!live())return {stale:true,restoredMessages:0};
   const result={owner:copy(owner),card:valid(cardRecord,'card',card)?copy(cardRecord.data.card):null,configuration:valid(configRecord,'configuration',card)?copy(configRecord.data.configuration):null,restoredMessages:0};
   if(!owner.chatId||!valid(manifest,'chat',owner))return result;
   const order=new Set(manifestOrder(manifest)),restores=[];
   for(let floor=0;floor<chat.length;floor++){
    const key=sessionWorkspaceKey(owner,'message',markerId(chat[floor],floor));if(!order.has(key))continue;
    const record=await cache.get(key);if(!live())return {...result,stale:true,restoredMessages:0};
    if(!valid(record,'message',owner)||!same(record.data.message,chat[floor])||!same(getContext()?.chat?.[floor],chat[floor]))continue;
    const values=record.data.derived??[];
    if(!Array.isArray(values)||values.some(row=>typeof row?.source!=='string'||!Array.isArray(row.slots)))fail('SESSION_WORKSPACE_DERIVED','消息工作区的派生快照格式无效，未自动重置');
    restores.push({floor,message:chat[floor],values});
   }
   if(!live())return {...result,stale:true,restoredMessages:0};
   for(const row of restores)if(same(getContext()?.chat?.[row.floor],row.message)){
    for(const value of row.values)workspace.restore?.(value.source,copy(value.slots));
    result.restoredMessages++;
   }
   if(!scheduled.has(id)&&!failed.has(id)&&!pendingFull.has(id)&&coverageVersions.get(id)===coverageSequence&&result.restoredMessages===chat.length&&same(manifestOrder(manifest),chat.map((message,floor)=>sessionWorkspaceKey(owner,'message',markerId(message,floor))))&&same(getContext()?.chat,chat))coveredKeys.set(id,new Set(manifestOrder(manifest)));
   return result;
  });}catch(error){throw report(error);}
 }
 const arm=()=>{clearTimeout(timer);if(!disposed)timer=setTimeout(()=>{timer=null;drain().catch(report);},120);};
 async function drain(){
  if(isBusy()){if(scheduled.size||deferred.size)arm();return {deferred:true};}
  let current;try{current=identity(scopeNow());}catch(error){if(deferred.size)throw error;}
  for(const [id,input]of deferred){deferred.delete(id);if(id===current){const snap=snapshot(input);scheduled.set(id,mergeSnapshots(scheduled.get(id),snap));}}
  const pending=[...scheduled.values()];scheduled.clear();
  await Promise.all(pending.map(snap=>enqueuePersist(snap)));
  return {captured:pending.length};
 }
 function schedule(input={}){
  assertOpen();try{
   const requested=options(input),id=identity(scopeNow());
   if(isBusy())deferred.set(id,mergeOptions(deferred.get(id),requested));
   else {const snap=snapshot(requested);scheduled.set(id,mergeSnapshots(scheduled.get(id),snap));}
   arm();
  }catch(error){report(error);}
 }
 async function flush(){
  assertOpen();clearTimeout(timer);timer=null;
  try{
   if(isBusy()&&(scheduled.size||deferred.size||failed.size))fail('SESSION_WORKSPACE_BUSY','当前消息仍在结算，请完成后同步工作区');
   await drain();await tail;
   for(const snap of [...failed.values()])await enqueuePersist(snap);
   await cache.flush?.();return {pending:scheduled.size+deferred.size+failed.size};
  }catch(error){throw report(error);}
 }
 return Object.freeze({capture,hydrate,schedule,flush,
  clearMemory(){generation++;clearTimeout(timer);timer=null;scheduled.clear();deferred.clear();failed.clear();coveredKeys.clear();coverageVersions.clear();workspace.clear?.();},
  async dispose(){if(disposed)return;clearTimeout(timer);timer=null;deferred.clear();const pending=[...scheduled.values()];scheduled.clear();disposed=true;await Promise.allSettled(pending.map(snap=>enqueuePersist(snap)));await tail;if(failed.size){disposed=false;fail('SESSION_WORKSPACE_UNSAVED','消息工作区仍有未保存快照，请显式重试同步；原消息未修改');}},
 });
}
