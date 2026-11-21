// Shared safety envelope for display, data and runtime inspections. This module
// deliberately projects raw host/task state into counts, booleans and fixed codes.
export const INSPECTION_SCHEMA='tisya.inspection-report/1';
const code=value=>typeof value==='string'&&/^[A-Z][A-Z0-9_]{0,90}$/.test(value)?value:'OTHER_ERROR';
const count=value=>Number.isSafeInteger(value)&&value>=0?value:0;
const bool=value=>typeof value==='boolean'?value:null;
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const table=value=>typeof value==='string'&&/^T_[A-Z0-9_]+$/.test(value)?value:'OTHER';
const boundaries=()=>Object.freeze({readOnly:true,modelCalled:false,businessStateModified:false,messageTextIncluded:false,namesIncluded:false,recordIdsIncluded:false,urlsIncluded:false,variableValuesIncluded:false,credentialsIncluded:false,requestContextIncluded:false,responseTextIncluded:false,pixelVerified:false,atomicSnapshot:false});
const pendingBlock=status=>({status,error:null,elapsedMs:null,report:null});

export function pendingInspectionReport({version,managed=false,now=()=>new Date()}={}){
 return {schema:INSPECTION_SCHEMA,version:String(version??'unknown'),createdAt:now().toISOString(),managedSurface:!!managed,display:pendingBlock('collecting'),data:pendingBlock('collecting'),runtime:pendingBlock('collecting'),boundaries:boundaries()};
}

const selectionStates=new Map([
 ['未发起会话选择','NOT_STARTED'],['准备调用','PREPARING'],['宿主调用未返回','HOST_PENDING'],
 ['宿主调用已返回','HOST_RETURNED'],['宿主调用失败','HOST_FAILED'],['已在目标会话，未调用宿主','ALREADY_SELECTED'],
 ['目标已交接，宿主收尾未返回','HANDED_OFF_HOST_PENDING']
]);
function safeSelection(value){
 if(!object(value))return {status:'unavailable',report:null};
 return {status:'available',report:{
  state:selectionStates.get(value.status)??'OTHER',targetPresent:object(value.target),
  chatEvents:count(value.chatEvents),contentCommits:count(value.contentCommits),
  lastContent:Number.isSafeInteger(value.lastContent)&&value.lastContent>=0?value.lastContent:null,
  matchesCharacter:bool(value.matchesCharacter),matchesChat:bool(value.matchesChat),
  current:object(value.current)?{messageCount:count(value.current.messageCount),hasIntegrity:bool(value.current.hasIntegrity)}:null
 }};
}

function safeDatabase(value){
 if(!object(value))return {status:'empty',revision:null,contextKeyPresent:false,statePresent:false,tableCount:0,recordCount:0,byTable:{}};
 const tables=object(value.state?.tables)?value.state.tables:{},byTable={};let recordCount=0;
 for(const [id,rows] of Object.entries(tables)){
  if(!object(rows))continue;const amount=Object.keys(rows).length,key=table(id);
  byTable[key]=(byTable[key]??0)+amount;recordCount+=amount;
 }
 return {status:'available',revision:Number.isSafeInteger(value.revision)&&value.revision>=0?value.revision:null,
  contextKeyPresent:typeof value.contextKey==='string'&&!!value.contextKey,statePresent:object(value.state),
  tableCount:Object.keys(byTable).length,recordCount,byTable:Object.fromEntries(Object.entries(byTable).sort(([a],[b])=>a.localeCompare(b)))};
}

export function safeDataInspection({selection,database}={}){
 return {selection:safeSelection(selection),database:safeDatabase(database)};
}

const stages=new Set(['preparing','prepared','waiting','connected','thinking','receiving','buffered','received','validating','complete','error','stopped']);
const finishes=new Set(['stop','length','tool_calls','content_filter']);
function safeTasks(value){
 if(!object(value))return {status:'unavailable',report:null};
 const progress=object(value.progress)?value.progress:null,jobs=Array.isArray(value.jobs)?value.jobs:[];
 const response=progress?.responseDiagnostic;
 return {status:'available',report:{
  busy:!!value.busy,stage:stages.has(progress?.stage)?progress.stage:null,
  characters:count(progress?.characters),response:{
   present:!!progress,textPresent:typeof progress?.text==='string'&&progress.text.length>0,
   diagnosticPresent:object(response),httpStatus:Number.isSafeInteger(response?.httpStatus)&&response.httpStatus>=100&&response.httpStatus<=599?response.httpStatus:null,
   done:bool(response?.done),reasoningDetected:bool(response?.reasoningDetected),finishReason:finishes.has(response?.finishReason)?response.finishReason:null,
   accepted:false
  },
  jobs:{total:jobs.length,failed:jobs.filter(job=>['失败','未通过','error','failed'].includes(job?.status)).length,
   withErrorCode:jobs.filter(job=>typeof job?.code==='string').length,withResponse:jobs.filter(job=>job?.response!==undefined&&job?.response!==null).length,
   errorCodes:[...new Set(jobs.map(job=>job?.code).filter(value=>typeof value==='string'&&/^[A-Z][A-Z0-9_]{0,90}$/.test(value)))].sort()}
 }};
}

export function safeRuntimeInspection({operation,tasks}={}){
 return {operation:{active:!!operation},tasks:safeTasks(tasks)};
}

async function readBlock(read,timeout,onLateValue){
 if(typeof read!=='function')return pendingBlock('unavailable');
 const started=Date.now();let timer;
 const work=Promise.resolve().then(read),expiry=new Promise(resolve=>{timer=setTimeout(()=>resolve({status:'timeout',error:'DIAGNOSTIC_TIMEOUT',value:null}),timeout);});
 const result=await Promise.race([
  work.then(value=>({status:value===null||value===undefined?'empty':'available',error:null,value:value??null}),error=>({status:'error',error:code(error?.code),value:null})),expiry
 ]);
 clearTimeout(timer);
 if(result.status==='timeout')work.then(value=>onLateValue?.(value)).catch(()=>{});
 return {status:result.status,error:result.error,elapsedMs:Math.max(0,Date.now()-started),report:result.value};
}

export async function collectInspectionReport({version,managed=false,readDisplay,readData,readRuntime,timeout=2000,now=()=>new Date(),onLateDisplay}={}){
 const limit=Number.isFinite(timeout)?Math.max(1,Math.min(5000,timeout)):2000;
 const [display,data,runtime]=await Promise.all([
  readBlock(readDisplay,limit,onLateDisplay),
  readBlock(readData,limit),
  readBlock(readRuntime,limit)
 ]);
 return {schema:INSPECTION_SCHEMA,version:String(version??'unknown'),createdAt:now().toISOString(),managedSurface:!!managed,display,data,runtime,boundaries:boundaries()};
}

export function inspectionReportSummary(report){
 const labels={collecting:'收集中',available:'已完成',empty:'空',unavailable:'不可用',error:'错误',timeout:'超时'};
 const blocks=[['显示',report?.display],['数据',report?.data],['运行时',report?.runtime]].map(([name,block])=>`${name}：${labels[block?.status]??'不可用'}${block?.error?'（'+code(block.error)+'）':''}`);
 const archive=report?.display?.report?.archiveLinkInspection;
 if(archive?.assessment)blocks.push('Tooltips：'+String(archive.assessment));
 return blocks.join('；');
}
