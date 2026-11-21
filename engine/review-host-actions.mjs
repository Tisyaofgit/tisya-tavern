import {clone,sha256,fail} from './common.mjs';
import {messageSignature} from './message-identity.mjs';
import {Runtime} from './runtime.mjs';
import {inversePatch} from './journal.mjs';
import {fillBackfillFloor} from './history-backfill.mjs';
import {projectReviewSchema,validateReviewSettings,planReviewBackfill,commitReviewBackfill,activeBackfillReceipts,backfillValuesFromReply} from './review-workflow.mjs';

// Pure staged mutation. The host performs one ownership/revision checked CAS.
export function applyReviewAction(bundle,messages,scope,input){
 const next=clone(bundle),meta=next.turn_review;
 if(input.action==='settings'){meta.settings=validateReviewSettings(next.state,input.settings);projectReviewSchema(next.state,meta.settings);}
 else if(input.action==='draft'){
  const message=messages.find(m=>m.uid===input.uid);if(!message||sha256(message.text)!==input.hash)fail('REVIEW_STALE','草稿对应正文已变化');
  meta.drafts??={};meta.drafts[input.uid]={hash:input.hash,cells:String(input.cells??''),archive:String(input.archive??''),responses:clone(input.responses??{})};
 }else if(input.action==='prepareBackfill')meta.backfill=planReviewBackfill(next.state,messages,scope,meta.settings??{},input,activeBackfillReceipts(next,messages,scope));
 else if(input.action==='fillBackfill'){
  if(meta.backfill?.id!==input.batchId)fail('REVIEW_STALE','补录批次已变化');
  const floor=meta.backfill.floors.find(f=>f.id===input.uid);if(!floor||!['pending','ready'].includes(floor.status))fail('REVIEW_STALE','此层已确认或不可补录');
  floor.status='pending';meta.backfill=fillBackfillFloor(meta.backfill,input.uid,input.values);meta.backfill.floors.find(f=>f.id===input.uid).reviewed=input.reviewed===true;
 }else if(input.action==='modelBackfill'){
  if(meta.backfill?.id!==input.batchId)fail('REVIEW_STALE','补录批次已变化');
  const floor=meta.backfill.floors.find(f=>f.id===input.uid);if(!floor||!['pending','ready'].includes(floor.status))fail('REVIEW_STALE','本层不可提炼');
  floor.status='pending';floor.raw=String(input.raw??'');
  try{meta.backfill=backfillValuesFromReply(next.state,meta.backfill,input.uid,input.raw);meta.backfill.floors.find(f=>f.id===input.uid).error='';}
  catch(error){floor.error='提炼结果尚未通过校验：'+error.message;}
 }else if(input.action==='confirmBackfill'){
  if(meta.backfill?.id!==input.batchId)fail('REVIEW_STALE','补录批次已变化');
  const result=commitReviewBackfill(next.state,meta.backfill,input.uid,messages,activeBackfillReceipts(next,messages,scope)),e=new Runtime(next.state);
  for(const change of result.changes){if(!e.rows(change.tableId)[change.recordId])e.newRecord(change.tableId,{},change.recordId);for(const [k,v]of Object.entries(change.values))e.set([change.tableId,change.recordId,k,[]],v);e.record(change.tableId,change.recordId).metadata={...e.record(change.tableId,change.recordId).metadata,...change.metadata};}
  const at=messages.findIndex(m=>m.uid===input.uid),prefix=messages.slice(0,at+1),ids=prefix.map(m=>m.uid);
  next.manual_edits??=[];next.manual_edits.push({uid:'backfill:'+meta.backfill.id+':'+input.uid,kind:'reviewBackfill',source_uid:input.uid,after_uid:input.uid,previous_uids:ids.slice(0,-1),strict:true,anchor_chain:prefix.map(m=>({uid:m.uid,signature:messageSignature(m)})),patch:inversePatch(e.data,next.state)});
  meta.backfill=result.batch;meta.backfillReceipts=result.receipts;
 }else fail('REVIEW_ACTION','未知归档操作');
 return next;
}
