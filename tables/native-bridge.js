import {check,copy,object} from './schema.js';
const esc=s=>s.replaceAll('~','~0').replaceAll('/','~1');
const keys=p=>{check(typeof p==='string'&&p.startsWith('/')&&!/~(?![01])/u.test(p),'变量路径须为 JSON Pointer');const out=p.slice(1).split('/').map(x=>x.replaceAll('~1','/').replaceAll('~0','~'));check(out.every(k=>!['__proto__','prototype','constructor'].includes(k)),'变量路径含保留键');return out;};
export function nativeLeaves(value,path=''){if(object(value)&&Object.keys(value).length)return Object.entries(value).flatMap(([k,v])=>nativeLeaves(v,path+'/'+esc(k)));return [{path,value:copy(value)}];}
export function valueAt(root,path){let v=root;for(const key of keys(path)){check(v!==null&&typeof v==='object'&&Object.hasOwn(v,key),'变量路径不存在：'+path);v=v[key];}return v;}
const kind=v=>v===null?'null':Array.isArray(v)?'array':typeof v;
export function bridgePatch(rows,proposal,before,evidence){
 check(Array.isArray(proposal.changes)&&proposal.changes.length<=200,'变量填表产物无效');const byId=new Map(rows.map(r=>[r.id,r])),seen=new Set(),operations=[];
 for(const op of proposal.changes){const row=byId.get(op.id);check(row?.table==='native_cells'&&row.values.启用!==false&&row.rev===op.expected,'变量映射不存在或版本已变化');check(op.table==='native_cells'&&object(op.values)&&Object.keys(op.values).every(k=>k==='值')&&Object.hasOwn(op.values,'值'),'变量归档只允许修改已有映射的值');check(typeof op.evidence==='string'&&op.evidence.trim()&&evidence.includes(op.evidence),'变量更新缺少本轮依据');const path=row.values.路径;check(!seen.has(path),'变量重复更新');seen.add(path);const old=valueAt(before.stat_data,path);check(JSON.stringify(old)===JSON.stringify(row.values.值),'原生值与表单映射已变化，请重新同步');check(kind(old)===kind(op.values.值),'变量类型不能由填表改变');if(JSON.stringify(old)!==JSON.stringify(op.values.值))operations.push({op:'replace',path,value:copy(op.values.值)});}
 // Absolute replacements are idempotent; no model-written commands, deltas or scripts.
 return {operations,block:operations.length?'<UpdateVariable>\n<JSONPatch>\n'+JSON.stringify(operations).replaceAll('&','\\u0026').replaceAll('<','\\u003c')+'\n</JSONPatch>\n</UpdateVariable>':''};
}
export function bridgeRuntime(runtime=globalThis.Mvu){check(typeof runtime?.getMvuData==='function'&&typeof runtime?.parseMessage==='function'&&typeof runtime?.replaceMvuData==='function','自动更新块需要原生 MVU 的读取、解析和写入接口；脚本保持开启');return runtime;}
export function bridgeInput(context,runtime=globalThis.Mvu,index=context.chat.findLastIndex(m=>!m.is_user&&!m.is_system&&m.role!=='tool')){bridgeRuntime(runtime);check(index>=0&&!context.chat[index]?.is_user,'请选择完整 AI 回复后同步变量');let data;for(let i=index;i>=0;i--){const candidate=runtime.getMvuData({type:'message',message_id:i});if(object(candidate?.stat_data)){data=copy(candidate);break;}}check(data,'原卡尚未初始化变量；先运行原卡开场');return {index,data};}
export async function applyBridge({runtime=globalThis.Mvu,index,before,block,guard}){const r=bridgeRuntime(runtime);guard();const current=r.getMvuData({type:'message',message_id:index});if(current?.stat_data)check(JSON.stringify(current.stat_data)===JSON.stringify(before.stat_data),'原生变量已被其他写入器改变');if(!block)return copy(before);const after=await r.parseMessage(block,copy(before));guard();check(object(after?.stat_data),'原生 MVU 未返回有效更新结果');const again=r.getMvuData({type:'message',message_id:index});if(again?.stat_data)check(JSON.stringify(again.stat_data)===JSON.stringify(before.stat_data),'解析期间原生值变化，未写入');await r.replaceMvuData(after,{type:'message',message_id:index});guard();const actual=r.getMvuData({type:'message',message_id:index});check(JSON.stringify(actual?.stat_data)===JSON.stringify(after.stat_data),'原生写回未确认，请重试核对');return copy(actual);}

// A user floor may already contain a copy of the old AI snapshot. Refresh only unchanged copies.
export async function carryNativeForward({context,runtime=globalThis.Mvu,index,before,after,guard}){
 for(let i=index+1;i<context.chat.length;i++){
  if(!context.chat[i].is_user)continue;
  const now=runtime.getMvuData({type:'message',message_id:i});
  if(now?.stat_data&&JSON.stringify(now.stat_data)!==JSON.stringify(before.stat_data))continue;
  guard();await runtime.replaceMvuData({...copy(after),...copy(now??{}),stat_data:copy(after.stat_data)},{type:'message',message_id:i});guard();
 }
}
