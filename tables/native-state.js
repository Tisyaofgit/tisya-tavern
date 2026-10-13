// Immutable, source-aligned reads only. MVU remains the single native writer.
export function nativeReferences(rows){const out=new Set();function visit(v){if(!v||typeof v!=='object')return;if(typeof v.原生引用==='string'&&v.原生引用)out.add(v.原生引用);for(const x of Object.values(v))visit(x);}for(const row of rows)visit(row.values);return [...out];}
function readPath(root,path){const keys=path.startsWith('/')?path.slice(1).split('/').map(k=>k.replaceAll('~1','/').replaceAll('~0','~')):path.replace(/^\$\.?/,'').split('.');let value=root;for(const k of keys){if(['__proto__','prototype','constructor'].includes(k)||!value||typeof value!=='object'||!Object.hasOwn(value,k))return {found:false};value=value[k];}return {found:true,value:structuredClone(value)};}
export function nativeSnapshot(rows,{context,messageIndex=context.chat.length-1,runtime=globalThis.Mvu}={}){
 const paths=nativeReferences(rows);if(!paths.length)return null;
 if(typeof runtime?.getMvuData!=='function')return {readOnly:true,available:false,missing:paths,note:'原生变量接口未就绪，不能据此结算数值结果'};
 for(let index=messageIndex;index>=0;index--){if(context.chat[index]?.is_system)continue;const data=runtime.getMvuData({type:'message',message_id:index});if(data?.stat_data&&typeof data.stat_data==='object'){const values=[],missing=[];for(const path of paths){const r=readPath(data.stat_data,path);if(r.found)values.push({path,value:r.value});else missing.push(path);}return {readOnly:true,available:true,sourceFloor:index+1,values,missing,note:'仅来源楼层快照，不能当成表单字段镜像或由辅助API写回'};}}
 return {readOnly:true,available:false,missing:paths,note:'所选剧情时刻之前没有原生变量快照'};
}
