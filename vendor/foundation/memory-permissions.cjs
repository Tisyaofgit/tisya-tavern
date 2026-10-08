'use strict';
const ACL=require('./permission-wire.cjs');
const bad=c=>{throw Object.assign(Error('TISYA_MEMORY5_'+c),{code:'TISYA_MEMORY5_'+c});};
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const exact=(v,keys,optional=[])=>{if(!object(v)||keys.some(k=>!Object.hasOwn(v,k))||Object.keys(v).some(k=>!keys.includes(k)&&!optional.includes(k)))bad('FIELDS');};
const str=(x,nullable=false)=>{if(nullable&&x===null)return;if(typeof x!=='string'||!x.trim()||x.length>24000)bad('TEXT');};
const list=(x,limit=128)=>{if(!Array.isArray(x)||x.length>limit)bad('LIST');};
const strings=x=>{list(x);x.forEach(v=>str(v));if(new Set(x).size!==x.length)bad('DUPLICATE');};
const cellPaths=n=>Array.from({length:n},(_,i)=>'/'+i);
function permission(p,paths){return ACL.validate(p,paths);}
function change(x){exact(x,['对象','字段','权限'],['旧值','新值','删除']);str(x.对象);str(x.字段);if(Object.hasOwn(x,'新值')===Object.hasOwn(x,'删除')||Object.hasOwn(x,'删除')&&x.删除!==true)bad('CHANGE');permission(x.权限,['/0','/1','/2','/3']);}
function eventPaths(e){
 const paths=['/0','/2','/原文/0/0','/场景/0/0','/场景/0/1','/场景/0/2','/场景/0/3','/影响/0/0','/变因/0/0','/标签/0/0'];
 for(const [label,key,columns]of [['结果','结果',[0]],['伏笔','伏笔',[0,1,2,3]],['认知','认知',[0,1,2,4,5]],['心理','角色心理',[0,2,3]],['变动','设定变动',[0,1,2,3]]])e[key].forEach((x,i)=>columns.forEach(j=>paths.push('/'+label+'/'+i+'/'+j)));
 return paths;
}
function validate(q,{body}={}){
 exact(q,['protocol','关联','关联权限','权限','事件','未完事项','倒计时']);if(q.protocol!=='tisya.lab.memory/5')bad('PROTOCOL');strings(q.关联);if(q.关联权限!==null)permission(q.关联权限,['/0']);else if(q.关联.length)bad('ASSOCIATION_PERMISSION');
 list(q.权限,256);const targets=new Set();for(const x of q.权限){exact(x,['区块','定位','权限']);if(!['status','vars','extra'].includes(x.区块))bad('ACL_BLOCK');const k=JSON.stringify([x.区块,x.定位]);if(targets.has(k))bad('ACL_DUPLICATE');targets.add(k);if(x.区块==='vars')ACL.pointer(x.定位);else{list(x.定位);if(x.定位.length!==(x.区块==='status'?3:2))bad('ACL_TARGET');x.定位.forEach(v=>str(v));}permission(x.权限);}
 list(q.事件,64);for(const e of q.事件){
  exact(e,['标题','时间','地点','世界','参与者','权限','梗概','结果','影响','原文','段落','伏笔','认知','角色心理','设定变动','设定原因','标签']);
  str(e.标题,true);exact(e.时间,['起','止']);str(e.时间.起,true);str(e.时间.止,true);if(e.地点!==null)strings(e.地点);str(e.世界,true);strings(e.参与者);str(e.梗概);strings(e.结果);str(e.影响,true);str(e.原文,true);strings(e.标签);
  for(const k of ['伏笔','认知','角色心理','设定变动'])list(e[k]);
  permission(e.权限,eventPaths(e));
  if(e.段落!==null){str(e.段落);if(typeof body==='string'&&require('./numbered-paragraphs.cjs').resolve(e.段落,body)!==e.原文)bad('QUOTE');}else if(e.原文!==null)bad('QUOTE_REFERENCE');
  for(const x of e.伏笔){exact(x,['动作','对象','词','依据']);if(!['埋下','推进','回收'].includes(x.动作))bad('HOOK');strings(x.对象);str(x.词);str(x.依据);}
  for(const x of e.认知){exact(x,['主体','类别','确信','权限','内容','来源']);str(x.主体);str(x.内容);str(x.来源);if(!['自我','对外'].includes(x.类别)||!['确认','听闻','推测','误信'].includes(x.确信))bad('COGNITION');permission(x.权限,['/0','/1','/2','/4','/5']);}
  for(const x of e.角色心理){exact(x,['主体','权限','内容','依据']);str(x.主体);str(x.内容);str(x.依据);permission(x.权限,['/0','/2','/3']);}
  e.设定变动.forEach(change);str(e.设定原因,true);if(e.设定变动.length&&e.设定原因===null)bad('REASON');
 }
 list(q.未完事项,64);for(const x of q.未完事项){exact(x,['状态','事项','对象','触发','依据','权限']);if(!['待处理','完成','取消'].includes(x.状态))bad('TASK');str(x.事项);strings(x.对象);str(x.触发);str(x.依据);permission(x.权限,cellPaths(5));}
 list(q.倒计时,32);for(const x of q.倒计时){exact(x,['计时','延后','对象','地点','内容','权限','条件','失效']);if(!['天','轮'].includes(x.计时)||!Number.isSafeInteger(x.延后)||x.延后<1||x.延后>1000)bad('TIMER');strings(x.对象);str(x.地点,true);str(x.内容);const paths=cellPaths(5);for(const k of ['条件','失效']){list(x[k]);x[k].forEach((c,i)=>{exact(c,['对象','公开字段','等于','权限']);str(c.对象);str(c.公开字段);permission(c.权限,cellPaths(3));cellPaths(3).forEach(p=>paths.push('/'+k+'/'+i+p));});}permission(x.权限,paths);}
 return q;
}
function all(p,paths,opts){return paths.every(path=>ACL.allows(p,{...opts,path}));}
// Filter using the original transport paths. The source remains unchanged.
// A field's name, cause and evidence need the same independent authorization.
function projectEvent(e,opts={}){
 const a=path=>ACL.allows(e.权限,{...opts,path});
 const out={...structuredClone(e),标题:a('/场景/0/0')?e.标题:null,时间:a('/场景/0/1')?e.时间:{起:null,止:null},地点:a('/场景/0/2')?e.地点:null,世界:a('/场景/0/3')?e.世界:null,参与者:a('/0')?e.参与者:[],梗概:a('/2')?e.梗概:null,原文:a('/原文/0/0')?e.原文:null,段落:null,影响:a('/影响/0/0')?e.影响:null,设定原因:a('/变因/0/0')?e.设定原因:null,标签:a('/标签/0/0')?e.标签:[]};
 out.结果=e.结果.filter((x,i)=>a('/结果/'+i+'/0'));
 for(const [label,key,cols,ownCols]of [['伏笔','伏笔',[0,1,2,3]],['认知','认知',[0,1,2,4,5],[0,1,2,4,5]],['心理','角色心理',[0,2,3],[0,2,3]],['变动','设定变动',[0,1,2,3],[0,1,2,3]]])out[key]=e[key].filter((x,i)=>cols.every(c=>a('/'+label+'/'+i+'/'+c))&&(!ownCols||all(x.权限,ownCols.map(c=>'/'+c),opts)));
 if(!out.梗概&&!out.原文&&!out.结果.length&&!out.影响&&!out.伏笔.length&&!out.认知.length&&!out.角色心理.length&&!out.设定变动.length)return null;
 return out;
}
function visibleTask(t,opts={}){return all(t.权限,cellPaths(5),opts);}
function visibleTimer(t,opts={}){return all(t.权限,cellPaths(5),opts)&&['条件','失效'].every(k=>t[k].every((c,i)=>all(c.权限,cellPaths(3),opts)&&all(t.权限,cellPaths(3).map(p=>'/'+k+'/'+i+p),opts)));}
function validateLocators(q,b){
 const parsed={status:JSON.parse(b.status||'{}'),vars:b.vars.trim()?JSON.parse(b.vars):{}};
 for(const x of q.权限){
  const parts=x.区块==='vars'?ACL.pointer(x.定位):x.定位;
  if(x.区块==='extra'){
   let component=false,found=false;const stack=[];for(const t of require('./xml-envelope.cjs').xmlTokens('<reply><extra>'+b.extra+'</extra></reply>')){if(t.kind==='open'){stack.push(t.name);if(t.name===parts[0])component=true;if(component&&t.name===parts[1])found=true;if(t.selfClose)stack.pop();}else if(t.kind==='close'){if(t.name===parts[0])component=false;stack.pop();}}
   if(!found)bad('ACL_EXTRA_TARGET');continue;
  }
  let v=parsed[x.区块];for(const p of parts){if(v===null||typeof v!=='object'||!Object.hasOwn(v,p))bad('ACL_UNRESOLVED');v=v[p];}
 }
 for(const [type,objects]of Object.entries(parsed.status))if(type!=='叙事状态')for(const [name,fields]of Object.entries(objects))for(const field of Object.keys(fields))if(!q.权限.some(x=>x.区块==='status'&&JSON.stringify(x.定位)===JSON.stringify([type,name,field])))bad('STATUS_PERMISSION_MISSING');
 if(parsed.vars.operations?.length&&!q.权限.some(x=>x.区块==='vars'))bad('VARS_PERMISSION_MISSING');
}
module.exports={validate,projectEvent,visibleTask,visibleTimer,validateLocators,eventPaths,all};
