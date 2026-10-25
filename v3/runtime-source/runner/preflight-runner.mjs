import {parseSimpleSheet,formatSimpleSheet} from '../../../tables/simple-sheet.js';
import {prepareCommit,calendarTime} from '../../../tables/ledger.js';
import {copy,object,check,validateRow,validateReferences,mapRowReferences,registryIndex} from '../../../tables/schema.js';
import {digest} from '../../../tables/books.js';
import {bridgePatch,parseNativeTransaction,auditNativeOutcome,hasNativeUpdate,valueAt,carryNativeForward} from '../../../tables/native-bridge.js';
import {prepareWorld,assertWorldBasisUnchanged} from './world.mjs';
import {sameJsonValue} from '../host/json-value.mjs';
import {preferenceGroup,preferenceContributionIdentity,preferenceContributionIdentities,projectPreferences} from '../preferences/service.mjs';
import {mergeDefinitionRegistries} from '../../design-schema.mjs';

export {formatSimpleSheet};
export const ROOT_FIELDS=['requestKey','archiveProposal','worldProposal','scope','preferenceCandidates','archiveRequests','creativeBrief','pending'];
const PROPOSAL_FIELDS=['templates','schemaChanges','changes','pending'];
const TYPES=['normal','swipe','advanced-reroll'];
const emptyProposal=()=>({templates:[],schemaChanges:[],changes:[],pending:[]});
const CLOSED={tasks:new Set(['完成','取消']),timers:new Set(['完成','取消']),activities:new Set(['完成','取消']),clues:new Set(['已回收','取消'])};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const rowSame=(a,b)=>{const semantic=r=>r&&({id:r.id,table:r.table,rev:r.rev,values:r.values,access:r.access,source:r.source,lockedFields:r.lockedFields??[]});return same(semantic(a),semantic(b));};
const failure=(code,message)=>Object.assign(new Error(message),{code});
function exact(value,fields,label,optional=[]){check(object(value),label+' must be an object');check(fields.every(k=>Object.hasOwn(value,k))&&Object.keys(value).every(k=>fields.includes(k)||optional.includes(k)),label+' has missing or unknown fields');}
function texts(value,label){check(Array.isArray(value)&&value.every(v=>typeof v==='string'),label+' must be a text list');}
function proposalShape(value,label){exact(value,PROPOSAL_FIELDS,label);for(const key of PROPOSAL_FIELDS)check(Array.isArray(value[key]),label+'.'+key+' must be a list');check(value.changes.length<=200,label+' exceeds 200 changes');check(value.pending.length===0,label+' has unresolved dependencies');}
function stateValid(state){check(object(state)&&Number.isSafeInteger(state.revision)&&state.revision>=0&&object(state.baseView)&&Array.isArray(state.commits)&&object(state.requests)&&object(state.nativeIntents)&&Array.isArray(state.preferenceDrafts),'Invalid W24 store');registryIndex(state.baseView.registry);}
function rowMetadata(row){const r=copy(row);if(r.table==='events'){delete r.values.原文段落;}return r;}
function publicView(view){return {...copy(view),rows:view.rows.map(rowMetadata)};}
function stepView(view,prepared){return {...view,registry:prepared.registry,rows:prepared.rows,anchors:[...(view.anchors??[]),...prepared.commit.anchors],commits:[...(view.commits??[]),prepared.commit],last:prepared.commit.id};}
function preferencesFor(state,input){return projectPreferences(state,{...input.preferenceProjectionOptions,chatId:input.originalScope?.chatId??input.identity?.chatId??input.preferenceProjectionOptions?.chatId,enabled:input.preferencesEnabled!==false,activeSourceKeys:input.activeSourceKeys});}
function preferenceWeights(state,input){const p=preferencesFor(state,input);return {groups:p.groups.map(g=>({...g,contributions:g.contributions.map(c=>({id:c.id,source:c.source,score:c.score,instruction:c.instruction}))})),hardConstraints:p.hardConstraints.map(c=>({group:c.group,kind:c.kind,tag:c.tag,id:c.id,source:c.source,instruction:c.instruction})),rows:p.rows.map(r=>({id:r.id,values:{...(r.values.适用情境?{适用情境:r.values.适用情境}:{}),...(r.values.例外?{例外:copy(r.values.例外)}:{})}}))};}
function currentView(state,input){const view=projectRetained(state,input.activeSourceKeys),preferences=preferencesFor(state,input);return {...view,rows:[...view.rows.filter(r=>r.table!=='preferences'),...preferences.rows]};}
function remapPatchReferences(op,registry,aliases,rows){if(!op.values)return;const inherited=op.table==='objects'&&!Object.hasOwn(op.values,'类型'),values=inherited?{...op.values,类型:rows.find(row=>row.id===op.id)?.values.类型}:op.values;mapRowReferences({id:op.id,table:op.table,values},registry,id=>aliases.get(id)??id);if(inherited)delete values.类型;op.values=values;}
function remapProposal(proposal,registry,aliases,rows){const p=copy(proposal);for(const op of p.changes){op.id=aliases.get(op.id)??op.id;remapPatchReferences(op,registry,aliases,rows);if(op.access)for(const k of ['readers','knowers'])op.access[k]=op.access[k]?.map(id=>aliases.get(id)??id);}return p;}
function registerAliases(proposal,prepared,aliases){proposal.changes.forEach((op,i)=>{if(op.id.startsWith('new:'))aliases.set(op.id,prepared.commit.changes[i].id);});}
function assertUnsettledWorldWindow(view,window){
 if(!window?.ready)return;
 const start=calendarTime(window.from),end=calendarTime(window.to);
 check(start!==null&&end!==null&&end>start,'Ready world window requires a complete increasing story-time interval');
 for(const commit of view.commits??[]){if(!commit.progression)continue;const priorStart=calendarTime(commit.progression.from),priorEnd=calendarTime(commit.progression.to);check(priorStart!==null&&priorEnd!==null&&priorEnd>priorStart,'Retained world settlement has invalid story-time boundaries');if(start<priorEnd&&end>priorStart)throw failure('WORLD_WINDOW_ALREADY_SETTLED','Ready world window overlaps retained settled story time');}
}
function mapWorld(proposal,aliases){if(proposal===null)return null;const p=copy(proposal);for(const event of p.events){event.actors=event.actors.map(id=>aliases.get(id)??id);for(const b of event.basis){b.id=aliases.get(b.id)??b.id;b.usedBy=b.usedBy.map(id=>aliases.get(id)??id);}for(const key of ['readers','knowers'])event.access[key]=event.access[key].map(id=>aliases.get(id)??id);for(const op of event.changes){op.id=aliases.get(op.id)??op.id;for(const key of ['readers','knowers'])op.access[key]=op.access[key].map(id=>aliases.get(id)??id);}}return p;}

