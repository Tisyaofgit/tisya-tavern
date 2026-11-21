import {phoneSource} from './phone-turn-host.js';
import {sha256} from './engine/common.mjs';
import {inspectMessage} from './reader.js';
import {matrixArchiveLinkIndex,archiveLinkTextIndex} from './archive-links.mjs';

// Read-only diagnostics for the exact production tooltip path. Reports contain
// counts, table families and fixed codes only: no prose, names, record IDs,
// message UIDs, snapshot IDs, URLs or iframe document content.
const errorCode=value=>typeof value==='string'&&/^[A-Z][A-Z0-9_]{0,90}$/.test(value)?value:'OTHER_ERROR';
const count=value=>Number.isSafeInteger(value)&&value>=0?value:0;
const publicTable=value=>typeof value==='string'&&/^T_[A-Z0-9_]+$/.test(value)?value:'OTHER';
const bodyOf=inspection=>inspection?.body?.paragraphs?.value?.length?inspection.body.paragraphs.value.map(row=>row.raw).join('\n\n'):inspection?.body?.value??'';
const occurrenceCount=(body,name)=>{let total=0,at=0;while(name&&(at=body.indexOf(name,at))>=0){total++;at+=name.length;}return total;};
async function readStage(read,timeout,onLateValue){
 let timer;const work=Promise.resolve().then(read),expiry=new Promise(resolve=>{timer=setTimeout(()=>resolve({status:'timeout',error:'DIAGNOSTIC_TIMEOUT',value:null}),timeout);});
 const result=await Promise.race([work.then(value=>({status:value?'object':'null',error:null,value:value??null}),error=>({status:'error',error:errorCode(error?.code),value:null})),expiry]);clearTimeout(timer);
 if(result.status==='timeout')work.then(value=>onLateValue?.(value)).catch(()=>{});
 return result;
}

function indexSummary(index,body){
 const entries=Array.isArray(index?.entries)?index.entries:[],names=archiveLinkTextIndex({entries}).map(row=>row.name),matched=names.filter(name=>body.includes(name));
 return {entries:entries.length,byTable:Object.fromEntries([...entries.reduce((map,row)=>{const table=publicTable(row?.reference?.tableId);map.set(table,(map.get(table)??0)+1);return map;},new Map())].sort(([a],[b])=>a.localeCompare(b))),uniqueNames:names.length,matchedNames:matched.length,matchedOccurrences:matched.reduce((sum,name)=>sum+occurrenceCount(body,name),0)};
}

function hiddenByStyle(document,element){
 const win=document.defaultView;if(!win?.getComputedStyle)return null;
 let current=element;
 for(let depth=0;current&&depth<64;depth++){
  let css;try{css=win.getComputedStyle(current);}catch{return null;}
  if(css.display==='none'||css.visibility==='hidden'||css.visibility==='collapse')return true;
  if(current===document.documentElement)break;
  if(current.parentElement)current=current.parentElement;
  else{const root=current.getRootNode?.();if(root?.host&&root!==document)current=root.host;else break;}
 }
 return false;
}

