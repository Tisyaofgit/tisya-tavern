import {check,copy,object,registryIndex} from '../../../tables/schema.js';
import {digest} from '../../../tables/books.js';
import {createWorldbookTableStorage} from '../host/table-storage.mjs';
import {confirmPreferenceDraft,rejectPreferenceDraft,setPreferenceContributionEnabled,revisePreferenceContribution,projectPreferences} from './service.mjs';

const canonical=v=>Array.isArray(v)?v.map(canonical):object(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const equal=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const nonempty=v=>typeof v==='string'&&v.trim();
const serial=()=>{let tail=Promise.resolve();return fn=>{const task=tail.then(fn);tail=task.catch(()=>{});return task;};};
const ownerValid=owner=>object(owner)&&nonempty(owner.chatId)&&nonempty(owner.branchId);
const hash=value=>digest(canonical(value));
const stamp=draft=>({id:draft.id,requestKey:draft.requestKey,changes:draft.changes,contributions:draft.contributions,mutations:draft.mutations??[],contextSource:draft.contextSource??null,...(draft.preferenceBankId?{preferenceBankId:draft.preferenceBankId}:{})});

export function createInitialPreferenceBank({registry}){
 registryIndex(registry);
 return {format:'tisya.preferences-bank/1',revision:0,baseView:{registry:copy(registry)},preferenceRows:[],preferenceHistory:[],preferenceDrafts:[],receipts:{}};
}

/** P is one shared owner, independent of the current chat/branch owner of B. */
export function createWorldbookPreferenceStorage({transport,bookId,registry}){
 return createWorldbookTableStorage({transport,bookId,owner:{chatId:'tisya-preferences',branchId:'global'},initialState:createInitialPreferenceBank({registry})});
}

function validateBank(bank){
 check(bank?.format==='tisya.preferences-bank/1'&&Number.isSafeInteger(bank.revision)&&bank.revision>=0&&object(bank.receipts)&&Array.isArray(bank.preferenceDrafts)&&bank.preferenceDrafts.length===0,'Shared preference bank is invalid');
 // Validates every contribution, even when it is not part of the current projection.
 projectPreferences(bank);return bank;
}

function cleanSession(session){
 check(object(session)&&Number.isSafeInteger(session.revision)&&Array.isArray(session.preferenceDrafts),'Session preference drafts are invalid');
 check(!(session.preferenceRows?.length)&&!(session.preferenceHistory?.length),'Legacy confirmed preference bank in B requires explicit migration to P');
 check(!(session.baseView?.rows??[]).some(row=>row.table==='preferences')&&!(session.commits??[]).some(commit=>(commit.changes??[]).some(change=>change.after?.table==='preferences')),'Business ledger cannot own confirmed preferences');
 return session;
}

function stripProjection(value){const out=copy(value);delete out.preferenceRows;delete out.preferenceHistory;delete out.preferenceBankReference;delete out.preferenceBankReceipts;return out;}
async function projected(session,bank){return {...copy(session),preferenceRows:copy(bank.preferenceRows),preferenceHistory:copy(bank.preferenceHistory),preferenceBankReceipts:copy(Object.values(bank.receipts).filter(r=>r.status==='accepted')),preferenceBankReference:{revision:bank.revision,fingerprint:await hash(bank)}};}
async function writeVerified(storage,before,next,label,guard=()=>{}){
 guard();check(equal(await storage.read(),before),label+' changed before persistence');guard();
 next.revision=before.revision+1;await storage.compareAndWrite(before.revision,next);guard();
 const actual=await storage.read();check(equal(actual,next),label+' persistence readback did not match');guard();return actual;
}

/** Only ephemeral reads contain the P projection. Writes persist B-owned fields only. */
export function createPreferenceOverlayStorage({sessionStorage,preferenceStorage}){
 const queue=serial();
 return {
  capabilities:{managedSingleWriter:true,consistencyScope:'single-controller',crossStoreAtomicity:false,verifiedWriteReadback:true},
  read:()=>queue(async()=>{
   // B and P are independent reads. Keep the serial queue until both settle,
   // including failure, so a following write cannot overtake a pending read.
   const results=await Promise.allSettled([sessionStorage.read(),preferenceStorage.read()]);
   for(const result of results)if(result.status==='rejected')throw result.reason;
   return projected(cleanSession(results[0].value),validateBank(results[1].value));
  }),
  compareAndWrite:(expectedRevision,next)=>queue(async()=>{
   const bank=validateBank(await preferenceStorage.read()),reference={revision:bank.revision,fingerprint:await hash(bank)};
   check(equal(next.preferenceBankReference,reference),'Preference bank changed; discard the stale writer snapshot');
   check(equal(next.preferenceRows,bank.preferenceRows)&&equal(next.preferenceHistory,bank.preferenceHistory)&&equal(next.preferenceBankReceipts,Object.values(bank.receipts).filter(r=>r.status==='accepted')),'Runner cannot write the shared preference projection');
   const session=cleanSession(await sessionStorage.read());check(session.revision===expectedRevision,'Session ledger revision conflict');
   const plain=stripProjection(next);check(plain.revision===expectedRevision+1,'Session revision must advance once');
   const receipt=await sessionStorage.compareAndWrite(expectedRevision,plain);
   if(sessionStorage.capabilities?.verifiedWriteReadback===true)check(receipt?.revision===plain.revision&&object(receipt.state),'Session ledger verified readback receipt is invalid');
   const actual=cleanSession(sessionStorage.capabilities?.verifiedWriteReadback===true?copy(receipt.state):await sessionStorage.read());check(equal(actual,plain),'Session ledger readback did not match');
   const actualBank=await preferenceStorage.read();check(equal(actualBank,bank),'Preference bank changed during session persistence');
   const state=await projected(actual,actualBank);check(equal(state,next),'Projected ledger readback did not match');
   return {revision:actual.revision,state:copy(state)};
  })
 };
}

/** P commit receipt precedes B draft acknowledgement; these two writes are recoverable, not atomic. */
export function createSharedPreferenceService({sessionStorage,preferenceStorage,getSessionOwner,isEnabled=()=>true,getProjectionOptions=()=>({}),preferenceBankId=null}){
 check(typeof getSessionOwner==='function','An actual session/branch owner getter is required');
 const queue=serial();
 check(preferenceBankId===null||nonempty(preferenceBankId),'Preference bank identity must be a stable ID');
 function belongs(draft,bank,captured){
  if(!preferenceBankId)return true;
  if(draft.preferenceBankId)return draft.preferenceBankId===preferenceBankId;
  return Object.values(bank.receipts).some(r=>r.status==='accepted'&&r.draftId===draft.id&&equal(r.owner,captured.owner));
 }
 function assertDraftOwner(draft,bank,captured){check(draft,'Preference draft does not exist');check(belongs(draft,bank,captured),draft.preferenceBankId?'偏好候选属于另一用户身份，未写入当前偏好库':'旧偏好候选缺少身份归属记录；原候选保留，不能写入当前偏好库');}
 function capture(){const owner=copy(getSessionOwner()),projection=copy(getProjectionOptions());check(ownerValid(owner),'Session/branch identity is required');return {owner,guard(){check(equal(getSessionOwner(),owner),'Session/branch changed during preference operation');check(equal(getProjectionOptions(),projection),'Preference source projection changed during operation');}};}
 async function confirm(id,options={}){return queue(async()=>{
  const captured=capture();let session=cleanSession(await sessionStorage.read()),bank=validateBank(await preferenceStorage.read());captured.guard();
  if(options.expectedRevision!==undefined)check(session.revision===options.expectedRevision,'Preference draft revision conflict');
  const draft=session.preferenceDrafts.find(item=>item.id===id);assertDraftOwner(draft,bank,captured);
  const operation=await hash([captured.owner,id]),fingerprint=await hash(stamp(draft));let receipt=bank.receipts[operation],recovered=!!receipt;
  if(receipt){check(receipt.fingerprint===fingerprint&&equal(receipt.owner,captured.owner),'Preference confirmation receipt conflicts with draft');}
  else{
   check(isEnabled(),'Preference processing is disabled');check(draft.status==='pending','Unreceipted preference draft must be pending');
   const input=copy(draft);
   for(const change of input.changes)if(!change.before){
    check(!change.after.preferenceOrigin||change.after.preferenceOrigin.chatId===captured.owner.chatId,'Preference source belongs to another chat');
    change.after.preferenceOrigin={chatId:captured.owner.chatId};
    if(change.after.values.作用域?.全局!==true&&!(change.after.values.作用域?.会话?.length))change.after.preferenceOwner={chatId:captured.owner.chatId};
   }
   for(const mutation of input.mutations??[]){check(!mutation.feedbackOrigin||mutation.feedbackOrigin.chatId===captured.owner.chatId,'Mutation feedback belongs to another chat');mutation.feedbackOrigin={chatId:captured.owner.chatId};}
   const temporary={...copy(bank),preferenceDrafts:[input]},accepted=confirmPreferenceDraft(temporary,id,{enabled:true,now:options.now}),next=copy(bank);
   next.preferenceRows=accepted.preferenceRows;next.preferenceHistory=accepted.preferenceHistory;
   receipt={operation,owner:captured.owner,draftId:id,fingerprint,status:'accepted',reviewedAt:accepted.preferenceDrafts[0].reviewedAt,bankRevision:bank.revision+1};
   next.receipts[operation]=receipt;captured.guard();bank=await writeVerified(preferenceStorage,bank,next,'Preference bank',captured.guard);captured.guard();
  }
  // A failure here is resumed from P's receipt, without applying the contribution again.
  session=cleanSession(await sessionStorage.read());captured.guard();const current=session.preferenceDrafts.find(item=>item.id===id);
  check(current&&await hash(stamp(current))===fingerprint,'Preference draft changed after bank confirmation');
  check(['pending','accepted'].includes(current.status),'Preference bank committed but the session draft now conflicts');
  if(current.status==='accepted'){check(session.preferenceConfirmations?.[operation]?.fingerprint===fingerprint,'Session acknowledgement lacks its bank receipt');return {changed:false,recovered,revision:session.revision,preferenceRevision:receipt.bankRevision};}
  const next=copy(session),target=next.preferenceDrafts.find(item=>item.id===id);target.status='accepted';target.reviewedAt=receipt.reviewedAt;
  next.preferenceConfirmations??={};next.preferenceConfirmations[operation]=copy(receipt);
  captured.guard();const saved=await writeVerified(sessionStorage,session,next,'Preference draft acknowledgement',captured.guard);captured.guard();
  return {changed:true,recovered,revision:saved.revision,preferenceRevision:receipt.bankRevision};
 });}
 function sourceValid(draft,captured){
  const active=new Set(getProjectionOptions().activeSourceKeys??[]),independent=draft.contributions?.some(c=>c.source?.startsWith('feedback:'));
  check(!draft.contextSource||active.has(draft.contextSource)||independent,'Preference draft context is no longer retained');
  for(const [index,contribution] of (draft.contributions??[]).entries()){const change=draft.changes?.[index],feedback=change?.before?(draft.mutations??[]).find(m=>m.id===change.id)?.feedbackSource:contribution.source;check(feedback?.startsWith('feedback:')||active.has(feedback),'Preference feedback source is no longer retained');}
  for(const change of draft.changes??[])if(!change.before)check(!change.after.preferenceOrigin||change.after.preferenceOrigin.chatId===captured.owner.chatId,'Preference source belongs to another chat');
 }
 async function prepareBatch(ids,session,bank,captured,options={}){
  check(Array.isArray(ids)&&ids.length>0&&ids.every(nonempty)&&new Set(ids).size===ids.length,'Preference batch requires unique draft IDs');
  const entries=[],next=copy(bank);
  for(const id of ids){const draft=session.preferenceDrafts.find(d=>d.id===id);check(draft,'Preference batch contains a missing draft');assertDraftOwner(draft,bank,captured);
   const fingerprint=await hash(stamp(draft)),operation=await hash([captured.owner,id]),receipt=bank.receipts[operation];
   if(options.fingerprints)check(options.fingerprints[id]===fingerprint,'Preference batch draft changed after preview');
   if(receipt){check(receipt.fingerprint===fingerprint&&equal(receipt.owner,captured.owner),'Preference confirmation receipt conflicts with draft');entries.push({id,fingerprint,operation,receipt:copy(receipt)});continue;}
   check(isEnabled(),'Preference processing is disabled');check(draft.status==='pending','Preference batch contains a handled draft');sourceValid(draft,captured);
   const input=copy(draft);for(const change of input.changes)if(!change.before){change.after.preferenceOrigin={chatId:captured.owner.chatId};if(change.after.values.作用域?.全局!==true&&!(change.after.values.作用域?.会话?.length))change.after.preferenceOwner={chatId:captured.owner.chatId};}
   for(const mutation of input.mutations??[]){check(!mutation.feedbackOrigin||mutation.feedbackOrigin.chatId===captured.owner.chatId,'Mutation feedback belongs to another chat');mutation.feedbackOrigin={chatId:captured.owner.chatId};}
   const accepted=confirmPreferenceDraft({...copy(next),preferenceDrafts:[input]},id,{enabled:true,now:options.now});next.preferenceRows=accepted.preferenceRows;next.preferenceHistory=accepted.preferenceHistory;
   const r={operation,owner:captured.owner,draftId:id,fingerprint,status:'accepted',reviewedAt:accepted.preferenceDrafts[0].reviewedAt,bankRevision:bank.revision+1};next.receipts[operation]=r;entries.push({id,fingerprint,operation,receipt:r});
  }
  return {next,entries};
 }
 async function previewBatch(ids,options={}){return queue(async()=>{const captured=capture(),session=cleanSession(await sessionStorage.read()),bank=validateBank(await preferenceStorage.read());captured.guard();const prepared=await prepareBatch(ids,session,bank,captured,options);captured.guard();return {draftIds:copy(ids),fingerprints:Object.fromEntries(prepared.entries.map(e=>[e.id,e.fingerprint])),revision:session.revision,preferenceRevision:bank.revision,owner:copy(captured.owner)};});}
 async function confirmBatch(ids,options={}){return queue(async()=>{
  check(nonempty(options.operationId),'Batch confirmation requires an operation ID');const captured=capture();let session=cleanSession(await sessionStorage.read()),bank=validateBank(await preferenceStorage.read());captured.guard();
  const operation=await hash([captured.owner,'preference-batch',options.operationId]),fingerprint=await hash({ids,fingerprints:options.fingerprints}),existing=bank.receipts[operation];let batch=existing,acknowledgementOnly=false;
  if(existing)check(existing.kind==='preference-batch'&&existing.fingerprint===fingerprint&&equal(existing.owner,captured.owner),'Batch operation ID was reused for different candidates');
  else {
   if(options.expectedRevision!==undefined)check(session.revision===options.expectedRevision,'Preference draft revision conflict');
   if(options.expectedPreferenceRevision!==undefined)check(bank.revision===options.expectedPreferenceRevision,'Preference bank revision conflict');
   check(object(options.fingerprints),'Batch confirmation requires its preview fingerprints');const prepared=await prepareBatch(ids,session,bank,captured,options);
   acknowledgementOnly=prepared.entries.every(e=>!!bank.receipts[e.operation]);batch={kind:'preference-batch',operation,owner:captured.owner,fingerprint,draftIds:copy(ids),entries:prepared.entries.map(e=>({id:e.id,operation:e.operation,fingerprint:e.fingerprint})),itemCount:ids.reduce((n,id)=>n+session.preferenceDrafts.find(d=>d.id===id).changes.length,0),bankRevision:bank.revision+1};if(acknowledgementOnly)batch.bankRevision=Math.max(...prepared.entries.map(e=>e.receipt.bankRevision));else prepared.next.receipts[operation]=batch;
   // Every candidate has already passed validation against the same temporary bank.
   try{if(!acknowledgementOnly)bank=await writeVerified(preferenceStorage,bank,prepared.next,'Preference batch bank',captured.guard);}catch(error){const actual=validateBank(await preferenceStorage.read());if(!equal(actual.receipts[operation],batch))throw error;bank=actual;}
  }
  try{
   captured.guard();session=cleanSession(await sessionStorage.read());const next=copy(session);let changed=false;
   for(const entry of batch.entries){const current=next.preferenceDrafts.find(d=>d.id===entry.id),receipt=bank.receipts[entry.operation];check(current&&await hash(stamp(current))===entry.fingerprint,'Preference batch draft changed after bank confirmation');check(receipt&&receipt.fingerprint===entry.fingerprint,'Preference batch bank receipt is missing');check(['pending','accepted'].includes(current.status),'Preference batch acknowledgement conflicts with draft');
    if(current.status==='accepted')check(next.preferenceConfirmations?.[entry.operation]?.fingerprint===entry.fingerprint,'Session acknowledgement lacks its bank receipt');
    else{current.status='accepted';current.reviewedAt=receipt.reviewedAt;next.preferenceConfirmations??={};next.preferenceConfirmations[entry.operation]=copy(receipt);changed=true;}
   }
   const saved=changed?await writeVerified(sessionStorage,session,next,'Preference batch acknowledgement',captured.guard):session;captured.guard();return {status:'accepted',count:batch.itemCount,changed,recovered:!!existing||acknowledgementOnly,revision:saved.revision,preferenceRevision:batch.bankRevision,operationId:options.operationId};
  }catch(error){return {status:'pending-acknowledgement',pendingAcknowledgement:true,count:batch.itemCount,preferenceRevision:batch.bankRevision,operationId:options.operationId,error:{message:error.message}};}
 });}
 async function manual(kind,id,payload,options,transition){return queue(async()=>{
  const captured=capture(),before=validateBank(await preferenceStorage.read());captured.guard();const operationId=options.operationId;
  if(kind==='revise')check(nonempty(operationId),'Manual preference revision requires an operation ID');
  const operation=operationId?await hash([captured.owner,'manual-preference',operationId]):null,fingerprint=await hash({kind,id,payload,reason:options.reason,expectedRowRevision:options.expectedRowRevision}),receipt=operation?before.receipts[operation]:null;
  if(receipt){check(receipt.kind==='manual-preference'&&receipt.fingerprint===fingerprint&&equal(receipt.owner,captured.owner),'Manual preference receipt conflicts with submitted values');return {changed:false,recovered:true,preferenceRevision:receipt.bankRevision,rowRevision:receipt.rowRevision};}
  if(options.expectedPreferenceRevision!==undefined)check(before.revision===options.expectedPreferenceRevision,'Preference bank revision conflict');
  const next=transition(before);if(equal(next,before))return {changed:false,preferenceRevision:before.revision,rowRevision:before.preferenceRows.find(r=>r.id===id)?.rev};
  const row=next.preferenceRows.find(r=>r.id===id);if(operation)next.receipts[operation]={kind:'manual-preference',operation,owner:captured.owner,fingerprint,rowId:id,rowRevision:row.rev,bankRevision:before.revision+1};
  const latest=next.preferenceHistory.at(-1);if(latest&&latest.subject===id){latest.manualOwner=copy(captured.owner);if(operationId)latest.operationId=operationId;}
  const saved=await writeVerified(preferenceStorage,before,next,'Preference bank',captured.guard);return {changed:true,recovered:false,preferenceRevision:saved.revision,rowRevision:row.rev};
 });}
 return {
  confirm,previewBatch,confirmBatch,
  reject:(id,options={})=>queue(async()=>{
   const captured=capture(),session=cleanSession(await sessionStorage.read()),bank=validateBank(await preferenceStorage.read());captured.guard();
   assertDraftOwner(session.preferenceDrafts.find(d=>d.id===id),bank,captured);const operation=await hash([captured.owner,id]);check(!bank.receipts[operation],'Preference already committed to P; resume confirmation or explicitly disable its contribution');
   if(options.expectedRevision!==undefined)check(session.revision===options.expectedRevision,'Preference draft revision conflict');
   const combined={...copy(session),preferenceRows:copy(bank.preferenceRows),preferenceHistory:copy(bank.preferenceHistory)},result=rejectPreferenceDraft(combined,id,options);
   if(equal(result,combined))return {changed:false,revision:session.revision};
   const next=stripProjection(result);next.preferenceReviewHistory=[...(session.preferenceReviewHistory??[]),...result.preferenceHistory.slice(bank.preferenceHistory.length)];
   captured.guard();const saved=await writeVerified(sessionStorage,session,next,'Preference draft rejection',captured.guard);return {changed:true,revision:saved.revision};
  }),
  setEnabled:(id,enabled,options={})=>manual('activation',id,{enabled},options,state=>setPreferenceContributionEnabled(state,id,enabled,options)),
  revise:(id,values,options={})=>manual('revise',id,{values},options,state=>revisePreferenceContribution(state,id,values,options)),
  async project(options={}){const captured=capture(),bank=validateBank(await preferenceStorage.read());captured.guard();const result=projectPreferences(bank,{...getProjectionOptions(),...options,chatId:captured.owner.chatId,enabled:isEnabled()&&options.enabled!==false});captured.guard();return result;},
  async list({includeDisabled=false}={}){const captured=capture(),enabled=isEnabled();if(!enabled&&!includeDisabled)return {drafts:[],rows:[],history:[]};const session=cleanSession(await sessionStorage.read());captured.guard();const bank=validateBank(await preferenceStorage.read());captured.guard();return {...(includeDisabled?{enabled}:{}),drafts:copy(session.preferenceDrafts.filter(d=>belongs(d,bank,captured))),...(preferenceBankId?{unresolvedDraftCount:session.preferenceDrafts.filter(d=>!d.preferenceBankId&&d.status==='pending'&&!belongs(d,bank,captured)).length}:{}),rows:copy(bank.preferenceRows),history:copy([...bank.preferenceHistory,...(session.preferenceReviewHistory??[]).filter(h=>!preferenceBankId||session.preferenceDrafts.some(d=>d.id===h.subject&&belongs(d,bank,captured)))]),confirmations:copy(Object.values(bank.receipts).filter(r=>r.status==='accepted'&&equal(r.owner,captured.owner)))};}
 };
}