export function createInitialState({registry,rows=[]}){
 registryIndex(registry);for(const row of rows)validateRow(registry,row);validateReferences(rows,registry);
 return {format:'tisya.preflight-runner/1',revision:0,baseView:{registry:copy(registry),rows:copy(rows),anchors:[],commits:[],last:null},commits:[],requests:{},nativeIntents:{},preferenceDrafts:[]};
}

/** Source selection replays the journal, so rerolls remove every dependent state change. */
export function projectRetained(state,activeSourceKeys){
 stateValid(state);check(Array.isArray(activeSourceKeys)&&activeSourceKeys.every(v=>typeof v==='string')&&new Set(activeSourceKeys).size===activeSourceKeys.length,'activeSourceKeys must be an exact retained chain');
 const selected=new Set(activeSourceKeys),applied=new Set(),rows=new Map(state.baseView.rows.map(r=>[r.id,copy(r)]));
 let registry=copy(state.baseView.registry),last=state.baseView.last??null;const commits=[],anchors=[...(state.baseView.anchors??[])];if(last)applied.add(last);
 for(const commit of state.commits){
  if(commit.source!==null&&!selected.has(commit.source))continue;
  if(commit.contextSource&&!selected.has(commit.contextSource))continue;
  if((commit.requiredSources??[]).some(source=>!selected.has(source)))continue;
  if(commit.depends&&!applied.has(commit.depends))continue;
  for(const change of commit.changes){if(change.deleted)rows.delete(change.id);else rows.set(change.id,copy(change.after));}
  if(commit.registry)registry=copy(commit.registry);commits.push(copy(commit));anchors.push(...copy(commit.anchors));applied.add(commit.id);last=commit.id;
 }
 if(state.definitionRegistry)registry=mergeDefinitionRegistries(registry,state.definitionRegistry);
 const result={registry,rows:[...rows.values()],anchors,commits,last};for(const row of result.rows)validateRow(registry,row);validateReferences(result.rows,registry);return result;
}

export function projectWriter(view){
 const all=view.rows.map(rowMetadata),closed=r=>CLOSED[r.table]?.has(r.table==='clues'?r.values.阶段:r.values.状态),rows=all.filter(r=>r.table!=='native_cells'&&!closed(r)),activePool=rows.filter(r=>CLOSED[r.table]);
 return {rows,activePool:activePool.map(r=>({id:r.id,rev:r.rev,table:r.table})),history:rows.filter(r=>r.table==='events').map(r=>({id:r.id,rev:r.rev})),nativeValues:all.filter(r=>r.table==='native_cells').map(r=>({id:r.id,path:r.values.路径,value:copy(r.values.值)}))};
}

function validateEnvelope(result,input){
 exact(result,ROOT_FIELDS,'preflight');check(same(Object.keys(result),ROOT_FIELDS),'Root fields must follow the registered order');check(result.requestKey===input.requestKey,'requestKey mismatch');
 check(Array.isArray(result.archiveProposal)&&result.archiveProposal.length===input.archiveSources.length,'Archive source slots changed');
 for(const [i,item]of result.archiveProposal.entries()){exact(item,['source','proposal'],'archive item');check(item.source===input.archiveSources[i].archiveSource.key,'Archive sources must remain ordered');proposalShape(item.proposal,'archive proposal');}
 exact(result.scope,['goal','targets','timeWindow','stop','unknowns'],'scope');for(const k of ['goal','timeWindow','stop'])check(typeof result.scope[k]==='string','scope.'+k+' must be text');texts(result.scope.targets,'scope.targets');texts(result.scope.unknowns,'scope.unknowns');
 proposalShape(result.preferenceCandidates,'preferences');check(result.preferenceCandidates.templates.length===0&&result.preferenceCandidates.schemaChanges.length===0,'Preferences cannot expand schema');
 check(Array.isArray(result.archiveRequests)&&result.archiveRequests.length<=8,'Read request budget exceeded');
 for(const r of result.archiveRequests){exact(r,['method','arguments','purpose'],'archive request');check(['list_archive','describe_fields','search_archive','read_archive'].includes(r.method)&&object(r.arguments)&&typeof r.purpose==='string'&&r.purpose.trim(),'Invalid archive read');check(!Object.hasOwn(r.arguments,'cursor'),'Initial archive reads cannot supply a cursor');const catalog=input.queryCatalog??[];check(catalog.some(d=>(typeof d==='string'?d:d.method)===r.method),'Archive method is not authorized');}
 exact(result.creativeBrief,['goal','beats','pendingChoices','due','clues','constraints'],'creativeBrief');check(typeof result.creativeBrief.goal==='string'&&Array.isArray(result.creativeBrief.beats)&&result.creativeBrief.beats.length<=20,'Invalid creative brief');for(const k of ['pendingChoices','due','clues','constraints'])texts(result.creativeBrief[k],'creativeBrief.'+k);
 for(const beat of result.creativeBrief.beats){exact(beat,['proposal','basis','condition'],'beat');check(typeof beat.proposal==='string'&&typeof beat.condition==='string','Invalid beat');texts(beat.basis,'beat.basis');}
 check(input.plotEnabled!==false||result.creativeBrief.beats.length===0&&result.creativeBrief.pendingChoices.length===0,'Plot drafting is disabled');
 check(Array.isArray(result.pending)&&result.pending.length<=20&&result.pending.length===0,'Preflight has unresolved dependencies');
 const ids=new Set();for(const p of [...result.archiveProposal.map(i=>i.proposal),result.preferenceCandidates])for(const op of p.changes)if(typeof op.id==='string'&&op.id.startsWith('new:')){check(!ids.has(op.id),'new: IDs must be unique across the response');ids.add(op.id);}return ids;
}