function inspectDocumentRoots(document,node){
 const message=node?.matches?.('.mes')?node:node.closest?.('.mes');
 if(!message)return {roots:[],links:0,tooltips:0,openTooltips:0,styleVisibleLinks:0,styleVisibilityKnown:false};
 const add=(kind,index,root,doc=document,accessible=true)=>{
  if(!root)return {kind,index,accessible:false,links:0,tooltips:0,openTooltips:0,styleVisibleLinks:0,styleVisibilityKnown:false};
  let elements=[];try{elements=[...root.querySelectorAll('[data-tisya-archive-link]')];}catch{return {kind,index,accessible:false,links:0,tooltips:0,openTooltips:0,styleVisibleLinks:0,styleVisibilityKnown:false};}
  const tooltips=(()=>{try{return root.querySelectorAll('[data-tisya-archive-tooltip]').length;}catch{return 0;}})();
  const open=(()=>{try{return root.querySelectorAll('[data-tisya-archive-anchor][data-archive-open="true"]').length;}catch{return 0;}})();
  const visibility=elements.map(element=>hiddenByStyle(doc,element)),styleVisibleLinks=visibility.filter(value=>value===false).length;
  return {kind,index,accessible,links:elements.length,tooltips,openTooltips:open,styleVisibleLinks,styleVisibilityKnown:visibility.every(value=>value!==null)};
 };
 const totals={roots:[],links:0,tooltips:0,openTooltips:0,styleVisibleLinks:0,styleVisibilityKnown:true};
 const collect=(kind,index,root,doc=document,accessible=true)=>{const result=add(kind,index,root,doc,accessible);totals.roots.push(result);totals.links+=result.links;totals.tooltips+=result.tooltips;totals.openTooltips+=result.openTooltips;totals.styleVisibleLinks+=result.styleVisibleLinks;totals.styleVisibilityKnown&&=result.styleVisibilityKnown;};
 collect('message-light-dom',0,message);
 [...message.querySelectorAll('.tisya-message-visual,.tisya-native-body-prose')].forEach((host,index)=>{if(host.shadowRoot)collect(host.classList.contains('tisya-message-visual')?'projection-shadow':'native-prose-shadow',index,host.shadowRoot);});
 [...message.querySelectorAll('iframe[id^="TH-message--"]')].forEach((frame,index)=>{
  let doc=null;try{doc=frame.contentDocument??null;}catch{}
  if(!doc){collect('helper-frame',index,null,document,false);return;}
  collect('helper-frame',index,doc,doc,true);
 });
 return totals;
}

function assessment({message,sourceError,identity,presentationResult,presentationError,presentationContextMatches,snapshotResult,snapshotError,serviceIndex,snapshotIndex,dom}){
 if(!message)return 'message-unavailable';
 if(message.extra?.tisya_engine?.pending_sha256)return 'message-pending';
 if(presentationResult==='timeout')return 'presentation-timeout';
 if(presentationError)return 'presentation-error';
 if(snapshotResult==='timeout')return 'snapshot-timeout';
 if(snapshotError)return 'snapshot-error';
 if(sourceError)return 'message-identity-error';
 if(presentationContextMatches===false)return 'presentation-context-mismatch';
 if(identity.snapshotContextMatches===false)return 'snapshot-context-mismatch';
 if([identity.snapshotUidMatches,identity.snapshotRawDigestMatches,identity.snapshotSourceMatches].includes(false))return 'snapshot-identity-mismatch';
 const service=serviceIndex??{entries:0,matchedNames:0},direct=snapshotIndex??service;
 if(presentationResult==='null'&&direct.matchedNames>0)return 'service-returned-empty';
 if(presentationResult==='unavailable'&&snapshotResult==='unavailable')return 'presentation-unavailable';
 if(presentationResult==='null'&&snapshotResult==='null')return 'snapshot-missing';
 if(direct.entries===0&&service.entries===0)return 'no-index-entries';
 if(service.matchedNames===0&&direct.matchedNames===0)return 'no-public-body-match';
 if(dom.links===0)return 'links-not-projected';
 if(dom.styleVisibleLinks===0&&dom.styleVisibilityKnown)return 'links-style-hidden';
 return 'links-present';
}

