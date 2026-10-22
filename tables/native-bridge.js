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
function absoluteChanges(before,after,path){
 if(sameValue(before,after))return [];
 // Preserve a native field's path. Structural collection changes and arrays stay
 // atomic; scalar edits do not replace their unrelated ancestor branches.
 if(object(before)&&object(after)&&Object.keys(before).length===Object.keys(after).length&&Object.keys(before).every(key=>Object.hasOwn(after,key)))return Object.keys(before).flatMap(key=>absoluteChanges(before[key],after[key],path+'/'+esc(key)));
 return [{op:'replace',path,value:copy(after)}];
}
function requestedPaths(before,after,path){
 if(sameValue(before,after))return [];
 if(object(before)&&object(after))return [...new Set([...Object.keys(before),...Object.keys(after)])].flatMap(key=>{
  const child=path+'/'+esc(key);
  return Object.hasOwn(before,key)&&Object.hasOwn(after,key)?requestedPaths(before[key],after[key],child):[child];
 });
 return [path];
}
function nativeWriteBoundaries(operations,writePaths,rootPath,before,after){
 if(writePaths===undefined)return operations;
 check(Array.isArray(writePaths)&&writePaths.length<=200,'原生写入边界须为至多 200 条路径');
 const boundaries=[],rootKeys=keys(rootPath),diff=requestedPaths(before,after,rootPath);
 for(const path of writePaths){
  const parts=keys(path);check(path===rootPath||path.startsWith(rootPath+'/'),'原生写入边界超出映射范围');
  check(!parts.some(readonly),'只读变量不能作为写入边界');
  check(!boundaries.some(p=>path===p||path.startsWith(p+'/')||p.startsWith(path+'/')),'原生写入边界重复或互相重叠');
  const relative=parts.slice(rootKeys.length);
  check(snapshotAt(before,relative).exists||snapshotAt(after,relative).exists,'原生写入边界在前后状态均不存在');
  if(relative.length){const priorParent=snapshotAt(before,relative.slice(0,-1)),nextParent=snapshotAt(after,relative.slice(0,-1));check(priorParent.exists&&nextParent.exists&&container(priorParent.value)&&container(nextParent.value),'原生写入边界父容器不存在，不能创建中间结构');}
  check(diff.some(p=>p===path||p.startsWith(path+'/')),'原生写入边界没有覆盖实际修改或拆分了原子值');
  boundaries.push(path);
 }
 // Validate requested coverage before using structural parents; a new member must
 // not silently authorize an unselected sibling change in the same container.
 check(diff.every(path=>boundaries.some(p=>path===p||path.startsWith(p+'/'))),'原生写入边界未完整覆盖本次变量差异');
 const emitted=new Set();return operations.flatMap(op=>{
  // New/deleted member selectors retain absoluteChanges' minimum existing parent.
  const path=boundaries.find(p=>op.path===p||op.path.startsWith(p+'/'))??op.path;if(emitted.has(path))return [];emitted.add(path);
  let value=after;for(const key of keys(path).slice(rootKeys.length)){check(container(value)&&Object.hasOwn(value,key),'原生写入边界在目标中不存在');value=value[key];}
  return [{op:'replace',path,value:copy(value)}];
 });
}
export function bridgePatch(rows,proposal,before,evidence){
 check(Array.isArray(proposal.changes)&&proposal.changes.length<=200,'变量填表产物无效');const byId=new Map(rows.map(r=>[r.id,r])),seen=new Set(),operations=[];
 for(const op of proposal.changes){const row=byId.get(op.id);check(row?.table==='native_cells'&&row.values.启用!==false&&row.rev===op.expected,'变量映射不存在或版本已变化');check(op.table==='native_cells'&&object(op.values)&&Object.keys(op.values).every(k=>k==='值')&&Object.hasOwn(op.values,'值'),'变量归档只允许修改已有映射的值');check(typeof op.evidence==='string'&&op.evidence.trim()&&evidence.includes(op.evidence),'变量更新缺少本轮依据');const path=row.values.路径;check(!seen.has(path)&&![...seen].some(p=>p.startsWith(path+'/')||path.startsWith(p+'/')),'变量重复或父子路径重叠');seen.add(path);const old=valueAt(before.stat_data,path);check(sameValue(old,row.values.值),'原生值与表单映射已变化，请重新同步');check(!keys(path).some(k=>k.startsWith('_')||k.startsWith('$')),'只读变量不能由填表改变');checkedValue(old,op.values.值,path);operations.push(...nativeWriteBoundaries(absoluteChanges(old,op.values.值,path),op.writePaths,path,old,op.values.值));}
 check(operations.length<=2000,'原生变量修改超过单次 2000 条路径，请分批处理');
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
// Conservatively preserve nonempty legacy blocks: the original runtime owns
// their effects. Empty JSONPatch/Analysis wrappers do not claim a settlement.
export function hasNativeUpdate(text){
 if(/<JSONPatch>\s*\[(?!\s*\])/i.test(String(text)))return true;
 return [...String(text).matchAll(/<UpdateVariable\b[^>]*>([\s\S]*?)<\/UpdateVariable>/gi)].some(match=>match[1].replace(/<Analysis\b[^>]*>[\s\S]*?<\/Analysis>/gi,'').replace(/<JSONPatch>\s*\[\s*\]\s*<\/JSONPatch>/gi,'').trim().length>0);
}
export function bridgeRuntime(runtime=globalThis.Mvu){check(typeof runtime?.getMvuData==='function'&&typeof runtime?.parseMessage==='function'&&typeof runtime?.replaceMvuData==='function','自动更新块需要原生 MVU 的读取、解析和写入接口；脚本保持开启');return runtime;}
export function bridgeInput(context,runtime=globalThis.Mvu,index=context.chat.findLastIndex(m=>!m.is_user&&!m.is_system&&m.role!=='tool')){bridgeRuntime(runtime);check(Number.isSafeInteger(index)&&index>=0&&index<context.chat.length&&!context.chat[index]?.is_user&&!context.chat[index]?.is_system&&context.chat[index]?.role!=='tool','请选择完整 AI 回复后同步变量');let data,snapshotIndex;for(let i=index;i>=0;i--){if(context.chat[i]?.is_system||context.chat[i]?.role==='tool')continue;const candidate=runtime.getMvuData({type:'message',message_id:i});if(object(candidate?.stat_data)){data=copy(candidate);snapshotIndex=i;break;}}check(data,'原卡尚未初始化变量；先运行原卡开场');return {index,snapshotIndex,data};}
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
