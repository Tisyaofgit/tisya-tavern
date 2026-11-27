// Read-only candidate for the explicitly selected three-layer history route.
// It does not enable/disable native history, write sources or call a model.
import {xmlSection,xmlText} from './prompt-sections.mjs';
import {extractXMLBody} from '../reader-core.js';
import {normalizeEnvelope,DEFAULT_TAGS,hasEnvelopeMarkers} from './tags.mjs';
import {parseNumberedBody} from '../six/paragraphs.mjs';
import {digest} from './common.mjs';

const check=(ok,message)=>{if(!ok)throw Error(message);};
export const historyHeadings={historyRecord:'已归档',recentBody:'较早正文',recentSituation:'本轮接续'};
export const quotedHistory=xmlText;
const section=(tag,content)=>xmlSection(tag,content.join('\n\n'),{escaped:true});
export const sourceVersion=m=>digest({id:m.id,revision:m.revision??1,text:m.text,role:m.role,scope:m.scope,floor:m.floor});
export function selectedMessages(messages,scope){
 check(Array.isArray(messages)&&typeof scope==='string'&&scope,'历史来源和会话范围无效。');
 const rows=messages.filter(m=>m.scope===scope&&m.selected!==false&&!m.hidden&&['user','assistant'].includes(m.role));
 check(rows.every(m=>typeof m.id==='string'&&m.id&&typeof m.text==='string'&&Number.isSafeInteger(m.floor)),'历史消息缺少稳定身份、楼层或完整文本。');
 check(new Set(rows.map(m=>m.id)).size===rows.length,'历史消息身份重复。');
 return [...rows].sort((a,b)=>a.floor-b.floor);
}
function historySource(text){
 const raw=String(text);
 // Legacy messages are source material, not malformed newly generated forms.
 // Preserve their original text. Never
 // use this route after a recognized protocol has failed boundary validation.
 if(!hasEnvelopeMarkers(raw))return {text:raw,format:'legacy_source'};
 const normalized=normalizeEnvelope(raw);
 // boby is a supported old spelling only at the envelope's body boundary.
 const canonical=/<boby(?:\s|>)/i.test(normalized)&&!/<body(?:\s|>)/i.test(normalized)?normalizeEnvelope(normalized,{...DEFAULT_TAGS,body:'boby'}):normalized;
 const body=extractXMLBody(canonical);
 if(!/^\s*1(?:[ \t]|\r?\n)/.test(body))return {text:body,format:'structured_body'};
 const paragraphs=parseNumberedBody(body);
 // Remove validated paragraph markers only. Keep prose digits, indentation,
 // fences and original newline/blank-line structure byte-for-byte.
 let at=0,out='';for(const p of paragraphs){out+=body.slice(at,p.blockStart)+body.slice(p.contentStart,p.blockEnd);at=p.blockEnd;}return {text:out+body.slice(at),format:'structured_body'};
}
export const historyBody=text=>historySource(text).text;
function historyMessage(label,message,text=message?.text){return message&&text?.trim()?label+'\n'+quotedHistory(text.trim()):'';}
export function projectHistoryLayers({messages,archives=[],scope,historyCount=10,currentCommand=null}){
 check(Number.isSafeInteger(historyCount)&&historyCount>=0,'历史消息条数须为非负整数。');
 const rows=selectedMessages(messages,scope),audit=[];
 let current=currentCommand;
 if(!current&&rows.at(-1)?.role==='user')current=rows.at(-1);
 if(current){check(current.scope===scope&&current.role==='user'&&typeof current.text==='string'&&current.id,'本轮命令来源不匹配。');const same=rows.find(m=>m.id===current.id);check(!same||sourceVersion(same)===sourceVersion(current),'本轮命令与历史记录不一致。');}
 const past=rows.filter(m=>m.id!==current?.id&&(!current||m.floor<current.floor));
 const last=past.findLast(m=>m.role==='assistant');
 const previous=last?past.findLast(m=>m.role==='user'&&m.floor<last.floor):null;
 // Historical prose stays in the verified source store. Only the chain head
 // enters the ordinary prompt; older passages return through the reviewed
 // timeline recall service instead of a second sliding raw-body window.
 const window=[],recent=[];
 for(const m of past.filter(m=>m.role==='assistant'&&m.id!==last?.id))audit.push({id:m.id,floor:m.floor,layer:'timeline_source',reason:'历史正文保留在来源库，仅由统一时间轴按需召回'});
 let latestBody='';
 if(last)try{latestBody=historySource(last.text).text;}
 catch(error){audit.push({id:last.id,floor:last.floor,layer:'excluded',reason:'上一轮正文无法读取：'+error.message});}
 const sourceMap=new Map(rows.map(m=>[m.id,m])),recentIds=new Set(recent.map(m=>m.id)),seen=new Map(),record=[];
 for(const unit of archives){
  if(unit.scope!==scope||unit.status!=='confirmed'||unit.active===false){audit.push({id:unit.id,layer:'excluded',reason:'非当前范围的已确认归档'});continue;}
  check(unit.id&&unit.factId&&typeof unit.text==='string','归档信息点缺少稳定身份或正文。');
  const source=unit.source&&sourceMap.get(unit.source.messageId);
  if(unit.source&&(!source||sourceVersion(source)!==unit.source.version)){audit.push({id:unit.id,layer:'excluded',reason:'来源已删除、改写或不在当前分支'});continue;}
  const prior=seen.get(unit.factId);if(prior){check(prior===unit.text,'同一归档信息点存在冲突，请先核对：'+unit.factId);audit.push({id:unit.id,layer:'excluded',reason:'同一已确认信息点仅保留一次'});continue;}seen.set(unit.factId,unit.text);
  let covered=false,placement='';
  // Coverage is an explicitly reviewed semantic link, not fuzzy string matching.
  // The exact evidence quote must still exist in the selected source revision.
  for(const link of unit.coverage??[]){
   if(link.reviewed!==true||typeof link.quote!=='string'||!link.quote)continue;
   const m=sourceMap.get(link.messageId);if(!m||sourceVersion(m)!==link.version)continue;
   if(m.id===last?.id&&link.block==='body'&&latestBody.includes(link.quote)){covered=true;placement='recent_situation';break;}
   if(m.id===previous?.id&&m.text.includes(link.quote)){covered=true;placement='recent_situation';break;}
   if(m.id===current?.id&&m.text.includes(link.quote)){covered=true;placement='recent_situation';break;}
   if(link.block==='body'&&recentIds.has(m.id)){covered=true;placement='timeline_source';break;}
  }
  if(covered)audit.push({id:unit.id,layer:placement,reason:'已核对的同一信息点由此层承载，归档不重复'});
  else{record.push(unit);audit.push({id:unit.id,layer:'history_record',reason:'已确认独立归档信息点'});}
 }
 // A reviewed source-faithful archive passage can carry a smaller reviewed
 // information point from that same source revision. Independent knowledge
 // with no such coverage stays. Never compare events by topic or name alone.
 const finalRecord=record.filter((unit,index)=>{
  const owner=record.find((other,otherIndex)=>other!==unit&&other.sourceFaithful===true&&(other.coverage??[]).some(b=>b.reviewed===true&&other.text.includes(b.quote)&&(unit.coverage??[]).some(a=>a.reviewed===true&&a.messageId===b.messageId&&a.version===b.version&&b.quote.includes(a.quote)&&(b.quote.length>a.quote.length||otherIndex<index))));
  if(!owner)return true;
  const item=audit.find(a=>a.id===unit.id);if(item){item.layer='excluded';item.reason='同一信息点由已核对的归档原文 '+owner.id+' 承载';}return false;
 });
 const recentSituation={previousUser:previous??null,assistant:last??null,currentUser:current??null};
 const layers={
  historyRecord:section('history_record',finalRecord.map(unit=>quotedHistory(unit.text))),
  recentBody:section('history',recent.map(message=>quotedHistory(message.body.trim())).filter(Boolean)),
  recentSituation:section('recent_situation',[
   historyMessage('上轮用户',previous),historyMessage('上轮正文',last,latestBody),historyMessage('本轮用户',current)
  ].filter(Boolean))
 };
 const chainHead={previousUser:previous??null,assistant:last??null,assistantBody:latestBody,currentUser:current??null};
 return {layers,archiveUnits:finalRecord,recentBodies:recent,recentSituation,chainHead,audit,window:{configured:historyCount,counted:'历史正文不进入主上下文；仅保留链头，本轮命令另算',sourceIds:window.map(m=>m.id)},sourceSignature:digest(rows),nativeHistoryCompatible:false};
}
