import {clone,digest,sha256,fail} from './common.mjs';
import {envelope} from './reply.mjs';
import {xmlTokens} from '../reader-core.js';

const contextSignature=messages=>digest(messages.map(m=>({uid:m.uid,role:m.role,text:m.text??''})));
export function enableTurnReview(bundle){
 if(bundle.turn_review)return bundle;
 const legacy=Object.values(bundle.state.runtime?.sources??{}).map(s=>({uid:s.entry_id,sourceHash:s.host_message_sha256??s.reply_sha256,reply:s.reply_raw}));
 return {...bundle,turn_review:{version:1,decisions:[],legacy}};
}
export function reviewProjection(bundle,messages){
 if(!bundle.turn_review)return {messages:clone(messages),reviews:[]};
 const projected=[],reviews=[],baseline=new Set((bundle.journal?.baseline_messages??[]).map(m=>m.uid));
 for(const [index,m]of messages.entries()){
  if(!['assistant','assistant_pending'].includes(m.role)||baseline.has(m.uid)){projected.push(clone(m));continue;}
  const contextHash=contextSignature(projected),sourceHash=sha256(m.text??''),decisions=(bundle.turn_review.decisions??[]).filter(d=>d.uid===m.uid&&d.contextHash===contextHash&&d.active!==false);
  const exact=decisions.findLast(d=>d.sourceHash===sourceHash||sha256(d.reply)===sourceHash),prior=exact??decisions.at(-1);
  const legacy=(bundle.turn_review.legacy??[]).find(d=>d.uid===m.uid&&(d.sourceHash===sourceHash||sha256(d.reply)===sourceHash));
  if(prior)projected.push({uid:m.uid,role:'assistant',text:prior.reply,review_confirmed:prior.archive_pending!==true});
  else if(legacy)projected.push({...clone(m),role:'assistant'});
  else projected.push({...clone(m),role:'assistant_pending'});
  reviews.push({uid:m.uid,index,sourceHash,contextHash,status:exact?.archive_pending===true?'pending':exact||legacy?'confirmed':'pending',previousConfirmed:!!prior&&!exact&&!prior.archive_pending,archivePending:exact?.archive_pending===true,decision:exact??null});
 }
 return {messages:projected,reviews};
}
export function reviewBlocks(raw,updates={}){
 const {canonical,blocks,attrs}=envelope(raw),ranges=[],stack=[];let start;
 for(const token of xmlTokens(canonical,{literalAmpersands:true,rawVarsJSON:true})){
  if(token.kind==='open'){
   if(stack.length===1&&['cells','archive'].includes(token.name)){
    start={key:token.name,start:token.start};if(token.selfClose){ranges.push({...start,end:token.end});start=null;}
   }
   if(!token.selfClose)stack.push(token.name);
  }else if(token.kind==='close'){
   if(stack.length===2&&start?.key===token.name){ranges.push({...start,end:token.end});start=null;}stack.pop();
  }
 }
 let text=canonical;
 for(const key of Object.keys(updates))if(!['cells','archive'].includes(key)||typeof updates[key]!=='string')fail('REVIEW_EDIT','每轮确认仅编辑 cells 与归档内容');
 for(const part of ranges.sort((a,b)=>b.start-a.start))if(Object.hasOwn(updates,part.key)){
  const format=attrs[part.key]?.format==='form'||/^\s*【/m.test(updates[part.key])?' format="form"':'';
  text=text.slice(0,part.start)+'<'+part.key+format+'>'+updates[part.key]+'</'+part.key+'>'+text.slice(part.end);
 }
 for(const key of ['cells','archive'])if(Object.hasOwn(updates,key)&&!ranges.some(r=>r.key===key))text=text.replace(/<\/reply>\s*$/,'<'+key+' format="form">'+updates[key]+'</'+key+'></reply>');
 const after=envelope(text).blocks;for(const key of Object.keys(blocks))if(!['cells','archive'].includes(key)&&after[key]!==blocks[key])fail('REVIEW_EDIT','本轮正文在编辑表单时发生变化');
 return {reply:text,cells:after.cells??'',archive:after.archive??'',body:after.body};
}
export function addTurnDecision(bundle,messages,{uid,sourceHash,contextHash,cells,archive,responses={}}){
 const review=reviewProjection(bundle,messages).reviews.find(r=>r.uid===uid),message=messages.find(m=>m.uid===uid);
 if(!review||review.sourceHash!==sourceHash||review.contextHash!==contextHash)fail('REVIEW_STALE','本轮正文或前序存档已变化，请重新打开确认窗');
 if(review.status==='confirmed')fail('REVIEW_CONFIRMED','本轮已经确认');
 const edited=reviewBlocks(message.text,{cells,archive}),next=clone(bundle);
 const decision={uid,sourceHash,contextHash,reply:edited.reply,responses:clone(responses),confirmedAt:new Date().toISOString()};
 next.turn_review.decisions.push(decision);return {bundle:next,decision};
}