function normalizeInput(input){
 const i=copy(input);check(typeof i.requestKey==='string'&&i.requestKey&&TYPES.includes(i.generationType),'Invalid request identity or generation type');check(Array.isArray(i.archiveSources),'archiveSources is required');
 check(Array.isArray(i.activeSourceKeys)&&i.activeSourceKeys.every(k=>typeof k==='string'&&k)&&new Set(i.activeSourceKeys).size===i.activeSourceKeys.length,'activeSourceKeys must be exact and unique');check(i.currentSourceKey===undefined||i.currentSourceKey===null||i.activeSourceKeys.includes(i.currentSourceKey),'Current request context must be retained');
 check(i.preflightSkipped===undefined||['disabled','first-turn'].includes(i.preflightSkipped),'Invalid preflight policy');if(i.preflightSkipped)check(i.archiveSources.length===0&&!i.worldWindow,'Direct narrative cannot settle archives or world');
 i.preferenceSources??=[];check(Array.isArray(i.preferenceSources),'preferenceSources must be a list');
 if(i.generationType==='advanced-reroll'){
  const r=i.advancedReroll;exact(r,['id','targetMessageId','replacedRevision','instruction'],'advancedReroll');check(typeof r.id==='string'&&r.id&&typeof r.targetMessageId==='string'&&r.targetMessageId&&Number.isSafeInteger(r.replacedRevision)&&r.replacedRevision>0&&typeof r.instruction==='string','Invalid advanced reroll');
  const key='feedback:'+r.id,prior=i.preferenceSources.find(s=>s.key===key);check(!prior||prior.text===r.instruction,'Advanced reroll feedback identity changed');if(!prior)i.preferenceSources.push({key,text:r.instruction,kind:'advanced-reroll'});
  check(!i.archiveSources.some(s=>s.archiveSource.messageId===r.targetMessageId&&s.archiveSource.revision===r.replacedRevision),'The replaced candidate cannot be archived as retained');
 }
 for(const source of i.archiveSources){check(object(source.archiveSource)&&typeof source.archiveSource.key==='string'&&typeof source.archiveSource.text==='string','Invalid archive source');check(i.activeSourceKeys.includes(source.archiveSource.key),'Unretained archive source');const archiveIndex=i.activeSourceKeys.indexOf(source.archiveSource.key);check(Array.isArray(source.userSources??[])&&new Set((source.userSources??[]).map(s=>s.key)).size===(source.userSources??[]).length,'Invalid preceding user sources');for(const user of source.userSources??[])check(typeof user.key==='string'&&typeof user.text==='string'&&i.activeSourceKeys.indexOf(user.key)>=0&&i.activeSourceKeys.indexOf(user.key)<archiveIndex&&user.key!==i.currentSourceKey,'User evidence must precede its archive source');}
 check(new Set(i.archiveSources.map(s=>s.archiveSource.key)).size===i.archiveSources.length,'Duplicate archive source');check(new Set(i.preferenceSources.map(s=>s.key)).size===i.preferenceSources.length,'Duplicate feedback source');return i;
}