export async function collectArchiveLinkDiagnostic(document,node,{message,contextKey=getContextKey(document),getPresentation=message=>document.defaultView?.Tisya?.presentation?.forMessage?.(message),source=phoneSource,database,getScope=()=>({}),inspect=inspectMessage,timeout=1000}={}){
 const base={schema:'tisya.archive-link-diagnostic/1',boundaries:{readOnly:true,messageTextIncluded:false,recordIdsIncluded:false,archiveNamesIncluded:false,iframeContentIncluded:false,pixelVerified:false}};
 if(!message)return {...base,available:false,assessment:'message-unavailable'};
 let inspection=null,body='',bodyError=null;
 try{inspection=inspect(String(message.mes??''));body=bodyOf(inspection);bodyError=inspection?.body?.error?errorCode(inspection.body.error):null;}catch(error){bodyError=errorCode(error?.code);}
 let sourceValue=null,sourceError=null;
 try{sourceValue=source(message);}catch(error){sourceError=errorCode(error?.code);}
 const presentationStage=readStage(()=>getPresentation(message),timeout,late=>late?.dispose?.()),snapshotStage=database?.snapshot&&sourceValue?readStage(()=>database.snapshot({...sourceValue,raw:String(message.mes??'')}),timeout):Promise.resolve({status:'unavailable',error:null,value:null});
 const [presentation,read]=await Promise.all([presentationStage,snapshotStage]);
 const presentationResult=presentation.status,presentationError=presentation.error,value=presentation.value,snapshot=read.value;let snapshotResult=read.status,snapshotError=read.error;
 let snapshotIndex=null;
 if(snapshot){
  try{snapshotIndex=indexSummary(matrixArchiveLinkIndex(snapshot,{sourceId:snapshot.snapshotId,contextKey,scope:getScope()}),body);}catch(error){snapshotError=errorCode(error?.code);snapshotResult='error';}
 }
 const serviceIndex=value?.archiveLinks?indexSummary(value.archiveLinks,body):null,dom=inspectDocumentRoots(document,node),presentationContextMatches=value?value.contextKey===contextKey:null;
 const identity={sourceReady:!!sourceValue,error:sourceError,contextKeyPresent:typeof contextKey==='string'&&!!contextKey,snapshotUidMatches:snapshot&&sourceValue?snapshot.uid===sourceValue.uid:null,snapshotRawDigestMatches:snapshot&&sourceValue?snapshot.hostMessageSha256===sha256(String(message.mes??'')):null,snapshotSourceMatches:snapshot&&sourceValue?snapshot.sourceId===sourceValue.sourceId:null,snapshotContextMatches:snapshot?snapshot.contextKey===contextKey:null};
 const result=assessment({message,sourceError,identity,presentationResult,presentationError,presentationContextMatches,snapshotResult,snapshotError,serviceIndex,snapshotIndex,dom});
 try{await value?.dispose?.();}catch{}
 return {...base,available:true,assessment:result,message:{assistant:message.is_user===false&&message.is_system!==true,uidPresent:typeof message.extra?.tisya_engine?.uid==='string',pending:!!message.extra?.tisya_engine?.pending_sha256,structured:!!inspection?.structured,publicBodyError:bodyError},identity,presentation:{status:presentationResult,error:presentationError,messageSnapshotPresent:!!value?.messageSnapshotId,contextMatches:presentationContextMatches,index:serviceIndex},snapshot:{status:snapshotResult,error:snapshotError,index:snapshotIndex},dom};
}

function getContextKey(document){try{return document.defaultView?.Tisya?.phone?.contextKey?.()??null;}catch{return null;}}

const assessments={ 'message-unavailable':'当前消息不可用','message-pending':'当前候选尚未接纳，严格历史快照不会投射链接','message-identity-error':'消息缺少可核对的历史身份','presentation-timeout':'生产呈现服务读取超时','presentation-error':'生产呈现服务读取失败','presentation-context-mismatch':'生产呈现结果不属于当前会话','snapshot-timeout':'历史快照读取超时','snapshot-error':'历史快照读取或索引失败','snapshot-context-mismatch':'历史快照不属于当前会话','snapshot-identity-mismatch':'历史快照与消息 UID、原文或来源不一致','snapshot-missing':'本条消息没有可读取的历史快照','service-returned-empty':'快照可匹配正文，但生产呈现服务返回空','presentation-unavailable':'呈现服务与快照均不可用','no-index-entries':'历史快照中没有可公开的自动链接档案','no-public-body-match':'索引存在，但本条公开正文没有匹配名称','links-not-projected':'服务与正文均有匹配，但最终 DOM 没有链接','links-style-hidden':'链接已插入，但全部被样式隐藏','links-present':'链接已插入；数量与样式状态见下方报告'};
export function archiveLinkDiagnosticSummary(report){if(!report?.available)return 'Tooltips：当前消息无法检查。';return `Tooltips：${assessments[report.assessment]??'检查完成'}。服务条目 ${count(report.presentation?.index?.entries)}；快照条目 ${count(report.snapshot?.index?.entries)}；正文匹配 ${Math.max(count(report.presentation?.index?.matchedNames),count(report.snapshot?.index?.matchedNames))}；DOM 链接 ${count(report.dom?.links)}；样式可见 ${count(report.dom?.styleVisibleLinks)}。`;}
