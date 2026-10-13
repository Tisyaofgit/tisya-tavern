import {safeDiagnostic} from '../config/stream-response.js';
import {personaSnapshot,personaStamp,personaDefinition,personaObjectChange,personaProjection,personaDraft} from './persona.js';
import {preferenceMatches} from './preferences.js';
import {prepareArchiveInput,validateArchiveNeedsRows,archiveProposalNeedsRows} from './archive-input.js';
import {assembleTableRows} from './assembly.js';
import {cardDefinitionSource,cardMechanisms,cardAIMaterials,bookAIMaterials} from './card-source.js';
import {nativeBranches,bridgeInput,bridgePatch,carryNativeForward,valueAt,parseNativeTransaction,auditNativeOutcome} from './native-bridge.js';
import {nativeSnapshot} from './native-state.js';
import {progressionWindow,validateWorldProposal,progressionKey,planContext} from './progression.js';
import {snapshotAnchor,branchSeed} from './branches.js';
import {reconcileProposal,mergeRegistries} from './reconcile.js';
import {createTableAssistant} from './assistant.js';
import {validateNativeConfig} from './native-config.js';
import {materialSlots} from './slots.js';
import {styleRules,stylePrompt,scanStyle} from './style-rules.js';
import {validateGeneratedTask} from '../config/contracts.js';
import {tableSettings,copy,check,derive,normalized,registryIndex,validateRow,defaultRegistry,mapRowReferences,references} from './schema.js';
import {createBookGateway,digest} from './books.js';
import {sources,selectedMessages,precedingUserSource,memoryBlock,taskTags,project,parseJSONResponse,prepareCommit,prepareRecoverable,archivalText,historyEvidence,retrieval,sourceTime,dueChecks} from './ledger.js';
import {worldbookEntries,createWorldbookProjection} from './worldbook-context.js';
import {NARRATIVE_TAGS} from './prompts.js';
const fields=['objects','facts','scene','state','relations','cognition','holdings','tasks','timers','clues','events'];
const cardBasis=c=>cardDefinitionSource(c.characters?.[c.characterId]);
const stampChat=c=>JSON.stringify(selectedMessages(c.chat).map(m=>[!!m.is_user,m.name??'',m.mes??'',m.swipe_id??0]));
export function createTableService({store,getContext,request,books=createBookGateway(undefined,getContext),vector=null,nativeConfig=null,persona=null,getConfigurationChoices=()=>({}),interfaceConfig=null,onNotice=()=>{},setPrompt=()=>{}}){
 let busy=false,controller=null,jobScope=null,latest=null,lastStyleAudit=null,progress=null,pendingFork=null,boundWorld=getContext().chatId?store.read().key:null;const jobs=[],parsedNative=new Map(),worldbook=createWorldbookProjection({getContext});
 const readPersona=()=>persona?.read()??personaSnapshot(getContext());
 const state=()=>({busy,jobScope,jobs:copy(jobs),latest:copy(latest),styleAudit:copy(lastStyleAudit),progress:copy(progress),available:books.available(),worldbook:worldbook.preview()});
 const status=(task,status,detail='',error=null)=>{jobs.push({task,status,detail:safeDiagnostic(detail),...(error?{code:error.code??error.name,cause:error.cause?safeDiagnostic(error.cause.message??String(error.cause)):undefined,stack:error.stack?safeDiagnostic(error.stack):undefined}:{}),at:new Date().toISOString()});if(jobs.length>50)jobs.shift();onNotice({task,status,detail:safeDiagnostic(detail)});};
 async function exclusive(fn,{scope='manual'}={}){check(!busy,'表单任务正在处理，请等待完成或停止');busy=true;jobScope=scope;progress={task:scope==='generation'?'表单推进':'表单操作',stage:'preparing',characters:0,text:'',startedAt:Date.now(),updatedAt:Date.now()};controller=new AbortController();const signal=controller.signal;try{const result=await fn(signal);signal.throwIfAborted();if(progress&&!['error','stopped'].includes(progress.stage))progress={...progress,stage:'complete',updatedAt:Date.now(),finishedAt:Date.now()};return result;}catch(e){const error=requestError(e,signal);worldbook.clear();setPrompt('');latest=null;const last=jobs.at(-1),label=signal.aborted?'已停止':'失败';if(last?.status!==label||last.detail!==safeDiagnostic(error.message))status(progress?.task??'表单操作',label,error.message,error);if(progress)progress={...progress,stage:signal.aborted?'stopped':'error',updatedAt:Date.now(),finishedAt:Date.now()};throw error;}finally{busy=false;controller=null;jobScope=null;}}
 function requestError(error,signal){if(signal?.aborted)return signal.reason instanceof Error?signal.reason:Error('当前表单任务已停止');if(error?.name==='AbortError')return Error('辅助请求被宿主或 API 中止，请检查连接后重试；已保存的记录仍保留。',{cause:error});return error;}
 function clear({scope=null,reason='已停止当前表单任务；已保存的记录仍保留'}={}){if(controller&&(!scope||jobScope===scope)){controller.abort(Error(reason));if(progress)progress={...progress,stage:'stopped',updatedAt:Date.now(),finishedAt:Date.now()};}worldbook.clear();setPrompt('');latest=null;}
 function contextChanged(){const next=getContext().chatId?store.read().key:null;if(next===boundWorld)return false;boundWorld=next;clear({reason:'会话已切换，旧表单任务已停止'});return true;}
 function capture(){const snapshot=store.read(),chat=stampChat(getContext()),signal=controller?.signal;return {...snapshot,settings:tableSettings(snapshot.world),chat,guard(){signal?.throwIfAborted();const now=store.read();check(now.key===snapshot.key&&now.revision===snapshot.revision&&stampChat(getContext())===chat,'聊天、候选或配置已改变，旧辅助结果未提交到当前进度');}};}
 async function load(c,type='normal'){if(!c.settings.originBook||!c.settings.sessionBook){await initializeCaptured(c);Object.assign(c,capture());}const origin=await books.read(c.settings.originBook),session=await books.read(c.settings.sessionBook);c.guard();check(origin.data.kind==='origin'&&session.data.kind==='session','原点书／会话存档类型不匹配');check(session.data.owner===c.key,'此存档属于另一会话；请为当前会话创建独立存档');const chain=await sources(getContext().chat,type);c.guard();const view=project(origin.data,session.data,chain.map(s=>s.key));return {origin,session,chain,view};}
 async function invoke(task,input,c,signal){
  status(task,'运行中');progress={task,stage:'waiting',characters:0,text:'',startedAt:Date.now(),updatedAt:Date.now()};
  try{
   signal?.throwIfAborted();const response=await request(task,JSON.stringify({...input,explicitRules:c.settings.hardRules,styleRules:c.settings.styleEnabled?styleRules(c.settings):[]}),{signal,onProgress:update=>{
    if(signal?.aborted||!update||!['connected','thinking','receiving','buffered','received'].includes(update.stage))return;
    // Reader delivers cumulative visible content; reasoning fields are never
    // accepted as a progress payload or appended to task data.
    const text=typeof update.text==='string'?update.text:progress.text;progress={...progress,stage:update.stage,text,characters:text.length,updatedAt:Date.now()};
   }});
   if(typeof response==='string')progress={...progress,text:response,characters:response.length};progress={...progress,stage:'validating',updatedAt:Date.now()};
   const result=copy(parseJSONResponse(response));c.guard();status(task,'返回待校验');return result;
  }catch(e){const failure=requestError(e,signal);progress={...progress,stage:signal?.aborted?'stopped':'error',updatedAt:Date.now(),finishedAt:Date.now()};status(task,signal?.aborted?'已停止':'失败',failure.message,failure);throw failure;}
 }
 async function commit(c,loaded,proposal,options){
  const prepared=(options.recover?prepareRecoverable:prepareCommit)(loaded.view,proposal,{...options,sourceOrder:Object.fromEntries(loaded.chain.map(s=>[s.key,s.index]))});c.guard();let origin=loaded.origin;
  for(const change of prepared.commit.changes)if(change.after.table==='preferences')change.after.preferenceConfirmed=true;
  const bases=prepared.commit.changes.filter(ch=>ch.after.table==='objects');
  if(bases.length||JSON.stringify(prepared.registry)!==JSON.stringify(origin.data.registry)){
   const next=copy(origin.data);next.revision++;next.registry=mergeRegistries(loaded.origin.data.registry,prepared.registry);
   for(const change of bases){change.after.rev=Math.max(change.after.rev,...next.bases.filter(b=>b.id===change.id).map(b=>b.rev+1));next.bases.push(copy(change.after));change.origin=change.id+'@'+change.after.rev;delete change.after;}
   next.schemaHistory??=[];next.schemaHistory.push({at:new Date().toISOString(),source:'归档模板扩展',fields:prepared.extensions??[]});
   origin=await books.write(origin,next,c.guard);
  }
  const next=copy(loaded.session.data);next.revision++;if(options.importSource)prepared.commit.importSource=copy(options.importSource);if(options.nativeReceipt)prepared.commit.nativeReceipt=copy(options.nativeReceipt);if(options.progression)prepared.commit.progression=copy(options.progression);next.commits.push(prepared.commit);if(options.reviewId){const draft=next.preferenceDrafts?.find(x=>x.id===options.reviewId);check(draft&&draft.status==='pending','偏好候选已处理');draft.status='accepted';draft.reviewedAt=new Date().toISOString();}
  try{const session=await books.write(loaded.session,next,c.guard);status(options.kind,prepared.commit.complete===false?'部分待处理':'已保存',prepared.commit.changes.length+' 项修改'+(prepared.commit.pending?.length?'，'+prepared.commit.pending.length+' 项待修正':''));return {...loaded,origin,session,view:project(origin.data,session.data,loaded.chain.map(s=>s.key))};}
  catch(e){if(origin.stamp!==loaded.origin.stamp)throw Error('原点候选版本已保存，但会话提交未确认；未绑定版本不会注入。'+e.message);throw e;}
 }
 async function archiveProposal(task,input,view,c,signal,reading){
  let previous=null;
  while(true){
   const projected=prepareArchiveInput(view,{sourceText:input.archiveSource?.text??input.historyText??'',userText:input.userSource?.text??'',actorIds:playerSettings(c,{session:{data:{}},view}).playerObjects,expandedIds:reading.ids});
   const preparedInput={...input,...projected,...(previous?{readMore:{previous,expandedIds:reading.ids,note:'补读后的全文覆盖旧薄引用；重新提出完整本次提案，不沿用未见全文时的修改。'}}:{})};
   const proposal=await invoke(task,preparedInput,c,signal),needs=[...(proposal.needsRows??[]),...(Array.isArray(proposal.changes)?archiveProposalNeedsRows(projected,proposal):[])];
   if(!needs.length){check(Array.isArray(proposal.changes),'归档产物缺少 changes 或 needsRows');return proposal;}
   const expanded=validateArchiveNeedsRows(view,needs,{expandedIds:reading.ids});check(expanded.length>reading.ids.length,'归档重复要求已完整提供的记录，未继续猜测');check(reading.rounds<8,'归档补读超过 8 回合；本楼层保留待处理');reading.ids=expanded;reading.rounds++;previous=proposal;
  }
 }
 function onlyArchiveObjects(proposal,view,objectsOnly){const index=registryIndex(view.registry);check(Array.isArray(proposal.changes),'归档提案缺少 changes');for(const op of proposal.changes){const table=index.tables.get(normalized(op.table))?.id,owned=['objects','facts'].includes(table);check(objectsOnly?owned:!owned,objectsOnly?'对象建档只能填写 objects/facts':'独立建档时历史归档不能重复填写对象或事实');}}
 function proposalView(view,proposal,options){
  onlyArchiveObjects(proposal,view,true);
  const prepared=prepareCommit(view,proposal,options),aliases=new Map(proposal.changes.map((op,index)=>[prepared.commit.changes[index].id,op.id]));
  const rows=prepared.rows.map(row=>{const next=copy(row);next.id=aliases.get(next.id)??next.id;mapRowReferences(next,prepared.registry,id=>aliases.get(id)??id);for(const key of ['readers','knowers'])next.access[key]=next.access[key].map(id=>aliases.get(id)??id);return next;});
  return {...view,registry:prepared.registry,rows};
 }
 function mergeArchiveProposals(discovery,history){
  const distinct=(a,b)=>[...a,...b.filter(item=>!a.some(prior=>JSON.stringify(prior)===JSON.stringify(item)))];
  return {...history,templates:distinct(discovery.templates??[],history.templates??[]),schemaChanges:distinct(discovery.schemaChanges??[],history.schemaChanges??[]),changes:[...discovery.changes,...history.changes],pending:[...(discovery.pending??[]),...(history.pending??[])]};
 }
 async function archiveLoaded(c,loaded,signal,includeLatest=false,range=null){
  if(!c.settings.archive&&!range)return loaded;
  const ai=loaded.chain.filter(s=>s.role==='assistant'),eligible=(includeLatest?ai:ai.filter(s=>loaded.chain.some(u=>u.role==='user'&&u.index>s.index))).filter(s=>!range||(s.floor>=range.from&&s.floor<=range.to)).filter(s=>!loaded.view.archived.has(s.key)).slice(0,range?.limit??Infinity);
  for(const source of eligible){
   if(loaded.view.archived.has(source.key))continue;
   c.guard();status('楼层归档','运行中','第 '+source.floor+' 层');
   const userSource=precedingUserSource(loaded.chain,source),text=archivalText(source.text),evidence=[text,userSource?.text??''].filter(Boolean).join('\n\n'),view={...loaded.view,rows:loaded.view.rows.map(r=>({...r,sourceFloor:loaded.chain.find(s=>s.key===r.source)?.floor??null}))};
   const input={sourceHistory:[{key:source.key,parent:source.parent,index:source.index,floor:source.floor,role:source.role,name:source.name,text:source.text,candidate:source.candidate}],archiveSource:{key:source.key,parent:source.parent,index:source.index,floor:source.floor,role:source.role,name:source.name,text,time:sourceTime(source.text)},userSource,pending:loaded.view.commits.filter(x=>x.source===source.key).flatMap(x=>x.pending??[]),instruction:'仅处理当前正文及本 AI 回复前连续用户输入。按来源顺序补录；计划、审核总结、任务标签及旧记忆块不是事实依据。已有事实更新原记录，不重复建行。',objectsSeparate:c.settings.objectsSeparate};
   const isHistory=!!range,task=isHistory?'historyImport':'tableArchive',options={source:source.key,kind:isHistory?'history':'archive',worldTime:sourceTime(source.text),evidence,allowedTables:loaded.view.registry.tables.filter(t=>t.owner==='archive'&&t.id!=='native_cells').map(t=>t.id),sourceOrder:Object.fromEntries(loaded.chain.map(s=>[s.key,s.index]))},reading={ids:[],rounds:0};
   try{
    let discovery=null,working=view;
    if(c.settings.objectsSeparate){
     const discoveryOptions={...options,allowedTables:['objects','facts']};
     discovery=await archiveProposal('objectArchive',input,view,c,signal,reading);
     try{working=proposalView(view,discovery,discoveryOptions);}catch(e){status('对象建档','修正格式',e.message);discovery=await archiveProposal('objectArchive',{...input,repair:{error:e.message,previous:discovery,instruction:'只修正对象与事实提案，保留正确项；不可确认的冲突保留 pending。'}},view,c,signal,reading);working=proposalView(view,discovery,discoveryOptions);}
    }
    let history=await archiveProposal(task,input,working,c,signal,reading);
    if(discovery)onlyArchiveObjects(history,working,false);
    let proposal=discovery?mergeArchiveProposals(discovery,history):history;
    try{prepareCommit(loaded.view,proposal,options);}catch(e){
     status('楼层归档','修正格式',e.message);
     history=await archiveProposal(task,{...input,repair:{error:e.message,previous:history,instruction:'修正本次会话提案；保留正确项和所有 discovery ID。不能修改独立对象提案或编造证据，不能解决的项放入 pending。'}},working,c,signal,reading);
     if(discovery)onlyArchiveObjects(history,working,false);proposal=discovery?mergeArchiveProposals(discovery,history):history;
    }
    // Discovery and historical state share one commit. No discovery is visible
    // while the second request is in flight or if either request is cancelled.
    loaded=await commit(c,loaded,proposal,{...options,recover:!discovery});
    if(!loaded.view.archived.has(source.key)){status('楼层归档','待处理','第 '+source.floor+' 层仍有未解决项目，后续楼层暂停');break;}
   }catch(e){c.guard();if(signal.aborted)throw e;status('楼层归档','待重试','第 '+source.floor+' 层：'+e.message);loaded=await commit(c,loaded,{changes:[],pending:[{reason:e.message,source:source.key,floor:source.floor}]},{...options});break;}
  }
  return loaded;
 }
 async function nativeMapLoaded(c,loaded,data,source,index){
  const prior=loaded.view.rows.filter(r=>r.table==='native_cells'),byPath=new Map(prior.map(r=>[r.values.路径,r])),leaves=nativeBranches(data.stat_data),changes=[];
  for(const [i,leaf] of leaves.entries()){const before=byPath.get(leaf.path);if(before&&before.values.启用!==false&&JSON.stringify(before.values.值)===JSON.stringify(leaf.value))continue;changes.push({id:before?.id??'new:native-'+i,table:'native_cells',expected:before?.rev??0,values:{名称:leaf.path,路径:leaf.path,值:leaf.value,启用:true},access:{readers:[],knowers:[]},evidence:'原生变量快照'});}
  const paths=new Set(leaves.map(l=>l.path));for(const old of prior)if(old.values.启用!==false&&!paths.has(old.values.路径))changes.push({id:old.id,table:'native_cells',expected:old.rev,values:{启用:false},access:{readers:[],knowers:[]},evidence:'原生变量快照'});
  for(let offset=0;offset<changes.length;offset+=100)loaded=await commit(c,loaded,{changes:changes.slice(offset,offset+100)},{source,kind:'native-snapshot',evidence:'原生变量快照',allowedTables:['native_cells'],nativeReceipt:{phase:'snapshot',index}});
  return loaded;
 }
 async function enableNativeBridge(enabled=true){return exclusive(async()=>{const c=capture();if(enabled){const settings=getContext().extensionSettings?.mvu_settings;check(!(settings?.更新方式==='额外模型解析'&&settings?.额外模型解析配置?.启用自动请求!==false),'原 MVU 额外模型自动更新正在启用，请先关闭该重复计算来源，脚本保持开启');let loaded=await load(c);const native=bridgeInput(getContext());loaded=await nativeMapLoaded(c,loaded,native.data,loaded.chain.at(-1)?.key??null,native.index);}
  const fresh=capture(),data=copy(fresh.data);data.worlds[fresh.key].tables={...fresh.settings,nativeBridge:enabled,enabled:enabled||fresh.settings.enabled};await store.save(data,fresh.revision,fresh.key);status('原生变量桥',enabled?'已启用':'已关闭','原 MVU 脚本保持开启；更新块由插件生成');return enabled;});}
 async function syncNative({scope='manual'}={}){return exclusive(async signal=>{
  const c=capture();if(!c.settings.nativeBridge)return null;let loaded=await load(c);const source=loaded.chain.findLast(x=>x.role==='assistant');if(!source||!loaded.chain.some(x=>x.role==='user'&&x.index>source.index))return {deferred:true,reason:'最新回复暂不结算；等用户继续后生成更新块'};const index=source.floor-1;
  if(loaded.view.commits.some(x=>x.nativeReceipt?.phase==='applied'&&x.source===source.key))return {already:true};
  if(/<JSONPatch>\s*\[(?!\s*\])/i.test(source.text)){const existing=globalThis.Mvu?.getMvuData?.({type:'message',message_id:index});check(existing?.stat_data,'旧回复含原生更新但尚无变量快照，请先由原脚本完成处理');loaded=await nativeMapLoaded(c,loaded,existing,source.key,index);await commit(c,loaded,{changes:[]},{source:source.key,kind:'native-fill',evidence:'沿用原回复已保存的原生变量',allowedTables:['native_cells'],nativeReceipt:{phase:'applied',index,legacyNative:true}});return {updated:0,already:true,nativeOwned:true};}
  const native=bridgeInput(getContext(),undefined,index);const evidence=[archivalText(source.text),precedingUserSource(loaded.chain,source)?.text??''].join('\n\n');
  let waiting=loaded.session.data.nativeIntents?.findLast(x=>x.source===source.key);
  if(waiting){
   if(waiting.phase==='parsing'){const cached=parsedNative.get(c.key+':'+source.key);check(cached,'上次原生回调中断，结果未能保存；为避免重抽随机结果，未再次执行。请回溯到已确认时间锚后继续');waiting={...waiting,...cached};loaded=await saveNativeIntent(c,loaded,waiting);}
   return finishNative(c,loaded,source,waiting);
  }
  loaded=await nativeMapLoaded(c,loaded,native.data,source.key,index);
  const rows=loaded.view.rows.filter(r=>r.table==='native_cells'&&r.values.启用!==false),entries=bookAIMaterials(await books.materials(getContext().characters[getContext().characterId].avatar));c.guard();
  const proposal=await invoke('nativeFill',{archiveSource:{text:evidence},registry:loaded.view.registry,currentRows:rows,nativeRules:[cardBasis(getContext()),...entries.map(e=>e.content)].join('\n\n')},c,signal);check(!proposal.pending?.length,'变量填录仍有未定条件，未生成更新块');
  const wire=bridgePatch(rows,proposal,native.data,evidence);if(!wire.operations.length){await commit(c,loaded,{changes:[]},{source:source.key,kind:'native-fill',evidence,allowedTables:['native_cells'],nativeReceipt:{phase:'applied',index,block:''}});return {updated:0};}
  const intent={source:source.key,index,phase:'parsing',before:JSON.stringify(native.data.stat_data),originalMissing:!globalThis.Mvu.getMvuData({type:'message',message_id:index})?.stat_data,proposal,evidence,operations:copy(wire.operations),block:wire.block};
  // Journal before invoking callbacks, including random adjudication. An interrupted parse is not replayed.
  loaded=await saveNativeIntent(c,loaded,intent);
  const {after,stagedWrites}=await parseNativeTransaction({runtime:globalThis.Mvu,eventSource:getContext().eventSource,index,before:native.data,block:wire.block,guard:c.guard});
  const outcome=auditNativeOutcome(wire.operations,native.data.stat_data,after.stat_data);
  const ready={phase:'parsed',after:JSON.stringify(after.stat_data),afterData:copy(after),proposal:copy(proposal),stagedWrites,outcome};
  // Persist the actual parse result before evaluating acceptance or attempting
  // writes. Recreated services resume this journal instead of rerunning random
  // callbacks, including a rejected or adjusted result.
  parsedNative.set(c.key+':'+source.key,ready);
  Object.assign(intent,ready);loaded=await saveNativeIntent(c,loaded,intent);
  return finishNative(c,loaded,source,intent);
 },{scope});}
 async function saveNativeIntent(c,loaded,intent){const next=copy(loaded.session.data);next.revision++;next.nativeIntents=(next.nativeIntents??[]).filter(x=>x.source!==intent.source);next.nativeIntents.push(copy(intent));return {...loaded,session:await books.write(loaded.session,next,c.guard)};}
 async function finishNative(c,loaded,source,intent){
  const outcome=intent.outcome??(intent.operations?auditNativeOutcome(intent.operations,JSON.parse(intent.before),intent.afterData.stat_data):null);
  if(outcome?.rejected.length){status('原生变量桥','原生规则拒绝',outcome.rejected.length+' 项未生效；解析结果已保存，不重复回调');throw Error('原生规则拒绝了 '+outcome.rejected.length+' 项更新；未写入原生变量。请核对原脚本、字段与来源后处理已保存的解析结果');}
  const runtime=globalThis.Mvu,index=intent.index,current=runtime.getMvuData({type:'message',message_id:index}),currentText=JSON.stringify(current?.stat_data);
  check(currentText===intent.after||currentText===intent.before||intent.originalMissing&&!current?.stat_data,'变量已被其他来源修改，未覆盖');
  if(currentText!==intent.after){c.guard();await runtime.replaceMvuData(intent.afterData,{type:'message',message_id:index});c.guard();check(JSON.stringify(runtime.getMvuData({type:'message',message_id:index})?.stat_data)===intent.after,'原生写回未确认；已保存结果可重试，随机判定不会重跑');}
  await carryNativeForward({context:getContext(),runtime,index,before:{stat_data:JSON.parse(intent.before)},after:intent.afterData,guard:c.guard});
  // Callbacks may update other branches; map the complete native result, not the model's requested values.
  loaded=await nativeMapLoaded(c,loaded,intent.afterData,source.key,index);
  await commit(c,loaded,{changes:[]},{source:source.key,kind:'native-fill',evidence:intent.evidence,allowedTables:['native_cells'],nativeReceipt:{phase:'applied',index,block:intent.block,stagedWrites:intent.stagedWrites??0,outcome:copy(outcome)}});
  parsedNative.delete(c.key+':'+source.key);
  // Refresh display after the confirmed write. Do not re-emit MVU adjudication events.
  if(typeof globalThis.TavernHelper?.refreshOneMessage==='function')try{await globalThis.TavernHelper.refreshOneMessage(index);}catch(e){status('原卡显示','待刷新','变量已保存；'+e.message);}
  status('原生变量桥','已更新',intent.proposal.changes.length+' 项；原卡回调已结算');
  return {updated:intent.proposal.changes.length,block:intent.block,outcome:copy(outcome)};
 }
 function playerSettings(c,loaded){const binding=loaded.session.data.personaBinding;return {...c.settings,playerObjects:[...new Set([...c.settings.playerObjects,...(binding?.state==='bound'&&binding.personaId===readPersona()?.id?[binding.objectId]:[])])]};}
 async function progressLoaded(c,loaded,signal){
  if(!c.settings.offstage)return loaded;
  const window=progressionWindow(loaded.view,playerSettings(c,loaded));if(!window.ready){status('场外推进','等待',window.reason);return loaded;}
  const key=await progressionKey(window);if(loaded.view.commits.some(x=>x.progression?.key===key))return loaded;
  try{const result=await invoke('plotAdvance',{phase:'world',window,registry:loaded.view.registry,currentRows:loaded.view.rows,nativeState:nativeSnapshot(loaded.view.rows,{context:getContext(),messageIndex:(loaded.chain.find(x=>x.key===window.source)?.floor??0)-1}),...planContext(loaded,playerSettings(c,loaded))},c,signal);const settled=validateWorldProposal(loaded.view,result,window);return await commit(c,loaded,settled.proposal,{source:window.source??null,kind:'simulation',evidence:settled.evidence,worldTime:window.to,allowedTables:['events','activities','state','relations','growth','tasks','timers','clues'],progression:{...settled.receipt,key}});}catch(e){c.guard();if(signal.aborted)throw e;status('场外推进','待重试',e.message);worldbook.clear();setPrompt('');latest=null;throw e;}
 }
 async function advance(){return exclusive(async signal=>{const c=capture();let loaded=await load(c);loaded=await progressLoaded(c,loaded,signal);return {rows:loaded.view.rows,receipt:loaded.view.commits.findLast(x=>x.progression)?.progression??null};});}
 async function saveAnchor(options){return exclusive(async()=>{const c=capture(),loaded=await load(c),anchor=snapshotAnchor(loaded,options),next=copy(loaded.origin.data);next.revision++;next.timelineAnchors??=[];next.timelineAnchors.push(anchor);await books.write(loaded.origin,next,c.guard);return anchor;});}
 async function useAnchor(id,{keepFuture=true}={}){return exclusive(async()=>{const c=capture(),loaded=await load(c);check(!loaded.view.commits.length&&!loaded.session.data.branchSeed,'请在新建且尚未填录进度的会话应用时间锚，避免覆盖当前存档');const anchor=loaded.origin.data.timelineAnchors?.find(a=>a.id===id);check(anchor,'时间锚不存在');const next=copy(loaded.session.data);next.revision++;next.pins=[];next.branchSeed=branchSeed(anchor);if(!keepFuture)next.branchSeed.nodes=[];next.registry=copy(anchor.registry);next.schemaPinned=true;project(loaded.origin.data,next,loaded.chain.map(s=>s.key));await books.write(loaded.session,next,c.guard);return next.branchSeed.anchor;});}
 async function stageFork(floor,keepFuture){return exclusive(async()=>{const c=capture();if(!c.settings.enabled)return null;const loaded=await load(c);check(Number.isInteger(floor)&&floor>=0&&floor<=getContext().chat.length,'分支楼层无效');const eligible=new Set(loaded.chain.filter(s=>s.floor<=floor).map(s=>s.key)),cut=loaded.view.commits.findLast(x=>x.source===null||eligible.has(x.source))?.id??null;
 const anchor=snapshotAnchor(loaded,{name:'分支起点 · 第 '+floor+' 层',cut:cut??'start'});if(!keepFuture)anchor.nodes=[];const next=copy(loaded.origin.data);next.revision++;next.timelineAnchors??=[];next.timelineAnchors.push(anchor);await books.write(loaded.origin,next,c.guard);
 pendingFork={sourceKey:c.key,avatar:getContext().characters[getContext().characterId].avatar,signature:JSON.stringify(selectedMessages(getContext().chat.slice(0,floor)).map(m=>[!!m.is_user,m.mes??'',m.swipe_id??0])),anchor,settings:copy(c.settings)};return {id:anchor.id,nodes:anchor.nodes.length};});}
 async function activateFork({rollback=false}={}){if(!pendingFork)return null;return exclusive(async()=>{const pending=pendingFork,ctx=getContext();if(ctx.characters?.[ctx.characterId]?.avatar!==pending.avatar)return null;const signature=JSON.stringify(selectedMessages(ctx.chat).map(m=>[!!m.is_user,m.mes??'',m.swipe_id??0]));if(signature!==pending.signature)return null;let c=capture();if(!rollback&&c.key===pending.sourceKey)return null;
 if(!rollback){check(!c.settings.sessionBook,'目标会话已有表单存档，未覆盖');const data=copy(c.data);data.worlds[c.key].tables={...pending.settings,sessionBook:'',originPins:[]};await store.save(data,c.revision,c.key);c=capture();}
 let loaded=await load(c);const next=copy(loaded.session.data);next.revision++;next.retiredBranches??=[];if(rollback&&next.commits.length)next.retiredBranches.push({at:new Date().toISOString(),commits:copy(next.commits),branchSeed:copy(next.branchSeed??null)});else check(!next.commits.length,'新分支已有进度，未覆盖');next.commits=[];next.pins=[];next.nativeIntents=[];next.branchSeed=branchSeed(pending.anchor);next.registry=copy(pending.anchor.registry);next.schemaPinned=true;project(loaded.origin.data,next,loaded.chain.map(s=>s.key));await books.write(loaded.session,next,c.guard);pendingFork=null;status('平行存档','已建立',next.branchSeed.nodes.length+' 个未来可能节点');return next.branchSeed.anchor;});}
 async function coreDraft(objectId,{growth=false}={}){return exclusive(async signal=>{const c=capture(),loaded=await load(c),row=loaded.view.rows.find(r=>r.id===objectId&&r.table==='objects');check(row,'请先选择已建档对象');const selected=[row,...(growth?loaded.view.rows.filter(r=>['growth','experiences'].includes(r.table)&&r.values.主体===objectId):[])],basis=JSON.stringify(selected);const result=await invoke('assetAdapt',{sourceCard:basis,goal:growth?'提取角色核心并携带已选择的成长':'只提取基础核心，不携带成长',registry:loaded.view.registry},c,signal);check(result.core&&typeof result.core.name==='string'&&Array.isArray(result.core.traits)&&Array.isArray(result.core.growth),'核心草稿格式无效');for(const item of [...result.core.traits,...result.core.growth])check(typeof item.name==='string'&&typeof item.value==='string'&&typeof item.evidence==='string'&&item.evidence.trim()&&basis.includes(item.evidence),'核心项缺少真实来源');check(growth||!result.core.growth.length,'未选择携带成长');return {format:'tisya.core-draft/1',world:c.key,chat:c.chat,revision:loaded.origin.data.revision,sessionRevision:loaded.session.data.revision,objectId,basis,core:result.core};});}
 async function saveCore(draft){return exclusive(async()=>{const c=capture(),loaded=await load(c);check(draft.format==='tisya.core-draft/1'&&draft.world===c.key&&draft.chat===c.chat&&draft.revision===loaded.origin.data.revision&&draft.sessionRevision===loaded.session.data.revision,'核心草稿依据已改变');check(draft.core&&typeof draft.core.name==='string'&&Array.isArray(draft.core.traits)&&Array.isArray(draft.core.growth),'核心草稿格式无效');for(const item of [...draft.core.traits,...draft.core.growth])check(typeof item.value==='string'&&typeof item.evidence==='string'&&item.evidence.trim()&&draft.basis.includes(item.evidence),'核心项缺少原文依据');const next=copy(loaded.origin.data);next.revision++;next.coreAssets??=[];const core={name:draft.core.name,traits:copy(draft.core.traits),growth:copy(draft.core.growth),id:crypto.randomUUID(),version:1,sourceObject:draft.objectId,sourceSession:loaded.session.data.id,createdAt:new Date().toISOString()};next.coreAssets.push(core);await books.write(loaded.origin,next,c.guard);return core;});}
 async function listCores(book){const c=capture(),source=await books.read(book||c.settings.originBook);c.guard();check(source.data.kind==='origin','请选择原点书');return copy(source.data.coreAssets??[]);}
 async function adaptCore(book,id,goal=''){const c=capture(),source=await books.read(book);c.guard();const core=source.data.coreAssets?.find(x=>x.id===id);check(core,'通用核心不存在');const reference=book+' / '+id+'@'+core.version;const draft=await genesis('将以下可迁移核心整合成当前世界画风的新版本。保留核心价值与特征，用当前世界身份与机制重构，不继承原世界已完成任务或人际关系。可携带成长作为对应经历重新设计，不能把旧世界事件当作本世界已发生事实。核心引用：'+reference+'\n核心：'+JSON.stringify(core)+'\n用户补充：'+goal);for(const op of draft.proposal.artifacts.base.changes)if(op.table==='objects'&&['character','人物','角色'].includes(op.values.类型))op.values.核心引用=reference;return draft;}
 async function autoInitialize(mode='card'){const draft=await cardTemplate(mode);const count=await saveCardTemplate(draft);return {count,notes:draft.proposal.notes};}
 async function analysePreferenceSource(c,loaded,source,signal,extra={}){
  if((loaded.session.data.preferenceDrafts??[]).some(x=>x.source===source.key))return loaded;
  const proposal=await invoke('preferenceAnalysis',{registry:loaded.view.registry,currentRows:loaded.view.rows.filter(r=>r.table==='preferences'),userInput:source.text,...extra,preferenceContext:{world:c.key,worldName:c.label,chatId:getContext().chatId,card:getContext().characters?.[getContext().characterId]?.avatar,user:readPersona()?.id},antiCliche:true},c,signal);
  prepareCommit(loaded.view,proposal,{source:source.key,kind:'preferences',evidence:source.text,allowedTables:['preferences']});
  const next=copy(loaded.session.data);next.revision++;next.preferenceDrafts??=[];next.preferenceDrafts.push({id:crypto.randomUUID(),source:source.key,text:source.text,proposal,status:proposal.changes.length?'pending':'empty',createdAt:new Date().toISOString()});
  status('偏好确认',proposal.changes.length?'待确认':'无新候选','第 '+source.floor+' 层 · '+proposal.changes.length+' 项；尚未影响正文');return {...loaded,session:await books.write(loaded.session,next,c.guard)};
 }
 async function analysePreferences({from=1,to=Number.MAX_SAFE_INTEGER,limit=10}={}){return exclusive(async signal=>{
  check(Number.isSafeInteger(from)&&from>=1&&Number.isSafeInteger(to)&&to>=from&&Number.isSafeInteger(limit)&&limit>=1&&limit<=100,'偏好分析楼层或批量无效');const c=capture();let loaded=await load(c),processed=0;
  const queue=loaded.chain.filter(s=>s.role==='user'&&s.floor>=from&&s.floor<=to&&!(loaded.session.data.preferenceDrafts??[]).some(d=>d.source===s.key)).slice(0,limit);
  for(const source of queue){loaded=await analysePreferenceSource(c,loaded,source,signal,{generationType:'history-analysis'});processed++;}
  return {processed,pending:(loaded.session.data.preferenceDrafts??[]).filter(x=>x.status==='pending').length};
 });}
 async function assemble(c,loaded,type,signal,{runPlan=true}={}){
  const chain=loaded.chain,lastAI=chain.findLast(s=>s.role==='assistant'),user=chain.findLast(s=>s.role==='user'),tags=[];
  if(c.settings.preferences&&user)loaded=await analysePreferenceSource(c,loaded,user,signal,{generationType:type});
  const currentPersona=readPersona(),binding=loaded.session.data.personaBinding;if(c.settings.continuity==='tables'&&currentPersona){check(binding?.state==='bound'&&binding.personaId===currentPersona.id&&loaded.view.rows.some(row=>row.id===binding.objectId&&row.table==='objects'),'当前原生用户身份尚未初始化或绑定，请在用户身份中核对后继续表单接续');}const allowedRows=personaProjection(loaded.view.rows,binding,currentPersona,{nativeInjected:c.settings.continuity!=='tables'&&!!c.world.context.persona&&!c.world.controller}).filter(r=>r.table!=='native_cells').filter(r=>r.table!=='preferences'||c.settings.preferences&&r.preferenceConfirmed===true&&r.values.启用!==false&&preferenceMatches(r,{context:getContext(),world:c,persona:currentPersona,binding})),readView={...loaded.view,rows:allowedRows};
  let found=retrieval(readView,{tags,query:user?.text??'',topK:c.settings.topK});
  if(c.settings.retrieval==='vector'&&c.settings.topK){check(vector,'尚未接入向量驱动；请配置原生向量 API 或选关键词');found.optional=await vector.search({scope:loaded.session.data.id,rows:allowedRows.filter(r=>['objects','facts','events'].includes(r.table)),query:user?.text??'',topK:c.settings.topK,signal,guard:c.guard});c.guard();}
  const selected=[...new Map([...found.mandatory,...found.optional].map(r=>[r.id,r])).values()],strict=c.settings.continuity==='tables',assembled=assembleTableRows(readView,{previousText:archivalText(lastAI?.text??''),userText:user?.text??'',tags,strict,retrieved:selected.map(row=>row.id),actorIds:playerSettings(c,loaded).playerObjects});
  const data={format:'tisya.context/1',source:'本轮表单资料。人物知识与读者可见范围仍以每行 access 为准；读者展示开关不授予人物知识。state.有效性为失效或待确认时，所存值只是最后已知，不是当前确证。',originBook:loaded.origin.name,sessionBook:loaded.session.name,revision:loaded.session.data.revision,rows:assembled.rows,latestTemporary:!strict&&lastAI?{source:lastAI.key,text:archivalText(lastAI.text),tags}:null,unresolvedTags:found.unresolved,explicitRules:c.settings.hardRules,styleRules:c.settings.styleEnabled?styleRules(c.settings):[],preferences:allowedRows.filter(r=>r.table==='preferences'),antiCliche:true,dueChecks:dueChecks(loaded.view,chain),plot:null};
  if(runPlan&&c.settings.plot)data.plot=await invoke('plotAdvance',{...data,phase:'plan',nativeState:nativeSnapshot(loaded.view.rows,{context:getContext()}),registry:loaded.view.registry,...planContext(loaded,playerSettings(c,loaded)),userInput:user?.text??'',generationType:type},c,signal);
  if(data.plot){check(typeof data.plot.goal==='string'&&Array.isArray(data.plot.beats)&&Array.isArray(data.plot.pendingChoices)&&Array.isArray(data.plot.constraints),'剧情推进产物字段不完整');check(!Object.hasOwn(data.plot,'changes'),'剧情推进不得产生事实写入');for(const beat of data.plot.beats)check(beat&&typeof beat.proposal==='string'&&Array.isArray(beat.basis)&&beat.basis.every(x=>typeof x==='string')&&typeof beat.condition==='string','剧情节拍须有提案、依据和触发条件');for(const name of ['pendingChoices','constraints'])check(data.plot[name].every(x=>typeof x==='string'),'剧情设计列表内容无效');}
  let entries=[],text;
  if(c.settings.injection==='worldbook'){
   check(worldbook.available(),'当前宿主缺少原生世界书扫描事件，请更新宿主或选择“直接组装”');
   const rows=assembled.candidates.filter(r=>r.table!=='preferences');
   const temporary=!strict&&lastAI?{text:archivalText(lastAI.text)}:null;
   entries=worldbookEntries({rows,registry:loaded.view.registry,scope:loaded.session.data.id,tags,forcedIds:found.optional.map(r=>r.id),temporary,due:data.dueChecks});
  }
  const slots={state:{source:data.source,revision:data.revision,rows:c.settings.injection==='direct'?data.rows.filter(r=>r.table!=='events'&&r.table!=='preferences'):[],nativeState:nativeSnapshot(loaded.view.rows,{context:getContext(),messageIndex:lastAI?lastAI.floor-1:getContext().chat.length-1}),dueChecks:data.dueChecks,unresolvedTags:data.unresolvedTags},preferences:{explicit:data.explicitRules,style:stylePrompt(data.styleRules),rows:data.preferences},plan:data.plot,genesis:loaded.session.data.blueprint??null};
  if(c.settings.injection==='direct')slots.archive={rows:data.rows.filter(r=>r.table==='events'),latestTemporary:data.latestTemporary};
  const instructions=(c.settings.nativeBridge?'原生变量由表单辅助填录，插件自动生成 UpdateVariable 并交给原 MVU；本轮正文禁止再次输出变量命令，vars 留空。\n':'')+(c.settings.nativeBridge?NARRATIVE_TAGS.replace('正文变量块继续沿用原卡与当前预设约定。',''):NARRATIVE_TAGS)+'\n资料槽按预处理路由使用；剧情方案不是事实，表单数据保留来源权限与版本。原生 user 的身份说明属于定义，不应覆盖后来有来源的会话状态；原生引用只能取已给定的实际快照，缺失字段保持未知。历史锚点只在具备相应经历和知识权限时成为默契，不把读者知道的内心解释强加给人物。';text=instructions+'\n\n'+materialSlots(slots);
  // Required archives, current facts and explicit rules are never silently cut.
  check(text.length<=c.settings.contextChars,'表单注入超过 '+c.settings.contextChars+' 字符预算；请提高预算、减少检索数量或整理冗余表行');
  c.guard();latest={world:c.key,revision:loaded.session.data.revision,source:lastAI?.key??null,rows:assembled.rows.length,tags,unresolved:found.unresolved,assembly:{trace:assembled.trace,omitted:assembled.omitted,recall:assembled.recall},slots,instructions,text,injection:c.settings.injection};if(entries.length)worldbook.install(entries,c.guard);return latest;
 }
 function rulesContext(){const c=capture(),rules=c.settings.styleEnabled?styleRules(c.settings):[],slots={preferences:{explicit:c.settings.hardRules,style:stylePrompt(rules)}};return {world:c.key,slots,text:materialSlots(slots),instructions:'已启用禁词、写作要求及用户明确限制按硬约束执行。'};}
 function requireNativeBridge(c){
  if(c.settings.continuity!=='tables'||c.world.modes?.[c.world.mode]?.nativeMvu==='off')return;
  const mechanisms=cardMechanisms(getContext().characters?.[getContext().characterId]),required=mechanisms.scripts.some(script=>script.enabled&&script.apis.some(api=>['getMvuData','replaceMvuData','parseMessage','registerMvuSchema','registerVariableSchema'].includes(api)));
  if(!required)return;check(c.settings.nativeBridge,'原卡包含 MVU 机制；表单接续须启用原生变量桥，或由用户明确关闭本模式原卡 MVU');
  check(typeof globalThis.Mvu?.getMvuData==='function'&&typeof globalThis.Mvu?.parseMessage==='function'&&typeof globalThis.Mvu?.replaceMvuData==='function','原卡 MVU 接口未就绪，未继续使用缺失变量生成正文');
 }
 async function prepare(type='normal'){
  worldbook.clear();setPrompt('');const current=store.read();if(!tableSettings(current.world).enabled||['quiet','impersonate'].includes(type))return null;
  return exclusive(async signal=>{const c=capture();try{requireNativeBridge(c);if(c.settings.injection==='worldbook')check(worldbook.available(),'当前宿主缺少原生世界书扫描事件，请更新宿主或选择“直接组装”');let loaded=await load(c,type);loaded=await archiveLoaded(c,loaded,signal);loaded=await progressLoaded(c,loaded,signal);const result=await assemble(c,loaded,type,signal);c.guard();setPrompt(result.text,()=>{try{c.guard();return true;}catch{return false;}});return result;}catch(e){status('表单推进','失败',e.message);worldbook.clear();setPrompt('');latest=null;throw e;}},{scope:'generation'});
 }
 async function initializeCaptured(c,{originBook=c.settings.originBook,sessionBook=c.settings.sessionBook}={}){
  const context=getContext(),card=context.characters?.[context.characterId]?.avatar;check(card&&!context.groupId,'请先在单角色卡会话中建立原点档案；群组复用需明确选择角色来源');
  const suffix=(await digest(c.key)).slice(0,12),originSuffix=(await digest(card)).slice(0,12);let origin,session;c.guard();
  if(originBook)origin=await books.read(originBook);else{
   const candidates=[];for(const name of await books.cardBooks(card))if(name.startsWith('缇斯亚原点 · ')){const candidate=await books.read(name);if(candidate.data.kind==='origin')candidates.push(candidate);}
   check(candidates.length<=1,'此角色卡绑定了多本原点书，请填写要复用的书名');
   const name='缇斯亚原点 · '+context.characters[context.characterId].name+' · '+originSuffix;
   origin=candidates[0]??((await books.names()).includes(name)?await books.read(name):await books.create('origin',card,name));
  }
  c.guard();check(origin.data.kind==='origin','所选书不是原点书');await books.bindOrigin(card,origin.name,c.guard);
  if(sessionBook)session=await books.read(sessionBook);else {const name='缇斯亚存档 · '+context.chatId+' · '+suffix;session=(await books.names()).includes(name)?await books.read(name):await books.create('session',c.key,name);}
  c.guard();check(session.data.kind==='session'&&session.data.owner===c.key,'会话存档不能绑定到另一个会话');
  if(!session.data.origin){const next=copy(session.data);next.revision++;next.origin=origin.name;next.pins=copy(c.settings.originPins);next.registry=copy(origin.data.registry);next.schemaPinned=true;session=await books.write(session,next,c.guard);}else check(session.data.origin===origin.name,'此存档已关联另一原点书，请选择原来的原点书');
  if(c.settings.originBook!==origin.name||c.settings.sessionBook!==session.name){const data=copy(c.data);data.worlds[c.key].tables={...c.settings,originBook:origin.name,sessionBook:session.name};await store.save(data,c.revision,c.key);}
  status('初始化','已保存','原点书绑定角色卡；独立存档未替换数据库绑定');return {originBook:origin.name,sessionBook:session.name};
 }
 async function initialize(options={}){return exclusive(()=>initializeCaptured(capture(),options));}
 async function ensureInitialized({scope='manual'}={}){const c=capture();if(!c.settings.enabled||c.settings.originBook&&c.settings.sessionBook)return;return exclusive(()=>initializeCaptured(c),{scope});}
 async function inspect(){const c=capture(),loaded=await load(c);return {settings:c.settings,registry:loaded.view.registry,rows:loaded.view.rows,anchors:loaded.view.anchors,archived:loaded.view.archived.size,sourceCount:loaded.chain.filter(s=>s.role==='assistant').length,origin:loaded.origin.data,session:loaded.session.data,preferenceDrafts:(loaded.session.data.preferenceDrafts??[]).filter(d=>loaded.chain.some(s=>s.key===d.source)),jobs:copy(jobs)};}
 async function review(){
  const c=capture(),chain=await sources(getContext().chat);c.guard();let view=null,origin=null,session=null,error='';
  if(c.settings.originBook&&c.settings.sessionBook){try{origin=await books.read(c.settings.originBook);session=await books.read(c.settings.sessionBook);check(origin.data.kind==='origin'&&session.data.kind==='session'&&session.data.owner===c.key,'当前会话存档绑定不匹配');view=project(origin.data,session.data,chain.map(s=>s.key));}catch(e){error=e.message;}}
  else error='尚未建立完整存档；开始补录时会自动创建／复用。';
  c.guard();const last=chain.findLast(s=>s.role==='assistant');return {world:c.key,chatStamp:c.chat,settings:c.settings,registry:view?.registry??defaultRegistry(),rows:view?.rows??[],blueprint:session?.data.blueprint??null,storageReady:!!view,storageError:error,jobs:copy(jobs),persona:readPersona(),personaBinding:copy(session?.data.personaBinding??null),history:chain.map(s=>({floor:s.floor,role:s.role,preview:s.text.slice(0,100),archived:view?view.archived.has(s.key):null,pending:view?.archived.has(s.key)?[]:view?.commits.filter(c=>c.source===s.key).flatMap(c=>c.pending??[])??[],latest:s.key===last?.key,hasMemory:!!memoryBlock(s.text)}))};
 }
 async function archive({includeLatest=false,range=null,scope='manual'}={}){return exclusive(async signal=>{const c=capture();if(range)check(Number.isSafeInteger(range.from)&&Number.isSafeInteger(range.to)&&range.from>=1&&range.to>=range.from&&Number.isSafeInteger(range.limit)&&range.limit>=1&&range.limit<=100,'楼层范围或批量数无效');let loaded=await load(c);loaded=await archiveLoaded(c,loaded,signal,includeLatest,range);return {archived:loaded.view.archived.size,pending:loaded.view.commits.filter(x=>x.complete===false&&!loaded.view.archived.has(x.source)).flatMap(x=>x.pending??[]),revision:loaded.session.data.revision};},{scope});}
 async function scan(){const c=capture(),loaded=await load(c),last=loaded.chain.findLast(s=>s.role==='assistant');return loaded.chain.map(s=>({floor:s.floor,role:s.role,preview:s.text.slice(0,100),archived:loaded.view.archived.has(s.key),pending:loaded.view.archived.has(s.key)?[]:loaded.view.commits.filter(c=>c.source===s.key).flatMap(c=>c.pending??[]),latest:s.key===last?.key,hasMemory:!!memoryBlock(s.text)}));}
 async function importHistory(text,{label='手写历史',worldTime=null}={}){return exclusive(async signal=>{const c=capture(),loaded=await load(c);check(typeof text==='string'&&text.trim(),'请填写历史原文');const hash=await digest(text);check(!loaded.session.data.commits.some(x=>x.importSource?.hash===hash),'这份历史已导入，不能重复入账');const proposal=await invoke('historyImport',{registry:loaded.view.registry,currentRows:loaded.view.rows,historyText:historyEvidence(text),sourceHistory:{text,label,worldTime},label,worldTime},c,signal);return {format:'tisya.history-draft/1',text,label,worldTime,hash,proposal,world:c.key,originRevision:loaded.origin.data.revision,sessionRevision:loaded.session.data.revision};});}
 async function saveHistory(draft){return exclusive(async()=>{const c=capture(),loaded=await load(c);check(draft.format==='tisya.history-draft/1'&&draft.world===c.key&&draft.originRevision===loaded.origin.data.revision&&draft.sessionRevision===loaded.session.data.revision,'历史草稿依据已变化，请重新核对');check(await digest(draft.text)===draft.hash,'历史原文已改变，请重新生成草稿');check(!loaded.session.data.commits.some(x=>x.importSource?.hash===draft.hash),'这份历史已经导入');const result=await commit(c,loaded,draft.proposal,{source:null,kind:'import',evidence:historyEvidence(draft.text),worldTime:draft.worldTime,allowedTables:loaded.view.registry.tables.filter(t=>t.owner==='archive'&&t.id!=='native_cells').map(t=>t.id),importSource:{label:draft.label,text:draft.text,hash:draft.hash,worldTime:draft.worldTime}});return result.session.data.revision;});}
 async function cardTemplate(mode='card'){return exclusive(async signal=>{
  check(['card','generic','reuse'].includes(mode),'初始化方式无效');const c=capture(),loaded=await load(c);let material='',userSource=null,userChange=null,sourceMaterials=null;
  if(mode==='card'){const context=getContext(),card=context.characters?.[context.characterId];material=cardBasis(context);const entries=bookAIMaterials(await books.materials(card.avatar));c.guard();sourceMaterials={card:cardAIMaterials(card),books:copy(entries),history:copy(loaded.chain)};material+='\n\n'+entries.map(x=>'来源：'+x.book+' / '+x.entry+'\n'+x.content).join('\n\n');userSource=readPersona();if(userSource){check(userSource.id,'当前用户人设缺少稳定标识，请先选择原生用户人设');userChange={...personaObjectChange(userSource,loaded.view.rows,loaded.session.data.personaBinding),evidence:personaDefinition(userSource)};material+='\n\n'+personaDefinition(userSource);}}
  const result=mode==='card'?await invoke('templateInit',{sourceCard:material,sourceCardRaw:sourceMaterials.card,sourceBooks:sourceMaterials.books,sourceHistory:sourceMaterials.history,sourceUser:userSource?{id:userSource.id,name:userSource.name,description:userSource.description,objectId:userChange.id}:null,registry:loaded.view.registry,currentRows:loaded.view.rows,goal:'按当前角色卡和原生用户定义补齐模板与底档。已有 ID、名称及当前会话进度保持；已有字段只有原文支持的修正才提交，未变化项省略。定义、职责和硬性约束须完整且强度不变；原始冲突并存待确认。逐项读取完整原卡 AI 须知、绑定资料和历史原文，先路由再填表。原卡定义与原生用户定义填写底档；历史原文用于核对当前进度及所需模板，历史事实由 historyImport 按楼层补录，不写回卡底档。关闭资料与示例保持原文但不作为生效定义或已发生事件；不用定义初值重置当前状态。'},c,signal):{registry:mode==='reuse'?copy(loaded.origin.data.registry):copy(loaded.view.registry),base:{changes:[]},initial:{changes:[]},notes:[mode==='reuse'?'复用卡模板；原点对象版本在设置与绑定中选择':'使用通用模板；后续归档按来源扩展']};
  if(userChange){check(Array.isArray(result.base?.changes),'初始化草稿缺少原点档案');check(!result.base.changes.some(x=>x.id===userChange.id||x.table==='objects'&&x.values?.名称===userSource.name),'模型重复生成了原生 user 档案，请修正草稿来源后重试');result.base.changes.unshift(userChange);}
  result.registry??=reconcileProposal(loaded.view.registry,{templates:result.templates??[],schemaChanges:result.schemaChanges??[],changes:result.base?.changes??[],currentRows:loaded.view.rows}).registry;compatibleRegistry(result.registry,loaded.view.registry);await repairInitializationNames(result,loaded.view.rows,userChange?.id,material,c,signal);check(result.base&&result.initial&&Array.isArray(result.notes),'初始化草稿不完整');return {format:'tisya.card-template/1',world:c.key,chat:c.chat,basis:material,sourceMaterials,mode,userSource,userObjectId:userChange?.id??null,originRevision:loaded.origin.data.revision,sessionRevision:loaded.session.data.revision,proposal:result};
 });}
 async function saveCardTemplate(draft){return exclusive(async()=>{
  const c=capture(),loaded=await load(c);check(draft.format==='tisya.card-template/1'&&draft.world===c.key&&draft.chat===c.chat&&draft.originRevision===loaded.origin.data.revision&&draft.sessionRevision===loaded.session.data.revision,'初始化依据已变化，请重新读取');
  if(draft.mode==='card'){const context=getContext(),card=context.characters?.[context.characterId],entries=bookAIMaterials(await books.materials(card.avatar));c.guard();const currentUser=readPersona();check(personaStamp(currentUser)===personaStamp(draft.userSource??null),'用户身份或设定已改变，请重新生成初始化草稿');const actual=cardBasis(context)+'\n\n'+entries.map(x=>'来源：'+x.book+' / '+x.entry+'\n'+x.content).join('\n\n')+(currentUser?'\n\n'+personaDefinition(currentUser):'');check(actual===draft.basis,'角色卡或绑定定义已改变，请重新生成初始化草稿');if(draft.sourceMaterials){check(JSON.stringify(cardAIMaterials(card))===JSON.stringify(draft.sourceMaterials.card)&&JSON.stringify(entries)===JSON.stringify(draft.sourceMaterials.books)&&JSON.stringify(loaded.chain)===JSON.stringify(draft.sourceMaterials.history),'原卡或历史资料已改变，请重新生成初始化草稿');}}
  if(draft.userSource){const user=draft.proposal.base.changes.find(x=>x.id===draft.userObjectId);check(user?.values.名称===draft.userSource.name&&user?.values.描述===draft.userSource.description,'原生用户档案须保持导入原文；修改请使用用户身份绑定预览');}
  const p=draft.proposal,reg=compatibleRegistry(copy(p.registry),loaded.view.registry);const options={source:null,kind:'init',evidence:draft.basis,allowedTables:['objects','facts']};
  const base=prepareCommit({...loaded.view,registry:reg,last:null},p.base,options),origin=copy(loaded.origin.data);origin.revision++;origin.registry=base.registry;
  for(const change of base.commit.changes){change.after.rev=Math.max(change.after.rev,...origin.bases.filter(b=>b.id===change.id).map(b=>b.rev+1));origin.bases.push(copy(change.after));}
  const session=copy(loaded.session.data);session.revision++;session.registry=copy(base.registry);session.schemaPinned=true;const pins=new Map((session.pins??[]).map(pin=>[pin.slice(0,pin.lastIndexOf('@')),pin]));for(const ch of base.commit.changes)pins.set(ch.id,ch.id+'@'+ch.after.rev);session.pins=[...pins.values()];
  const ids=new Map(p.base.changes.map((op,i)=>[op.id,base.commit.changes[i].id])),initial=copy(p.initial);for(const op of initial.changes){mapRowReferences({table:op.table,values:op.values},base.registry,id=>ids.get(id)??id);for(const field of ['readers','knowers'])if(op.access?.[field])op.access[field]=op.access[field].map(id=>ids.get(id)??id);}
  if(draft.userSource){const objectId=ids.get(draft.userObjectId)??draft.userObjectId;check(origin.bases.some(x=>x.id===objectId),'用户档案在草稿中被删除，未保存');session.personaBinding={objectId,personaId:draft.userSource.id,state:'bound',at:new Date().toISOString()};}
  for(const op of initial.changes){const prior=loaded.view.rows.find(row=>row.id===op.id);check(!prior||prior.source===null||Object.entries(op.values).every(([key,value])=>JSON.stringify(prior.values[key])===JSON.stringify(value)),'初始化不能覆盖已有来源的会话进度；请按正文补录或人工修订');}
  const view=project(origin,session,loaded.chain.map(x=>x.key)),filled=prepareCommit(view,initial,{...options,allowedTables:base.registry.tables.filter(t=>t.owner==='archive'&&!['objects','facts','events','cognition'].includes(t.id)).map(t=>t.id)});
  filled.commit.changes.unshift(...base.commit.changes.map(ch=>({id:ch.id,before:ch.before,origin:ch.id+'@'+ch.after.rev})));filled.commit.anchors.unshift(...base.commit.anchors);for(const anchor of filled.commit.anchors)anchor.group=filled.commit.id;session.commits.push(filled.commit);session.templateInitialization={mode:draft.mode,at:new Date().toISOString(),notes:copy(p.notes),registryVersion:origin.revision};
  await books.write(loaded.origin,origin,c.guard);try{await books.write(loaded.session,session,c.guard);}catch(e){throw Error('卡模板与原点候选已保存，本会话初始化未确认：'+e.message);}
  status('角色卡初始化','已保存','模板绑定角色卡，初始进度仅写入当前存档');return base.commit.changes.length+filled.commit.changes.length;
 });}
 async function previewUserBinding(objectId){return exclusive(async()=>{const c=capture(),loaded=await load(c),current=readPersona();check(loaded.session.data.personaBinding?.state!=='writing','上次绑定尚未完成，请先继续核对');return {format:'tisya.persona-draft/1',...personaDraft(loaded.view.rows.find(r=>r.id===objectId),loaded.view.registry,current),world:c.key,chat:c.chat,sessionRevision:loaded.session.data.revision};});}
 async function finishUserBinding(c,loaded,intent){
  check(persona,'宿主用户人设写入接口未接入');let actual=readPersona();
  const desired=actual?.id===intent.personaId&&actual.name===intent.name&&actual.description===intent.description&&actual.storedName===intent.name&&actual.descriptor.description===intent.description;
  check(desired||personaStamp(actual)===personaStamp(intent.before),'原生人设已另行修改，不能继续旧绑定；请核对后重新操作');
  actual=await persona.write({before:actual,name:intent.name,description:intent.description},c.guard);
  const next=copy(loaded.session.data);next.revision++;next.personaBinding={objectId:intent.objectId,personaId:actual.id,state:'bound',at:new Date().toISOString()};
  try{await books.write(loaded.session,next,c.guard);}catch(e){throw Error('原生 user 已更新，但档案绑定未完成；请点击继续核对绑定：'+e.message);}
  status('用户身份','已绑定','原生名称与设定已保存；档案正文不再二次注入');return next.personaBinding;
 }
 async function saveUserBinding(draft){return exclusive(async()=>{const c=capture();let loaded=await load(c);check(draft.format==='tisya.persona-draft/1'&&draft.world===c.key&&draft.chat===c.chat&&draft.sessionRevision===loaded.session.data.revision,'绑定草稿依据已改变，请重新预览');check(loaded.view.rows.some(r=>r.id===draft.objectId&&r.rev===draft.rowRevision),'人物档案版本已改变');check(personaStamp(readPersona())===personaStamp(draft.before),'原生 user 已改变，请重新预览');check(typeof draft.name==='string'&&draft.name.trim()&&!/[\r\n]/.test(draft.name)&&typeof draft.description==='string','姓名或设定格式无效');const next=copy(loaded.session.data);next.revision++;next.personaBinding={state:'writing',objectId:draft.objectId,personaId:draft.personaId,name:draft.name,description:draft.description,before:copy(draft.before),at:new Date().toISOString()};loaded={...loaded,session:await books.write(loaded.session,next,c.guard)};return finishUserBinding(c,loaded,next.personaBinding);});}
 async function resumeUserBinding(){return exclusive(async()=>{const c=capture(),loaded=await load(c),intent=loaded.session.data.personaBinding;check(intent?.state==='writing','没有待核对的绑定');return finishUserBinding(c,loaded,intent);});}
 async function repairInitializationNames(result,currentRows,userId,sourceCard,c,signal){
  const changes=result.base?.changes;if(!Array.isArray(changes))return;
  const current=new Map(currentRows.filter(row=>row.table==='objects').map(row=>[row.id,row])),proposed=new Map(changes.filter(op=>op.table==='objects').map(op=>[op.id,op]));
  function collisions(){const names=new Map();for(const id of new Set([...current.keys(),...proposed.keys()])){const value={...current.get(id)?.values,...proposed.get(id)?.values},name=value.名称;check(typeof name==='string'&&name.trim(),'对象名称缺失：'+id);const key=name.trim().normalize('NFKC').toLocaleLowerCase();if(!names.has(key))names.set(key,[]);names.get(key).push({id,name,editable:proposed.has(id)&&id!==userId});}return [...names.values()].filter(rows=>rows.length>1);}
  const conflicts=collisions();if(!conflicts.length)return;
  const editable=new Set(conflicts.flat().filter(row=>row.editable).map(row=>row.id));check(editable.size,'现有对象名称冲突，初始化不能改写未提交档案或原生用户名称');
  const repair=await invoke('templateInit',{sourceCard,registry:result.registry,currentRows,repair:{instruction:'仅修复所列新提案对象的显示名称冲突。返回 {renames:[{id,name}]}，保持 ID、引用、事实、用户原生名称以及不可编辑档案不变。依据来源用身份限定名称；不可确定放 notes，不合并同名不同人。',nameConflicts:conflicts,editableIds:[...editable]}},c,signal);
  check(Array.isArray(repair.renames)&&repair.renames.length<=editable.size,'名称修复格式无效');const seen=new Set();for(const rename of repair.renames){check(editable.has(rename.id)&&!seen.has(rename.id)&&typeof rename.name==='string'&&rename.name.trim(),'名称修复越界或重复');seen.add(rename.id);proposed.get(rename.id).values.名称=rename.name;}
  check(!collisions().length,'对象显示名称仍冲突，请在草稿中区分身份');
 }
 async function genesis(goal){return exclusive(async signal=>{const c=capture(),loaded=await load(c);check(typeof goal==='string'&&goal.trim(),'请填写创世要求');const basisCard=cardBasis(getContext());const proposal=await invoke('tableGenesis',{goal,sourceCard:basisCard,registry:loaded.view.registry,currentRows:loaded.view.rows},c,signal);validateBlueprint(proposal,loaded.origin.data.registry);return {format:'tisya.genesis-draft/2',goal,basisCard,proposal,world:c.key,originRevision:loaded.origin.data.revision,sessionRevision:loaded.session.data.revision};});}
 async function saveGenesis(draft){return exclusive(async()=>{const c=capture(),loaded=await load(c);check(draft.format==='tisya.genesis-draft/2','请重新生成创世蓝图');check(draft.basisCard===cardBasis(getContext()),'角色卡资料已修改，请重新生成创世草稿');check(draft.world===c.key&&draft.originRevision===loaded.origin.data.revision&&draft.sessionRevision===loaded.session.data.revision,'创世草稿依据已变化，请重新生成或载入');
  const p=validateBlueprint(draft.proposal,loaded.origin.data.registry);if(p.artifacts.native&&Object.values(p.artifacts.native).some(x=>x.length)){check(nativeConfig,'原生配置接口尚未接入');p.artifacts.native=nativeConfig.resolveTargets(p.artifacts.native);}
  const evidence=[draft.goal,draft.basisCard,...p.blueprint.decisions].filter(Boolean).join('\n\n'),reg=p.artifacts.registry;
  const prepared=prepareCommit({...loaded.view,registry:reg,last:null},p.artifacts.base,{source:null,kind:'genesis',evidence,allowedTables:['objects','facts']});
  const next=copy(loaded.origin.data);next.revision++;next.registry=mergeRegistries(loaded.origin.data.registry,prepared.registry);for(const change of prepared.commit.changes){change.after.rev=Math.max(change.after.rev,...next.bases.filter(b=>b.id===change.id).map(b=>b.rev+1));next.bases.push(change.after);}
  const session=copy(loaded.session.data);session.revision++;session.registry=copy(next.registry);session.schemaPinned=true;session.pins=[...new Set([...(session.pins??[]),...prepared.commit.changes.map(x=>x.id+'@'+x.after.rev)])];
  const pinned=new Map();for(const pin of session.pins)pinned.set(pin.slice(0,pin.lastIndexOf('@')),pin);session.pins=[...pinned.values()];
  const ids=new Map(p.artifacts.base.changes.map((op,i)=>[op.id,prepared.commit.changes[i].id])),initial=copy(p.artifacts.initial);for(const op of initial.changes){mapRowReferences({table:op.table,values:op.values},reg,id=>ids.get(id)??id);for(const field of ['readers','knowers'])if(op.access?.[field])op.access[field]=op.access[field].map(id=>ids.get(id)??id);}
  const initialView=project(next,session,loaded.chain.map(s=>s.key)),init=prepareCommit(initialView,initial,{source:null,kind:'genesis',evidence,allowedTables:reg.tables.filter(t=>t.owner==='archive'&&!['objects','facts','events','cognition'].includes(t.id)).map(t=>t.id)});
  check(!(initial.templates??[]).length,'新模板应在蓝图注册表中统一登记');init.commit.changes.unshift(...prepared.commit.changes.map(ch=>({id:ch.id,before:ch.before,origin:ch.id+'@'+ch.after.rev})));init.commit.anchors.unshift(...prepared.commit.anchors);for(const anchor of init.commit.anchors)anchor.group=init.commit.id;init.commit.registry=copy(next.registry);session.commits.push(init.commit);session.blueprint={...copy(p.blueprint),checklist:copy(p.checklist),workflow:copy(p.workflow),native:copy(p.artifacts.native??{presets:[],worldbooks:[],regexes:[]}),appliedAt:new Date().toISOString()};
  next.schemaHistory??=[];next.schemaHistory.push({at:new Date().toISOString(),before:loaded.origin.data.registry,after:copy(next.registry),source:'创世蓝图确认'});
  const origin=await books.write(loaded.origin,next,c.guard);try{await books.write(loaded.session,session,c.guard);}catch(e){throw Error('创世原点候选版本已保存，本会话尚未应用：'+e.message);}
  status('创世','已保存',origin.name);return prepared.commit.changes.length+init.commit.changes.length;}).then(async count=>{try{await applyNative(draft.world);}catch(e){e.blueprintSaved=true;throw e;}return count;});}
 async function applyNative(expectedWorld){check(!busy,'请等待表单任务完成');const c=capture();check(!expectedWorld||c.key===expectedWorld,'蓝图已保存，但聊天已切换，原生配置尚未创建');const loaded=await load(c),spec=loaded.session.data.blueprint?.native;if(!spec||!Object.values(spec).some(x=>Array.isArray(x)&&x.length))return [];check(nativeConfig,'原生配置接口尚未接入；表单已保存');try{const receipts=await nativeConfig.apply(spec);status('原生配置','已核对',receipts.length+' 项');return receipts;}catch(e){status('原生配置','待补建',e.message);throw e;}}
 async function reviewPreference(id,proposal=null){return exclusive(async()=>{const c=capture(),loaded=await load(c),draft=loaded.session.data.preferenceDrafts?.find(x=>x.id===id);check(draft&&draft.status==='pending'&&loaded.chain.some(s=>s.key===draft.source),'偏好候选不存在、已处理或来源已变化');if(proposal){check(!(proposal.templates??[]).length,'偏好确认不能新增类型');await commit(c,loaded,proposal,{source:draft.source,kind:'preferences',evidence:draft.text,allowedTables:['preferences'],reviewId:id});}else{const next=copy(loaded.session.data);next.revision++;next.preferenceDrafts.find(x=>x.id===id).status='rejected';await books.write(loaded.session,next,c.guard);}return true;});}
 async function edit(proposal){return exclusive(async()=>{const c=capture(),loaded=await load(c),source=loaded.chain.at(-1)?.key??null;const evidence='用户手动修改表单';const result=await commit(c,loaded,proposal,{source,kind:'manual',evidence,allowedTables:loaded.view.registry.tables.map(t=>t.id)});return result.session.data.revision;});}
 async function pinOrigins(pins){return exclusive(async()=>{
  const c=capture(),loaded=await load(c),bases=loaded.origin.data.bases;check(Array.isArray(pins)&&pins.every(p=>bases.some(b=>b.id+'@'+b.rev===p)),'所选原点版本不存在');check(new Set(pins.map(p=>p.slice(0,p.lastIndexOf('@')))).size===pins.length,'同一档案只能选择一个版本');
  const selected=new Map(pins.map(pin=>{const row=bases.find(b=>b.id+'@'+b.rev===pin);return [row.id,row];})),queue=[...selected.values()];
  for(let i=0;i<queue.length;i++)for(const id of references(queue[i],loaded.view.registry))if(!selected.has(id)){const versions=bases.filter(b=>b.id===id),compatible=versions.filter(b=>!queue[i].updatedAt||!b.updatedAt||b.updatedAt<=queue[i].updatedAt);const row=(compatible.length?compatible:versions).sort((a,b)=>b.rev-a.rev)[0];check(row,'所选对象缺少可复用关联档案：'+id);selected.set(id,row);queue.push(row);}
  const next=copy(loaded.session.data);next.revision++;next.pins=[...selected.values()].map(b=>b.id+'@'+b.rev);project(loaded.origin.data,next,loaded.chain.map(s=>s.key));await books.write(loaded.session,next,c.guard);return next.pins;
 });}
 async function saveTemplates(nextRegistry,expectedRevision){return exclusive(async()=>{const c=capture(),loaded=await load(c);check(loaded.origin.data.revision===expectedRevision,'模板版本已变化，请重新载入');compatibleRegistry(nextRegistry,loaded.origin.data.registry);for(const row of loaded.view.rows)validateRow(nextRegistry,row);
  const next=copy(loaded.origin.data);next.revision++;next.registry=copy(nextRegistry);next.schemaHistory??=[];next.schemaHistory.push({at:new Date().toISOString(),before:loaded.origin.data.registry,after:copy(nextRegistry),source:'用户编辑模板'});await books.write(loaded.origin,next,c.guard);const session=copy(loaded.session.data);session.revision++;session.registry=copy(nextRegistry);session.schemaPinned=true;session.commits.push({id:crypto.randomUUID(),source:null,depends:loaded.view.last,kind:'schema',changes:[],anchors:[],registry:copy(nextRegistry)});await books.write(loaded.session,session,c.guard);status('模板','已保存','新字段和别名已登记');return next.revision;});}
 const api={previewUserBinding,saveUserBinding,resumeUserBinding,analysePreferences,stageFork,activateFork,cancelFork(){pendingFork=null;},enableNativeBridge,syncNative,coreDraft,saveCore,listCores,adaptCore,advance,saveAnchor,useAnchor,autoInitialize,cardTemplate,saveCardTemplate,review,state,worldbook,nativeConfiguration:nativeConfig,applyNative,prepare,rulesContext,initialize,ensureInitialized,inspect,scan,archive,importHistory,saveHistory,saveTemplates,genesis,saveGenesis,reviewPreference,checkStyle(text){const settings=tableSettings(store.read().world);return settings.styleEnabled?scanStyle(archivalText(text),styleRules(settings)):[];},auditStyle(text){const settings=tableSettings(store.read().world);lastStyleAudit={enabled:settings.styleEnabled,hits:settings.styleEnabled?scanStyle(archivalText(text),styleRules(settings)):[],at:new Date().toISOString()};return copy(lastStyleAudit);},reportError(task,error){if(error===undefined){error=task;task='表单操作';}status(task,'失败',error?.message??String(error),error);if(progress)progress={...progress,stage:'error',updatedAt:Date.now(),finishedAt:Date.now()};},edit,pinOrigins,books,clear,contextChanged,preview:()=>copy(latest)};
 api.assistant=createTableAssistant({store,getContext,review,run:exclusive,call:(input,signal)=>invoke('tableAssistant',input,capture(),signal),getChoices:getConfigurationChoices,interfaceConfig});return api;
}

