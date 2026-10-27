import {xmlTokens,strictJSON} from '../reader-core.js';
import {parsePipeBlock} from './pipes.mjs';
export {isOnePassReply} from './source.mjs';
import {inspectV3Message,readV3Details,readV3PublicEnvelope,runV3Display,parseV3Reply,splitV3Cells} from '../six/reply.mjs';
export const ONEPASS_ORDER=Object.freeze(['task','before','title','body','after','status','extra','vars','archive','memory','actions']);
const fail=code=>{throw Object.assign(Error('TISYA_ONEPASS_'+code),{code:'TISYA_ONEPASS_'+code});};
const check=(v,c)=>{if(!v)fail(c);};
export function onePassEnvelope(source){
 check(typeof source==='string'&&source.length<=2000000,'SIZE');
 const stack=[],blocks={},attrs={};let current=null,start=0,end=0;
 for(const t of xmlTokens(source)){
  if(t.kind==='open'){
   if(!stack.length)check(t.name==='reply'&&t.attrs.id==='tisya-onepass-1'&&!end,'ROOT');
   else if(stack.length===1){const name=t.name==='think'?t.attrs.phase:t.name;check(name===ONEPASS_ORDER[Object.keys(blocks).length],'ORDER');current=name;blocks[current]='';attrs[current]=t.attrs;start=t.end;check(!t.selfClose||['task','status','vars','archive','memory','extra','actions'].includes(current),'EMPTY_BLOCK');}
   else check(['body','extra'].includes(current),'NESTED_RECORD');
   if(!t.selfClose)stack.push(t.name);
  }else if(t.kind==='close'){
   check(stack.at(-1)===t.name,'CLOSE');if(stack.length===2){blocks[current]=source.slice(start,t.start);current=null;}stack.pop();if(!stack.length){end=t.end;break;}
  }else if(stack.length<2)check(t.kind==='comment'||!t.value.trim(),'OUTSIDE');
 }
 const tail=source.slice(end);check(end&&Object.keys(blocks).length===11&&!stack.length&&(!tail.trim()||/^\s*<StatusPlaceHolderImpl\s*\/>\s*$/.test(tail)),'INCOMPLETE');
 const tag=(name,a,body)=>'<'+name+Object.entries(a).map(([k,v])=>' '+k+'="'+v+'"').join('')+'>'+body+'</'+name+'>';
 const projected='<reply>\n'+tag('think',{phase:'before'},blocks.before)+'\n'+tag('title',{},blocks.title)+'\n'+tag('body',attrs.body,blocks.body)+'\n'+tag('think',{phase:'after'},blocks.after)+'\n'+tag('extra',{},blocks.extra)+'\n'+(Object.keys(attrs.actions).length?tag('actions',attrs.actions,blocks.actions):'<actions/>')+'\n</reply>';
 return {blocks,attrs,source,projected:projected+tail};
}
export function parseOnePassReply(source){
 const e=onePassEnvelope(source),publicReply=parseV3Reply(e.projected),records={};preferenceRows(e.blocks.task);
 const formats=['status','vars','archive','memory'].map(k=>e.attrs[k]?.format).filter(Boolean);const pipes=formats.length&&formats.every(f=>f==='pipes');
 if(pipes){for(const k of ['status','vars','archive','memory']){check(e.attrs[k]?.format==='pipes'||!e.blocks[k].trim()&&!e.attrs[k]?.format,'FORMAT_'+k.toUpperCase());records[k]=parsePipeBlock(e.blocks[k],k);}return {...e,publicReply,records,recordFormat:'pipes'};}
 for(const k of ['status','vars','archive','memory']){check(e.attrs[k]?.format==='json','FORMAT_'+k.toUpperCase());try{records[k]=strictJSON(e.blocks[k]);}catch{fail('JSON_'+k.toUpperCase());}check(records[k]&&typeof records[k]==='object'&&!Array.isArray(records[k]),'JSON_'+k.toUpperCase());}
 return {...e,publicReply,records};
}
export function readOnePassDetails(source){const e=onePassEnvelope(source),details=readV3Details(e.projected,{tolerant:true});return {...details,protocol:4,preferences:preferenceRows(e.blocks.task,details.diagnostics)};}
function preferenceRows(text,diagnostics=null){const rows=[];for(const [index,raw]of text.split(/\r?\n/).entries()){
 const line=raw.trim();if(!line)continue;
 try{
  // A missing row prefix is unambiguous only for these two complete four-cell forms.
  const prefixed=line.startsWith('偏好：');check(prefixed||/^(明确要求|候选)\|/.test(line),'TASK_LABEL');
  const cells=splitV3Cells(prefixed?line.slice(3):line).map(x=>x.trim());check(cells.length===4&&['明确要求','候选'].includes(cells[0])&&cells.every(Boolean),'TASK_ROW');
  rows.push({label:cells[0],status:cells[1],text:cells.slice(2).join(' · ')});
 }catch(error){if(!diagnostics)throw error;diagnostics.push({phase:'task',line:index+1,code:error.code,raw});}
}return rows;}

export function readOnePassPublic(source){return readV3PublicEnvelope(onePassEnvelope(source).projected,{tolerant:true});}
export function inspectOnePass(source){
 try{const e=onePassEnvelope(source),result=inspectV3Message(e.projected,{tolerant:true});if(result.details.value){try{result.details.value=readOnePassDetails(source);}catch(error){result.details={error:error.code};}}try{parseOnePassReply(source);}catch(error){result.records={error:error.code??'TISYA_ONEPASS_RECORDS',...(error.detail?{detail:error.detail}:{})};}return result;}
 catch(error){const code=error.code??'TISYA_ONEPASS_INVALID';return {structured:true,body:{error:code},details:{error:code},journey:{error:code},actions:{error:code}};}
}
export function runOnePassDisplay(options){return runV3Display({...options,source:onePassEnvelope(options.source).projected});}
