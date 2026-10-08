'use strict';
// Reply-local paragraph addresses. Original message bytes remain authoritative.
const fail=code=>{throw Object.assign(Error('TISYA_PARAGRAPH_'+code),{code:'TISYA_PARAGRAPH_'+code});};
function read(body,{required=false}={}){
 if(typeof body!=='string')fail('BODY');
 if(!/^\s*1\r?\n/.test(body)){if(required)fail('NUMBERING_REQUIRED');return null;}
 const marks=[];let fence=null,pre=false;
 for(const m of body.matchAll(/[^\r\n]*(?:\r\n|\n|\r|$)/g)){
  if(!m[0])continue;const line=m[0].replace(/[\r\n]+$/,'');
  const fm=/^\s*(`{3,}|~{3,})/.exec(line);
  if(!fence&&!pre&&/^[0-9]+$/.test(line))marks.push({id:Number(line),start:m.index,end:m.index+m[0].length,token:line});
  if(fm){if(fence&&fm[1][0]===fence[0]&&fm[1].length>=fence.length)fence=null;else if(!fence)fence=fm[1];}
  if(/<pre(?:\s|>)/i.test(line))pre=true;if(/<\/pre\s*>/i.test(line))pre=false;
 }
 if(!marks.length||body.slice(0,marks[0].start).trim())fail('PREFIX');
 return marks.map((m,i)=>{
  if(!Number.isSafeInteger(m.id)||m.id!==i+1||m.token!==String(i+1))fail('SEQUENCE');
  let start=m.end,end=marks[i+1]?.start??body.length;const sourceEnd=end;
  // Full blank lines around numbered content are layout padding, not another
  // paragraph. Keep content bytes/offsets intact and still reject interior gaps.
  start+=/^(?:[^\S\r\n]*(?:\r\n|\n|\r))+/.exec(body.slice(start,end))?.[0].length??0;
  end-=/(?:(?:\r\n|\n|\r)[^\S\r\n]*)+$/.exec(body.slice(start,end))?.[0].length??0;
  const raw=body.slice(start,end);if(!raw.trim())fail('EMPTY');
  let code=null,inPre=false;
  for(const line of raw.replace(/\r\n?/g,'\n').split('\n')){
   const fm=/^\s*(`{3,}|~{3,})/.exec(line);
   if(!code&&!inPre&&!line.trim())fail('UNNUMBERED_PARAGRAPH');
   if(fm){if(code&&fm[1][0]===code[0]&&fm[1].length>=code.length)code=null;else if(!code)code=fm[1];}
   if(/<pre(?:\s|>)/i.test(line))inPre=true;if(/<\/pre\s*>/i.test(line))inPre=false;
  }
  // An unfinished protected block owns its trailing whitespace too. Preserve
  // the prior newline-only boundary instead of trimming code/pre content.
  if(code||inPre){end=sourceEnd;while(end>start&&/[\r\n]/.test(body[end-1]))end--;}
  return {id:m.id,raw:body.slice(start,end),start,end};
 });
}
function text(body){const p=read(body);return p?p.map(x=>x.raw).join('\n\n'):body;}
function resolve(reference,body){
 if(!/^段落[1-9]\d*(?:、[1-9]\d*)*$/.test(reference))fail('REFERENCE');
 const p=read(body,{required:true}),ids=reference.slice(2).split('、').map(Number);
 let previous=0;return ids.map(id=>{
  if(!Number.isSafeInteger(id)||id<=previous||id>p.length)fail('REFERENCE_RANGE_OR_ORDER');
  previous=id;return p[id-1].raw;
 }).join('\n\n');
}
module.exports={read,text,resolve};
