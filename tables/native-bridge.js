import {check,copy,object} from './schema.js';
const esc=s=>s.replaceAll('~','~0').replaceAll('/','~1');
const keys=p=>{check(typeof p==='string'&&p.startsWith('/')&&!/~(?![01])/u.test(p),'变量路径须为 JSON Pointer');const out=p.slice(1).split('/').map(x=>x.replaceAll('~1','/').replaceAll('~0','~'));check(out.every(k=>!['__proto__','prototype','constructor'].includes(k)),'变量路径含保留键');return out;};
export function nativeLeaves(value,path=''){if(object(value)&&Object.keys(value).length)return Object.entries(value).flatMap(([k,v])=>nativeLeaves(v,path+'/'+esc(k)));return [{path,value:copy(value)}];}
// A branch is one editable JSON cell: native maps can gain/lose members without new model paths.
export function nativeBranches(value){return Object.entries(value).filter(([k])=>!k.startsWith('$')).map(([k,v])=>({path:'/'+esc(k),value:copy(v)}));}
export function valueAt(root,path){let v=root;for(const key of keys(path)){check(v!==null&&typeof v==='object'&&Object.hasOwn(v,key),'变量路径不存在：'+path);v=v[key];}return v;}
const container=v=>v!==null&&typeof v==='object';
const readonly=key=>key.startsWith('_')||key.startsWith('$');
function sameValue(a,b){
 if(a===b)return true;
 if(!container(a)||!container(b)||Array.isArray(a)!==Array.isArray(b))return false;
 if(Array.isArray(a)&&a.length!==b.length)return false;
 const aKeys=Object.keys(a),bKeys=Object.keys(b);
 return aKeys.length===bKeys.length&&aKeys.every(key=>Object.hasOwn(b,key)&&sameValue(a[key],b[key]));
}
function checkedRemoval(value,path){
 if(!container(value))return;
 for(const key of Object.keys(value)){const childPath=path+'/'+esc(key);check(!readonly(key),'只读变量不能移除：'+childPath);checkedRemoval(value[key],childPath);}
}
function checkedValue(before,after,path){
 // The native schema owns ordinary value types, including nullable and union branches.
 // Check disappearing subtrees too: replacing an ancestor must not erase protected descendants.
 if(container(after))for(const key of Object.keys(after)){
  check(!['__proto__','prototype','constructor'].includes(key),'变量含保留键');
  const childPath=path+'/'+esc(key),exists=container(before)&&Object.hasOwn(before,key);
  if(readonly(key))check(exists&&sameValue(before[key],after[key]),'只读变量不能由填表改变：'+childPath);
  else if(exists)checkedValue(before[key],after[key],childPath);
  else checkedNew(after[key]);
 }
 if(container(before))for(const key of Object.keys(before))if(!container(after)||!Object.hasOwn(after,key)){
  const childPath=path+'/'+esc(key);check(!readonly(key),'只读变量不能移除：'+childPath);checkedRemoval(before[key],childPath);
 }
}
function checkedNew(value){if(object(value)||Array.isArray(value))for(const [key,child] of Object.entries(value)){check(!['__proto__','prototype','constructor'].includes(key)&&!key.startsWith('$')&&!key.startsWith('_'),'不能创建保留变量键');checkedNew(child);}}
const within=(path,parent)=>path.length>=parent.length&&parent.every((key,index)=>path[index]===key);
function requestedPaths(before,after,path){
 if(sameValue(before,after))return [];
 if(object(before)&&object(after))return [...new Set([...Object.keys(before),...Object.keys(after)])].flatMap(key=>{
  const child=path+'/'+esc(key);
  return Object.hasOwn(before,key)&&Object.hasOwn(after,key)?requestedPaths(before[key],after[key],child):[child];
 });
 return [path];
}
function granularWrites(before,after,path){
 if(sameValue(before,after))return [];
 if(object(before)&&object(after)){
  const oldKeys=Object.keys(before),nextKeys=Object.keys(after);
  if(oldKeys.length===nextKeys.length&&oldKeys.every(key=>Object.hasOwn(after,key)))return oldKeys.flatMap(key=>granularWrites(before[key],after[key],path+'/'+esc(key)));
 }
 // A membership change needs its existing parent; arrays and type changes stay atomic.
 return [{op:'replace',path,value:copy(after)}];
}
function selectedWrites(before,after,path,writePaths,granular){
 check(Array.isArray(writePaths)&&writePaths.length<=200,'writePaths 须为至多 200 项的 JSON Pointer 列表');
 const branch=keys(path),selected=writePaths.map(pointer=>({path:pointer,parts:keys(pointer)})),diff=requestedPaths(before,after,path).map(keys);
 for(let index=0;index<selected.length;index++){
  const selectedPath=selected[index],relative=selectedPath.parts.slice(branch.length);
  check(within(selectedPath.parts,branch),'writePaths 超出当前原生映射分支：'+selectedPath.path);
  check(!selectedPath.parts.some(readonly),'writePaths 不能选择只读变量：'+selectedPath.path);
  check(!selected.slice(0,index).some(prior=>within(prior.parts,selectedPath.parts)||within(selectedPath.parts,prior.parts)),'writePaths 重复或父子路径重叠');
  check(snapshotAt(before,relative).exists||snapshotAt(after,relative).exists,'writePaths 路径在前后状态均不存在：'+selectedPath.path);
  if(relative.length){const priorParent=snapshotAt(before,relative.slice(0,-1)),nextParent=snapshotAt(after,relative.slice(0,-1));check(priorParent.exists&&nextParent.exists&&container(priorParent.value)&&container(nextParent.value),'writePaths 父容器不存在，不能创建中间结构：'+selectedPath.path);}
  check(diff.some(parts=>within(parts,selectedPath.parts)),'writePaths 未选择实际变化或拆分了原子值：'+selectedPath.path);
 }
 check(diff.every(parts=>selected.some(item=>within(parts,item.parts))),'writePaths 未完整覆盖本次变量差异');
 const effective=new Map();
 for(const item of selected){
  // An explicit new/deleted member selects its minimum existing structural parent.
  // Coverage was checked before promotion, so promotion cannot hide unselected sibling edits.
  const atomic=granular.find(operation=>within(item.parts,keys(operation.path))),actualPath=atomic?.path??item.path;
  if(!effective.has(actualPath))effective.set(actualPath,{op:'replace',path:actualPath,value:copy(valueAt({branch:after},'/branch'+actualPath.slice(path.length)))});
 }
 const operations=[...effective.values()];
 for(let index=0;index<operations.length;index++)check(!operations.slice(0,index).some(prior=>within(keys(prior.path),keys(operations[index].path))||within(keys(operations[index].path),keys(prior.path))),'writePaths 提交路径重叠');
 return operations;
}
export function bridgePatch(rows,proposal,before,evidence){
 check(Array.isArray(proposal.changes)&&proposal.changes.length<=200,'变量填表产物无效');const byId=new Map(rows.map(r=>[r.id,r])),seen=new Set(),operations=[];
 for(const op of proposal.changes){
  const row=byId.get(op.id);check(row?.table==='native_cells'&&row.values.启用!==false&&row.rev===op.expected,'变量映射不存在或版本已变化');check(op.table==='native_cells'&&object(op.values)&&Object.keys(op.values).every(k=>k==='值')&&Object.hasOwn(op.values,'值'),'变量归档只允许修改已有映射的值');check(typeof op.evidence==='string'&&op.evidence.trim()&&evidence.includes(op.evidence),'变量更新缺少本轮依据');
  const path=row.values.路径;check(!seen.has(path)&&![...seen].some(p=>p.startsWith(path+'/')||path.startsWith(p+'/')),'变量重复或父子路径重叠');seen.add(path);
  const old=valueAt(before.stat_data,path);check(sameValue(old,row.values.值),'原生值与表单映射已变化，请重新同步');check(!keys(path).some(readonly),'只读变量不能由填表改变');checkedValue(old,op.values.值,path);
  const granular=granularWrites(old,op.values.值,path),writes=Object.hasOwn(op,'writePaths')?selectedWrites(old,op.values.值,path,op.writePaths,granular):granular;
  check(operations.length+writes.length<=2000,'原生变量更新超过 2000 项，未回退整段写入');operations.push(...writes);
 }
 // Absolute replacements are idempotent; no model-written commands, deltas or scripts.
 return {operations,block:operations.length?'<UpdateVariable>\n<JSONPatch>\n'+JSON.stringify(operations).replaceAll('&','\\u0026').replaceAll('<','\\u003c')+'\n</JSONPatch>\n</UpdateVariable>':''};
}

