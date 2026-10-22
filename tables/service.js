import {parseRuleReviewSheet} from './rule-review-sheet.js';
import {registerOpening,matchingOpening,applyOpening,canRestoreInto} from './startup.js';
import {assembleArchiveBook} from './archive-book.js';
import {createArchiveSystem} from './archive-system.js';
import {createConditionService,conditionNarrative} from './condition-service.js';
import {createFoundationService} from './foundation-service.js';
import {parseStateEvents} from './state-event-rules.js';
import {stateEventInput,stateEventProposal,stateEventNarrative} from './state-events.js';
import {STATE_SYSTEM_CONTRACT,compileStateFormulas} from './state-formulas.js';
import {historyGroups} from '../config/tool-history.js';
import {historySignature} from '../config/history-context.js';
import {storySources,assertStoryLedger} from './story-sources.js';
import {coreSelection,validateBundle,validateCoreMapping,coreKind} from './core-assets.js';
import {validateStateCatalog,registerStateCatalog,readStateGrid,stateGridProposal,readStateValues,stateValuesProposal,stateFormulaProposal,stateGrowthProposal} from './state-form.js';
import {ruleSources,validateRuleReview,rulePolicy,chooseRule,policyEvidence} from './rule-review.js';
import {safeDiagnostic} from '../config/stream-response.js';
import {personaSnapshot,personaStamp,personaDefinition,personaObjectChange,personaProjection,personaDraft} from './persona.js';
import {preferenceMatches,withGlobalPreferences,confirmedPreferenceDraft,preferenceBatches,validateGlobalPreferences} from './preferences.js';
import {prepareArchiveInput,validateArchiveNeedsRows,archiveProposalNeedsRows} from './archive-input.js';
import {assembleTableRows} from './assembly.js';
import {cardDefinitionSource,cardMechanisms,cardAIMaterials,bookAIMaterials} from './card-source.js';
import {nativeBranches,bridgeInput,bridgePatch,hasNativeUpdate,carryNativeForward,valueAt,parseNativeTransaction,auditNativeOutcome} from './native-bridge.js';
import {nativeSnapshot} from './native-state.js';
import {progressionWindow,validateWorldProposal,progressionKey,planContext} from './progression.js';
import {snapshotAnchor,branchSeed,forkCommits} from './branches.js';
import {freezeCanonSnapshot,validateFrozenCanon} from './canon.js';
import {createArchiveQuerySession} from './archive-query.js';
import {archiveToolBudget} from './tool-budget.js';
import {createArchiveProposalSession,ARCHIVE_SCHEMA_OPTIONS} from './archive-proposal.js';
import {reconcileProposal,mergeRegistries} from './reconcile.js';
import {createTableAssistant} from './assistant.js';
import {validateNativeConfig} from './native-config.js';
import {materialSlots} from './slots.js';
import {styleRules,stylePrompt,scanStyle} from './style-rules.js';
import {validateGeneratedTask} from '../config/contracts.js';
import {tableSettings,copy,check,isObjectType,sameDefinition,derive,normalized,registryIndex,validateRow,defaultRegistry,upgradeRegistry,mapRowReferences,references} from './schema.js';
import {createBookGateway,digest} from './books.js';
import {precedingUserSource,memoryBlock,taskTags,project,originPinsAtStart,parseJSONResponse,prepareCommit,prepareRecoverable,archivalText,historyEvidence,retrieval,sourceTime,dueChecks} from './ledger.js';
import {worldbookEntries,createWorldbookProjection} from './worldbook-context.js';
import {NARRATIVE_TAGS} from './prompts.js';
const fields=['objects','facts','scene','state','relations','cognition','holdings','tasks','timers','clues','events'];
const cardBasis=c=>cardDefinitionSource(c.characters?.[c.characterId]);
const stampChat=historySignature;
export function createTableService({store,getContext,request,projectToolTurns,books=createBookGateway(undefined,getContext),vector=null,nativeConfig=null,persona=null,archiveQueryPolicy=null,getConfigurationChoices=()=>({}),interfaceConfig=null,onNotice=()=>{},setPrompt=()=>{}}){
 let busy=false,controller=null,jobScope=null,latest=null,lastStyleAudit=null,progress=null,pendingFork=null,boundWorld=getContext().chatId?store.read().key:null;const jobs=[],parsedNative=new Map(),worldbook=createWorldbookProjection({getContext});
 let archiveChanged=false;const archiveListeners=new Set();
 const rawBookWrite=books.write;
 // Every service writer (including conditions, imports and edits) publishes the
 // same disposable reading projection alongside the authoritative journal.
 books={...books,async write(snapshot,next,guard=()=>{}){
  if(next.kind!=='session'||!next.origin){const result=await rawBookWrite(snapshot,next,guard);archiveChanged=true;return result;}
  const origin=await books.read(next.origin),projection=await storySources(getContext().chat,'normal',projectToolTurns);guard();
  const decorated=copy(next);decorated.archiveView=assembleArchiveBook(origin,decorated,projection.chain);
  check((await books.read(next.origin)).stamp===origin.stamp,'原点在分层组装期间已变化');guard();
  const result=await rawBookWrite(snapshot,decorated,guard);archiveChanged=true;worldbook.clear();setPrompt('');latest=null;guard();check((await books.read(next.origin)).stamp===origin.stamp,'存档已写入，但原点同时发生变化，请重新载入核对');return result;
 }};
 const readPersona=()=>persona?.read()??personaSnapshot(getContext());
 const archiveDrafts=new Map(),archiveReviews=new Map(),stateFormDrafts=new Map();
 const state=()=>({busy,jobScope,jobs:copy(jobs),latest:copy(latest),styleAudit:copy(lastStyleAudit),progress:copy(progress),available:books.available(),worldbook:worldbook.preview()});
 const status=(task,status,detail='',error=null)=>{jobs.push({task,status,detail:safeDiagnostic(detail),...(error?{code:error.code??error.name,cause:error.cause?safeDiagnostic(error.cause.message??String(error.cause)):undefined,stack:error.stack?safeDiagnostic(error.stack):undefined}:{}),at:new Date().toISOString()});if(jobs.length>50)jobs.shift();onNotice({task,status,detail:safeDiagnostic(detail)});};
 async function exclusive(fn,{scope='manual'}={}){check(!busy,'表单任务正在处理，请等待完成或停止');busy=true;jobScope=scope;progress={task:scope==='generation'?'表单推进':'表单操作',stage:'preparing',characters:0,text:'',startedAt:Date.now(),updatedAt:Date.now()};controller=new AbortController();const signal=controller.signal;try{const result=await fn(signal);signal.throwIfAborted();if(progress&&!['error','stopped'].includes(progress.stage))progress={...progress,stage:'complete',updatedAt:Date.now(),finishedAt:Date.now()};return result;}catch(e){const error=requestError(e,signal);worldbook.clear();setPrompt('');latest=null;const last=jobs.at(-1),label=signal.aborted?'已停止':'失败';if(last?.status!==label||last.detail!==safeDiagnostic(error.message))status(progress?.task??'表单操作',label,error.message,error);if(progress)progress={...progress,stage:signal.aborted?'stopped':'error',updatedAt:Date.now(),finishedAt:Date.now()};throw error;}finally{busy=false;controller=null;jobScope=null;if(archiveChanged){archiveChanged=false;for(const notify of archiveListeners)try{notify();}catch(e){status('图鉴刷新','失败',e.message);}}}}
 // Registered in-process executors may return validated-domain candidates as
 // objects. Network/model text uses the sheet parser only, with no JSON fallback.
 function parseRuleReviewResponse(response){
  if(response&&typeof response==='object'&&!Array.isArray(response)&&Array.isArray(response.issues))return response;
  const text=typeof response==='string'?response:response?.choices?.[0]?.message?.content??response?.content?.filter?.(x=>x.type==='text').map(x=>x.text).join('')??response?.candidates?.[0]?.content?.parts?.filter(x=>x.thought!==true).map(x=>x.text??'').join('');
  check(typeof text==='string'&&text.trim(),'规则校对 API 没有返回简表文本');return parseRuleReviewSheet(text);
 }
 function requestError(error,signal){if(signal?.aborted)return signal.reason instanceof Error?signal.reason:Error('当前表单任务已停止');if(error?.name==='AbortError')return Error('辅助请求被宿主或 API 中止，请检查连接后重试；已保存的记录仍保留。',{cause:error});return error;}
 function clear({scope=null,reason='已停止当前表单任务；已保存的记录仍保留'}={}){if(controller&&(!scope||jobScope===scope)){controller.abort(Error(reason));if(progress)progress={...progress,stage:'stopped',updatedAt:Date.now(),finishedAt:Date.now()};}worldbook.clear();setPrompt('');latest=null;}
 function contextChanged(){const next=getContext().chatId?store.read().key:null;if(next===boundWorld)return false;boundWorld=next;clear({reason:'会话已切换，旧表单任务已停止'});return true;}
 function capture(){const snapshot=store.read(),chat=stampChat(getContext()),signal=controller?.signal;return {...snapshot,settings:tableSettings(snapshot.world),chat,guard(){signal?.throwIfAborted();const now=store.read();check(now.key===snapshot.key&&now.revision===snapshot.revision&&stampChat(getContext())===chat,'聊天、候选或配置已改变，旧辅助结果未提交到当前进度');}};}
 async function load(c,type='normal'){historyGroups(getContext().chat,projectToolTurns);if(!c.settings.originBook||!c.settings.sessionBook){await initializeCaptured(c);Object.assign(c,capture());}const origin=await books.read(c.settings.originBook),session=await books.read(c.settings.sessionBook);c.guard();check(origin.data.kind==='origin'&&session.data.kind==='session','原点书／会话存档类型不匹配');check(session.data.owner===c.key,'此存档属于另一会话；请为当前会话创建独立存档');const projection=await storySources(getContext().chat,type,projectToolTurns),chain=projection.chain;c.guard();assertStoryLedger(origin.data,session.data,projection);const view=withGlobalPreferences(project(origin.data,session.data,chain.map(s=>s.key)),c.data.全局偏好);return {origin,session,chain,view};}
 async function currentRuleSources(c){const context=getContext(),card=context.characters?.[context.characterId],entries=card?.avatar?await books.materials(card.avatar):[];c.guard();return ruleSources(card,entries);}
 async function selectedRulePolicy(c,{requireResolved=true}={}){if(!c.settings.sessionBook)return null;const session=await books.read(c.settings.sessionBook);c.guard();check(session.data.kind==='session'&&session.data.owner===c.key,'规则选择属于另一会话，请重新绑定当前存档');if(!session.data.ruleReview)return null;return rulePolicy(session.data.ruleReview,await currentRuleSources(c),{requireResolved});}
 async function reviewCardRules({force=false}={}){return exclusive(async signal=>{const c=capture(),loaded=await load(c),source=await currentRuleSources(c),old=loaded.session.data.ruleReview;if(!force&&old?.fingerprint===source.fingerprint)return {review:copy(old),sessionRevision:loaded.session.data.revision,stale:false};const proposal=await invoke('ruleReview',{ruleSources:source},c,signal),review=validateRuleReview(proposal,source);check((await currentRuleSources(c)).fingerprint===source.fingerprint,'校对期间原卡已变化，请重新校对');const next=copy(loaded.session.data);next.revision++;next.ruleReview=review;if(old){next.ruleReviewHistory??=[];next.ruleReviewHistory.push(copy(old));}await books.write(loaded.session,next,c.guard);return {review:copy(review),sessionRevision:next.revision,stale:false};});}
 async function ruleReviewStatus(){const c=capture();if(!c.settings.sessionBook)return {review:null,sessionRevision:null,stale:false};const session=await books.read(c.settings.sessionBook);c.guard();check(session.data.kind==='session'&&session.data.owner===c.key,'规则选择属于另一会话，请重新绑定当前存档');const review=session.data.ruleReview??null;return {review:copy(review),sessionRevision:session.data.revision,stale:!!review&&review.fingerprint!==(await currentRuleSources(c)).fingerprint};}
 async function saveRuleChoice(choice,expected){return exclusive(async()=>{const c=capture(),loaded=await load(c),review=loaded.session.data.ruleReview;check(review&&expected?.fingerprint===review.fingerprint&&expected?.sessionRevision===loaded.session.data.revision,'规则选择依据已变化，请重新载入');const next=copy(loaded.session.data);next.revision++;next.ruleReview=chooseRule(review,await currentRuleSources(c),choice);next.ruleChoiceHistory??=[];next.ruleChoiceHistory.push({...copy(choice),fingerprint:review.fingerprint,at:new Date().toISOString()});await books.write(loaded.session,next,c.guard);worldbook.clear();setPrompt('');latest=null;return {review:copy(next.ruleReview),sessionRevision:next.revision,stale:false};});}
 function activePreferences(rows,c,binding=null){return rows.filter(row=>row.table==='preferences'&&row.preferenceConfirmed===true&&row.values.启用!==false&&preferenceMatches(row,{context:getContext(),world:c,persona:readPersona(),binding}));}
 async function invoke(task,input,c,signal,{archiveToolSession=null}={}){
  status(task,'运行中');progress={task,stage:'preparing',characters:0,text:'',startedAt:Date.now(),updatedAt:Date.now()};
  try{
   signal?.throwIfAborted();const policy=task==='ruleReview'||task==='tableAssistant'?null:await selectedRulePolicy(c);const response=await request(task,JSON.stringify({...input,preferences:activePreferences(withGlobalPreferences({rows:input.preferences??input.currentRows??input.rows??[]},c.data.全局偏好).rows,c),...(policy?{rulePolicy:policy}:{}),explicitRules:c.settings.hardRules,styleRules:c.settings.styleEnabled?styleRules(c.settings):[]}),{signal,...(archiveToolSession?{archiveToolSession}:{}),onProgress:update=>{
    if(signal?.aborted||!update||!['preparing','prepared','waiting','connected','thinking','receiving','buffered','received'].includes(update.stage))return;
    // Reader delivers cumulative visible content; reasoning fields are never
    // accepted as a progress payload or appended to task data.
    const text=typeof update.text==='string'?update.text:progress.text;progress={...progress,stage:update.stage,text,characters:text.length,updatedAt:Date.now()};
   }});
   if(typeof response==='string')progress={...progress,text:response,characters:response.length};progress={...progress,stage:'validating',updatedAt:Date.now()};
   const result=copy(task==='ruleReview'?parseRuleReviewResponse(response):parseJSONResponse(response));c.guard();status(task,'返回待校验');return result;
  }catch(e){const failure=requestError(e,signal);progress={...progress,stage:signal?.aborted?'stopped':'error',updatedAt:Date.now(),finishedAt:Date.now()};status(task,signal?.aborted?'已停止':'失败',failure.message,failure);throw failure;}
 }
 async function commit(c,loaded,proposal,options){
  const prepared=(options.recover?prepareRecoverable:prepareCommit)(loaded.view,proposal,{...options,sourceOrder:Object.fromEntries(loaded.chain.map(s=>[s.key,s.index]))});c.guard();let origin=loaded.origin;
  if(options.archiveProposal){prepared.commit.archiveProposal=copy(options.archiveProposal);prepared.commit.complete=false;}
  for(const change of prepared.commit.changes)if(change.after?.table==='preferences')change.after.preferenceConfirmed=true;
  if(options.independentPreference){check(options.source===null&&prepared.commit.changes.every(ch=>ch.after?.table==='preferences'),'独立偏好提交不得写入故事事实');prepared.commit.depends=null;}
  const globalIds=new Set((c.data.全局偏好?.记录??[]).map(row=>row.id)),shared=prepared.commit.changes.filter(change=>change.after?.table==='preferences'&&(change.after.values.作用域?.全局===true||globalIds.has(change.id)));
  if(shared.length){
   check(shared.length===prepared.commit.changes.length,'请将全局偏好与本会话表单分开选择并保存');
   check(sameDefinition(prepared.registry,loaded.view.registry),'全局偏好使用通用偏好字段，不能夹带模板修改');
   const data=copy(c.data),bank=data.全局偏好??{记录:[],确认:[],历史:[]},rows=new Map(bank.记录.map(row=>[row.id,row]));
   for(const change of shared){check(change.after.values.作用域?.全局===true,'全局偏好可停用；如需本会话版本，请停用后在本会话新增');change.after.source=null;check(!change.after.access.knowers.length,'用户偏好不授予人物知识');rows.set(change.id,copy(change.after));}
   bank.记录=[...rows.values()];bank.历史.push(copy(prepared.commit));
   if(options.reviewId){check(!bank.确认.some(item=>item.编号===options.reviewId),'偏好候选已处理');bank.确认.push({编号:options.reviewId,会话:c.key,时间:new Date().toISOString()});}
   validateGlobalPreferences(bank);data.全局偏好=bank;c.guard();const saved=await store.save(data,c.revision,c.key);
   status('全局偏好','已保存',shared.length+' 项已确认偏好；仅在匹配作用域中使用');return {...loaded,configurationRevision:saved.data.revision,view:withGlobalPreferences(loaded.view,bank)};
  }
  // Plot changes are overlays of this save. Only explicit init/genesis writes
  // origin assets; ordinary archive/manual changes never rewrite the beginning.
  const next=copy(loaded.session.data);next.revision++;if(options.importSource)prepared.commit.importSource=copy(options.importSource);if(options.nativeReceipt)prepared.commit.nativeReceipt=copy(options.nativeReceipt);if(options.progression)prepared.commit.progression=copy(options.progression);next.commits.push(prepared.commit);if(options.reviewId){const draft=next.preferenceDrafts?.find(x=>x.id===options.reviewId);check(draft&&draft.status==='pending','偏好候选已处理');draft.status='accepted';draft.reviewedAt=new Date().toISOString();}
  try{const session=await books.write(loaded.session,next,c.guard);status(options.kind,prepared.commit.complete===false?'部分待处理':'已保存',prepared.commit.changes.length+' 项修改'+(prepared.commit.pending?.length?'，'+prepared.commit.pending.length+' 项待修正':''));return {...loaded,origin,session,view:withGlobalPreferences(project(origin.data,session.data,loaded.chain.map(s=>s.key)),c.data.全局偏好)};}
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
  if(c.settings.nativeBridge)return archiveNativeLoaded(c,loaded,signal,range);
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
 function nativeMapChanges(view,data,reserved=[]){
  const prior=view.rows.filter(r=>r.table==='native_cells'),byPath=new Map(prior.map(r=>[r.values.路径,r])),leaves=nativeBranches(data.stat_data),changes=[];
  const ids=new Set(reserved);
  const newId=index=>{let id='new:native-'+index;while(ids.has(id))id+='-snapshot';ids.add(id);return id;};
  for(const [i,leaf] of leaves.entries()){const before=byPath.get(leaf.path);if(before&&before.values.启用!==false&&JSON.stringify(before.values.值)===JSON.stringify(leaf.value))continue;changes.push({id:before?.id??newId(i),table:'native_cells',expected:before?.rev??0,values:{名称:leaf.path,路径:leaf.path,值:leaf.value,启用:true},access:{readers:[],knowers:[]},evidence:'原生变量快照'});}
  const paths=new Set(leaves.map(l=>l.path));for(const old of prior)if(old.values.启用!==false&&!paths.has(old.values.路径))changes.push({id:old.id,table:'native_cells',expected:old.rev,values:{启用:false},access:{readers:[],knowers:[]},evidence:'原生变量快照'});
  return changes;
 }
 async function nativeMapLoaded(c,loaded,data,source,index){
  const changes=nativeMapChanges(loaded.view,data);
  for(let offset=0;offset<changes.length;offset+=100)loaded=await commit(c,loaded,{changes:changes.slice(offset,offset+100)},{source,kind:'native-snapshot',evidence:'原生变量快照',allowedTables:['native_cells'],nativeReceipt:{phase:'snapshot',index}});
  return loaded;
 }
 async function enableNativeBridge(enabled=true){return exclusive(async()=>{const c=capture();if(enabled){check(c.settings.archive,'请先启用自动归档历史；原生变量桥通过同一次归档结算变量');const settings=getContext().extensionSettings?.mvu_settings;check(!(settings?.更新方式==='额外模型解析'&&settings?.额外模型解析配置?.启用自动请求!==false),'原 MVU 额外模型自动更新正在启用，请先关闭该重复计算来源，脚本保持开启');let loaded=await load(c);const native=bridgeInput(getContext());loaded=await nativeMapLoaded(c,loaded,native.data,loaded.chain.at(-1)?.key??null,native.index);}
  const fresh=capture(),data=copy(fresh.data);data.worlds[fresh.key].tables={...fresh.settings,nativeBridge:enabled,enabled:enabled||fresh.settings.enabled};await store.save(data,fresh.revision,fresh.key);status('原生变量桥',enabled?'已启用':'已关闭','原 MVU 脚本保持开启；更新块由插件生成');return enabled;});}
 // A confirmed floor has one proposal and one persisted native settlement.
 // The journal bridges the native message store and the archive worldbook;
 // neither a retry nor a service recreation replays an adjudication callback.
 async function archiveNativeLoaded(c,loaded,signal,range=null){
  check(c.settings.archive,'请先启用自动归档历史；原生变量桥通过同一次归档结算变量');
  const applied=(state,key)=>state.view.commits.some(x=>x.source===key&&x.nativeReceipt?.phase==='applied');
  const eligible=loaded.chain.filter(s=>s.role==='assistant'&&loaded.chain.some(u=>u.role==='user'&&u.index>s.index)).filter(s=>!range||(s.floor>=range.from&&s.floor<=range.to)).filter(s=>!loaded.view.archived.has(s.key)||!applied(loaded,s.key)).slice(0,range?.limit??Infinity);
  for(const source of eligible){
   c.guard();const index=source.floor-1;
   check(!loaded.view.commits.some(x=>x.nativeReceipt?.phase==='applied'&&x.nativeReceipt.index>index),'后续楼层已有原生结算；请恢复到本楼对应时间锚再补录，未回退当前变量映射');
   // A completed old candidate is absent from the current projection but its
   // journal is complete in the raw session. This does not settle the new source.
   check(!(loaded.session.data.nativeIntents??[]).some(x=>x.index===index&&x.source!==source.key&&!loaded.session.data.commits.some(commit=>commit.source===x.source&&commit.nativeReceipt?.phase==='applied')),'该楼层正文已改变且存在未完成的原生结算；请先恢复对应来源，未重复执行模型或回调');
   let waiting=loaded.session.data.nativeIntents?.findLast(x=>x.source===source.key);
   if(waiting&&!applied(loaded,source.key)){
    if(waiting.phase==='parsing'){const cached=parsedNative.get(c.key+':'+source.key);check(cached,'上次原生回调中断，结果未能保存；为避免重抽随机结果，未再次执行。请回溯到已确认时间锚后继续');waiting={...waiting,...cached};loaded=await saveNativeIntent(c,loaded,waiting);}
    if(waiting.unifiedArchive){loaded=await finishArchiveNative(c,loaded,source,waiting);continue;}
    // Resume a pre-upgrade native-only journal before requesting its missing archive.
    await finishNative(c,loaded,source,waiting);loaded=await load(c);
   }
   const archiveAlready=loaded.view.archived.has(source.key),legacyNative=hasNativeUpdate(source.text),nativeOwned=legacyNative||applied(loaded,source.key);
   const native=bridgeInput(getContext(),undefined,index);
   if(nativeOwned){const existing=globalThis.Mvu.getMvuData({type:'message',message_id:index});check(existing?.stat_data,'旧回复含原生更新但尚无变量快照，请先由原脚本完成处理');native.data=copy(existing);native.snapshotIndex=index;}
   loaded=await nativeMapLoaded(c,loaded,native.data,source.key,index);
   const userSource=precedingUserSource(loaded.chain,source),text=archivalText(source.text),evidence=[text,userSource?.text??''].filter(Boolean).join('\n\n');
   const view={...loaded.view,rows:loaded.view.rows.map(r=>({...r,sourceFloor:loaded.chain.find(s=>s.key===r.source)?.floor??null}))},entries=bookAIMaterials(await books.materials(getContext().characters[getContext().characterId].avatar));c.guard();
   const input={sourceHistory:[{key:source.key,parent:source.parent,index:source.index,floor:source.floor,role:source.role,name:source.name,text:source.text,candidate:source.candidate}],archiveSource:{key:source.key,parent:source.parent,index:source.index,floor:source.floor,role:source.role,name:source.name,text,time:sourceTime(source.text)},userSource,pending:[],objectsSeparate:c.settings.objectsSeparate&&!archiveAlready,
    nativeBridge:{enabled:true,writer:'native-mvu',sourceFloor:source.floor,index,snapshotFloor:native.snapshotIndex+1,nativeOwned,archiveAlready},nativeState:{readOnly:true,sourceFloor:source.floor,snapshotFloor:native.snapshotIndex+1,valuesFrom:'currentRows.native_cells'},nativeRules:[cardBasis(getContext()),...entries.map(e=>e.content)].join('\n\n'),instruction:'同一次归档提出记忆与变量变更。native_cells 仅为原生映射；程序交原 MVU 结算后保存实际值。业务状态引用原生路径，不复制变量值。仅处理当前正文及此前连续用户输入，不授予人物未获知的事实。'};
   const options={source:source.key,kind:archiveAlready?'native-fill':range?'history':'archive',worldTime:sourceTime(source.text),evidence,allowedTables:loaded.view.registry.tables.filter(t=>t.owner==='archive'&&t.id!=='native_cells').map(t=>t.id),sourceOrder:Object.fromEntries(loaded.chain.map(s=>[s.key,s.index]))},reading={ids:[],rounds:0};
   let discovery=null,working=view;
   if(input.objectsSeparate){discovery=await archiveProposal('objectArchive',{...input,nativeBridge:undefined,nativeState:undefined,nativeRules:undefined},view,c,signal,reading);working=proposalView(view,discovery,{...options,allowedTables:['objects','facts']});}
   const task=range?'historyImport':'tableArchive';let history=await archiveProposal(task,input,working,c,signal,reading);
   function splitAndValidate(history){
    if(discovery)onlyArchiveObjects(history,working,false);
    const proposal=discovery?mergeArchiveProposals(discovery,history):history;
    check(!proposal.pending?.length,'统一归档仍有未解决项目；未结算变量或完成归档');
    const tables=registryIndex(loaded.view.registry),nativeChanges=[],changes=[];
    for(const op of proposal.changes)(tables.tables.get(normalized(op.table))?.id==='native_cells'?nativeChanges:changes).push(copy(op));
    check(!nativeOwned||!nativeChanges.length,'原回复已有原生更新，native_cells 本轮只读');
    check(!archiveAlready||(!changes.length&&!proposal.templates?.length&&!proposal.schemaChanges?.length),'此楼层记忆已归档；补结算只能提出 native_cells 变更');
    const business={...proposal,changes},nativeProposal={changes:nativeChanges.map(op=>({...op,table:'native_cells'}))};
    prepareCommit(loaded.view,business,options);
    const wire=bridgePatch(loaded.view.rows.filter(r=>r.table==='native_cells'&&r.values.启用!==false),nativeProposal,native.data,evidence);
    return {business,nativeProposal,wire};
   }
   let validated;
   try{validated=splitAndValidate(history);}catch(e){status('统一归档','修正格式',e.message);history=await archiveProposal(task,{...input,repair:{error:e.message,previous:history,instruction:'只修正同一归档提案，保留正确业务与变量项、来源和 discovery ID；不能解决的项目保留 pending。'}},working,c,signal,reading);validated=splitAndValidate(history);}
   const {business,nativeProposal,wire}=validated;
   const intent={unifiedArchive:true,source:source.key,index,snapshotIndex:native.snapshotIndex,phase:'parsing',before:JSON.stringify(native.data.stat_data),originalMissing:!globalThis.Mvu.getMvuData({type:'message',message_id:index})?.stat_data,proposal:nativeProposal,archiveProposal:business,archiveOptions:options,evidence,operations:copy(wire.operations),block:wire.block,legacyNative,nativeOwned};
   assertNativeBaseline(intent);loaded=await saveNativeIntent(c,loaded,intent);assertNativeBaseline(intent);
   const parsed=wire.operations.length?await parseNativeTransaction({runtime:globalThis.Mvu,eventSource:getContext().eventSource,index,before:native.data,block:wire.block,guard:c.guard}):{after:copy(native.data),stagedWrites:0};
   const ready={phase:'parsed',after:JSON.stringify(parsed.after.stat_data),afterData:copy(parsed.after),stagedWrites:parsed.stagedWrites,outcome:auditNativeOutcome(wire.operations,native.data.stat_data,parsed.after.stat_data)};
   parsedNative.set(c.key+':'+source.key,ready);Object.assign(intent,ready);loaded=await saveNativeIntent(c,loaded,intent);
   loaded=await finishArchiveNative(c,loaded,source,intent);
  }
  return loaded;
 }
 function assertNativeBaseline(intent){
  const snapshot=globalThis.Mvu?.getMvuData?.({type:'message',message_id:intent.snapshotIndex});
  check(JSON.stringify(snapshot?.stat_data)===intent.before,'原生来源快照已改变；未使用过期前值结算，请恢复到已确认时间锚后重试');
 }
 async function finishArchiveNative(c,loaded,source,intent){
  check(intent.phase==='parsed'&&intent.source===source.key&&intent.index===source.floor-1,'原生归档日志与当前来源不匹配');
  const outcome=intent.outcome;
  if(outcome?.rejected.length){status('统一归档','原生规则拒绝',outcome.rejected.length+' 项未生效；已保存实际回执，不重复回调');throw Error('原生规则拒绝了 '+outcome.rejected.length+' 项更新；未写入变量或完成归档，解析结果已保存');}
  // Validate both destinations before the first native write. Native cells are
  // constructed only from the actual callback result, never from the proposal.
  prepareCommit(loaded.view,intent.archiveProposal,intent.archiveOptions);
  const proposal={...copy(intent.archiveProposal),changes:[...copy(intent.archiveProposal.changes),...nativeMapChanges(loaded.view,intent.afterData,intent.archiveProposal.changes.map(op=>op.id))]},options={...intent.archiveOptions,evidence:intent.evidence+'\n原生变量快照',allowedTables:[...intent.archiveOptions.allowedTables,'native_cells'],nativeReceipt:{phase:'applied',unifiedArchive:true,index:intent.index,block:intent.block,legacyNative:intent.legacyNative,stagedWrites:intent.stagedWrites??0,outcome:copy(outcome),updated:intent.proposal.changes.length}};
  prepareCommit(loaded.view,proposal,options);
  const runtime=globalThis.Mvu,index=intent.index,current=runtime.getMvuData({type:'message',message_id:index}),currentText=JSON.stringify(current?.stat_data);
  check(currentText===intent.after||currentText===intent.before||intent.originalMissing&&!current?.stat_data,'变量已被其他来源修改，未覆盖');
  if(currentText!==intent.after){assertNativeBaseline(intent);c.guard();await runtime.replaceMvuData(intent.afterData,{type:'message',message_id:index});c.guard();check(JSON.stringify(runtime.getMvuData({type:'message',message_id:index})?.stat_data)===intent.after,'原生写回未确认；已保存结果可重试，随机判定不会重跑');}
  await carryNativeForward({context:getContext(),runtime,index,before:{stat_data:JSON.parse(intent.before)},after:intent.afterData,guard:c.guard});
  loaded=await commit(c,loaded,proposal,options);
  parsedNative.delete(c.key+':'+source.key);
  if(typeof globalThis.TavernHelper?.refreshOneMessage==='function')try{await globalThis.TavernHelper.refreshOneMessage(index);}catch(e){status('原卡显示','待刷新','变量与记忆已保存；'+e.message);}
  loaded.nativeResult={updated:intent.proposal.changes.length,block:intent.block,outcome:copy(outcome),...(intent.nativeOwned?{nativeOwned:true}:{})};return loaded;
 }
 async function syncNative({scope='manual'}={}){return exclusive(async signal=>{
  const c=capture();if(!c.settings.nativeBridge)return null;
  check(c.settings.archive,'请先启用自动归档历史；原生变量桥通过同一次归档结算变量');
  let loaded=await load(c);const confirmed=loaded.chain.some(s=>s.role==='assistant'&&loaded.chain.some(u=>u.role==='user'&&u.index>s.index));
  if(!confirmed)return {deferred:true,reason:'最新回复暂不结算；等用户继续后统一归档变量与记忆'};
  loaded=await archiveNativeLoaded(c,loaded,signal);return loaded.nativeResult??{already:true};
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
 // Only the host archive task receives this handle. Neither the read-only
 // assistant nor the main-chat global dispatcher can acquire it implicitly.
 async function openArchiveProposal({sourceKey,includeLatest=false,signal}={}){
  check(typeof sourceKey==='string'&&typeof includeLatest==='boolean','归档草案须绑定明确来源');
  for(const [handle,record]of archiveDrafts)if(Date.now()-record.started>record.toolBudget.timeoutMs)handle.dispose();
  check(archiveDrafts.size<8,'归档草案会话数量已达上限，请完成或关闭旧草案');
  const c=capture();check(c.settings.originBook&&c.settings.sessionBook,'尚未绑定可写的表单存档');const loaded=await load(c),source=loaded.chain.find(s=>s.key===sourceKey&&s.role==='assistant');check(source,'归档草案来源不是当前候选正文');
  const userSource=precedingUserSource(loaded.chain,source),evidence=[archivalText(source.text),userSource?.text??''].filter(Boolean).join('\n\n'),allowedTables=loaded.view.registry.tables.filter(t=>t.owner==='archive'&&t.id!=='native_cells').map(t=>t.id);
  const guard=async()=>{signal?.throwIfAborted();c.guard();const [a,b]=await Promise.all([books.read(loaded.origin.name),books.read(loaded.session.name)]);signal?.throwIfAborted();c.guard();check(a.stamp===loaded.origin.stamp&&b.stamp===loaded.session.stamp,'归档草案依据已改变，请重新读取');};await guard();
  const context={world:c.key,branch:loaded.session.data.id,task:'tableArchive',originRevision:loaded.origin.data.revision,sessionRevision:loaded.session.data.revision};
  const toolBudget=archiveToolBudget(getContext().ToolManager?.RECURSE_LIMIT);
  const handle=createArchiveProposalSession({view:loaded.view,context,source:{...source,evidence,worldTime:sourceTime(source.text),sourceOrder:Object.fromEntries(loaded.chain.map(s=>[s.key,s.index]))},allowedTables,authorizeChange:(op,_before,_context,{newTables=[]}={})=>allowedTables.includes(op.table)||newTables.includes(op.table),authorizeSchemaChange:change=>change.kind==='type'?allowedTables.includes('objects'):change.definition?change.definition.owner==='archive'&&!loaded.view.registry.tables.some(t=>t.id===change.definition.id):allowedTables.includes(change.id),guard,limits:{ttlMs:toolBudget.timeoutMs},recorded:loaded.session.data.commits.flatMap(x=>x.archiveProposal?[x.archiveProposal]:[])});
  check(archiveDrafts.size<8,'归档草案会话数量已达上限，请完成或关闭旧草案');const dispose=handle.dispose;handle.dispose=()=>{dispose();archiveDrafts.delete(handle);};archiveDrafts.set(handle,{c,loaded,source,evidence,allowedTables,includeLatest,signal,toolBudget,started:Date.now()});return handle;
 }
 async function saveArchiveProposal(handle,requestId){return exclusive(async()=>{
  const record=archiveDrafts.get(handle);check(record,'归档草案会话不存在');record.signal?.throwIfAborted();const draft=handle.getDraft(requestId),c=capture();
  const capturedGuard=c.guard;c.guard=()=>{record.signal?.throwIfAborted();capturedGuard();};
  check(c.settings.originBook&&c.settings.sessionBook&&c.key===record.c.key&&c.settings.originBook===record.loaded.origin.name&&c.settings.sessionBook===record.loaded.session.name,'归档草案所属会话或存档已改变');
  const loaded=await load(c);check(loaded.session.data.id===draft.context.branch&&loaded.origin.data.id===record.loaded.origin.data.id,'归档草案所属分支已改变');
  const matches=loaded.session.data.commits.filter(x=>x.archiveProposal?.requestId===requestId);check(matches.length<=1,'归档请求回执不唯一，须核对存档');
  const receipt=(entry,replayed)=>({status:'ok',state:'committed',requestId,commitId:entry.id,sessionRevision:loaded.session.data.revision,replayed,active:loaded.view.commits.some(x=>x.id===entry.id)});
  if(matches.length){const entry=matches[0],saved=entry.archiveProposal;check(saved.hash===draft.hash&&saved.fingerprint===draft.fingerprint&&saved.source===draft.source.key&&saved.task==='tableArchive','相同归档请求编号的内容或来源发生变化');return receipt(entry,true);}
  check(!draft.recorded&&draft.proposal,'已记录的草案回执缺失，须核对存档');await handle.assertFresh();c.guard();
  const source=loaded.chain.find(s=>s.key===draft.source.key&&s.role==='assistant');check(source,'归档草案来源已不是当前候选正文');check(record.includeLatest||loaded.chain.some(s=>s.role==='user'&&s.index>source.index),'当前候选尚未确认；草案保留但未归档');
  const saved=await commit(c,loaded,draft.proposal,{source:source.key,kind:'archive',evidence:record.evidence,worldTime:sourceTime(source.text),allowedTables:record.allowedTables,...ARCHIVE_SCHEMA_OPTIONS,archiveProposal:{requestId,hash:draft.hash,fingerprint:draft.fingerprint,source:source.key,task:'tableArchive',changes:draft.proposal.changes.length,schemaEvidence:copy(draft.proposal.schemaEvidence??[])}});
  const entry=saved.session.data.commits.find(x=>x.archiveProposal?.requestId===requestId);check(entry,'归档写入回执缺失');return {...receipt(entry,false),sessionRevision:saved.session.data.revision,active:saved.view.commits.some(x=>x.id===entry.id)};
 });}
 function discardArchiveReview(id){const record=archiveReviews.get(id);if(!record)return false;record.lifetime.abort(Error('归档审核草案已关闭'));record.handle.dispose();archiveReviews.delete(id);return true;}
 async function acceptArchiveReview(id){const record=archiveReviews.get(id);check(record,'归档审核草案不存在或已关闭');return saveArchiveProposal(record.handle,record.requestId);}
 async function previewArchiveChanges({sourceKey,includeLatest=false}={}){return exclusive(async signal=>{
  for(const [id,r]of archiveReviews)if(Date.now()>r.expiresAt)discardArchiveReview(id);
  const lifetime=new AbortController(),abort=()=>lifetime.abort(signal.reason??Error('归档草案生成已停止'));signal.addEventListener('abort',abort,{once:true});let handle=null,query=null,keep=false;
  try{
   signal.throwIfAborted();handle=await openArchiveProposal({sourceKey,includeLatest,signal:lifetime.signal});const record=archiveDrafts.get(handle),{c,loaded,source,allowedTables}=record;
   check(includeLatest||loaded.chain.some(s=>s.role==='user'&&s.index>source.index),'当前候选尚未确认；请先确认保留最新回复');
   const requestId=crypto.randomUUID(),id=crypto.randomUUID(),context={...handle.context,source:source.key,requestId,storyPoint:sourceTime(source.text)};
   query=createArchiveQuerySession({view:loaded.view,context,sourceOrder:Object.fromEntries(loaded.chain.map(s=>[s.key,s.index])),authorizeRow:row=>allowedTables.includes(row.table),authorizeField:row=>allowedTables.includes(row.table),authorizeMetadata:row=>allowedTables.includes(row.table),guard:()=>handle.assertFresh(),limits:{ttlMs:record.toolBudget.timeoutMs,maxCalls:record.toolBudget.maxCalls}});
   let staged=false;const toolSession={context:copy(context),assertFresh:()=>handle.assertFresh(),dispose:()=>query.dispose()};
   for(const method of ['list_archive','describe_fields','search_archive','read_archive'])toolSession[method]=input=>query[method](input);
   toolSession.propose_archive_change=async input=>{check(input?.requestId===requestId,'草案请求编号与本轮不匹配');const result=await handle.propose_archive_change(input);staged=true;return {...result,completion:{changes:[],archiveRequestId:requestId,notes:[]}};};
   const userSource=precedingUserSource(loaded.chain,source),input={archiveRequestId:requestId,archiveSource:{key:source.key,floor:source.floor,text:archivalText(source.text),time:sourceTime(source.text)},userSource,currentRows:[],registry:{...copy(loaded.view.registry),tables:loaded.view.registry.tables.filter(t=>allowedTables.includes(t.id)).map(copy)},preferences:loaded.view.rows.filter(r=>r.table==='preferences'),objectsSeparate:false,instruction:'独立单楼审核：当前来源支持的完整一批修改先通过工具提交，等用户审核，不直接保存。使用给定archiveRequestId；空内联记录不是空库。'};
   const final=await invoke('tableArchive',input,c,signal,{archiveToolSession:toolSession});await handle.assertFresh();
   check(Array.isArray(final.changes)&&final.changes.length===0&&Object.keys(final).every(k=>['changes','archiveRequestId','notes'].includes(k))&&Array.isArray(final.notes??[])&&(final.notes??[]).length<=20&&(final.notes??[]).every(n=>typeof n==='string'&&n.length<=2000),'归档审核最终结果须只引用工具草案，不得绕过校验填写changes');
   if(final.archiveRequestId===null){check(!staged,'已提交草案不能在最终结果中隐去');status('归档草案','无新修改');return {id:null,source:{key:source.key,floor:source.floor},notes:copy(final.notes??[]),changes:[]};}
   check(final.archiveRequestId===requestId&&staged,'最终结果没有引用本轮已接纳的草案');const draft=handle.getDraft(requestId);check(!draft.recorded&&draft.proposal,'本轮应生成待审新草案');
   const preflight=prepareCommit(loaded.view,draft.proposal,{source:source.key,kind:'archive',evidence:record.evidence,allowedTables,sourceOrder:Object.fromEntries(loaded.chain.map(s=>[s.key,s.index])),...ARCHIVE_SCHEMA_OPTIONS});
   const review={id,requestId,source:{key:source.key,floor:source.floor,text:input.archiveSource.text,userText:userSource?.text??''},changes:draft.proposal.changes.map(op=>({...copy(op),intent:op.delete?'delete':op.id.startsWith('new:')?'create':'update',before:copy(loaded.view.rows.find(r=>r.id===op.id)??null)})),extensions:copy(preflight.extensions??[]),structure:{templates:copy(draft.proposal.templates??[]),schemaChanges:copy(draft.proposal.schemaChanges??[]),evidence:copy(draft.proposal.schemaEvidence??[])},notes:copy(final.notes??[]),expiresAt:record.started+record.toolBudget.timeoutMs};
   archiveReviews.set(id,{handle,requestId,lifetime,expiresAt:review.expiresAt});keep=true;status('归档草案','待确认',review.changes.length+' 项；尚未写入档案');return review;
  }finally{signal.removeEventListener('abort',abort);query?.dispose();if(!keep){lifetime.abort(Error('归档草案任务已结束'));handle?.dispose();}}
 },{scope:'archive-review'});}
 async function openArchiveQuery(){
  check(typeof archiveQueryPolicy==='function','档案查询尚未绑定本任务的宿主读取授权');const c=capture();check(c.settings.originBook&&c.settings.sessionBook,'尚未绑定可查询的表单存档');const loaded=await load(c),policy=await archiveQueryPolicy({world:c.key,session:copy(loaded.session.data),view:copy(loaded.view)});c.guard();check(policy&&typeof policy.task==='string'&&policy.task&&typeof policy.guard==='function','档案查询任务授权及在途检查无效');
  const context={world:c.key,branch:loaded.session.data.id,task:policy.task,actor:policy.actorId??null,storyPoint:loaded.view.rows.find(r=>r.table==='scene')?.values.当前时间??loaded.view.baseTime??null,originRevision:loaded.origin.data.revision,sessionRevision:loaded.session.data.revision};
  const guard=async()=>{c.guard();await policy.guard();const [origin,session]=await Promise.all([books.read(loaded.origin.name),books.read(loaded.session.name)]);c.guard();check(origin.stamp===loaded.origin.stamp&&session.stamp===loaded.session.stamp,'档案查询快照已过期，请重新查询');await policy.guard();c.guard();};await guard();
  return createArchiveQuerySession({view:loaded.view,context,authorizeRow:policy.authorizeRow,authorizeField:policy.authorizeField,readSource:policy.readSource??null,limits:policy.limits??{},guard});
 }
 // The configuration assistant already has explicit access to review().rows.
 // This session grants exactly that snapshot, never arbitrary narrative knowledge.
 async function openAssistantArchiveQuery(input,{signal}={}){
  const c=capture();check(input?.storage?.ready===true&&c.settings.originBook&&c.settings.sessionBook,'表单助手没有可查询的既有存档');
  const [origin,session]=await Promise.all([books.read(c.settings.originBook),books.read(c.settings.sessionBook)]);c.guard();check(origin.data.kind==='origin'&&session.data.kind==='session'&&session.data.owner===c.key,'助手档案属于另一会话');
  const projection=await storySources(getContext().chat,'normal',projectToolTurns),chain=projection.chain;c.guard();assertStoryLedger(origin.data,session.data,projection);const view=project(origin.data,session.data,chain.map(s=>s.key));
  check(JSON.stringify(input.currentRows)===JSON.stringify(view.rows)&&JSON.stringify(input.registry)===JSON.stringify(view.registry),'助手读取依据已改变，请重新提问');
  const ids=new Set(view.rows.map(r=>r.id)),guard=async()=>{signal?.throwIfAborted();c.guard();const [a,b]=await Promise.all([books.read(origin.name),books.read(session.name)]);c.guard();signal?.throwIfAborted();check(a.stamp===origin.stamp&&b.stamp===session.stamp,'助手档案快照已改变，请重新提问');};
  const toolBudget=archiveToolBudget(getContext().ToolManager?.RECURSE_LIMIT);
  await guard();return createArchiveQuerySession({view,context:{world:c.key,branch:session.data.id,task:'tableAssistant-review',actor:null,storyPoint:view.rows.find(r=>r.table==='scene')?.values.当前时间??view.baseTime??null,originRevision:origin.data.revision,sessionRevision:session.data.revision},authorizeRow:r=>ids.has(r.id),authorizeField:r=>ids.has(r.id),guard,limits:{ttlMs:toolBudget.timeoutMs,maxCalls:toolBudget.maxCalls}});
 }
 async function freezeCanon(options){return exclusive(async()=>{const c=capture();check(c.settings.originBook&&c.settings.sessionBook,'请先建立要冻结的表单存档');const loaded=await load(c),chat=copy(getContext().chat),raw=JSON.stringify(chat),guard=()=>{c.guard();check(JSON.stringify(getContext().chat)===raw,'聊天原文或候选已改变，未保存旧原著');};
  const anchor=await freezeCanonSnapshot(loaded,{chat,world:c.key,projectToolTurns},copy(options));guard();const currentSession=await books.read(loaded.session.name);guard();check(currentSession.stamp===loaded.session.stamp,'源存档版本已改变，请重新冻结');const next=copy(loaded.origin.data);next.revision++;next.timelineAnchors??=[];next.timelineAnchors.push(anchor);const saved=await books.write(loaded.origin,next,guard),frozen=saved.data.timelineAnchors.find(a=>a.id===anchor.id);await validateFrozenCanon(frozen,{projectToolTurns});return copy(frozen);
 });}
 async function readCanon(id){const c=capture();check(c.settings.originBook,'尚未绑定原点书');const origin=await books.read(c.settings.originBook);c.guard();check(origin.data.kind==='origin','请选择原点书');const anchor=origin.data.timelineAnchors?.find(a=>a.id===id);check(anchor,'原著不存在');const receipt=await validateFrozenCanon(anchor,{projectToolTurns});c.guard();return {anchor:copy(anchor),receipt};}
 async function saveAnchor(options){return exclusive(async()=>{const c=capture(),loaded=await load(c),anchor=snapshotAnchor(loaded,copy(options)),next=copy(loaded.origin.data);const currentSession=await books.read(loaded.session.name);c.guard();check(currentSession.stamp===loaded.session.stamp,'源存档已改变，请重新保存时间锚');next.revision++;next.timelineAnchors??=[];next.timelineAnchors.push(anchor);await books.write(loaded.origin,next,c.guard);return anchor;});}
 async function useAnchor(id,{keepFuture=true}={}){return exclusive(async()=>{const c=capture(),loaded=await load(c);check(canRestoreInto(loaded.session.data),'请在新建且尚未填录进度的会话应用时间锚，避免覆盖当前存档');const anchor=loaded.origin.data.timelineAnchors?.find(a=>a.id===id);check(anchor,'时间锚不存在');if(anchor.canon)await validateFrozenCanon(anchor,{projectToolTurns});const next=copy(loaded.session.data);next.revision++;next.pins=[];next.commits=[];delete next.openingBinding;delete next.templateInitialization;next.branchSeed=branchSeed(anchor);if(next.personaBinding&&!next.branchSeed.rows.some(r=>r.id===next.personaBinding.objectId))delete next.personaBinding;if(!keepFuture)next.branchSeed.nodes=[];next.registry=copy(anchor.registry);next.schemaPinned=true;project(loaded.origin.data,next,loaded.chain.map(s=>s.key));await books.write(loaded.session,next,c.guard);return next.branchSeed.anchor;});}
 async function stageFork(floor,keepFuture,{preserveCandidates=false}={}){return exclusive(async()=>{const c=capture();if(!c.settings.enabled)return null;const loaded=await load(c);check(Number.isInteger(floor)&&floor>=0&&floor<=getContext().chat.length,'分支楼层无效');const eligible=new Set(loaded.chain.filter(s=>s.floor<=floor).map(s=>s.key)),cut=forkCommits(loaded.view.commits,eligible).at(-1)?.id??null;
 const anchor=snapshotAnchor(loaded,{name:'分支起点 · 第 '+floor+' 层',cut:cut??'start',sourceKeys:[...eligible]});if(!keepFuture)anchor.nodes=[];const next=copy(loaded.origin.data);next.revision++;next.timelineAnchors??=[];next.timelineAnchors.push(anchor);await books.write(loaded.origin,next,c.guard);
 let candidateSession=null;if(preserveCandidates){const prefix=getContext().chat.slice(0,floor),last=prefix.at(-1);for(let i=0;i<(last?.swipes?.length??0);i++){const alternate=[...prefix.slice(0,-1),{...last,mes:last.swipes[i],swipe_id:i}];for(const source of (await storySources(alternate,'normal',projectToolTurns)).chain)eligible.add(source.key);}candidateSession=copy(loaded.session.data);if(!keepFuture&&candidateSession.branchSeed)candidateSession.branchSeed.nodes=[];candidateSession.pins=originPinsAtStart(loaded.origin.data,loaded.session.data);candidateSession.commits=forkCommits(candidateSession.commits,eligible);candidateSession.nativeIntents=(candidateSession.nativeIntents??[]).filter(item=>eligible.has(item.source));}
 pendingFork={candidateSession,sourceKey:c.key,avatar:getContext().characters[getContext().characterId].avatar,signature:historySignature({chat:getContext().chat.slice(0,floor)}),anchor,settings:copy(c.settings)};return {id:anchor.id,nodes:anchor.nodes.length};});}
 let activatingFork=null;
 function activateFork({rollback=false}={}){if(activatingFork)return activatingFork;if(!pendingFork)return Promise.resolve(null);activatingFork=exclusive(async()=>{const pending=pendingFork,ctx=getContext();if(ctx.characters?.[ctx.characterId]?.avatar!==pending.avatar)return null;const signature=historySignature(ctx);if(signature!==pending.signature)return null;let c=capture();if(!rollback&&c.key===pending.sourceKey)return null;
 if(!rollback){check(!c.settings.sessionBook,'目标会话已有表单存档，未覆盖');const data=copy(c.data);data.worlds[c.key].tables={...pending.settings,sessionBook:'',originPins:[]};await store.save(data,c.revision,c.key);c=capture();}
 let loaded=await load(c);const next=copy(loaded.session.data);next.revision++;next.retiredBranches??=[];if(rollback&&next.commits.length)next.retiredBranches.push({at:new Date().toISOString(),commits:copy(next.commits),branchSeed:copy(next.branchSeed??null)});else check(!next.commits.length,'新分支已有进度，未覆盖');next.commits=[];next.pins=[];next.nativeIntents=[];next.branchSeed=branchSeed(pending.anchor);if(pending.candidateSession){for(const key of ['commits','pins','nativeIntents','branchSeed','preferenceDrafts','revisionFeedback','personaBinding'])if(Object.hasOwn(pending.candidateSession,key))next[key]=copy(pending.candidateSession[key]);if(!Object.hasOwn(pending.candidateSession,'branchSeed'))delete next.branchSeed;}next.registry=copy(pending.anchor.registry);next.schemaPinned=true;project(loaded.origin.data,next,loaded.chain.map(s=>s.key));await books.write(loaded.session,next,c.guard);pendingFork=null;status('平行存档','已建立',(next.branchSeed?.nodes?.length??0)+' 个未来可能节点');return next.branchSeed?.anchor??{id:pending.anchor.id};}).finally(()=>{activatingFork=null;});return activatingFork;}
 async function coreDraft(objectId,{growth=false}={}){return exclusive(async signal=>{const c=capture(),loaded=await load(c),row=loaded.view.rows.find(r=>r.id===objectId&&r.table==='objects');check(row,'请先选择已建档对象');const selected=[row,...(growth?loaded.view.rows.filter(r=>['growth','experiences'].includes(r.table)&&r.values.主体===objectId):[])],basis=JSON.stringify(selected);const result=await invoke('assetAdapt',{sourceCard:basis,goal:growth?'提取无画风基点、已有叙事意义及已选择的成长':'提取无画风基点与已有叙事意义，不携带成长',registry:loaded.view.registry},c,signal);check(result.core&&typeof result.core.name==='string'&&Array.isArray(result.core.traits)&&Array.isArray(result.core.growth),'核心草稿格式无效');for(const item of [...result.core.traits,...result.core.growth])check(typeof item.name==='string'&&typeof item.value==='string'&&typeof item.evidence==='string'&&item.evidence.trim()&&basis.includes(item.evidence),'核心项缺少真实来源');check(growth||!result.core.growth.length,'未选择携带成长');return {format:'tisya.core-draft/1',world:c.key,chat:c.chat,revision:loaded.origin.data.revision,sessionRevision:loaded.session.data.revision,objectId,sourceType:row.values.类型,kind:['character','item','place','rule','organization'].find(kind=>isObjectType(loaded.view.registry,row,kind))??null,basis,core:result.core};});}
 async function saveCore(draft){return exclusive(async()=>{const c=capture(),loaded=await load(c);check(draft.format==='tisya.core-draft/1'&&draft.world===c.key&&draft.chat===c.chat&&draft.revision===loaded.origin.data.revision&&draft.sessionRevision===loaded.session.data.revision,'核心草稿依据已改变');check(draft.core&&typeof draft.core.name==='string'&&Array.isArray(draft.core.traits)&&Array.isArray(draft.core.growth),'核心草稿格式无效');for(const item of [...draft.core.traits,...draft.core.growth])check(typeof item.value==='string'&&typeof item.evidence==='string'&&item.evidence.trim()&&draft.basis.includes(item.evidence),'核心项缺少原文依据');const next=copy(loaded.origin.data);next.revision++;next.coreAssets??=[];const core={name:draft.core.name,traits:copy(draft.core.traits),growth:copy(draft.core.growth),id:crypto.randomUUID(),version:1,sourceObject:draft.objectId,sourceType:loaded.view.rows.find(r=>r.id===draft.objectId)?.values.类型??null,kind:['character','item','place','rule','organization'].find(kind=>isObjectType(loaded.view.registry,loaded.view.rows.find(r=>r.id===draft.objectId),kind))??null,sourceSession:loaded.session.data.id,createdAt:new Date().toISOString()};next.coreAssets.push(core);await books.write(loaded.origin,next,c.guard);return core;});}
 async function listCores(book){const c=capture(),source=await books.read(book||c.settings.originBook);c.guard();check(source.data.kind==='origin','请选择原点书');return copy(source.data.coreAssets??[]);}
 async function adaptCore(book,id,goal=''){const c=capture(),source=await books.read(book);c.guard();const core=source.data.coreAssets?.find(x=>x.id===id);check(core,'通用核心不存在');const reference=book+' / '+id+'@'+core.version;const draft=await genesis('将以下无画风基点整合成当前角色卡世界的新原点版本。保留每项核心设定与有来源的叙事意义，适配身份、经历、形态、用词和世界机制。人物及装备都必须保持其独特用途、意义、限制与代价；不因换画风变成只有泛泛标签的另一个对象。旧世界已完成任务、人际关系、持有与知识不能直接继承；获选成长须作为等价的世界经历重新设计，不能冒充本会话已发生事实。仅代表这个基点主体的原点对象把核心引用字段写为下述引用，陪衬对象不可使用同一引用；若需要拆成多个主体，在蓝图中说明映射。核心引用：'+reference+'\n基点：'+JSON.stringify(core)+'\n用户补充：'+goal);const objects=draft.proposal.artifacts.base.changes.filter(op=>op.table==='objects'),bound=objects.filter(op=>op.values.核心引用===reference);if(!bound.length){const candidates=objects.filter(op=>isObjectType(draft.proposal.artifacts.registry,{table:'objects',values:{...op.values,类型:registryIndex(draft.proposal.artifacts.registry).types.get(normalized(op.values.类型))?.id}},core.kind??'character'));check(candidates.length===1,'世界化蓝图缺少明确的基点主体映射，请保留草稿并核对；未将全部同类对象误绑到同一基点');candidates[0].values.核心引用=reference;}return draft;}
 async function previewCoreBundle(objectIds,options={}){const c=capture(),loaded=await load(c);return coreSelection(loaded.view,objectIds,options);}
 async function coreBundleDraft(objectIds,options={}){const selection=copy({objectIds,linkIds:options.linkIds??[],growthIds:options.growthIds??[],instructions:options.instructions??''});return exclusive(async signal=>{const c=capture(),loaded=await load(c),source=coreSelection(loaded.view,selection.objectIds,selection).source;
  const result=await invoke('assetAdapt',{sourceCard:JSON.stringify(source),goal:'按所选对象和关联提取完整无画风基点资产组；只含明确勾选的成长。',registry:loaded.view.registry},c,signal),bundle=validateBundle(result.bundle,source,{assignIds:true});
  return {format:'tisya.core-bundle-draft/1',world:c.key,chat:c.chat,revision:loaded.origin.data.revision,sessionRevision:loaded.session.data.revision,selection,source,bundle,notes:copy(result.notes??[])};
 });}
 async function saveCoreBundle(input){const draft=copy(input);return exclusive(async()=>{const c=capture(),loaded=await load(c);check(draft.format==='tisya.core-bundle-draft/1'&&draft.world===c.key&&draft.chat===c.chat&&draft.revision===loaded.origin.data.revision&&draft.sessionRevision===loaded.session.data.revision,'整组基点草稿依据已改变');
  const source=coreSelection(loaded.view,draft.selection.objectIds,draft.selection).source;check(sameDefinition(source,draft.source),'基点来源或选择已改变，请重新提取');const validated=validateBundle(draft.bundle,source),next=copy(loaded.origin.data);next.revision++;next.coreAssets??=[];
  const bundle={format:'tisya.core-bundle/1',id:crypto.randomUUID(),version:1,name:validated.name,members:validated.members.map(member=>{const row=source.objects.find(x=>x.row.id===member.sourceObject).row;return {sourceObject:row.id,sourceRevision:row.rev,sourceType:row.values.类型,kind:coreKind(row,loaded.view.registry),name:member.name,traits:copy(member.traits),growth:copy(member.growth)};}),links:copy(validated.links),source:copy(source),sourceSession:loaded.session.data.id,createdAt:new Date().toISOString()};
  next.coreAssets.push(bundle);await books.write(loaded.origin,next,c.guard);return copy(bundle);
 });}
 async function adaptCoreBundle(book,id,goal='',version=null){return exclusive(async signal=>{const c=capture(),loaded=await load(c),source=await books.read(book);c.guard();check(source.data.kind==='origin','请选择原点书');const candidates=(source.data.coreAssets??[]).filter(x=>x.id===id&&(version===null||x.version===version));check(candidates.length===1,'请明确选择唯一的基点版本');const bundle=candidates[0];check(bundle?.format==='tisya.core-bundle/1','整组基点不存在');
  const reference=book+' / '+bundle.id+'@'+bundle.version,requestGoal='将以下无画风基点资产组完整适配为当前卡的新原点。逐成员保留核心、叙事意义、限制及所选成长的等价意义；为每个成员设计符合当前世界的独立身份、背景及表现。关联只保留已选择的抽象意义，不能直接继承旧会话实际持有、关系、知情、完成任务或经历。此次仅建立新原点，initial.changes=[]，所有档案使用new:编号。每个成员的核心引用为“'+reference+'/”加该成员sourceObject。输出coreMapping，逐条对应每项核心/成长及每条关联，expression须逐字存在于目标档案path字段。\n基点资产组：'+JSON.stringify({format:bundle.format,id:bundle.id,version:bundle.version,name:bundle.name,members:bundle.members,links:bundle.links})+'\n用户补充：'+goal;
  const draft=await genesisLoaded(requestGoal,c,loaded,signal);draft.coreBinding={book,id:bundle.id,version:bundle.version,fingerprint:await digest(bundle)};draft.corePreview=copy({members:bundle.members,links:bundle.links});
  try{validateCoreMapping(draft.proposal,bundle,book);draft.mappingErrors=[];}catch(error){draft.mappingErrors=[error.message];}
  return draft;
 });}
 async function autoInitialize(mode='card'){if(mode==='card')await reviewCardRules();const draft=await cardTemplate(mode);const count=await saveCardTemplate(draft);return {count,notes:draft.proposal.notes};}
 async function analysePreferenceSource(c,loaded,source,signal,extra={}){
  if((loaded.session.data.preferenceDrafts??[]).some(x=>x.source===source.key))return loaded;
  const proposal=await invoke('preferenceAnalysis',{registry:loaded.view.registry,currentRows:loaded.view.rows.filter(r=>r.table==='preferences'),userInput:source.text,...extra,preferenceContext:{world:c.key,worldName:c.label,chatId:getContext().chatId,card:getContext().characters?.[getContext().characterId]?.avatar,user:readPersona()?.id},antiCliche:true},c,signal);
  prepareCommit(loaded.view,proposal,{source:source.key,kind:'preferences',evidence:source.text,allowedTables:['preferences']});
  const next=copy(loaded.session.data);next.revision++;next.preferenceDrafts??=[];for(const batch of (preferenceBatches(proposal,loaded.view.rows).length?preferenceBatches(proposal,loaded.view.rows):[proposal]))next.preferenceDrafts.push({id:crypto.randomUUID(),source:source.key,text:source.text,proposal:batch,status:batch.changes.length?'pending':'empty',createdAt:new Date().toISOString()});
  status('偏好确认',proposal.changes.length?'待确认':'无新候选','第 '+source.floor+' 层 · '+proposal.changes.length+' 项；尚未影响正文');return {...loaded,session:await books.write(loaded.session,next,c.guard)};
 }
 function livePreferenceDraft(loaded,draft){return draft.feedbackId?(loaded.session.data.revisionFeedback??[]).some(f=>f.id===draft.feedbackId):loaded.chain.some(s=>s.key===draft.source);}
 async function recordRevisionFeedback(feedback){return exclusive(async signal=>{const c=capture();if(!c.settings.enabled)return {recorded:false,pending:0};let loaded=await load(c);check(feedback?.format==='tisya.revision/1'&&typeof feedback.id==='string'&&typeof feedback.direction==='string'&&typeof feedback.source==='string','重骰反馈格式无效');check(getContext().chatId===feedback.chatId,'重骰反馈所属聊天已变化');const next=copy(loaded.session.data);next.revision++;next.revisionFeedback??=[];if(next.revisionFeedback.some(f=>f.id===feedback.id))return {recorded:true,pending:0};next.revisionFeedback.push(copy(feedback));loaded={...loaded,session:await books.write(loaded.session,next,c.guard)};
 if(!feedback.remember||!feedback.direction.trim())return {recorded:true,pending:0};
 const proposal=await invoke('preferenceAnalysis',{registry:loaded.view.registry,currentRows:loaded.view.rows.filter(r=>r.table==='preferences'),userInput:feedback.direction,generationType:'reroll-feedback',rerollFeedback:{mode:feedback.mode,selected:feedback.selected,source:feedback.source,completedCount:next.revisionFeedback.filter(f=>f.messageId===feedback.messageId).length,requestPreferenceProposal:true},preferenceContext:{world:c.key,worldName:c.label,chatId:getContext().chatId,card:getContext().characters?.[getContext().characterId]?.avatar,user:readPersona()?.id},antiCliche:true},c,signal);
 prepareCommit(loaded.view,proposal,{source:null,kind:'preferences',evidence:feedback.direction,allowedTables:['preferences']});const saved=copy(loaded.session.data);saved.revision++;saved.preferenceDrafts??=[];for(const batch of (preferenceBatches(proposal,loaded.view.rows).length?preferenceBatches(proposal,loaded.view.rows):[proposal]))saved.preferenceDrafts.push({id:crypto.randomUUID(),source:null,feedbackId:feedback.id,text:feedback.direction,proposal:batch,status:batch.changes.length?'pending':'empty',createdAt:new Date().toISOString()});await books.write(loaded.session,saved,c.guard);status('偏好确认',proposal.changes.length?'待确认':'无新候选','重骰反馈 · '+proposal.changes.length+' 项；尚未影响正文');return {recorded:true,pending:proposal.changes.length};
 });}
 async function analysePreferences({from=1,to=Number.MAX_SAFE_INTEGER,limit=10}={}){return exclusive(async signal=>{
  check(Number.isSafeInteger(from)&&from>=1&&Number.isSafeInteger(to)&&to>=from&&Number.isSafeInteger(limit)&&limit>=1&&limit<=100,'偏好分析楼层或批量无效');const c=capture();let loaded=await load(c),processed=0;
  const queue=loaded.chain.filter(s=>s.role==='user'&&s.floor>=from&&s.floor<=to&&!(loaded.session.data.preferenceDrafts??[]).some(d=>d.source===s.key)).slice(0,limit);
  for(const source of queue){loaded=await analysePreferenceSource(c,loaded,source,signal,{generationType:'history-analysis'});processed++;}
  return {processed,pending:(loaded.session.data.preferenceDrafts??[]).map(d=>confirmedPreferenceDraft(d,c.data.全局偏好,c.key)).filter(x=>x.status==='pending').length};
 });}
 async function assemble(c,loaded,type,signal,{runPlan=true}={}){
  const chain=loaded.chain,lastAI=chain.findLast(s=>s.role==='assistant'),user=chain.findLast(s=>s.role==='user'),tags=[];
  if(c.settings.preferences&&user)loaded=await analysePreferenceSource(c,loaded,user,signal,{generationType:type});
  const currentPersona=readPersona(),binding=loaded.session.data.personaBinding;if(c.settings.continuity==='tables'&&currentPersona){check(binding?.state==='bound'&&binding.personaId===currentPersona.id&&loaded.view.rows.some(row=>row.id===binding.objectId&&row.table==='objects'),'当前原生用户身份尚未初始化或绑定，请在用户身份中核对后继续表单接续');}const allowedRows=personaProjection(loaded.view.rows,binding,currentPersona,{nativeInjected:c.settings.continuity!=='tables'&&!!c.world.context.persona&&!c.world.controller}).filter(r=>r.table!=='native_cells').filter(r=>r.table!=='preferences'||r.preferenceConfirmed===true&&r.values.启用!==false&&preferenceMatches(r,{context:getContext(),world:c,persona:currentPersona,binding})),readView={...loaded.view,rows:allowedRows};
  let found=retrieval(readView,{tags,query:user?.text??'',topK:c.settings.topK});
  if(c.settings.retrieval==='vector'&&c.settings.topK){check(vector,'尚未接入向量驱动；请配置原生向量 API 或选关键词');found.optional=await vector.search({scope:loaded.session.data.id,rows:allowedRows.filter(r=>['objects','facts','events'].includes(r.table)),query:user?.text??'',topK:c.settings.topK,signal,guard:c.guard});c.guard();}
  const selected=[...new Map([...found.mandatory,...found.optional].map(r=>[r.id,r])).values()],strict=c.settings.continuity==='tables',assembled=assembleTableRows(readView,{previousText:archivalText(lastAI?.text??''),userText:user?.text??'',tags,strict,retrieved:selected.map(row=>row.id),actorIds:playerSettings(c,loaded).playerObjects});
  const data={format:'tisya.context/1',source:'本轮表单资料。人物知识与读者可见范围仍以每行 access 为准；读者展示开关不授予人物知识。state.有效性为失效或待确认时，所存值只是最后已知，不是当前确证。',originBook:loaded.origin.name,sessionBook:loaded.session.name,revision:loaded.session.data.revision,rows:assembled.rows,latestTemporary:!strict&&lastAI?{source:lastAI.key,text:archivalText(lastAI.text),tags}:null,unresolvedTags:found.unresolved,explicitRules:c.settings.hardRules,styleRules:c.settings.styleEnabled?styleRules(c.settings):[],preferences:allowedRows.filter(r=>r.table==='preferences'),antiCliche:true,dueChecks:dueChecks(loaded.view,chain),eventResults:stateEventNarrative(loaded.view,lastAI?.key??null),conditionResults:conditionNarrative(loaded,lastAI?.key??null),plot:null};
  if(runPlan&&c.settings.plot)data.plot=await invoke('plotAdvance',{...data,phase:'plan',nativeState:nativeSnapshot(loaded.view.rows,{context:getContext()}),registry:loaded.view.registry,...planContext(loaded,playerSettings(c,loaded)),userInput:user?.text??'',generationType:type},c,signal);
  if(data.plot){check(typeof data.plot.goal==='string'&&Array.isArray(data.plot.beats)&&Array.isArray(data.plot.pendingChoices)&&Array.isArray(data.plot.constraints),'剧情推进产物字段不完整');check(!Object.hasOwn(data.plot,'changes'),'剧情推进不得产生事实写入');for(const beat of data.plot.beats)check(beat&&typeof beat.proposal==='string'&&Array.isArray(beat.basis)&&beat.basis.every(x=>typeof x==='string')&&typeof beat.condition==='string','剧情节拍须有提案、依据和触发条件');for(const name of ['pendingChoices','constraints'])check(data.plot[name].every(x=>typeof x==='string'),'剧情设计列表内容无效');}
  let entries=[],text;
  if(c.settings.injection==='worldbook'){
   check(worldbook.available(),'当前宿主缺少原生世界书扫描事件，请更新宿主或选择“直接组装”');
   const rows=assembled.candidates.filter(r=>r.table!=='preferences');
   const temporary=!strict&&lastAI?{text:archivalText(lastAI.text)}:null;
   entries=worldbookEntries({rows,registry:loaded.view.registry,scope:loaded.session.data.id,bookName:loaded.session.name,tags,forcedIds:found.optional.map(r=>r.id),temporary,due:data.dueChecks});
  }
  const ruleVersion=await selectedRulePolicy(c);const slots={state:{rulePolicy:ruleVersion,source:data.source,revision:data.revision,eventResults:data.eventResults,rows:c.settings.injection==='direct'?data.rows.filter(r=>r.table!=='events'&&r.table!=='preferences'):[],nativeState:nativeSnapshot(loaded.view.rows,{context:getContext(),messageIndex:lastAI?lastAI.floor-1:getContext().chat.length-1}),dueChecks:data.dueChecks,unresolvedTags:data.unresolvedTags},preferences:{explicit:data.explicitRules,style:stylePrompt(data.styleRules),rows:data.preferences},plan:data.plot,genesis:loaded.session.data.blueprint??null};
  if(c.settings.injection==='direct')slots.archive={rows:data.rows.filter(r=>r.table==='events'),latestTemporary:data.latestTemporary};
  const instructions=(c.settings.nativeBridge?'原生变量由表单辅助填录，插件自动生成 UpdateVariable 并交给原 MVU；本轮正文禁止再次输出变量命令，vars 留空。\n':'')+(c.settings.nativeBridge?NARRATIVE_TAGS.replace('正文变量块继续沿用原卡与当前预设约定。',''):NARRATIVE_TAGS)+'\nSTATE.rulePolicy 是玩家确认的当前会话规则版本：optimize 仅在指定原文范围内使用 after，keep 保留原规则；不改历史事实、原生脚本或未涉及的规则。资料槽按预处理路由使用；剧情方案不是事实，表单数据保留来源权限与版本。原生 user 的身份说明属于定义，不应覆盖后来有来源的会话状态；原生引用只能取已给定的实际快照，缺失字段保持未知。历史锚点只在具备相应经历和知识权限时成为默契，不把读者知道的内心解释强加给人物。';text=instructions+'\n\n'+materialSlots(slots);
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
 async function initializeCaptured(c,{originBook=c.settings.originBook,sessionBook=c.settings.sessionBook,fresh=false,removeMissing=[]}={}){
  const context=getContext(),card=context.characters?.[context.characterId]?.avatar;check(card&&!context.groupId,'请先在单角色卡会话中建立原点档案；群组复用需明确选择角色来源');
  const suffix=(await digest(c.key)).slice(0,12),originSuffix=(await digest(card)).slice(0,12),freshSuffix=fresh?' · 重建 '+crypto.randomUUID():'';let origin,session;c.guard();
  if(originBook)origin=await books.read(originBook);else{
   const candidates=[];for(const name of fresh?[]:await books.cardBooks(card))if(name.startsWith('缇斯亚原点 · ')){const candidate=await books.read(name);if(candidate.data.kind==='origin')candidates.push(candidate);}
   check(candidates.length<=1,'此角色卡绑定了多本原点书，请填写要复用的书名');
   const name='缇斯亚原点 · '+context.characters[context.characterId].name+' · '+originSuffix+freshSuffix;
   origin=candidates[0]??((await books.names()).includes(name)?await books.read(name):await books.create('origin',card,name));
  }
  c.guard();check(origin.data.kind==='origin','所选书不是原点书');await books.bindOrigin(card,origin.name,c.guard,{removeMissing});
  if(sessionBook)session=await books.read(sessionBook);else {const name='缇斯亚存档 · '+context.chatId+' · '+suffix+freshSuffix;session=(await books.names()).includes(name)?await books.read(name):await books.create('session',c.key,name);}
  c.guard();check(session.data.kind==='session'&&session.data.owner===c.key,'会话存档不能绑定到另一个会话');
  if(!session.data.origin){let next=copy(session.data);next.revision++;next.origin=origin.name;next.pins=fresh?[]:copy(c.settings.originPins);next.registry=copy(origin.data.registry);next.schemaPinned=true;const opening=matchingOpening(origin.data,card,readPersona(),cardAIMaterials(getContext().characters[getContext().characterId]));if(opening&&!pendingFork&&!next.pins.length)next=applyOpening(origin.data,next,opening,{avatar:card,persona:readPersona(),cardSource:cardAIMaterials(getContext().characters[getContext().characterId])});session=await books.write(session,next,c.guard);}else check(session.data.origin===origin.name,'此存档已关联另一原点书，请选择原来的原点书');
  if(c.settings.originBook!==origin.name||c.settings.sessionBook!==session.name){const data=copy(c.data);data.worlds[c.key].tables={...c.settings,...(fresh?{originPins:[],playerObjects:[],focusObjects:[],nativeBridge:false}:{}),originBook:origin.name,sessionBook:session.name};await store.save(data,c.revision,c.key);}
  status('初始化','已保存','原点书绑定角色卡；独立存档未替换数据库绑定');return {originBook:origin.name,sessionBook:session.name};
 }
 async function initialize({originBook,sessionBook}={}){return exclusive(()=>initializeCaptured(capture(),{originBook,sessionBook}));}
 async function storageRecovery(){const c=capture(),names=await books.names();c.guard();check(Array.isArray(names),'宿主未返回世界书列表');const missing=[...new Set([c.settings.originBook,c.settings.sessionBook].filter(name=>name&&!names.includes(name)))];return {world:c.key,revision:c.revision,originBook:c.settings.originBook,sessionBook:c.settings.sessionBook,missing};}
 async function recoverMissingStorage(expected){return exclusive(async()=>{const c=capture(),current=await storageRecovery();c.guard();check(expected&&sameDefinition(current,expected)&&current.missing.length,'存档缺失状态已变化，请重新核对；未重建');const result=await initializeCaptured(c,{originBook:'',sessionBook:'',fresh:true,removeMissing:current.missing});worldbook.clear();setPrompt('');latest=null;return {...result,previous:{originBook:current.originBook,sessionBook:current.sessionBook},missing:current.missing};});}
 async function ensureInitialized({scope='manual'}={}){const c=capture();if(!c.settings.enabled||c.settings.originBook&&c.settings.sessionBook)return;return exclusive(()=>initializeCaptured(c),{scope});}
 async function inspect(){const c=capture(),loaded=await load(c);return {settings:c.settings,registry:loaded.view.registry,rows:loaded.view.rows,anchors:loaded.view.anchors,archived:loaded.view.archived.size,sourceCount:loaded.chain.filter(s=>s.role==='assistant').length,origin:loaded.origin.data,session:loaded.session.data,preferenceDrafts:(loaded.session.data.preferenceDrafts??[]).map(d=>confirmedPreferenceDraft(d,c.data.全局偏好,c.key)).filter(d=>livePreferenceDraft(loaded,d)),jobs:copy(jobs)};}
 async function review(){
  const c=capture(),projection=await storySources(getContext().chat,'normal',projectToolTurns),chain=projection.chain;c.guard();let view=null,origin=null,session=null,error='';
  if(c.settings.originBook&&c.settings.sessionBook){try{origin=await books.read(c.settings.originBook);session=await books.read(c.settings.sessionBook);check(origin.data.kind==='origin'&&session.data.kind==='session'&&session.data.owner===c.key,'当前会话存档绑定不匹配');assertStoryLedger(origin.data,session.data,projection);view=project(origin.data,session.data,chain.map(s=>s.key));}catch(e){error=e.message;}}
  else error='尚未建立完整存档；开始补录时会自动创建／复用。';
  c.guard();const last=chain.findLast(s=>s.role==='assistant');return {world:c.key,chatStamp:c.chat,settings:c.settings,registry:view?.registry??defaultRegistry(),rows:view?.rows??[],blueprint:session?.data.blueprint??null,storageReady:!!view,storageError:error,jobs:copy(jobs),persona:readPersona(),personaBinding:copy(session?.data.personaBinding??null),history:chain.map(s=>({key:s.key,floor:s.floor,role:s.role,confirmed:chain.some(u=>u.role==='user'&&u.index>s.index),preview:s.text.slice(0,100),archived:view?view.archived.has(s.key):null,pending:view?.archived.has(s.key)?[]:view?.commits.filter(c=>c.source===s.key).flatMap(c=>c.pending??[])??[],latest:s.key===last?.key,hasMemory:!!memoryBlock(s.text)}))};
 }
 async function lifecycle(){
  const data=await review(),c=capture(),card=getContext().characters?.[getContext().characterId];
  let opening=null,cores=0;
  if(data.storageReady){const origin=await books.read(c.settings.originBook);c.guard();opening=matchingOpening(origin.data,card?.avatar,readPersona(),cardAIMaterials(card));cores=(origin.data.coreAssets??[]).length;}
  return {avatar:card?.avatar??null,character:card?.name??null,persona:data.persona,binding:data.personaBinding,originBook:c.settings.originBook,sessionBook:c.settings.sessionBook,storageReady:data.storageReady,storageError:data.storageError,opening:opening?{id:opening.id,revision:opening.revision}:null,cores,rows:data.rows.length,confirmed:data.history.filter(x=>x.role==='assistant'&&x.confirmed).length,archived:data.history.filter(x=>x.role==='assistant'&&x.archived).length,enabled:c.settings.enabled,archive:c.settings.archive};
 }
 async function archive({includeLatest=false,range=null,scope='manual'}={}){return exclusive(async signal=>{const c=capture();if(range)check(Number.isSafeInteger(range.from)&&Number.isSafeInteger(range.to)&&range.from>=1&&range.to>=range.from&&Number.isSafeInteger(range.limit)&&range.limit>=1&&range.limit<=100,'楼层范围或批量数无效');let loaded=await load(c);loaded=await archiveLoaded(c,loaded,signal,includeLatest,range);return {archived:loaded.view.archived.size,pending:loaded.view.commits.filter(x=>x.complete===false&&!loaded.view.archived.has(x.source)).flatMap(x=>x.pending??[]),revision:loaded.session.data.revision};},{scope});}
 async function scan(){const c=capture(),loaded=await load(c),last=loaded.chain.findLast(s=>s.role==='assistant');return loaded.chain.map(s=>({floor:s.floor,role:s.role,preview:s.text.slice(0,100),archived:loaded.view.archived.has(s.key),pending:loaded.view.archived.has(s.key)?[]:loaded.view.commits.filter(c=>c.source===s.key).flatMap(c=>c.pending??[]),latest:s.key===last?.key,hasMemory:!!memoryBlock(s.text)}));}
 async function importHistory(text,{label='手写历史',worldTime=null}={}){return exclusive(async signal=>{const c=capture(),loaded=await load(c);check(typeof text==='string'&&text.trim(),'请填写历史原文');const hash=await digest(text);check(!loaded.session.data.commits.some(x=>x.importSource?.hash===hash),'这份历史已导入，不能重复入账');const proposal=await invoke('historyImport',{registry:loaded.view.registry,currentRows:loaded.view.rows,historyText:historyEvidence(text),sourceHistory:{text,label,worldTime},label,worldTime},c,signal);return {format:'tisya.history-draft/1',text,label,worldTime,hash,proposal,world:c.key,originRevision:loaded.origin.data.revision,sessionRevision:loaded.session.data.revision};});}
 async function saveHistory(draft){return exclusive(async()=>{const c=capture(),loaded=await load(c);check(draft.format==='tisya.history-draft/1'&&draft.world===c.key&&draft.originRevision===loaded.origin.data.revision&&draft.sessionRevision===loaded.session.data.revision,'历史草稿依据已变化，请重新核对');check(await digest(draft.text)===draft.hash,'历史原文已改变，请重新生成草稿');check(!loaded.session.data.commits.some(x=>x.importSource?.hash===draft.hash),'这份历史已经导入');const result=await commit(c,loaded,draft.proposal,{source:null,kind:'import',evidence:historyEvidence(draft.text),worldTime:draft.worldTime,allowedTables:loaded.view.registry.tables.filter(t=>t.owner==='archive'&&t.id!=='native_cells').map(t=>t.id),importSource:{label:draft.label,text:draft.text,hash:draft.hash,worldTime:draft.worldTime}});return result.session.data.revision;});}
 async function cardTemplate(mode='card'){if(mode==='card')await reviewCardRules();return exclusive(async signal=>{
  check(['card','generic','reuse'].includes(mode),'初始化方式无效');const c=capture(),loaded=await load(c);let material='',userSource=null,userChange=null,sourceMaterials=null;
  if(mode==='card'){const context=getContext(),card=context.characters?.[context.characterId];material=cardBasis(context);const entries=bookAIMaterials(await books.materials(card.avatar,{includeDisabled:true}));c.guard();sourceMaterials={card:cardAIMaterials(card),books:copy(entries),history:copy(loaded.chain)};material+='\n\n'+entries.filter(x=>x.enabled!==false).map(x=>'来源：'+x.book+' / '+x.entry+'\n'+x.content).join('\n\n');userSource=readPersona();if(userSource){check(userSource.id,'当前用户人设缺少稳定标识，请先选择原生用户人设');userChange={...personaObjectChange(userSource,loaded.view.rows,loaded.session.data.personaBinding),evidence:personaDefinition(userSource)};material+='\n\n'+personaDefinition(userSource);}}
  const originalBasis=material,ruleVersion=mode==='card'?await selectedRulePolicy(c):null;material+=policyEvidence(ruleVersion);
  const result=mode==='card'?await invoke('templateInit',{sourceCard:material,sourceCardRaw:sourceMaterials.card,sourceBooks:sourceMaterials.books,sourceHistory:sourceMaterials.history,sourceUser:userSource?{id:userSource.id,name:userSource.name,description:userSource.description,objectId:userChange.id}:null,registry:loaded.view.registry,currentRows:loaded.view.rows,goal:'按当前角色卡和原生用户定义补齐模板与底档。已有 ID、名称及当前会话进度保持；已有字段只有原文支持的修正才提交，未变化项省略。定义、职责和硬性约束须完整且强度不变；只有 rulePolicy 中玩家已确认的 optimize 差异使用 after，其余原文保留；keep 的原始冲突并存且不再反复提醒。逐项读取完整原卡 AI 须知、绑定资料和历史原文，先路由再填表。原卡、原生用户及历史中用户明确给出的开局定义先建立 user 与每个独立人物的原点档案，并填写有依据的初始关系、状态和知情。启动提示不是剧情，不能把其后的开局设定全部推迟到补录。后续历史事件、关系变化和成长由 historyImport 按楼层补录，不倒灌成开局；全文保留。关闭资料与示例保持原文但不作为生效定义或已发生事件；不用定义初值重置当前状态。'},c,signal):{registry:mode==='reuse'?copy(loaded.origin.data.registry):copy(loaded.view.registry),base:{changes:[]},initial:{changes:[]},notes:[mode==='reuse'?'复用卡模板；原点对象版本在设置与绑定中选择':'使用通用模板；后续归档按来源扩展']};
  if(userChange){check(Array.isArray(result.base?.changes),'初始化草稿缺少原点档案');check(!result.base.changes.some(x=>x.id===userChange.id||x.table==='objects'&&x.values?.名称===userSource.name),'模型重复生成了原生 user 档案，请修正草稿来源后重试');result.base.changes.unshift(userChange);}
  result.registry??=reconcileProposal(loaded.view.registry,{templates:result.templates??[],schemaChanges:result.schemaChanges??[],changes:result.base?.changes??[],currentRows:loaded.view.rows}).registry;compatibleRegistry(result.registry,loaded.view.registry);await repairInitializationNames(result,loaded.view.rows,userChange?.id,[material,...(sourceMaterials?.history??[]).filter(x=>x.role==='user').map(x=>x.text)].join('\n\n'),c,signal);check(result.base&&result.initial&&Array.isArray(result.notes),'初始化草稿不完整');return {format:'tisya.card-template/1',world:c.key,chat:c.chat,basis:material,originalBasis,rulePolicy:ruleVersion,sourceMaterials,mode,userSource,userObjectId:userChange?.id??null,originRevision:loaded.origin.data.revision,sessionRevision:loaded.session.data.revision,proposal:result};
 });}
 async function saveCardTemplate(draft){return exclusive(async()=>{
  const c=capture(),loaded=await load(c);check(draft.format==='tisya.card-template/1'&&draft.world===c.key&&draft.chat===c.chat&&draft.originRevision===loaded.origin.data.revision&&draft.sessionRevision===loaded.session.data.revision,'初始化依据已变化，请重新读取');
  if(draft.mode==='card'){const context=getContext(),card=context.characters?.[context.characterId],entries=bookAIMaterials(await books.materials(card.avatar,{includeDisabled:true}));c.guard();const currentUser=readPersona();check(personaStamp(currentUser)===personaStamp(draft.userSource??null),'用户身份或设定已改变，请重新生成初始化草稿');const actual=cardBasis(context)+'\n\n'+entries.filter(x=>x.enabled!==false).map(x=>'来源：'+x.book+' / '+x.entry+'\n'+x.content).join('\n\n')+(currentUser?'\n\n'+personaDefinition(currentUser):'');check(actual===(draft.originalBasis??draft.basis),'角色卡或绑定定义已改变，请重新生成初始化草稿');if(draft.sourceMaterials){check(JSON.stringify(cardAIMaterials(card))===JSON.stringify(draft.sourceMaterials.card)&&JSON.stringify(entries)===JSON.stringify(draft.sourceMaterials.books)&&JSON.stringify(loaded.chain)===JSON.stringify(draft.sourceMaterials.history),'原卡或历史资料已改变，请重新生成初始化草稿');}}
  check(JSON.stringify(draft.rulePolicy??null)===JSON.stringify(draft.mode==='card'?await selectedRulePolicy(c):null),'规则选择已改变，请重新生成初始化草稿');
  if(draft.userSource){const user=draft.proposal.base.changes.find(x=>x.id===draft.userObjectId);check(user?.values.名称===draft.userSource.name&&user?.values.描述===draft.userSource.description,'原生用户档案须保持导入原文；修改请使用用户身份绑定预览');}
  const p=draft.proposal,reg=compatibleRegistry(copy(p.registry),loaded.view.registry);const options={source:null,kind:'init',evidence:[draft.basis,...(draft.sourceMaterials?.history??[]).filter(x=>x.role==='user').map(x=>x.text)].join('\n\n'),allowedTables:['objects','facts']};
  check(!(p.base.pending?.length||p.initial.pending?.length),'初始化仍有阻塞项，请保留草稿并核对，尚未保存');
  const base=prepareCommit({...loaded.view,registry:reg,last:null},p.base,options),origin=copy(loaded.origin.data);origin.revision++;origin.registry=base.registry;
  for(const change of base.commit.changes){change.after.rev=Math.max(change.after.rev,...origin.bases.filter(b=>b.id===change.id).map(b=>b.rev+1));origin.bases.push(copy(change.after));}
  const session=copy(loaded.session.data);session.revision++;session.registry=copy(base.registry);session.schemaPinned=true;const pins=new Map((session.pins??[]).map(pin=>[pin.slice(0,pin.lastIndexOf('@')),pin]));for(const ch of base.commit.changes)pins.set(ch.id,ch.id+'@'+ch.after.rev);session.pins=[...pins.values()];
  const ids=new Map(p.base.changes.map((op,i)=>[op.id,base.commit.changes[i].id])),initial=copy(p.initial);for(const op of initial.changes){mapRowReferences({table:op.table,values:op.values},base.registry,id=>ids.get(id)??id);for(const field of ['readers','knowers'])if(op.access?.[field])op.access[field]=op.access[field].map(id=>ids.get(id)??id);}
  if(draft.userSource){const objectId=ids.get(draft.userObjectId)??draft.userObjectId;check(origin.bases.some(x=>x.id===objectId),'用户档案在草稿中被删除，未保存');session.personaBinding={objectId,personaId:draft.userSource.id,state:'bound',at:new Date().toISOString()};}
  for(const op of initial.changes){const prior=loaded.view.rows.find(row=>row.id===op.id);check(!prior||prior.source===null||Object.entries(op.values).every(([key,value])=>JSON.stringify(prior.values[key])===JSON.stringify(value)),'初始化不能覆盖已有来源的会话进度；请按正文补录或人工修订');}
  const view={...loaded.view,registry:base.registry,rows:base.rows},filled=prepareCommit(view,initial,{...options,allowedTables:base.registry.tables.filter(t=>t.owner==='archive'&&!['objects','facts','events'].includes(t.id)).map(t=>t.id)});
  filled.commit.changes.unshift(...base.commit.changes.map(ch=>({id:ch.id,before:ch.before,origin:ch.id+'@'+ch.after.rev})));filled.commit.anchors.unshift(...base.commit.anchors);for(const anchor of filled.commit.anchors)anchor.group=filled.commit.id;origin.registry=mergeRegistries(origin.registry,filled.registry);session.registry=copy(origin.registry);filled.commit.registry=copy(origin.registry);filled.commit.contextSource=null;session.commits.push(filled.commit);project(origin,session,loaded.chain.map(x=>x.key));session.templateInitialization={mode:draft.mode,at:new Date().toISOString(),notes:copy(p.notes),registryVersion:origin.revision};
  if(draft.mode==='card'&&!loaded.view.commits.some(x=>x.kind!=='init')){const opening=registerOpening(origin,session,filled.commit,{avatar:getContext().characters[getContext().characterId].avatar,persona:draft.userSource??null,cardSource:cardAIMaterials(getContext().characters[getContext().characterId])});session.openingBinding={id:opening.id,revision:opening.revision,avatar:opening.avatar,at:opening.createdAt};}
  await books.write(loaded.origin,origin,c.guard);try{await books.write(loaded.session,session,c.guard);}catch(e){throw Error('卡模板与原点候选已保存，本会话初始化未确认：'+e.message);}
  status('角色卡初始化','已保存','模板绑定角色卡，初始进度仅写入当前存档');return base.commit.changes.length+filled.commit.changes.length;
 });}
 async function assertIdentityCompatible(id){const c=capture(),ref=getContext().powerUserSettings?.persona_descriptions?.[id]?.tisyaOrigin;if(!ref)return true;const source=await books.read(ref.book);c.guard();check(source.data.kind==='origin'&&source.data.id===ref.originId&&source.data.bases.some(r=>r.id===ref.id&&r.rev===ref.rev),'身份引用的原点已不存在，请重新选择');if(c.settings.originBook)check(c.settings.originBook===ref.book,'该身份来自另一世界，请先从基点适配到当前世界');else{const avatar=getContext().characters?.[getContext().characterId]?.avatar;if(avatar&&!getContext().groupId){const bound=await books.cardBooks(avatar);c.guard();check(bound.includes(ref.book),'此角色卡未关联该原点；请先适配或在世界维护明确选择原点');}else check(false,'请选择已有原点的角色或群聊存档，再使用档案身份');}return true;}
 async function bindIdentitySelection(id){return exclusive(async()=>{const c=capture(),current=readPersona(),ref=current?.descriptor?.tisyaOrigin;check(current?.id===id,'活动用户身份已改变');if(!ref||!c.settings.sessionBook)return null;await assertIdentityCompatible(id);c.guard();const loaded=await load(c),binding=loaded.session.data.personaBinding;check(binding?.state!=='writing','原点绑定尚未完成，请先继续核对');if(binding?.state==='bound'&&binding.personaId===id&&binding.objectId===ref.id&&binding.origin?.rev===ref.rev)return copy(binding);const pins=(loaded.session.data.pins??[]).filter(p=>p.slice(0,p.lastIndexOf('@'))!==ref.id);pins.push(ref.id+'@'+ref.rev);const next=withOriginSelection(loaded,pins);next.personaBinding={state:'bound',personaId:id,objectId:ref.id,origin:copy(ref),at:new Date().toISOString()};await books.write(loaded.session,next,c.guard);return copy(next.personaBinding);});}
 async function identityCores(){const c=capture(),out=[];for(const name of await books.names()){if(!name.startsWith('缇斯亚原点 · '))continue;const book=await books.read(name);c.guard();if(book.data.kind!=='origin')continue;for(const core of book.data.coreAssets??[])out.push({...copy(core),book:name});}return out;}
 async function identityOrigins(){const c=capture(),out=[];for(const name of await books.names()){if(!name.startsWith('缇斯亚原点 · '))continue;const book=await books.read(name);c.guard();if(book.data.kind!=='origin')continue;for(const row of book.data.bases)if(row.table==='objects'&&isObjectType(book.data.registry,row,'character'))out.push({book:name,originId:book.data.id,id:row.id,rev:row.rev,name:row.values.名称,world:row.values.世界??'',description:row.values.描述??''});}return out;}
 async function previewIdentityOrigin(ref){return exclusive(async()=>{const c=capture(),source=await books.read(ref.book);c.guard();check(source.data.kind==='origin','请选择原点档案');const row=source.data.bases.find(r=>r.id===ref.id&&r.rev===ref.rev);const current=readPersona();return {format:'tisya.origin-persona/1',...personaDraft(row,source.data.registry,current),reference:{book:source.name,originId:source.data.id,id:row.id,rev:row.rev},world:c.key,chat:c.chat,originStamp:source.stamp};});}
 async function saveIdentityOrigin(input){const draft=copy(input);return exclusive(async()=>{
  const c=capture();check(draft.format==='tisya.origin-persona/1'&&draft.world===c.key&&draft.chat===c.chat,'身份绑定作用域已经变化');const source=await books.read(draft.reference.book);c.guard();check(source.stamp===draft.originStamp&&source.data.id===draft.reference.originId,'原点版本已改变，请重新预览');check(source.data.bases.some(r=>r.id===draft.reference.id&&r.rev===draft.reference.rev),'原点对象已不存在');check(!c.settings.originBook||c.settings.originBook===source.name,'此原点属于另一世界，请先按基点适配到当前世界');check(personaStamp(readPersona())===personaStamp(draft.before),'用户身份已改变，请重新预览');check(persona,'原生身份接口尚未接入');
  if(c.settings.sessionBook){let loaded=await load(c);check(loaded.session.data.personaBinding?.state!=='writing','上次绑定尚未完成，请先继续核对');const pins=(loaded.session.data.pins??[]).filter(p=>p.slice(0,p.lastIndexOf('@'))!==draft.reference.id);pins.push(draft.reference.id+'@'+draft.reference.rev);const next=withOriginSelection(loaded,pins);next.personaBinding={state:'writing',objectId:draft.objectId,personaId:draft.personaId,name:draft.name,description:draft.description,before:copy(draft.before),origin:copy(draft.reference),at:new Date().toISOString()};loaded={...loaded,session:await books.write(loaded.session,next,c.guard)};return finishUserBinding(c,loaded,next.personaBinding);}
  const saved=await persona.write({before:draft.before,name:draft.name,description:draft.description,origin:draft.reference},c.guard);return {reference:draft.reference,personaId:saved.id};
 });}

 async function createIdentityDraft({goal,core=null}){check(typeof goal==='string'&&goal.trim(),'请填写点子或适配要求');return exclusive(async signal=>{const c=capture(),loaded=await load(c);let fixed=null;if(core){const book=await books.read(core.book);c.guard();const row=book.data.coreAssets?.find(x=>x.id===core.id&&x.version===core.version);check(row,'基点固定版本不存在');fixed={...copy(core),data:copy(row),stamp:book.stamp};}const prompt='设计恰好一个新的用户原点人物完整档案，可新增配套物品、地点或事实，不新增其他人物。用户钉死的要求必须保留，新设计明确写入蓝图说明。只允许 artifacts.base 新增 objects/facts，不改已有对象，不写会话进度；artifacts.initial.changes 必须为空，不生成原生配置或状态系统。字段采用当前世界注册表，人物身份、外貌、性格、背景及定义完整。角色卡是目标世界参考，不能把卡中人物误当用户。'+(fixed?'固定基点（核心引用必须为 '+fixed.book+' / '+fixed.id+'@'+fixed.version+'）：'+JSON.stringify(fixed.data):'')+'\n用户点子和要求：'+goal;const draft=await genesisLoaded(prompt,c,loaded,signal);draft.format='tisya.identity-creation/1';draft.chat=c.chat;draft.coreSource=fixed;draft.raw=progress?.text??'';if(fixed){const people=draft.proposal.artifacts.base.changes.filter(x=>x.table==='objects'&&isObjectType(draft.proposal.artifacts.registry,x,'character'));check(people.length===1,'用户建档须有且仅有一个主体人物，请核对原答');people[0].values.核心引用=fixed.book+' / '+fixed.id+'@'+fixed.version;}return draft;});}
 async function saveIdentityDraft(input){const draft=copy(input);return exclusive(async()=>{const c=capture(),loaded=await load(c);check(draft.format==='tisya.identity-creation/1'&&draft.world===c.key&&draft.chat===c.chat&&draft.originRevision===loaded.origin.data.revision&&draft.sessionRevision===loaded.session.data.revision&&draft.basisCard===cardBasis(getContext()),'建档依据已变化，请重新生成或核对');if(draft.coreSource){const b=await books.read(draft.coreSource.book);c.guard();check(b.stamp===draft.coreSource.stamp,'基点版本已改变');}const p=validateBlueprint(draft.proposal,loaded.origin.data.registry);check(!p.artifacts.initial.changes.length&&!p.artifacts.stateSystem&&!Object.values(p.artifacts.native??{}).some(x=>x.length),'用户建档不能修改会话进度或原生配置');check(p.artifacts.base.changes.length&&p.artifacts.base.changes.every(x=>x.expected===0&&!loaded.view.rows.some(r=>r.id===x.id)),'只可创建新原点，不覆盖已有档案');const prepared=prepareCommit({...loaded.view,registry:p.artifacts.registry,last:null},p.artifacts.base,{source:null,kind:'genesis',evidence:[draft.goal,draft.basisCard,...p.blueprint.decisions].join('\n'),allowedTables:['objects','facts']});const people=prepared.commit.changes.filter(x=>x.after.table==='objects'&&isObjectType(prepared.registry,x.after,'character'));check(people.length===1,'用户建档须有且仅有一个主体人物');if(draft.coreSource)check(people[0].after.values.核心引用===draft.coreSource.book+' / '+draft.coreSource.id+'@'+draft.coreSource.version,'基点固定引用不能被草稿改写');const next=copy(loaded.origin.data);next.revision++;next.registry=mergeRegistries(next.registry,prepared.registry);next.bases.push(...prepared.commit.changes.map(x=>x.after));await books.write(loaded.origin,next,c.guard);return prepared.commit.changes.filter(x=>isObjectType(prepared.registry,x.after,'character')).map(x=>({book:loaded.origin.name,originId:next.id,id:x.id,rev:x.after.rev,name:x.after.values.名称}));});}
 async function previewUserBinding(objectId){return exclusive(async()=>{const c=capture(),loaded=await load(c),current=readPersona();check(loaded.session.data.personaBinding?.state!=='writing','上次绑定尚未完成，请先继续核对');return {format:'tisya.persona-draft/1',...personaDraft(loaded.view.rows.find(r=>r.id===objectId),loaded.view.registry,current),world:c.key,chat:c.chat,sessionRevision:loaded.session.data.revision};});}
 async function finishUserBinding(c,loaded,intent){
  check(persona,'宿主用户人设写入接口未接入');let actual=readPersona();
  const desired=actual?.id===intent.personaId&&actual.name===intent.name&&actual.description===intent.description&&actual.storedName===intent.name&&actual.descriptor.description===intent.description&&(!intent.origin||JSON.stringify(actual.descriptor.tisyaOrigin)===JSON.stringify(intent.origin));
  check(desired||personaStamp(actual)===personaStamp(intent.before),'原生人设已另行修改，不能继续旧绑定；请核对后重新操作');
  actual=await persona.write({before:actual,name:intent.name,description:intent.description,origin:intent.origin},c.guard);
  const next=copy(loaded.session.data);next.revision++;next.personaBinding={objectId:intent.objectId,personaId:actual.id,state:'bound',...(intent.origin?{origin:copy(intent.origin)}:{}),at:new Date().toISOString()};
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
 async function genesisLoaded(goal,c,loaded,signal){check(typeof goal==='string'&&goal.trim(),'请填写创世要求');const basisCard=cardBasis(getContext());const proposal=await invoke('tableGenesis',{goal,sourceCard:basisCard,registry:loaded.view.registry,currentRows:loaded.view.rows,stateSystem:{contract:STATE_SYSTEM_CONTRACT,catalog:copy(loaded.origin.data.状态目录??null)}},c,signal);validateBlueprint(proposal,loaded.origin.data.registry);if(proposal.artifacts.stateSystem)validateGenesisStateSystem(proposal.artifacts.stateSystem,loaded.origin);return {format:'tisya.genesis-draft/2',goal,basisCard,proposal,world:c.key,originRevision:loaded.origin.data.revision,sessionRevision:loaded.session.data.revision};}
 async function genesis(goal){return exclusive(async signal=>{const c=capture(),loaded=await load(c);return genesisLoaded(goal,c,loaded,signal);});}
 async function saveGenesis(input){const draft=copy(input);return exclusive(async()=>{const c=capture(),loaded=await load(c);check(draft.format==='tisya.genesis-draft/2','请重新生成创世蓝图');check(draft.basisCard===cardBasis(getContext()),'角色卡资料已修改，请重新生成创世草稿');check(draft.world===c.key&&draft.originRevision===loaded.origin.data.revision&&draft.sessionRevision===loaded.session.data.revision,'创世草稿依据已变化，请重新生成或载入');
  const p=validateBlueprint(draft.proposal,loaded.origin.data.registry);if(p.artifacts.native&&Object.values(p.artifacts.native).some(x=>x.length)){check(nativeConfig,'原生配置接口尚未接入');p.artifacts.native=nativeConfig.resolveTargets(p.artifacts.native);}
  let coreMapping=null;if(draft.coreBinding){const binding=draft.coreBinding,source=await books.read(binding.book);c.guard();const bundle=source.data.coreAssets?.find(x=>x.id===binding.id&&x.version===binding.version);check(bundle?.format==='tisya.core-bundle/1'&&await digest(bundle)===binding.fingerprint,'适配所依据的基点版本已改变');check(!p.blueprint.unresolved.length,'整组适配仍有未定事项，请先核对');coreMapping=validateCoreMapping(p,bundle,binding.book);}
  const stateCatalog=p.artifacts.stateSystem?validateGenesisStateSystem(p.artifacts.stateSystem,loaded.origin):null;
  const evidence=[draft.goal,draft.basisCard,...p.blueprint.decisions].filter(Boolean).join('\n\n'),reg=p.artifacts.registry;
  const prepared=prepareCommit({...loaded.view,registry:reg,last:null},p.artifacts.base,{source:null,kind:'genesis',evidence,allowedTables:['objects','facts']});
  const next=copy(loaded.origin.data);next.revision++;next.registry=mergeRegistries(loaded.origin.data.registry,prepared.registry);for(const change of prepared.commit.changes){change.after.rev=Math.max(change.after.rev,...next.bases.filter(b=>b.id===change.id).map(b=>b.rev+1));next.bases.push(change.after);}
  if(stateCatalog)next.状态目录=stateCatalog;
  const session=copy(loaded.session.data);session.revision++;session.registry=copy(next.registry);session.schemaPinned=true;session.pins=[...new Set([...(session.pins??[]),...prepared.commit.changes.map(x=>x.id+'@'+x.after.rev)])];
  const pinned=new Map();for(const pin of session.pins)pinned.set(pin.slice(0,pin.lastIndexOf('@')),pin);session.pins=[...pinned.values()];
  const ids=new Map(p.artifacts.base.changes.map((op,i)=>[op.id,prepared.commit.changes[i].id])),initial=copy(p.artifacts.initial);for(const op of initial.changes){mapRowReferences({table:op.table,values:op.values},reg,id=>ids.get(id)??id);for(const field of ['readers','knowers'])if(op.access?.[field])op.access[field]=op.access[field].map(id=>ids.get(id)??id);}
  if(coreMapping){const ref=id=>{const row=prepared.commit.changes.find(x=>x.id===ids.get(id));check(row,'适配映射原点版本不存在');return row.id+'@'+row.after.rev;};next.coreAdaptations??=[];next.coreAdaptations.push({id:crypto.randomUUID(),core:copy(draft.coreBinding),members:coreMapping.members.map(row=>({...copy(row),object:ref(row.object)})),links:coreMapping.links.map(row=>({...copy(row),targets:row.targets.map(target=>({...copy(target),object:ref(target.object)}))})),createdAt:new Date().toISOString()});}
  const initialView={...loaded.view,registry:prepared.registry,rows:prepared.rows};
  if(stateCatalog){const states=p.artifacts.stateSystem.initial??[],seen=new Set();for(const [i,item]of states.entries()){
   const ownerId=ids.get(item.owner)??item.owner;check(!seen.has(ownerId),'创世数值初值重复人物');seen.add(ownerId);check(typeof item.evidence==='string'&&item.evidence.trim()&&evidence.includes(item.evidence),'创世数值初值缺少连续原文/设定依据');
   const plan=stateValuesProposal(initialView,stateCatalog,{ownerId,itemIds:stateCatalog.items.map(x=>x.id),text:item.values});
   check(plan.proposal.changes.every(op=>op.expected===0),'创世不能重新初始化已存在的状态值');
   for(const [j,op]of plan.proposal.changes.entries())initial.changes.push({...op,id:'new:genesis-state-'+i+'-'+j,evidence:item.evidence});
  }}
  const init=prepareCommit(initialView,initial,{source:null,kind:'genesis',evidence,allowedTables:reg.tables.filter(t=>t.owner==='archive'&&!['objects','facts','events'].includes(t.id)).map(t=>t.id)});
  check(!(initial.templates??[]).length,'新模板应在蓝图注册表中统一登记');init.commit.changes.unshift(...prepared.commit.changes.map(ch=>({id:ch.id,before:ch.before,origin:ch.id+'@'+ch.after.rev})));init.commit.anchors.unshift(...prepared.commit.anchors);for(const anchor of init.commit.anchors)anchor.group=init.commit.id;next.registry=mergeRegistries(next.registry,init.registry);session.registry=copy(next.registry);init.commit.registry=copy(next.registry);init.commit.contextSource=loaded.chain.at(-1)?.key??null;session.commits.push(init.commit);project(next,session,loaded.chain.map(s=>s.key));session.blueprint={...copy(p.blueprint),checklist:copy(p.checklist),workflow:copy(p.workflow),native:copy(p.artifacts.native??{presets:[],worldbooks:[],regexes:[]}),appliedAt:new Date().toISOString()};
  next.schemaHistory??=[];next.schemaHistory.push({at:new Date().toISOString(),before:loaded.origin.data.registry,after:copy(next.registry),source:'创世蓝图确认'});
  const origin=await books.write(loaded.origin,next,c.guard);try{await books.write(loaded.session,session,c.guard);}catch(e){throw Error('创世原点候选版本已保存，本会话尚未应用：'+e.message);}
  status('创世','已保存',origin.name);return prepared.commit.changes.length+init.commit.changes.length;}).then(async count=>{try{await applyNative(draft.world);}catch(e){e.blueprintSaved=true;throw e;}return count;});}
 async function applyNative(expectedWorld){check(!busy,'请等待表单任务完成');const c=capture();check(!expectedWorld||c.key===expectedWorld,'蓝图已保存，但聊天已切换，原生配置尚未创建');const loaded=await load(c),spec=loaded.session.data.blueprint?.native;if(!spec||!Object.values(spec).some(x=>Array.isArray(x)&&x.length))return [];check(nativeConfig,'原生配置接口尚未接入；表单已保存');try{const receipts=await nativeConfig.apply(spec);status('原生配置','已核对',receipts.length+' 项');return receipts;}catch(e){status('原生配置','待补建',e.message);throw e;}}
 async function reviewPreference(id,proposal=null){return exclusive(async()=>{const c=capture(),loaded=await load(c),draft=loaded.session.data.preferenceDrafts?.map(d=>confirmedPreferenceDraft(d,c.data.全局偏好,c.key)).find(x=>x.id===id);check(draft&&draft.status==='pending'&&livePreferenceDraft(loaded,draft),'偏好候选不存在、已处理或来源已变化');if(proposal){check(!(proposal.templates??[]).length,'偏好确认不能新增类型');await commit(c,loaded,proposal,{source:draft.source,kind:'preferences',evidence:draft.text,allowedTables:['preferences'],reviewId:id,independentPreference:!!draft.feedbackId});}else{const next=copy(loaded.session.data);next.revision++;next.preferenceDrafts.find(x=>x.id===id).status='rejected';await books.write(loaded.session,next,c.guard);}return true;});}
 // Compact state forms share this service's serialization, source projection and book writer.
 async function stateFormContext(){const c=capture();check(c.settings.originBook&&c.settings.sessionBook,'请先建立当前会话的表单存档');const loaded=await load(c),catalog=loaded.origin.data.状态目录;if(catalog)validateStateCatalog(catalog,loaded.origin.data.id);return {c,loaded,catalog};}
 async function stateCatalog(){const {loaded,catalog}=await stateFormContext();return {catalog:copy(catalog??null),originRevision:loaded.origin.data.revision};}
 async function saveStateCatalog(registration,expectedOriginRevision){const input=copy(registration);return exclusive(async()=>{
  const {c,loaded,catalog}=await stateFormContext();check(loaded.origin.data.revision===expectedOriginRevision,'状态定义已改变，请重新载入');
  const nextCatalog=registerStateCatalog(catalog,loaded.origin.data.id,input);if(catalog&&JSON.stringify(catalog)===JSON.stringify(nextCatalog))return {catalog:copy(catalog),originRevision:loaded.origin.data.revision,unchanged:true};
  const next=copy(loaded.origin.data);next.revision++;next.状态目录=nextCatalog;const saved=await books.write(loaded.origin,next,c.guard);c.guard();
  status('状态定义','已保存',nextCatalog.items.length+' 个条目；没有初始化人物状态');return {catalog:copy(saved.data.状态目录),originRevision:saved.data.revision,unchanged:false};
 });}
 async function readStateForm(ownerId,itemIds){const selected=copy(itemIds);const {loaded,catalog}=await stateFormContext();check(catalog,'尚未登记状态定义');return {text:readStateGrid(loaded.view,catalog,ownerId,selected),ownerId,itemIds:selected,originRevision:loaded.origin.data.revision,sessionRevision:loaded.session.data.revision};}
 async function readNumericState(ownerId){const {loaded,catalog}=await stateFormContext();check(catalog,'尚未登记状态定义');return {text:readStateValues(loaded.view,catalog,ownerId,catalog.items.map(i=>i.id)),ownerId,actions:compileStateFormulas(catalog).actions.filter(a=>!parseStateEvents(catalog.events??'').some(e=>e.action===a.name)).map(a=>({name:a.name,automatic:a.automatic}))};}
 async function stageStatePreview(input,kind){const captured=copy(input);return exclusive(async()=>{
  const {c,loaded,catalog}=await stateFormContext();check(catalog,'尚未登记状态定义');
  if(kind==='formula')check(!parseStateEvents(catalog.events??'').some(e=>e.action===captured.name),'此公式由事件结算调用，请选择已确认事件');
  const itemIds=captured.itemIds??catalog.items.map(i=>i.id),args={...captured,itemIds};
  const planned=(kind==='grid'?stateGridProposal:kind==='values'?stateValuesProposal:kind==='formula'?stateFormulaProposal:stateGrowthProposal)(loaded.view,catalog,args);
  const options={source:loaded.chain.at(-1)?.key??null,kind:'manual',evidence:planned.raw,allowedTables:['state'],allowSchemaExtensions:false,inferSchemaFields:false};
  prepareCommit(loaded.view,planned.proposal,options);c.guard();
  const id='state-form:'+crypto.randomUUID(),draft={id,world:c.key,chat:c.chat,ownerId:captured.ownerId,itemIds:copy(itemIds),originStamp:loaded.origin.stamp,sessionStamp:loaded.session.stamp,catalogRevision:catalog.revision,...planned,options};
  check(stateFormDrafts.size<100,'待保存状态简表过多，请先保存或取消');stateFormDrafts.set(id,draft);
  return {id,ownerId:draft.ownerId,diff:copy(planned.diff),changes:planned.diff.length,written:false,...(planned.growth?{growth:copy(planned.growth)}:{})};
 });}
 async function stateEventReceipt(loaded,catalog,entry){
  const inherited=(loaded.session.data.branchSeed?.stateEventReceipts??[]).some(c=>c.id===entry.id);
  check(inherited||loaded.view.commits.some(c=>c.id===entry.id),'事件回执不在当前分支，不能重新结算旧事件');
  const record=entry.stateEvent,spec=stateEventInput(loaded.view,catalog,record);
  check(inherited?JSON.stringify(spec.event)===JSON.stringify(record.eventSnapshot)&&JSON.stringify(spec.rule)===JSON.stringify(record.rule):await digest(spec.payload)===record.inputHash,'已结算事件或规则发生变化，未再次扣费或发放奖励');
  return {id:entry.stateForm.id,ownerId:record.ownerId,eventId:record.eventId,name:record.name,recorded:true,diff:copy(record.diff),changes:record.diff.length,growth:copy(record.growth),written:false};
 }
 async function previewStateEvent(input){const captured=copy(input);return exclusive(async()=>{
  const {c,loaded,catalog}=await stateFormContext();check(catalog,'尚未登记状态定义');
  const spec=stateEventInput(loaded.view,catalog,captured),prior=[...(loaded.session.data.branchSeed?.stateEventReceipts??[]),...loaded.session.data.commits].filter(x=>x.stateEvent?.identity===spec.identity);
  check(prior.length<=1,'同一事件存在重复结算回执');if(prior.length)return stateEventReceipt(loaded,catalog,prior[0]);
  const planned=stateEventProposal(loaded.view,catalog,captured),options={source:loaded.chain.at(-1)?.key??null,kind:'manual',evidence:planned.raw,allowedTables:['state'],allowSchemaExtensions:false,inferSchemaFields:false};
  prepareCommit(loaded.view,planned.proposal,options);c.guard();
  const id='state-event:'+crypto.randomUUID(),event={identity:spec.identity,eventId:captured.eventId,ownerId:captured.ownerId,name:captured.name,action:spec.rule.action,narrative:spec.rule.narrative,inputHash:await digest(spec.payload),eventRevision:spec.event.rev,rule:copy(spec.rule),eventSnapshot:spec.event,deliveryAfter:loaded.chain.findLast(x=>x.role==='assistant')?.key??null,diff:copy(planned.diff),growth:copy(planned.growth),access:copy(planned.access)};
  c.guard();check(stateFormDrafts.size<100,'待保存状态简表过多，请先保存或取消');
  stateFormDrafts.set(id,{id,world:c.key,chat:c.chat,ownerId:captured.ownerId,itemIds:catalog.items.map(i=>i.id),originStamp:loaded.origin.stamp,sessionStamp:loaded.session.stamp,catalogRevision:catalog.revision,...planned,options,event});
  return {id,ownerId:captured.ownerId,eventId:captured.eventId,name:captured.name,diff:copy(planned.diff),changes:planned.diff.length,growth:copy(planned.growth),recorded:false,written:false};
 });}
 async function readStateEventResults(){const {loaded}=await stateFormContext();return stateEventNarrative(loaded.view,loaded.chain.findLast(x=>x.role==='assistant')?.key??null);}
 const previewStateForm=input=>stageStatePreview(input,'grid'),previewNumericState=input=>stageStatePreview(input,'values'),previewStateFormula=input=>stageStatePreview(input,'formula'),previewStateGrowth=input=>stageStatePreview(input,'growth');
 async function saveStateForm(id){return exclusive(async()=>{
  const {c,loaded,catalog}=await stateFormContext(),recorded=[...(loaded.session.data.branchSeed?.stateEventReceipts??[]),...loaded.view.commits].find(x=>x.stateForm?.id===id);
  if(recorded){if(recorded.stateEvent)await stateEventReceipt(loaded,catalog,recorded);stateFormDrafts.delete(id);return {id,recorded:true,changes:recorded.stateEvent?.diff.length??recorded.changes.length,sessionRevision:loaded.session.data.revision};}
  const draft=stateFormDrafts.get(id);check(draft&&draft.world===c.key&&draft.chat===c.chat,'状态简表不存在或聊天已改变，请重新预览');
  check(catalog&&loaded.origin.stamp===draft.originStamp&&loaded.session.stamp===draft.sessionStamp,'状态定义或档案已改变，旧简表未覆盖新值');
  if(!draft.proposal.changes.length&&!draft.event){stateFormDrafts.delete(id);return {id,recorded:false,unchanged:true,changes:0,sessionRevision:loaded.session.data.revision};}
  if(draft.event)check(!loaded.session.data.commits.some(x=>x.stateEvent?.identity===draft.event.identity),'事件已结算，请重新载入回执');
  const prepared=prepareCommit(loaded.view,draft.proposal,draft.options);check(JSON.stringify(prepared.registry)===JSON.stringify(loaded.view.registry),'状态简表不能改变档案模板');
  prepared.commit.stateForm={id,ownerId:draft.ownerId,itemIds:copy(draft.itemIds),catalogRevision:draft.catalogRevision};
  if(draft.event)prepared.commit.stateEvent=copy(draft.event);
  const next=copy(loaded.session.data);next.revision++;next.commits.push(prepared.commit);
  // Only one session book is written. Shared definitions were registered separately.
  const saved=await books.write(loaded.session,next,c.guard);c.guard();
  stateFormDrafts.delete(id);worldbook.clear();setPrompt('');latest=null;
  status('状态简表','已保存',prepared.commit.changes.length+' 项');return {id,recorded:true,changes:prepared.commit.changes.length,sessionRevision:saved.data.revision};
 });}
 function discardStateForm(id){return stateFormDrafts.delete(id);}
 async function edit(proposal){return exclusive(async()=>{const c=capture(),loaded=await load(c),source=loaded.chain.at(-1)?.key??null;const evidence='用户手动修改表单';const result=await commit(c,loaded,proposal,{source,kind:'manual',evidence,allowedTables:loaded.view.registry.tables.map(t=>t.id)});return result.configurationRevision??result.session.data.revision;});}
 function resolveOriginPins(loaded,pins){const bases=loaded.origin.data.bases;check(Array.isArray(pins)&&pins.every(p=>bases.some(b=>b.id+'@'+b.rev===p)),'所选原点版本不存在');check(new Set(pins.map(p=>p.slice(0,p.lastIndexOf('@')))).size===pins.length,'同一档案只能选择一个版本');
  const selected=new Map(pins.map(pin=>{const row=bases.find(b=>b.id+'@'+b.rev===pin);return [row.id,row];})),queue=[...selected.values()];
  for(let i=0;i<queue.length;i++)for(const id of references(queue[i],loaded.view.registry))if(!selected.has(id)){const versions=bases.filter(b=>b.id===id),compatible=versions.filter(b=>!queue[i].updatedAt||!b.updatedAt||b.updatedAt<=queue[i].updatedAt);const row=(compatible.length?compatible:versions).sort((a,b)=>b.rev-a.rev)[0];check(row,'所选对象缺少可复用关联档案：'+id);selected.set(id,row);queue.push(row);}
return [...selected.values()].map(b=>b.id+'@'+b.rev);}
 function withOriginSelection(loaded,pins){const next=copy(loaded.session.data);next.revision++;next.pins=resolveOriginPins(loaded,pins);next.registry=mergeRegistries(next.registry??loaded.view.registry,loaded.origin.data.registry);next.schemaPinned=true;next.commits.push({id:crypto.randomUUID(),kind:'origin-selection',source:loaded.chain.at(-1)?.key??null,depends:loaded.view.last,at:new Date().toISOString(),changes:[],anchors:[],registry:copy(next.registry),originSelection:{before:copy(loaded.session.data.pins??[]),after:copy(next.pins)}});project(loaded.origin.data,next,loaded.chain.map(s=>s.key));return next;}
 async function pinOrigins(pins){return exclusive(async()=>{const c=capture(),loaded=await load(c),next=withOriginSelection(loaded,pins);await books.write(loaded.session,next,c.guard);return next.pins;});}

 async function saveTemplates(nextRegistry,expectedRevision){return exclusive(async()=>{const c=capture(),loaded=await load(c);check(loaded.origin.data.revision===expectedRevision,'模板版本已变化，请重新载入');compatibleRegistry(nextRegistry,loaded.origin.data.registry);for(const row of loaded.view.rows)validateRow(nextRegistry,row);
  const next=copy(loaded.origin.data);next.revision++;next.registry=copy(nextRegistry);next.schemaHistory??=[];next.schemaHistory.push({at:new Date().toISOString(),before:loaded.origin.data.registry,after:copy(nextRegistry),source:'用户编辑模板'});await books.write(loaded.origin,next,c.guard);const session=copy(loaded.session.data);session.revision++;session.registry=copy(nextRegistry);session.schemaPinned=true;session.commits.push({id:crypto.randomUUID(),source:null,depends:loaded.view.last,kind:'schema',changes:[],anchors:[],registry:copy(nextRegistry)});await books.write(loaded.session,session,c.guard);status('模板','已保存','新字段和别名已登记');return next.revision;});}
 const archives=createArchiveSystem({run:exclusive,capture,load,books,readerPolicy:archiveQueryPolicy,onCommitted(){worldbook.clear();setPrompt('');latest=null;}});
 const conditionService=createConditionService({run:exclusive,capture,load,books,onCommitted(){worldbook.clear();setPrompt('');latest=null;}});
 const foundation=createFoundationService({run:exclusive,capture,load,books,onCommitted(){worldbook.clear();setPrompt('');latest=null;}});
 const api={storageRecovery,recoverMissingStorage,identityCores,bindIdentitySelection,assertIdentityCompatible,identityOrigins,previewIdentityOrigin,saveIdentityOrigin,createIdentityDraft,saveIdentityDraft,lifecycle,subscribeArchive(fn){check(typeof fn==='function','需要刷新函数');archiveListeners.add(fn);return ()=>archiveListeners.delete(fn);},...archives,...conditionService,...foundation,previewStateEvent,readStateEventResults,readNumericState,previewNumericState,previewStateFormula,previewStateGrowth,stateCatalog,saveStateCatalog,readStateForm,previewStateForm,saveStateForm,discardStateForm,recordRevisionFeedback,reviewCardRules,ruleReviewStatus,saveRuleChoice,previewUserBinding,saveUserBinding,resumeUserBinding,analysePreferences,stageFork,activateFork,cancelFork(){pendingFork=null;},enableNativeBridge,syncNative,coreDraft,saveCore,listCores,adaptCore,previewCoreBundle,coreBundleDraft,saveCoreBundle,adaptCoreBundle,advance,saveAnchor,freezeCanon,readCanon,openArchiveProposal,saveArchiveProposal,previewArchiveChanges,acceptArchiveReview,discardArchiveReview,openArchiveQuery,openAssistantArchiveQuery,useAnchor,autoInitialize,cardTemplate,saveCardTemplate,review,state,worldbook,nativeConfiguration:nativeConfig,applyNative,prepare,rulesContext,initialize,ensureInitialized,inspect,scan,archive,importHistory,saveHistory,saveTemplates,genesis,saveGenesis,reviewPreference,checkStyle(text){const settings=tableSettings(store.read().world);return settings.styleEnabled?scanStyle(archivalText(text),styleRules(settings)):[];},auditStyle(text){const settings=tableSettings(store.read().world);lastStyleAudit={enabled:settings.styleEnabled,hits:settings.styleEnabled?scanStyle(archivalText(text),styleRules(settings)):[],at:new Date().toISOString()};return copy(lastStyleAudit);},reportError(task,error){if(error===undefined){error=task;task='表单操作';}status(task,'失败',error?.message??String(error),error);if(progress)progress={...progress,stage:'error',updatedAt:Date.now(),finishedAt:Date.now()};},edit,pinOrigins,books,clear,contextChanged,preview:()=>copy(latest)};
 api.assistant=createTableAssistant({store,getContext,review,run:exclusive,call:(input,signal)=>invoke('tableAssistant',input,capture(),signal),getChoices:getConfigurationChoices,interfaceConfig});return api;
}

function compatibleRegistry(nextRegistry,previous){previous=upgradeRegistry(previous);registryIndex(nextRegistry);for(const kind of ['tables','types'])for(const old of previous[kind]){const next=nextRegistry[kind].find(x=>x.id===old.id);check(next&&next.name===old.name&&(old.aliases??[]).every(x=>next.aliases.includes(x)),'现有名称不可删除或改名；请添加别名');for(const [key,field]of Object.entries(old.fields))check(sameDefinition(next.fields[key],field),'已有字段不可改变类型／公式');check(next.parent===old.parent&&next.owner===old.owner,'不能改变模板继承或职责');for(const [key,field]of Object.entries(next.fields))if(!old.fields[key])check(!field.required,'已有模板只能增加可选字段');next.version=sameDefinition({...next,version:old.version},old)?old.version:old.version+1;}for(const t of nextRegistry.tables)check(t.owner==='archive'||t.id==='preferences'&&t.owner==='preferences','新增业务表由记忆归档填录，偏好使用共用确认表');return nextRegistry;}
function validateBlueprint(value,previous){const p=validateGeneratedTask('genesis',value);check(p.blueprint&&typeof p.blueprint.name==='string'&&typeof p.blueprint.goal==='string'&&Array.isArray(p.blueprint.decisions)&&p.blueprint.decisions.every(x=>typeof x==='string')&&Array.isArray(p.blueprint.unresolved)&&p.blueprint.unresolved.every(x=>typeof x==='string'),'蓝图字段不完整');check(Array.isArray(p.checklist)&&p.checklist.every(x=>typeof x==='string'),'蓝图核对清单无效');validateGeneratedTask('workflow',p.workflow);check(p.artifacts?.base&&p.artifacts?.initial,'蓝图缺少原点档案或会话初值');compatibleRegistry(p.artifacts.registry,previous);if(p.artifacts.native!==undefined)validateNativeConfig(p.artifacts.native);return p;}

function validateGenesisStateSystem(spec,origin){
 check(spec&&typeof spec==='object'&&!Array.isArray(spec)&&Object.keys(spec).every(k=>['definitions','items','formulas','growth','events','initial'].includes(k)),'创世数值体系字段无效');
 check(spec.initial===undefined||Array.isArray(spec.initial)&&spec.initial.length<=32&&spec.initial.every(x=>x&&typeof x.owner==='string'&&typeof x.values==='string'&&typeof x.evidence==='string'),'创世数值初值格式无效');
 return registerStateCatalog(origin.data.状态目录,origin.data.id,spec);
}
