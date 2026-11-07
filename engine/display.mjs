import {envelope,paragraphs} from './reply.mjs';
import {normalizeEnvelope} from './tags.mjs';
import {xmlTokens,strictJSON} from '../reader-core.js';
import {nativeStatusInVars,nativeStatusTail} from '../native-mvu-wire.js';
import {runV3Display,readV3PublicEnvelope,readV3Details,inspectV3Message} from '../six/reply.mjs';
const before={'构想':'用户偏好','情节':'情节取向','运镜':'篇幅重点','用语':'文风用词','余韵':'伏笔','与用户互动':'回应用户评价'};
const after={'立住了':'语言亮点','变局':'本轮变化','骨相':'人物厚度','主动':'角色主动','世界':'世界动向','关系':'关系位移','余钩':'下一步张力','与用户互动':'回应用户评价'};
const action={'交锋':'战斗','试探':'交流','破局':'操作','拉扯':'交流','观察':'调查'};
const mapRows=(value,map)=>(value??'').split(/\r?\n/).map(line=>{const cells=line.split('|');cells[0]=map[cells[0]?.trim()]??cells[0];if(cells[0]==='留白')cells[1]=map[cells[1]?.trim()]??cells[1];return cells.join('|');}).join('\n');
// Read-only projection reuses the established title, prose, hearts and action
// widgets. The source and its machine instructions are never rewritten.
export function displayProjection(source){
 const reading=nativeStatusTail(nativeStatusInVars(normalizeEnvelope(source),xmlTokens,strictJSON),xmlTokens);
 const e=envelope(reading),b=e.blocks,p=paragraphs(b.body),actions=mapRows(b.actions,action),count=actions.split(/\r?\n/).filter(s=>s.trim()).length;
 return '<reply><think phase="before">'+mapRows(b.before,before)+'</think><title>'+b.title+'</title><body min="0" max="2000000" unit="字">'+p.normalized+'</body><think phase="after">'+mapRows(b.after,after)+'</think><extra>'+(b.extra??'')+'</extra><actions min="0" max="'+count+'">'+actions+'</actions></reply>';
}
export const runMatrixDisplay=options=>runV3Display({...options,source:displayProjection(options.source)});
export const readMatrixPublic=source=>readV3PublicEnvelope(displayProjection(source),{tolerant:true});
export const readMatrixDetails=source=>readV3Details(displayProjection(source),{tolerant:true});
export function inspectMatrix(source){try{return inspectV3Message(displayProjection(source),{tolerant:true});}catch(error){return {structured:true,body:{error:error.code??'TISYA_MATRIX_REPLY_INVALID'},journey:{error:error.code??'TISYA_MATRIX_REPLY_INVALID'},actions:{error:error.code??'TISYA_MATRIX_REPLY_INVALID'},details:{error:error.code??'TISYA_MATRIX_REPLY_INVALID'}};}}
