import {clone,digest,sha256,fail} from './common.mjs';
import {materials} from './materials.mjs';
import {Runtime} from './runtime.mjs';
import {historyMessages} from './review-workflow.mjs';
import {projectHistoryLayers,sourceVersion} from './history-layers.mjs';
import {hasToolMetadata} from '../config/tool-history.js';

export function prepareReviewHistory(bundle,messages,scope,count){
 const rows=historyMessages(messages,scope),archives=[];
 materials(new Runtime(bundle.state),{...bundle.state.runtime.scope,reviewHistory:true,archiveCollector:archives});
 const map=new Map(rows.map(m=>[m.id,m]));
 const units=archives.map(({id,text,metadata})=>{
  const h=metadata.history_field,a=metadata.archive_source,m=map.get(h?.source.messageId??a?.entry_id);
  const unit={id,factId:id,text,scope,status:'confirmed'};
  if(h){unit.source=h.source;if(h.coverageReviewed&&typeof h.evidence==='string')unit.coverage=[{messageId:h.source.messageId,version:h.source.version,quote:h.evidence,block:'body',reviewed:true}];}
  else if(a){const saved=bundle.state.runtime.sources?.[a.source_key];if(m&&saved?.host_message_sha256){
   // Compare the actual selected reply with the accepted source before claiming coverage.
   unit.source={messageId:m.id,version:sourceVersion(m)};
   const same=saved.reply_raw===m.text||saved.host_message_sha256===sha256(m.text);
   const exact=Object.values(bundle.turn_review?.decisions??[]).some(d=>d.uid===m.id&&d.active!==false&&(d.reply===m.text||d.sourceHash===sha256(m.text)));
   if(same||exact){const quotes=(saved.fragments??[]).filter(f=>(a.paragraphs??[]).includes(f.paragraph_id)).map(f=>f.chunk_text??f.text??f.content??f.raw_block);unit.coverage=quotes.map(quote=>({messageId:m.id,version:sourceVersion(m),quote,block:'body',reviewed:true}));}
  }}
  return unit;
 });
 const result=projectHistoryLayers({messages:rows,archives:units,scope,historyCount:count});
 const malformed=result.audit.find(x=>x.layer==='excluded'&&x.reason.startsWith('正文边界'));
 if(malformed)fail('HISTORY_BODY_BOUNDARY','历史第'+malformed.floor+'层（AI回复）'+malformed.reason+'。请检查该层原文的回复外壳和段号。',{messageId:malformed.id,floor:malformed.floor});
 return {...result,text:Object.values(result.layers).join('\n'),messages:clone(messages),signature:digest(messages)};
}
export function applyReviewHistory(chat,prepared){
 if(!Array.isArray(chat))fail('HISTORY_COPY','历史发送副本无效');
 const native=chat.filter(m=>Number.isSafeInteger(m.index)&&m.index>=0);
 if(native.some(hasToolMetadata))fail('HISTORY_TOOLS','三层历史尚不能承载工具调用，请保留原始工具会话。');
 if(chat.length&&!native.length)fail('HISTORY_COPY','历史副本缺少楼层来源，未替换消息');
 const carrier=native.findLast(m=>m.is_user||m.role==='user')??native.at(-1)??{index:0};
 const before=chat.length,kept=chat.filter(m=>!native.includes(m));
 kept.push({...carrier,is_user:true,is_system:false,role:'user',mes:prepared.text,...(Object.hasOwn(carrier,'content')?{content:prepared.text}:{})});
 chat.splice(0,chat.length,...kept);return {route:'three-layer',removed:before-native.length,sourceMessages:prepared.messages.length,window:prepared.window};
}
export function ensureReviewHistoryPayload(payload,prepared,previousText=null){
 if(previousText&&previousText!==prepared.text)for(const m of payload.messages)if(typeof m.content==='string'&&m.content.includes(previousText))m.content=m.content.replace(previousText,prepared.text);
 const texts=payload.messages.map(m=>typeof m.content==='string'?m.content:'');
 const found=texts.filter(t=>t.includes(prepared.text));
 if(found.length===1)return;
 if(found.length>1)fail('HISTORY_DUPLICATE','三层历史在最终请求中重复');
 const originals=new Set(prepared.messages.map(m=>m.text));
 // Fallback is used by supported hosts without a coreChat interceptor. Only
 // exact owned text messages may be replaced; media and tools need their host boundary.
 for(const m of payload.messages)if(['user','assistant'].includes(m.role)&&typeof m.content!=='string')fail('HISTORY_MEDIA','宿主未提供历史边界，无法安全替换多媒体历史');
 payload.messages=payload.messages.filter(m=>!['user','assistant'].includes(m.role)||!originals.has(m.content));
 payload.messages.push({role:'user',content:prepared.text});
}
