import {archivalText,sourceTime} from './ledger.js';
import {renderModelMaterial} from './simple-sheet.js';

const FORMAT='tisya.same-source-history/1';
const invalid=()=>{throw Error('同源历史引用不完整，未丢弃来源原文');};

// A transport projection only: source keys, host messages and evidence still
// use the original source. Ambiguous/noncontiguous prose keeps the raw view.
export function archiveSourceView(source){
 const {key,parent,index,floor,role,name,candidate}=source,raw=source.text;
 if(typeof raw!=='string'||typeof key!=='string'||!key)invalid();
 const metadata={key,parent,index,floor,role,name};
 const archiveSource={...metadata,text:archivalText(raw),time:sourceTime(raw)};
 const legacy={...metadata,text:raw,candidate};
 const fallback=reason=>({archiveSource,sourceHistory:[{...legacy,format:FORMAT,projection:'raw-fallback',reason}]});
 const text=archiveSource.text;if(!text)return fallback('empty-prose');
 const start=raw.indexOf(text);if(start<0)return fallback('noncontiguous-prose');
 if(raw.indexOf(text,start+1)!==-1)return fallback('ambiguous-prose');
 const end=start+text.length,parts=[];
 if(start)parts.push({start:0,end:start,text:raw.slice(0,start),evidence:false});
 parts.push({start,end,sourceKey:key,sourcePath:'archiveSource.text'});
 if(end<raw.length)parts.push({start:end,end:raw.length,text:raw.slice(end),evidence:false});
 const history={...metadata,candidate,format:FORMAT,projection:'source-reference',parts};
 if(restoreArchiveSource(history,archiveSource)!==raw)invalid();
 // Compare the actual sheet representation, including references and metadata.
 if(renderModelMaterial([history]).length>=renderModelMaterial([legacy]).length)return fallback('not-smaller');
 return {archiveSource,sourceHistory:[history]};
}

// For source coverage checks, never for re-expanding the outgoing HISTORY slot.
export function restoreArchiveSource(history,archiveSource){
 if(history?.format!==FORMAT||history.key!==archiveSource?.key)invalid();
 if(history.projection==='raw-fallback'){
  if(typeof history.text!=='string'||history.parts!==undefined)invalid();
  return history.text;
 }
 if(history.projection!=='source-reference'||history.text!==undefined||!Array.isArray(history.parts))invalid();
 let text='',references=0;
 for(const part of history.parts){
  if(!Number.isSafeInteger(part.start)||!Number.isSafeInteger(part.end)||part.start!==text.length||part.end<=part.start)invalid();
  let value;
  if(Object.hasOwn(part,'text')){
   if(typeof part.text!=='string'||part.evidence!==false||part.sourceKey!==undefined||part.sourcePath!==undefined)invalid();
   value=part.text;
  }else{
   if(part.sourceKey!==history.key||part.sourcePath!=='archiveSource.text'||typeof archiveSource.text!=='string')invalid();
   value=archiveSource.text;references++;
  }
  if(value.length!==part.end-part.start)invalid();
  text+=value;
 }
 if(references!==1)invalid();
 return text;
}