async function boundArchive(proposal,item,input,{bindArchiveParagraphs,resolveEvidence}){
 check(typeof bindArchiveParagraphs==='function'&&typeof resolveEvidence==='function','Original paragraph store is required');
 const p=await bindArchiveParagraphs({proposal:copy(proposal),source:item.originalReference,scope:input.originalScope});const refs=[];
 for(const op of p.changes){
  exact(op,['id','table','expected','values','access','evidence'],'archive change',['unset','delete','writePaths']);
  if(Array.isArray(op.evidence)){
   check(op.evidence.length&&op.evidence.every(n=>Number.isSafeInteger(n)&&n>0)&&new Set(op.evidence).size===op.evidence.length,'Archive evidence must contain paragraph numbers');
   const resolved=await resolveEvidence({source:item.originalReference,paragraphs:op.evidence,scope:input.originalScope});
   check(typeof resolved.envelope?.text==='string'&&item.archiveSource.text.includes(resolved.envelope.text),'Frozen source does not contain the evidence envelope');
   refs.push({kind:'original-paragraphs',...copy(resolved.reference)});op.evidence=resolved.envelope.text;
  }else{
   exact(op.evidence,['userSource','excerpt'],'preceding user evidence');const source=(item.userSources??[]).find(s=>s.key===op.evidence.userSource);
   check(source&&typeof source.text==='string'&&typeof op.evidence.excerpt==='string'&&op.evidence.excerpt.trim()&&source.text.includes(op.evidence.excerpt),'User evidence must be a continuous excerpt of this archive source\'s preceding user input');
   refs.push({kind:'user-source',source:source.key,excerpt:op.evidence.excerpt});op.evidence=op.evidence.excerpt;
  }
 }
 return {proposal:p,refs};
}
function scrubArchive(prepared,refs){const out=copy(prepared);out.commit.anchors.forEach((anchor,i)=>{anchor.evidence=copy(refs[i]);});return out;}
function nativeMaps(view,after,refs){return view.rows.filter(r=>r.table==='native_cells'&&r.values.启用!==false).flatMap(row=>{const actual=valueAt(after.stat_data,row.values.路径);return same(row.values.值,actual)?[]:[{id:row.id,table:'native_cells',expected:row.rev,values:{值:copy(actual)},access:copy(row.access),evidence:'Native callback readback'}];});}
function preparePreferences(view,proposal,input,state){
 check(input.preferencesEnabled!==false||proposal.changes.length===0,'Preference analysis is disabled');const sources=new Map(input.preferenceSources.map(s=>[s.key,s.text])),seen=new Set();
 const chatId=input.originalScope?.chatId??input.identity?.chatId;check(!proposal.changes.length||typeof chatId==='string'&&chatId,'Preference feedback needs its stable chat identity');
 const p=copy(proposal),sourceByChange=[];
 for(const op of p.changes){exact(op,['id','table','expected','values','access','evidence','preferenceSource'],'preference change');check(op.table==='preferences'&&sources.has(op.preferenceSource),'Unauthorized preference source');const text=sources.get(op.preferenceSource);check(typeof text==='string'&&typeof op.evidence==='string'&&op.evidence.trim()&&text.includes(op.evidence),'Preference evidence must be an exact feedback excerpt');
  const fresh=op.id.startsWith('new:'),before=view.rows.find(r=>r.id===op.id);if(fresh)check(op.values.启用===true&&op.values.证据===op.evidence,'New preference candidates require their exact evidence and enabled draft value');else check(before?.table==='preferences'&&before.preferenceSource&&Object.keys(op.values).every(k=>['启用','修订原因'].includes(k)),'Existing contribution edits retain original score, evidence and group');
  const merged={...before?.values,...op.values},group=preferenceGroup(merged),source=fresh?op.preferenceSource:before.preferenceSource,key=source+'\0'+group;check(!seen.has(key),'Feedback contributes once per preference group');seen.add(key);
  check(typeof merged.核心标签==='string'&&merged.核心标签.trim()&&typeof merged.内容==='string'&&merged.内容.trim(),'Preference tag and instruction are required');check(Array.isArray(op.access?.knowers)&&op.access.knowers.length===0,'User preferences cannot become character knowledge');
  const hard=['必须','禁止'].includes(merged.强度);check(!hard||merged.性质!=='推测偏好','Inferred preference cannot create a hard constraint');check(hard||Number.isFinite(merged.赋分),'Scored preference needs its original numeric contribution');
  if(merged.强度==='喜爱')check(merged.赋分>=0,'Encouragement score is negative');if(merged.强度==='厌恶')check(merged.赋分<=0,'Aversion score is positive');
  const origin=fresh?{chatId}:copy(before.preferenceOrigin),identity=preferenceContributionIdentity({preferenceSource:source,preferenceOrigin:origin,values:merged});
  const duplicate=state.preferenceDrafts.some(d=>(!input.preferenceBankId||d.preferenceBankId===input.preferenceBankId)&&d.status!=='rejected'&&d.changes?.some(c=>c.after&&preferenceContributionIdentities(c.after).includes(identity)))||(state.preferenceRows??[]).some(r=>preferenceContributionIdentities(r).includes(identity));check(!fresh||!duplicate,'Feedback contribution is already pending or confirmed');
  sourceByChange.push({key,source,origin,group,feedbackSource:op.preferenceSource,feedbackOrigin:{chatId}});delete op.preferenceSource;
 }
 const prepared=prepareCommit(view,p,{source:input.currentSourceKey??null,kind:'preferences',evidence:[...sources.values()].join('\n\n'),allowedTables:['preferences'],allowSchemaExtensions:false,inferSchemaFields:false});
 prepared.commit.changes.forEach((c,i)=>{c.after.preferenceSource=sourceByChange[i].source;c.after.preferenceOrigin=copy(sourceByChange[i].origin);c.after.preferenceConfirmed=false;if(c.before)c.after.source=c.before.source;});
 const mutations=prepared.commit.changes.flatMap((c,i)=>c.before?[{id:c.id,feedbackSource:sourceByChange[i].feedbackSource,feedbackOrigin:copy(sourceByChange[i].feedbackOrigin),evidence:proposal.changes[i].evidence,reason:proposal.changes[i].values.修订原因??''}]:[]);
 return {prepared,contributions:sourceByChange,mutations};
}

/**
 * storage.read() and storage.compareAndWrite(expectedRevision,next) must be durable.
 * A failed/unknown callback is never automatically replayed. The store serializes one
 * runner instance; a real host must supply its own cross-instance concurrency guard.
 */
