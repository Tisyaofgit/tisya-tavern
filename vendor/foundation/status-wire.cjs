'use strict';
const {parse}=require('./world/strict-json.cjs');
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
function parseStatus(text){
 const fail=()=>{throw Object.assign(Error('TISYA_WORLD_STATUS_SHAPE'),{code:'TISYA_WORLD_STATUS_SHAPE'});};
 if(typeof text!=='string'||text.length>64000)fail();
 // Empty legacy blocks remain readable; new output always uses {}.
 const value=text.trim()?parse(text):{};
 if(!object(value))fail();let count=0;
 for(const [type,objects]of Object.entries(value)){
  if(type==='叙事状态'){if(!object(objects))fail();for(const fields of Object.values(objects)){if(!object(fields))fail();for(const v of Object.values(fields)){if(++count>256)fail();validateNarrativeState(v);}}continue;}
  if(!type||!object(objects)||!Object.keys(objects).length)fail();
  for(const [name,fields]of Object.entries(objects)){
   if(!name||!object(fields)||!Object.keys(fields).length)fail();
   for(const [field]of Object.entries(fields))if(!field||++count>256)fail();
  }
 }
 return value;
}
function validateNarrativeState(v){
 const bad=()=>{throw Object.assign(Error('TISYA_NARRATIVE_STATUS_SHAPE'),{code:'TISYA_NARRATIVE_STATUS_SHAPE'});};
 if(!object(v)||!Object.hasOwn(v,'权限')||!Array.isArray(v.知情)||Object.keys(v).some(k=>!['权限','知情','旧值','新值','删除'].includes(k))||Object.hasOwn(v,'新值')===Object.hasOwn(v,'删除')||Object.hasOwn(v,'删除')&&v.删除!==true)bad();
 require('./permission-wire.cjs').validate(v.权限,['/0','/2','/3','/4',...v.知情.flatMap((x,i)=>[0,1,2].map(c=>'/知情/'+i+'/'+c))]);const used=new Set();
 for(const x of v.知情){if(!object(x)||Object.keys(x).sort().join()!=='主体,依据,等级'||typeof x.主体!=='string'||!x.主体.trim()||used.has(x.主体)||!['K0','K1','K2','K3'].includes(x.等级)||typeof x.依据!=='string'||!x.依据.trim())bad();used.add(x.主体);}return v;
}
function nativeStatus(v){return Object.fromEntries(Object.entries(v).filter(([k])=>k!=='叙事状态'));}
module.exports={parseStatus,validateNarrativeState,nativeStatus};
