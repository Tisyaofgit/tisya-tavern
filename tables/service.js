import {createPreferenceAssistant} from '../engine/preference-assistant.mjs';
import {prepareMainProposalRedraw,acceptMainProposalRedraw} from '../engine/main-proposals.mjs';
import {readPersistentMatrixAtlas} from './matrix-atlas-index.mjs';
import {memoryMessageRows} from '../engine/memory-status.mjs';
import {createConditionService} from './condition-service.js';
import {createFoundationService} from './foundation-service.js';
import {createTableAssistant} from './assistant.js';
import {createWorldFrameworkService} from '../engine/world-framework.mjs';
import {safeDiagnostic} from '../config/stream-response.js';
import {historySignature} from '../config/history-context.js';
import {tableSettings} from './schema.js';
import {styleRules,scanStyle} from './style-rules.js';
import {archivalText} from '../engine/reply.mjs';

// The only composition root. Legacy origin/session books, their replay journal,
// and their duplicate form workflows are not constructed by the product.
export function createTableService({store,getContext,request,books,conditionService:sharedConditionService=null,matrixDatabase=null,matrixHost=null,mediaAtlas=null,onNotice=()=>{},getConfigurationChoices=()=>({}),interfaceConfig=null,creator=null,openReviewWorkflow=null}={}){
 if(!matrixDatabase||!matrixHost)throw Error('规范 Matrix 数据库与宿主服务是表单组合根的必需依赖');
 let busy=false,controller=null,jobScope=null,progress=null,lastStyleAudit=null,boundWorld=getContext().chatId?store.read().key:null;
 const jobs=[],archiveListeners=new Set();
 const check=(ok,message)=>{if(!ok)throw Error(message);};
 const state=()=>({busy,jobScope,jobs:structuredClone(jobs),latest:null,styleAudit:structuredClone(lastStyleAudit),progress:structuredClone(progress),available:true,worldbook:{pending:false,active:[],candidates:0}});
 function status(task,status,detail='',error=null){
  jobs.push({task,status,detail:safeDiagnostic(detail),...(error?{response:structuredClone(error.responseDiagnostic??null),code:error.code??error.name}:{}),at:new Date().toISOString()});if(jobs.length>50)jobs.shift();onNotice({task,status,detail:safeDiagnostic(detail)});
 }
 async function exclusive(fn,{scope='manual'}={}){
  check(!busy,'表单任务正在处理，请等待完成或停止');busy=true;jobScope=scope;progress={task:scope==='generation'?'表单推进':'表单操作',stage:'preparing',characters:0,text:'',startedAt:Date.now(),updatedAt:Date.now()};controller=new AbortController();const signal=controller.signal;
  try{const result=await fn(signal);signal.throwIfAborted();if(progress)progress={...progress,stage:'complete',updatedAt:Date.now(),finishedAt:Date.now()};return result;}
  catch(error){const failure=signal.aborted?(signal.reason instanceof Error?signal.reason:Error('当前表单任务已停止')):error;status(progress?.task??'表单操作',signal.aborted?'已停止':'失败',failure.message,failure);if(progress)progress={...progress,stage:signal.aborted?'stopped':'error',updatedAt:Date.now(),finishedAt:Date.now()};throw failure;}
  finally{busy=false;controller=null;jobScope=null;}
 }
 function clear({scope=null,reason='已停止当前表单任务；已保存的记录仍保留'}={}){if(controller&&(!scope||jobScope===scope))controller.abort(Error(reason));}
 function contextChanged(){const next=getContext().chatId?store.read().key:null;if(next===boundWorld)return false;boundWorld=next;clear({reason:'会话已切换，旧表单任务已停止'});return true;}
 async function review(){
  const database=await matrixHost.readDatabase(),rows=memoryMessageRows(getContext().chat),schema=database?.state?.schema??{};
  const registry={format:'tisya.matrix-schema/1',tables:Object.values(schema).map(table=>({...structuredClone(table),name:table.label??table.id,fields:Object.fromEntries((table.fields??[]).map(field=>[field.label??field.key,structuredClone(field)]))})),types:[]};
  const records=Object.entries(database?.state?.tables??{}).flatMap(([table,rows])=>Object.entries(rows).map(([id,row])=>({id,table,values:structuredClone(row.values),states:structuredClone(row.states??{})})));
  return {database,registry,rows:records,history:rows,storageReady:!!database,storageError:database?null:'尚未接入规范表单',jobs:structuredClone(jobs),blueprint:null,chatStamp:historySignature(getContext())};
 }
 const onCommitted=()=>{for(const notify of archiveListeners)try{notify();}catch(error){status('图鉴刷新','失败',error.message);}};
 const conditionService=sharedConditionService??createConditionService({database:matrixDatabase,getContext,run:exclusive,onCommitted});
 const foundation=createFoundationService({database:matrixDatabase,books,request,getContext,ensureDatabase:()=>matrixHost.ensureDatabase(),run:exclusive,onCommitted});
 const api={
  ...createWorldFrameworkService(matrixDatabase),matrixDatabase,matrixHost,mediaAtlas,matrixCreator:creator,matrixFoundation:foundation,openReviewWorkflow,
  ...foundation,...conditionService,state,clear,contextChanged,review,
  readAtlasSnapshot:()=>readPersistentMatrixAtlas(matrixDatabase),prepareAtlasSnapshot:()=>readPersistentMatrixAtlas(matrixDatabase),
  subscribeArchive(fn){check(typeof fn==='function','需要刷新函数');archiveListeners.add(fn);const unsubscribe=matrixHost.subscribe(fn);return ()=>{archiveListeners.delete(fn);unsubscribe?.();};},
  checkStyle(text){const settings=tableSettings(store.read().world);return settings.styleEnabled?scanStyle(archivalText(text),styleRules(settings)):[];},
  auditStyle(text){const settings=tableSettings(store.read().world);lastStyleAudit={enabled:settings.styleEnabled,hits:settings.styleEnabled?scanStyle(archivalText(text),styleRules(settings)):[],at:new Date().toISOString()};return structuredClone(lastStyleAudit);},
  reviewMainProposal:input=>matrixHost.reviewMainProposal(input)
 };
 api.preferenceDraft=createPreferenceAssistant({run:exclusive,request,snapshot:async()=>{const db=await matrixHost.readDatabase();return {config:matrixHost.config.read(),databaseRevision:db?.revision,contextKey:db?.contextKey};}});
 api.redrawMainProposal=({tableId,recordId})=>exclusive(async signal=>{
  const snapshot=await matrixHost.readDatabase();check(snapshot,'请先接入当前会话');
  const prepared=prepareMainProposalRedraw(snapshot,{tableId,recordId});status(prepared.task,'运行中','重绘待确认提案');
  const raw=await request(prepared.task,JSON.stringify(prepared.input),{signal});signal.throwIfAborted();
  const accepted=acceptMainProposalRedraw(snapshot,prepared,raw),current=await matrixHost.readDatabase();
  check(current.revision===snapshot.revision&&current.contextKey===snapshot.contextKey,'重绘期间存档已变化；原答未采用');
  const result=await matrixHost.reviewMainProposal({tableId,recordId,action:'revise',values:accepted.values,contextKey:current.contextKey,expectedRevision:current.revision});status(prepared.task,'待确认','专项重绘已保存，尚未生效');return result;
 });
 api.assistant=createTableAssistant({matrixConfig:matrixHost.config,store,getContext,review,run:exclusive,call:(input,signal)=>request('tableAssistant',JSON.stringify(input),{signal}),getChoices:getConfigurationChoices,interfaceConfig});
 return Object.freeze(api);
}
