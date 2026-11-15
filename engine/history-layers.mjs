// Read-only candidate for the explicitly selected three-layer history route.
// It does not enable/disable native history, write sources or call a model.
import {extractXMLBody} from '../reader-core.js';
import {normalizeEnvelope,DEFAULT_TAGS} from './tags.mjs';
import {parseNumberedBody} from '../six/paragraphs.mjs';
import {sha256,digest} from './common.mjs';

const check=(ok,message)=>{if(!ok)throw Error(message);};
const cdata=text=>'<![CDATA['+String(text).replaceAll(']]>',']]]]><![CDATA[>')+']]>';
export const sourceVersion=m=>digest({id:m.id,revision:m.revision??1,text:m.text,role:m.role,scope:m.scope,floor:m.floor});
export function selectedMessages(messages,scope){
 check(Array.isArray(messages)&&typeof scope==='string'&&scope,'历史来源和会话范围无效。');
 const rows=messages.filter(m=>m.scope===scope&&m.selected!==false&&!m.hidden&&['user','assistant'].includes(m.role));
 check(rows.every(m=>typeof m.id==='string'&&m.id&&typeof m.text==='string'&&Number.isSafeInteger(m.floor)),'历史消息缺少稳定身份、楼层或完整文本。');
 check(new Set(rows.map(m=>m.id)).size===rows.length,'历史消息身份重复。');
 return [...rows].sort((a,b)=>a.floor-b.floor);
}
export function historyBody(text){
 const raw=String(text),normalized=normalizeEnvelope(/<\/?[A-Za-z][\w:.-]*(?:\s|\/?>)/.test(raw)?raw:'<reply><body>'+raw+'</body></reply>');
 // boby is a supported old spelling only at the envelope's body boundary.
 const canonical=/<boby(?:\s|>)/i.test(normalized)&&!/<body(?:\s|>)/i.test(normalized)?normalizeEnvelope(normalized,{...DEFAULT_TAGS,body:'boby'}):normalized;
 const body=extractXMLBody(canonical);
 if(!/^\s*1(?:[ \t]|\r?\n)/.test(body))return body;
 const paragraphs=parseNumberedBody(body);
 // Remove validated paragraph markers only. Keep prose digits, indentation,
 // fences and original newline/blank-line structure byte-for-byte.
 let at=0,out='';for(const p of paragraphs){out+=body.slice(at,p.blockStart)+body.slice(p.contentStart,p.blockEnd);at=p.blockEnd;}return out+body.slice(at);
}
function messageXML(tag,m,text=m?.text??''){return m?'<'+tag+'>'+cdata(text)+'</'+tag+'>':'';}
export function projectHistoryLayers({messages,archives=[],scope,historyCount=10,currentCommand=null}){
 check(Number.isSafeInteger(historyCount)&&historyCount>=0,'历史消息条数须为非负整数。');
 const rows=selectedMessages(messages,scope),audit=[],bodyCache=new Map();
 let current=currentCommand;
 if(!current&&rows.at(-1)?.role==='user')current=rows.at(-1);
 if(current){check(current.scope===scope&&current.role==='user'&&typeof current.text==='string'&&current.id,'本轮命令来源不匹配。');const same=rows.find(m=>m.id===current.id);check(!same||sourceVersion(same)===sourceVersion(current),'本轮命令与历史记录不一致。');}
 const past=rows.filter(m=>m.id!==current?.id&&(!current||m.floor<current.floor));
 const last=past.findLast(m=>m.role==='assistant');
 const previous=last?past.findLast(m=>m.role==='user'&&m.floor<last.floor):null;
 const window=historyCount?past.slice(-historyCount):[];
 const recent=[];
 for(const m of window.filter(m=>m.role==='assistant'&&m.id!==last?.id)){
  try{const text=historyBody(m.text);bodyCache.set(m.id,text);recent.push({...m,body:text});audit.push({id:m.id,layer:'recent_body',reason:'所选消息窗口内的char正文'});}
  catch(error){audit.push({id:m.id,layer:'excluded',reason:'正文边界/段号无法可靠读取：'+error.message});}
 }
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
   if(m.id===last?.id){
    let carries=m.text.includes(link.quote);
    // A reviewed quote may span numbered paragraphs. The complete raw reply
    // still carries it even though paragraph markers interrupt the quote.
    if(!carries&&link.block==='body'){try{carries=historyBody(m.text).includes(link.quote);}catch{/* Keep independent archive when body cannot be verified. */}}
    if(carries){covered=true;placement='recent_situation';break;}
   }
   if(m.id===previous?.id&&m.text.includes(link.quote)){covered=true;placement='recent_situation';break;}
   if(m.id===current?.id&&m.text.includes(link.quote)){covered=true;placement='recent_situation';break;}
   if(link.block==='body'&&recentIds.has(m.id)&&bodyCache.get(m.id)?.includes(link.quote)){covered=true;placement='recent_body';break;}
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
 // Full fact IDs, hashes and field addresses remain in audit data. The prompt
 // only needs content and its source floor, not repeated database identifiers.
 const recordXML=u=>cdata(u.text);
 const layers={historyRecord:'<history_record>\n'+finalRecord.map(recordXML).join('\n')+'\n</history_record>',recentBody:'<history>\n'+recent.map(m=>messageXML('message',m,m.body)).join('\n')+'\n</history>',recentSituation:'<recent_situation>\n'+[messageXML('previous_user',previous),messageXML('char_reply',last),messageXML('current_user',current)].join('\n')+'\n</recent_situation>'};
 return {layers,archiveUnits:finalRecord,recentBodies:recent,recentSituation,audit,window:{configured:historyCount,counted:'历史user与char消息合计；本轮命令另算',sourceIds:window.map(m=>m.id)},sourceSignature:sha256(JSON.stringify(rows)),nativeHistoryCompatible:false};
}
