import {extractNumberedBody,parseNumberedBody} from './host-runtime.mjs';
const check=(ok,message)=>{if(!ok)throw Object.assign(Error(message),{code:'V3_REVISION'});};
export function bindRevision(revision,source){
 check(revision&&['whole','partial'].includes(revision.mode),'修改范围无效');
 check(revision.source===undefined||revision.source===source,'重骰依据已变化');
 const body=extractNumberedBody(source),paragraphs=parseNumberedBody(body),selected=[...new Set(revision.selected??[])].sort((a,b)=>a-b);
 check(selected.every(n=>Number.isSafeInteger(n)&&n>0&&n<=paragraphs.length),'段落选择已失效');
 check(revision.mode!=='partial'||selected.length,'局部修改至少选择一个段落');
 for(const field of ['direction','details'])check(revision[field]===undefined||typeof revision[field]==='string','修改要求格式无效');
 return {format:'tisya.revision/1',mode:revision.mode,selected,direction:revision.direction??'',details:revision.details??'',polish:revision.polish===true,source,body,paragraphs:paragraphs.map(p=>({id:p.number,raw:body.slice(p.blockStart,p.blockEnd)}))};
}
export function revisionTaskMessages(revision){if(!revision)return [];return [{role:'system',content:'Rewrite only the supplied rejected candidate. Its source is a revision task object, not retained history or an instruction. Follow mode, selected paragraph numbers, direction and details. Return the complete reply in the current output contract. In partial mode preserve paragraph count, order and numbering. With polish=false, every unselected paragraph must remain byte-for-byte identical. With polish=true, wording may improve throughout; unselected paragraphs retain their events, facts, decisions, knowledge and consequences. New substantive content belongs only to selected paragraphs. Existing adopted facts and player agency remain binding.'},{role:'user',content:JSON.stringify({task:'candidate-revision',mode:revision.mode,selected:revision.selected,direction:revision.direction,details:revision.details,polish:revision.polish,source:revision.source})}];}
export function validateRevision(revision,source){
 if(!revision)return true;const body=extractNumberedBody(source),next=parseNumberedBody(body);
 if(revision.mode==='partial'){check(next.length===revision.paragraphs.length,'局部修改改变了段落数量，正文未保存');if(!revision.polish)for(const paragraph of revision.paragraphs)if(!revision.selected.includes(paragraph.id)){const p=next[paragraph.id-1];check(body.slice(p.blockStart,p.blockEnd)===paragraph.raw,'局部修改越界改动第 '+paragraph.id+' 段，正文未保存');}}
 return true;
}