const snapshot=(exists,value)=>({exists,value:exists?copy(value):null});
const sameSnapshot=(a,b)=>a.exists===b.exists&&(!a.exists||sameValue(a.value,b.value));
function snapshotAt(root,parts){
 let value=root;
 for(const key of parts){if(!container(value)||!Object.hasOwn(value,key))return snapshot(false);value=value[key];}
 return snapshot(true,value);
}
// Audit only the requested differences. Callback changes to other fields are not acceptance.
// Arrays, added/deleted containers and union type changes are atomic, so index shifts or
// missing containers cannot turn a failed replacement into apparently successful leaf edits.
export function auditNativeOutcome(operations,beforeStat,afterStat){
 check(Array.isArray(operations),'变量更新审计需要操作列表');
 const outcome={applied:[],adjusted:[],rejected:[]};
 for(const operation of operations){
  check(object(operation)&&operation.op==='replace'&&Object.hasOwn(operation,'value'),'变量更新审计仅支持绝对替换');
  const parts=keys(operation.path),requested=snapshot(true,operation.value),before=snapshotAt(beforeStat,parts);
  const visit=(prior,target,path,pathParts)=>{
   if(sameSnapshot(prior,target))return;
   if(prior.exists&&target.exists&&object(prior.value)&&object(target.value)){
    for(const key of new Set([...Object.keys(prior.value),...Object.keys(target.value)]))visit(snapshot(Object.hasOwn(prior.value,key),prior.value[key]),snapshot(Object.hasOwn(target.value,key),target.value[key]),path+'/'+esc(key),[...pathParts,key]);
    return;
   }
   const actual=snapshotAt(afterStat,pathParts),status=sameSnapshot(actual,target)?'applied':sameSnapshot(actual,prior)?'rejected':'adjusted';
   outcome[status].push({op:'replace',operationPath:operation.path,path,before:prior,requested:target,actual});
  };
  visit(before,requested,operation.path,parts);
 }
 return outcome;
}
export function bridgeRuntime(runtime=globalThis.Mvu){check(typeof runtime?.getMvuData==='function'&&typeof runtime?.parseMessage==='function'&&typeof runtime?.replaceMvuData==='function','自动更新块需要原生 MVU 的读取、解析和写入接口；脚本保持开启');return runtime;}
export function bridgeInput(context,runtime=globalThis.Mvu,index=context.chat.findLastIndex(m=>!m.is_user&&!m.is_system&&m.role!=='tool')){bridgeRuntime(runtime);check(Number.isSafeInteger(index)&&index>=0&&index<context.chat.length&&!context.chat[index]?.is_user&&!context.chat[index]?.is_system&&context.chat[index]?.role!=='tool','请选择完整 AI 回复后同步变量');let data;for(let i=index;i>=0;i--){if(context.chat[i]?.is_system||context.chat[i]?.role==='tool')continue;const candidate=runtime.getMvuData({type:'message',message_id:i});if(object(candidate?.stat_data)){data=copy(candidate);break;}}check(data,'原卡尚未初始化变量；先运行原卡开场');return {index,data};}
export async function applyBridge({runtime=globalThis.Mvu,index,before,block,guard}){const r=bridgeRuntime(runtime);guard();const current=r.getMvuData({type:'message',message_id:index});if(current?.stat_data)check(JSON.stringify(current.stat_data)===JSON.stringify(before.stat_data),'原生变量已被其他写入器改变');if(!block)return copy(before);const after=await r.parseMessage(block,copy(before));guard();check(object(after?.stat_data),'原生 MVU 未返回有效更新结果');const again=r.getMvuData({type:'message',message_id:index});if(again?.stat_data)check(JSON.stringify(again.stat_data)===JSON.stringify(before.stat_data),'解析期间原生值变化，未写入');await r.replaceMvuData(after,{type:'message',message_id:index});guard();const actual=r.getMvuData({type:'message',message_id:index});check(JSON.stringify(actual?.stat_data)===JSON.stringify(after.stat_data),'原生写回未确认，请重试核对');return copy(actual);}

