import {Runtime} from './runtime.mjs';
import {initializeState} from './materials.mjs';
import {clone,fail,digest} from './common.mjs';

export const GLOBAL_PREFERENCE_CONTEXT='matrix-global-preferences';
const STORAGE_ID='tisya-matrix-global-preferences';

// Cross-story defaults are Matrix records in the same storage and Runtime
// transaction service. This is a scope workspace, not a settings sidecar.
export function createGlobalPreferenceStore({storage,loadCatalog}){
 async function read(){
  const bundle=await storage.get(STORAGE_ID);
  return {state:clone(bundle?.state??{tables:{}}),revision:bundle?.local_revision??0,contextKey:GLOBAL_PREFERENCE_CONTEXT};
 }
 async function commit({operationId,expectedRevision,contextKey,changes=[]}={}){
  if(contextKey!==GLOBAL_PREFERENCE_CONTEXT)fail('CHAT_CHANGED','全局偏好工作区归属已变化');
  if(typeof operationId!=='string'||!operationId.trim())fail('OPERATION_ID','全局偏好提交需要稳定操作ID');
  if(!Array.isArray(changes))fail('DATABASE_BATCH','全局偏好批次必须为列表');
  const bundle=await storage.get(STORAGE_ID),revision=bundle?.local_revision??0;
  const hash=digest({operationId,contextKey,changes}),prior=bundle?.database_operations?.[operationId];
  if(prior){if(prior.hash!==hash)fail('OPERATION_CONFLICT','同一操作ID不能替换内容');return read();}
  if(expectedRevision!==revision)fail('SAVE_CONFLICT','全局偏好已被另一页面更新，请刷新后重试');
  const state=bundle?.state??initializeState(await loadCatalog(),{session_ref:'global',branch_ref:'main'}),e=new Runtime(state);
  const transaction=e.transaction(operationId,{operationId,contextKey,changes,source:{kind:'global-preference-editor'}},()=>{
   for(const change of changes){
    const tid=change.tableId??change.table,rid=change.recordId??change.id;
    if(tid!=='T_PREF_SCOPES'||typeof rid!=='string'||!rid)fail('DATABASE_TARGET','全局工作区只接受用户偏好记录');
    if(change.remove){e.removeRecord(tid,rid);continue;}
    if(!e.rows(tid)[rid])e.newRecord(tid,{},rid);
    for(const [field,value]of Object.entries(change.values??{}))e.set([tid,rid,field,[]],value,change.states?.[field]??'known');
   }
   return {changed:changes.length,source:{kind:'global-preference-editor'}};
  });
  if(transaction.status==='FAILED')fail(transaction.error.code,transaction.error.message,transaction.error.details);
  const next={...bundle,state:e.data,local_revision:revision+1,database_operations:{...(bundle?.database_operations??{}),[operationId]:{hash,contextKey}}};
  if(!await storage.commit(STORAGE_ID,revision,next))fail('SAVE_CONFLICT','全局偏好已被另一页面更新，请刷新后重试');
  return {state:clone(next.state),revision:next.local_revision,contextKey,receipt:clone(transaction)};
 }
 return {read,commit};
}