async function prepareReadbackCommit({archive,view,item,input,after,index,resolveEvidence}){
     const temporaryBusiness=copy(archive.business);
     for(const op of temporaryBusiness.changes){if(Array.isArray(op.evidence)){const resolved=await resolveEvidence({source:item.originalReference,paragraphs:op.evidence,scope:input.originalScope});op.evidence=resolved.envelope.text;}else{const source=(item.userSources??[]).find(s=>s.key===op.evidence.userSource);check(source?.text.includes(op.evidence.excerpt),'Preceding user evidence changed');op.evidence=op.evidence.excerpt;}}
     const maps=nativeMaps(view,after),combined={...temporaryBusiness,changes:[...temporaryBusiness.changes,...maps]};
     const options={...archive.options,evidence:[item.archiveSource.text,...(item.userSources??[]).map(s=>s.text),'Native callback readback'].join('\n\n'),allowedTables:[...archive.options.allowedTables,'native_cells']};
     const finalPrepared=prepareCommit(view,combined,options);
     // Use fixed business IDs allocated before callbacks, updating all typed references.
     const generatedAliases=new Map();archive.business.changes.forEach((op,i)=>{if(op.id.startsWith('new:'))generatedAliases.set(finalPrepared.commit.changes[i].id,archive.prepared.commit.changes[i].id);});
     for(const row of finalPrepared.rows){row.id=generatedAliases.get(row.id)??row.id;mapRowReferences(row,finalPrepared.registry,id=>generatedAliases.get(id)??id);for(const k of ['readers','knowers'])row.access[k]=row.access[k].map(id=>generatedAliases.get(id)??id);}
     for(const ch of finalPrepared.commit.changes){ch.id=generatedAliases.get(ch.id)??ch.id;if(ch.after){ch.after=copy(finalPrepared.rows.find(r=>r.id===ch.id));}}
     finalPrepared.commit.anchors.forEach((a,i)=>{a.row=generatedAliases.get(a.row)??a.row;a.before=copy(finalPrepared.commit.changes[i].before?.values??null);a.after=copy(finalPrepared.commit.changes[i].after?.values??null);a.evidence=i<archive.businessRefs.length?copy(archive.businessRefs[i]):{kind:'native-readback',source:archive.source,index,basis:copy(archive.nativeRefs)};});
     finalPrepared.commit.id=archive.prepared.commit.id;finalPrepared.commit.depends=archive.prepared.commit.depends;
     return finalPrepared;
}

