'use strict';
const fail=c=>{throw Object.assign(Error('TISYA_PERMISSION_'+c),{code:'TISYA_PERMISSION_'+c});};
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
function tuple(p){
 if(!Array.isArray(p)||p.length!==4||!['A','B','C','D','E',null].includes(p[0]))fail('SHAPE');
 for(const a of p.slice(1))if(a!==null&&(!Array.isArray(a)||a.some(x=>typeof x!=='string'||!x.trim())||new Set(a).size!==a.length))fail('AUDIENCE');
 return p;
}
function pointer(s){if(typeof s!=='string'||!/^\/(?:[^~]|~[01])*$/.test(s))fail('POINTER');return s.split('/').slice(1).map(x=>x.replace(/~1/g,'/').replace(/~0/g,'~'));}
function validate(p,paths){
 if(Array.isArray(p))return tuple(p);
 if(!object(p)||Object.keys(p).sort().join()!=='字段,默认'||!object(p.字段))fail('SHAPE');
 tuple(p.默认);for(const [key,v]of Object.entries(p.字段)){pointer(key);tuple(v);if(paths&&!paths.some(x=>x===key||x.startsWith(key+'/')))fail('UNRESOLVED_TARGET');}
 return p;
}
function at(p,path=''){validate(p);if(Array.isArray(p))return p;let selected=p.默认,length=0;for(const [k,v]of Object.entries(p.字段))if((path===k||path.startsWith(k+'/'))&&k.length>length){selected=v;length=k.length;}return selected;}
function allows(p,{mode='read',audience='叙事组织',path='',subject=false}={}){const t=at(p,path),scope=t[mode==='emit'?2:1];return Array.isArray(scope)&&scope.includes(audience)&&(!subject||Array.isArray(t[3])&&t[3].includes(audience));}
function conjunct(a,b,opts){return allows(a,opts)&&allows(b,opts);}
module.exports={validate,tuple,at,allows,conjunct,pointer};