function compatibleRegistry(nextRegistry,previous){registryIndex(nextRegistry);for(const kind of ['tables','types'])for(const old of previous[kind]){const next=nextRegistry[kind].find(x=>x.id===old.id);check(next&&next.name===old.name&&(old.aliases??[]).every(x=>next.aliases.includes(x)),'现有名称不可删除或改名；请添加别名');for(const [key,field]of Object.entries(old.fields))check(JSON.stringify(next.fields[key])===JSON.stringify(field),'已有字段不可改变类型／公式');check(next.parent===old.parent&&next.owner===old.owner,'不能改变模板继承或职责');for(const [key,field]of Object.entries(next.fields))if(!old.fields[key])check(!field.required,'已有模板只能增加可选字段');next.version=JSON.stringify({...next,version:old.version})===JSON.stringify(old)?old.version:old.version+1;}for(const t of nextRegistry.tables)check(t.owner==='archive'||t.id==='preferences'&&t.owner==='preferences','新增业务表由记忆归档填录，偏好使用共用确认表');return nextRegistry;}
function validateBlueprint(value,previous){const p=validateGeneratedTask('genesis',value);check(p.blueprint&&typeof p.blueprint.name==='string'&&typeof p.blueprint.goal==='string'&&Array.isArray(p.blueprint.decisions)&&p.blueprint.decisions.every(x=>typeof x==='string')&&Array.isArray(p.blueprint.unresolved)&&p.blueprint.unresolved.every(x=>typeof x==='string'),'蓝图字段不完整');check(Array.isArray(p.checklist)&&p.checklist.every(x=>typeof x==='string'),'蓝图核对清单无效');validateGeneratedTask('workflow',p.workflow);check(p.artifacts?.base&&p.artifacts?.initial,'蓝图缺少原点档案或会话初值');compatibleRegistry(p.artifacts.registry,previous);if(p.artifacts.native!==undefined)validateNativeConfig(p.artifacts.native);return p;}