export function createPreflightRunner({storage,requestA,bindArchiveParagraphs,resolveEvidence,native={},query,writerB,acceptWriterOutput,guard=()=>{},sourceGuard=async()=>{},onProgress,beforeWriter}){
 check(typeof storage?.read==='function'&&typeof storage?.compareAndWrite==='function'&&typeof requestA==='function','Runner dependencies are incomplete');check(typeof writerB!=='function'||typeof acceptWriterOutput==='function','A configured writer needs a worldbook A acceptance callback');let busy=false;
 const progress=(requestKey,phase,status='running')=>{try{onProgress?.({requestKey,phase,status});}catch(error){console.warn('[Tisya progress observer]',error);}};
 async function write(state,mutate){guard();const next=copy(state);mutate(next);next.revision=state.revision+1;const receipt=await storage.compareAndWrite(state.revision,next);guard();if(storage.capabilities?.verifiedWriteReadback===true)check(receipt?.revision===next.revision&&object(receipt.state),'Store verified readback receipt is invalid');const actual=storage.capabilities?.verifiedWriteReadback===true?copy(receipt.state):await storage.read();guard();check(sameJsonValue(actual,next),'Store write was not confirmed');return actual;}
 async function verifySources(input){await sourceGuard(input);for(const item of input.archiveSources)await bindArchiveParagraphs({proposal:emptyProposal(),source:item.originalReference,scope:input.originalScope});guard();}
 async function run(rawInput,{writeNarrative=true}={}){
  check(typeof writeNarrative==='boolean','Invalid narrative execution option');
  if(busy)throw failure('RUN_BUSY','A request is already active');busy=true;
  try{
   const input=normalizeInput(rawInput),inputHash=await digest(writeNarrative?input:{input,execution:'forms'});let state=await storage.read();stateValid(state);let record=state.requests[input.requestKey];
   if(record){check(record.inputHash===inputHash,'requestKey was reused for different input');if(record.status==='delivered'){await verifySources(input);if(record.result.deliveryReceipt)await acceptWriterOutput(null,copy(record.result.snapshot),{recovery:true,receipt:copy(record.result.deliveryReceipt)});return {...copy(record.result),output:null,reused:true};}if(record.status==='awaiting-model')throw failure('MODEL_OUTCOME_UNKNOWN','The previous model call has no durable response; use a new explicit request');if(['writer-running','writer-output'].includes(record.status))throw failure('WRITER_OUTCOME_UNKNOWN','Recover the existing host output receipt; the writer will not run again');}
   await verifySources(input);
   if(!record){
    const view=currentView(state,input);assertUnsettledWorldWindow(view,input.worldWindow);if(input.viewRevision!==undefined)check(input.viewRevision===state.revision,'Snapshot revision changed before preflight');
    state=await write(state,s=>{s.requests[input.requestKey]={inputHash,status:'awaiting-model',baseViewHash:null,createdAt:new Date().toISOString(),...writeNarrative?{}:{execution:'forms'}};});
    let response;
    if(input.preflightSkipped){response=formatSimpleSheet({requestKey:input.requestKey,archiveProposal:[],worldProposal:null,scope:{goal:input.currentUser??'',targets:[],timeWindow:'',stop:'',unknowns:[]},preferenceCandidates:emptyProposal(),archiveRequests:[],creativeBrief:{goal:'',beats:[],pendingChoices:[],due:[],clues:[],constraints:[]},pending:[]});}
    else {progress(input.requestKey,'model-a');const requestView=publicView(view);try{response=await requestA({...input,view:requestView,preferenceProjection:preferenceWeights(state,input)});}catch(error){error.preflightRequestFailed=true;throw error;}}
    guard();check(typeof response==='string','Model A must return one complete simple sheet');
    state=await write(state,s=>{Object.assign(s.requests[input.requestKey],{status:'response',response,baseViewHash:null});});record=state.requests[input.requestKey];
   }
   progress(input.requestKey,'validate');const result=parseSimpleSheet(record.response);const responseNewIds=validateEnvelope(result,input);
   if(!record.plan){
    let shadow=currentView(state,input);const aliases=new Map(),archivePlans=[],allNewIds=new Set(responseNewIds);
    const sourceOrder=Object.fromEntries(input.activeSourceKeys.map((key,index)=>[key,index]));
    for(const [index,batch]of result.archiveProposal.entries()){
     const item=input.archiveSources[index];check(!shadow.commits.some(c=>c.source===batch.source&&c.kind==='archive'&&!c.archiveSkipped),'Retained source was already archived');
     const bound=await boundArchive(batch.proposal,item,input,{bindArchiveParagraphs,resolveEvidence});const p=remapProposal(bound.proposal,shadow.registry,aliases,shadow.rows),nativeOps=p.changes.filter(op=>op.table==='native_cells'),businessOps=p.changes.filter(op=>op.table!=='native_cells');
     check(input.archiveEnabled!==false||businessOps.length===0&&p.templates.length===0&&p.schemaChanges.length===0,'Business archive is disabled');check(!item.nativeBridge?.nativeAlready||nativeOps.length===0,'This source native state is already settled');
     const business={...p,changes:businessOps};const businessRefs=p.changes.flatMap((op,i)=>op.table!=='native_cells'?[bound.refs[i]]:[]);
     check(!item.nativeBridge?.archiveAlready||business.changes.length===0&&business.templates.length===0&&business.schemaChanges.length===0,'Already archived business is read-only');
     const eligibleEvidence=[item.archiveSource.text,...(item.userSources??[]).map(s=>s.text)].join('\n\n');
     const allowed=shadow.registry.tables.filter(t=>t.owner==='archive'&&t.id!=='native_cells').map(t=>t.id),options={source:batch.source,kind:'archive',evidence:eligibleEvidence,allowedTables:allowed,sourceOrder,allowSchemaExtensions:true,inferSchemaFields:false};
     const prepared=scrubArchive(prepareCommit(shadow,business,options),businessRefs);registerAliases(business,prepared,aliases);for(const op of batch.proposal.changes)if(op.id.startsWith('new:'))allNewIds.add(op.id);
     const nativeOwned=item.nativeBridge?.nativeOwned===true||hasNativeUpdate(item.archiveSource.text);check(!nativeOwned||nativeOps.length===0,'Original native update owns this floor');
     let wire=null;
     if(nativeOps.length){check(item.nativeBridge?.enabled===true&&item.nativeBridge.writer==='native-mvu','Native writes require the original MVU owner');check(object(item.nativeState?.before?.stat_data),'Missing source-bound native baseline');wire=bridgePatch(shadow.rows,{changes:nativeOps},item.nativeState.before,eligibleEvidence);}
     const nativeRefs=p.changes.flatMap((op,i)=>op.table==='native_cells'?[bound.refs[i]]:[]);
     // Durable plans retain paragraph references, never source prose or envelopes.
     const wireEvidence=ref=>ref.kind==='user-source'?{userSource:ref.source,excerpt:ref.excerpt}:copy(ref.paragraphs);
     const storedBusiness=copy(business);storedBusiness.changes.forEach((op,i)=>{op.evidence=wireEvidence(businessRefs[i]);});
     const storedOptions=copy(options);delete storedOptions.evidence;
     const storedNativeOps=copy(nativeOps);storedNativeOps.forEach((op,i)=>{op.evidence=wireEvidence(nativeRefs[i]);});
     archivePlans.push({source:batch.source,itemIndex:index,prepared,business:storedBusiness,options:storedOptions,businessRefs,nativeRefs,nativeOps:storedNativeOps,wire,nativeOwned,syncNativeOwned:nativeOwned&&item.nativeBridge?.enabled===true});shadow=stepView(shadow,prepared);
     if(nativeOwned&&item.nativeBridge?.enabled===true){check(object(item.nativeState?.before?.stat_data),'Original-owned native source has no frozen snapshot');const maps=nativeMaps(shadow,item.nativeState.before);if(maps.length){const synced=prepareCommit(shadow,{changes:maps,pending:[]},{source:batch.source,kind:'native-sync',evidence:'Native callback readback',allowedTables:['native_cells'],allowSchemaExtensions:false,inferSchemaFields:false});shadow={...shadow,rows:synced.rows};}}
     if(nativeOps.length){const maps=nativeOps.map(op=>({...op,evidence:'Native proposed shadow'}));const simulated=prepareCommit(shadow,{changes:maps,pending:[]},{source:batch.source,kind:'native-fill',evidence:'Native proposed shadow',allowedTables:['native_cells'],allowSchemaExtensions:false,inferSchemaFields:false});shadow={...shadow,rows:simulated.rows};}
    }
    const worldInput=mapWorld(result.worldProposal,aliases);if(worldInput)for(const event of worldInput.events)for(const op of event.changes)remapPatchReferences(op,shadow.registry,aliases,shadow.rows);
    const world=prepareWorld(shadow,worldInput,input.worldWindow,{playerObjects:input.playerObjects??[],onstageObjects:input.onstageObjects??[],activeSourceKeys:input.activeSourceKeys,existingNewIds:allNewIds});
    if(world)registerAliases(world.proposal,world.prepared,aliases);
    const prefs=preparePreferences(shadow,result.preferenceCandidates,input,state);
    // Persist the fully checked plan before the first callback or business write.
    state=await write(state,s=>{Object.assign(s.requests[input.requestKey],{status:'planned',plan:{archivePlans,world,prefs,aliases:Object.fromEntries(aliases)},completedSources:[]});});record=state.requests[input.requestKey];
   }
   const plan=record.plan;
   for(const archive of plan.archivePlans){
    if(state.requests[input.requestKey].completedSources.includes(archive.source))continue;
    await verifySources(input);const item=input.archiveSources[archive.itemIndex];let view=currentView(state,input);
    // Staged prepared IDs remain fixed across retries; their before-images detect conflicts.
    for(const ch of archive.prepared.commit.changes)check(rowSame(view.rows.find(r=>r.id===ch.id)??null,ch.before),'Archive target changed after validation');
    let nativeReceipt=null,finalPrepared=copy(archive.prepared);
    if(archive.wire?.operations.length){
     const id=input.requestKey+'\0'+archive.source;let intent=state.nativeIntents[id];const baseline=item.nativeState.before,index=item.nativeState.index??item.nativeBridge.index;
     check(Number.isSafeInteger(index)&&index>=0&&native.runtime,'Native runtime or source index is missing');
     const baselineNow=native.runtime.getMvuData({type:'message',message_id:item.nativeState.snapshotIndex??index});
     const ownReadback=intent&&['parsed','applied'].includes(intent.phase)&&(item.nativeState.snapshotIndex??index)===index&&same(baselineNow?.stat_data,intent.after.stat_data);
     check(same(baselineNow?.stat_data,baseline.stat_data)||ownReadback,'Native baseline changed');
     if(!intent){state=await write(state,s=>{s.nativeIntents[id]={phase:'parsing',source:archive.source,index,before:copy(baseline),operations:copy(archive.wire.operations)};});
      progress(input.requestKey,'native');const parsed=await parseNativeTransaction({runtime:native.runtime,eventSource:native.eventSource,index,before:baseline,block:archive.wire.block,guard});const outcome=auditNativeOutcome(archive.wire.operations,baseline.stat_data,parsed.after.stat_data);
      state=await write(state,s=>{Object.assign(s.nativeIntents[id],{phase:'parsed',after:parsed.after,outcome,stagedWrites:parsed.stagedWrites});});intent=state.nativeIntents[id];
     }
     check(intent.phase==='parsed'||intent.phase==='applied','Native callback outcome is unknown; it will not be replayed');check(intent.outcome.rejected.length===0,'Original MVU rules rejected an update');
     const current=native.runtime.getMvuData({type:'message',message_id:index});check(!current?.stat_data||same(current.stat_data,baseline.stat_data)||same(current.stat_data,intent.after.stat_data),'Native target changed');
     finalPrepared=await prepareReadbackCommit({archive,view,item,input,after:intent.after,index,resolveEvidence});
     await verifySources(input);
     if(!same(current?.stat_data,intent.after.stat_data)){guard();await native.runtime.replaceMvuData(copy(intent.after),{type:'message',message_id:index});guard();}
     const actual=native.runtime.getMvuData({type:'message',message_id:index});check(same(actual?.stat_data,intent.after.stat_data),'Native writeback was not confirmed');
     if(native.context)await carryNativeForward({context:native.context,runtime:native.runtime,index,before:baseline,after:actual,guard});
     nativeReceipt={phase:'applied',source:archive.source,index,outcome:copy(intent.outcome),stagedWrites:intent.stagedWrites,basis:copy(archive.nativeRefs)};
    }else if(archive.syncNativeOwned){
     const index=item.nativeState?.index??item.nativeBridge?.index,actual=native.runtime?.getMvuData({type:'message',message_id:index});check(object(actual?.stat_data),'Original-owned native source has no actual snapshot');
     check(same(actual.stat_data,item.nativeState?.before?.stat_data),'Original-owned snapshot changed after source freeze');
     finalPrepared=await prepareReadbackCommit({archive,view,item,input,after:actual,index,resolveEvidence});
     nativeReceipt={phase:'original-owned',source:archive.source,index};
    }
    progress(input.requestKey,'archive');finalPrepared.commit.contextSource=input.currentSourceKey??null;finalPrepared.commit.archiveSkipped=input.archiveEnabled===false;finalPrepared.commit.requiredSources=[...new Set([...archive.businessRefs,...archive.nativeRefs].filter(ref=>ref.kind==='user-source').map(ref=>ref.source))];if(nativeReceipt)finalPrepared.commit.nativeReceipt=nativeReceipt;
    await verifySources(input);state=await write(state,s=>{s.commits.push(finalPrepared.commit);s.requests[input.requestKey].completedSources.push(archive.source);const id=input.requestKey+'\0'+archive.source;if(s.nativeIntents[id])s.nativeIntents[id].phase='applied';});
   }
   if(!state.requests[input.requestKey].worldDone){progress(input.requestKey,'world');
    await verifySources(input);const view=currentView(state,input);if(plan.world)assertUnsettledWorldWindow(view,input.worldWindow);assertWorldBasisUnchanged(plan.world,view);
    if(plan.world){const w=plan.world;for(const ch of w.prepared.commit.changes)check(rowSame(view.rows.find(r=>r.id===ch.id)??null,ch.before),'World consequence changed after archival readback');w.prepared.commit.contextSource=input.currentSourceKey??null;w.prepared.commit.progression=copy(w.receipt);state=await write(state,s=>{s.commits.push(copy(w.prepared.commit));s.requests[input.requestKey].worldDone=true;});}
    else state=await write(state,s=>{s.requests[input.requestKey].worldDone=true;});
   }
   if(!state.requests[input.requestKey].preferencesDone){progress(input.requestKey,'preferences');state=await write(state,s=>{if(plan.prefs.prepared.commit.changes.length)s.preferenceDrafts.push({id:'preference:'+input.requestKey,requestKey:input.requestKey,...(input.preferenceBankId?{preferenceBankId:input.preferenceBankId}:{}),status:'pending',contributions:copy(plan.prefs.contributions),mutations:copy(plan.prefs.mutations),changes:copy(plan.prefs.prepared.commit.changes),contextSource:input.currentSourceKey??null});s.requests[input.requestKey].preferencesDone=true;});}
   if(writeNarrative&&typeof beforeWriter==='function'){await beforeWriter({input:copy(input),view:currentView(state,input)});guard();state=await storage.read();stateValid(state);await verifySources(input);}
   const alias=id=>plan.aliases[id]??id,reads=[];for(const request of result.archiveRequests){progress(input.requestKey,'query');check(typeof query==='function','Archive query adapter is unavailable');const baseArgs=copy(request.arguments);if(typeof baseArgs.id==='string')baseArgs.id=alias(baseArgs.id);if(Array.isArray(baseArgs.ids))baseArgs.ids=baseArgs.ids.map(alias);let args=copy(baseArgs),seen=new Set();for(let page=0;;page++){check(page<100,'Read pagination exceeded its bound');const receipt=await query(request.method,args,{input,view:projectRetained(state,input.activeSourceKeys)});check(object(receipt),'Archive query did not return a receipt');reads.push({method:request.method,purpose:request.purpose,result:copy(receipt)});if(!receipt.has_more)break;check(typeof receipt.next_cursor==='string'&&receipt.next_cursor&&!seen.has(receipt.next_cursor),'Invalid archive pagination cursor');seen.add(receipt.next_cursor);args={...baseArgs,cursor:receipt.next_cursor};}}
   const scope=copy(result.scope);scope.targets=scope.targets.map(alias);const creativeBrief=copy(result.creativeBrief);for(const beat of creativeBrief.beats)beat.basis=beat.basis.map(alias);for(const key of ['pendingChoices','due','clues','constraints'])creativeBrief[key]=creativeBrief[key].map(alias);
   const view=currentView(state,input),snapshot={requestKey:input.requestKey,generationType:input.generationType,...(input.identity?{identity:copy(input.identity)}:{}),...(input.advancedReroll?{advancedReroll:copy(input.advancedReroll)}:{}),...projectWriter(view),preferenceProjection:preferenceWeights(state,input),scope,creativeBrief,toolReceipts:reads,preferenceDrafts:input.preferencesEnabled===false?[]:state.preferenceDrafts.filter(d=>(!input.preferenceBankId||d.preferenceBankId===input.preferenceBankId)&&d.status==='pending'&&(!d.contextSource||input.activeSourceKeys.includes(d.contextSource)||d.contributions.some(c=>c.source.startsWith('feedback:')))).map(d=>({id:d.id,count:d.changes.length})),receipt:{archiveSources:copy(state.requests[input.requestKey].completedSources),world:plan.world?.receipt??null,modelCalls:input.preflightSkipped?0:1,...(input.preflightSkipped?{preflightSkipped:input.preflightSkipped}:{})}};
   // Query payloads may contain explicitly requested original excerpts. Keep only
   // their receipt identities in the durable writer journal; A remains canonical.
   const durableSnapshot={...copy(snapshot),toolReceipts:reads.map(r=>({method:r.method,purpose:r.purpose,result:{status:r.result.status??'ok',snapshot:r.result.snapshot??null,has_more:r.result.has_more??false}}))};
   if(!writeNarrative){await verifySources(input);const durable={snapshot:durableSnapshot,deliveryReceipt:null};await write(state,s=>{Object.assign(s.requests[input.requestKey],{status:'delivered',result:copy(durable)});});return {snapshot,deliveryReceipt:null,output:null,reused:false};}
   state=await write(state,s=>{Object.assign(s.requests[input.requestKey],{status:'writer-running',writerSnapshot:durableSnapshot});});await verifySources(input);progress(input.requestKey,'writer');const output=typeof writerB==='function'?await writerB(copy(snapshot)):null;
   state=await write(state,s=>{s.requests[input.requestKey].status='writer-output';});
   progress(input.requestKey,'original-a');const deliveryReceipt=typeof writerB==='function'?await acceptWriterOutput(output,copy(snapshot)):null;
   if(typeof writerB==='function')validateDeliveryReceipt(deliveryReceipt,input.requestKey);
   const durable={snapshot:durableSnapshot,deliveryReceipt};state=await write(state,s=>{Object.assign(s.requests[input.requestKey],{status:'delivered',result:copy(durable)});});return {snapshot,deliveryReceipt,output,reused:false};
  }finally{busy=false;}
 }
 async function recoverWriterOutput({requestKey,receipt}){
  check(!busy,'A request is already active');busy=true;
  try{let state=await storage.read();stateValid(state);const record=state.requests[requestKey];check(record&&['writer-running','writer-output','delivered'].includes(record.status),'There is no pending writer output');check(typeof acceptWriterOutput==='function','Writer recovery needs the original-store acceptance callback');validateDeliveryReceipt(receipt,requestKey);guard();const deliveryReceipt=await acceptWriterOutput(null,copy(record.writerSnapshot),{recovery:true,receipt:copy(receipt)});validateDeliveryReceipt(deliveryReceipt,requestKey);if(record.status==='delivered'){check(same(deliveryReceipt,record.result.deliveryReceipt),'Writer recovery receipt differs from the delivered output');return {...copy(record.result),output:null,reused:true};}const durable={snapshot:copy(record.writerSnapshot),deliveryReceipt};state=await write(state,s=>{Object.assign(s.requests[requestKey],{status:'delivered',result:copy(durable)});});return {...durable,output:null,reused:true};}finally{busy=false;}
 }
 return {run,recoverWriterOutput,inspect:async(activeSourceKeys,preferenceProjectionOptions={})=>{const state=await storage.read();return projectWriter(currentView(state,{activeSourceKeys,preferencesEnabled:preferenceProjectionOptions.enabled!==false,preferenceProjectionOptions}));}};
}

function validateDeliveryReceipt(receipt,requestKey){check(object(receipt)&&typeof receipt.entryId==='string'&&receipt.entryId&&Number.isSafeInteger(receipt.revision)&&receipt.revision>0&&typeof receipt.hash==='string'&&receipt.hash,'Writer acceptance requires an original-store receipt');check(receipt.sourceRevision==='candidate:'+requestKey,'Writer receipt belongs to a different generation request');const forbidden=new Set(['content','body','mes','output']);check(!Object.keys(receipt).some(k=>forbidden.has(k)),'Writer receipt cannot duplicate source prose');}