// A user floor may already contain a copy of the old AI snapshot. Refresh only unchanged copies.
export async function carryNativeForward({context,runtime=globalThis.Mvu,index,before,after,guard}){
 for(let i=index+1;i<context.chat.length;i++){
  if(!context.chat[i].is_user)continue;
  const now=runtime.getMvuData({type:'message',message_id:i});
  if(now?.stat_data&&JSON.stringify(now.stat_data)!==JSON.stringify(before.stat_data))continue;
  guard();await runtime.replaceMvuData({...copy(now??{}),...copy(after)},{type:'message',message_id:i});guard();
 }
}

// Stage only writes carrying this parser's exact callback object. Unrelated writers pass through.
// The callback still runs once; its final wrapper, including Zod adjustments, is returned by MVU.
export async function parseNativeTransaction({runtime=globalThis.Mvu,eventSource,index,before,block,guard}){
 const r=bridgeRuntime(runtime),start=r.events?.VARIABLE_UPDATE_STARTED,original=r.replaceMvuData;
 let active=null,stagedWrites=0;
 if(start)check(typeof eventSource?.makeFirst==='function'&&typeof eventSource?.removeListener==='function','原生变量桥需要宿主事件接口以隔离原卡回调写入');
 const capture=variables=>{if(active===null)active=variables;};
 const staged=function(data,options){
  if(active&&(data===active||data===active.stat_data)&&options?.type==='message'){
   check(options.message_id===undefined||options.message_id==='latest'||options.message_id===-1||options.message_id===index,'原卡回调试图写入本次结算范围外的楼层');guard();stagedWrites++;return Promise.resolve();
  }
  return original.call(r,data,options);
 };
 if(start)eventSource.makeFirst(start,capture);
 r.replaceMvuData=staged;
 try{guard();const after=await r.parseMessage(block,copy(before));guard();check(object(after?.stat_data),'原生 MVU 未返回有效更新结果');return {after,stagedWrites};}
 finally{if(r.replaceMvuData===staged)r.replaceMvuData=original;if(start)eventSource.removeListener(start,capture);}
}
