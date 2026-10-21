import {sourceVarsJSON,nativeStatusTail,nativeUpdateTail,nativeStatusInVars} from './native-mvu-wire.js';
import {displayRecordSource} from './display-records.js';
// Read-only wire compatibility. Original messages and vendor sources are never
// rewritten. Compact grades carry no inferred character/participant knowledge.
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
export function expandPermission(value){
 if(typeof value==='string'&&/^(?:[A-Ea-e]|~)$/.test(value)){
  const grade=value==='~'?'A':value.toUpperCase(),publicRecord=grade==='A';
  return [grade,publicRecord?['叙事组织','记录整理','读者']:['叙事组织','记录整理'],publicRecord?['读者']:[],null];
 }
 if(object(value)&&Object.keys(value).sort().join()==='字段,默认'&&object(value.字段))return {
  默认:expandPermission(value.默认),字段:Object.fromEntries(Object.entries(value.字段).map(([path,policy])=>[path,expandPermission(policy)]))
 };
 return value;
}

const fail=code=>{throw Object.assign(Error('TISYA_MEMORY5_'+code),{code:'TISYA_MEMORY5_'+code});};
function hasPath(root,parts){let value=root;for(const part of parts){if(value===null||typeof value!=='object'||!Object.hasOwn(value,part))return false;value=value[part];}return true;}

// Source cards use XML components with either XML fields or [Field|value]
// records. Match an actual direct field of one unique component, not arbitrary
// text, comments, attributes, nested scripts, or another component's field.
function extraTarget(extra,parts,xmlTokens){
 const stack=[];let components=0,hits=0,active=false;
 for(const token of xmlTokens('<reply><extra>'+extra+'</extra></reply>')){
  if(token.kind==='open'){
   if(stack.length===2&&token.name===parts[0]){components++;active=true;}
   else if(active&&stack.length===3&&token.name===parts[1])hits++;
   if(!token.selfClose)stack.push(token.name);
   else if(stack.length===2)active=false;
  }else if(token.kind==='close'){
   if(stack.length===3)active=false;
   stack.pop();
  }else if(token.kind==='text'&&active&&stack.length===3){
   for(const line of token.value.split(/\r?\n/)){
    const row=/^\s*\[([^|\]\r\n]+)\|[^\r\n]*\]\s*$/.exec(line);
    if(row?.[1]===parts[1])hits++;
   }
  }
 }
 return components===1&&hits===1;
}

function validateLocator(row,blocks,load){
 if(row.区块==='status'){
  if(!Array.isArray(row.定位)||row.定位.length!==3||row.定位[0]==='叙事状态')fail('ACL_TARGET');
  if(!hasPath(load('status-wire.cjs').parseStatus(blocks.status),row.定位))fail('ACL_UNRESOLVED');
 }else if(row.区块==='vars'){
  load('permission-wire.cjs').pointer(row.定位);
  const vars=blocks.vars.trim()?load('strict-json.cjs').strictJSON(blocks.vars):{};
  if(!Array.isArray(vars.operations)||!vars.operations.some(op=>object(op)&&op.path===row.定位))fail('ACL_UNRESOLVED');
 }else if(row.区块==='extra'){
  if(!Array.isArray(row.定位)||row.定位.length!==2)fail('ACL_TARGET');
  if(!extraTarget(blocks.extra,row.定位,load('xml-envelope.cjs').xmlTokens))fail('ACL_EXTRA_TARGET');
 }else fail('ACL_BLOCK');
}

export function adaptReaderModule(id,original,load){
 if(id==='xml-envelope.cjs'){
  const normalize=source=>{
   const parse=load('strict-json.cjs').strictJSON;
   return nativeStatusTail(nativeUpdateTail(nativeStatusInVars(source,original.xmlTokens,parse),original.xmlTokens,parse),original.xmlTokens);
  };
  const envelope=source=>{
   const e=original.parseDisplayEnvelope(normalize(source));
   e.blocks.vars=sourceVarsJSON(e.blocks.vars,load('strict-json.cjs').strictJSON);
   return e;
  };
  const regexEnvelope=source=>envelope(displayRecordSource(normalize(source),original.xmlTokens,load('pipes-wire.cjs').records));
  return {...original,parseDisplayEnvelope:envelope,parseRegexEnvelope:regexEnvelope,replyRegion:(source,options)=>original.replyRegion(options?.partial?source:normalize(source),options)};
 }

 if(id==='permission-wire.cjs')return {
  ...original,
  validate:(value,paths)=>original.validate(expandPermission(value),paths),
  at:(value,path)=>original.at(expandPermission(value),path),
  allows:(value,options)=>original.allows(expandPermission(value),options),
  conjunct:(a,b,options)=>original.conjunct(expandPermission(a),expandPermission(b),options)
 };
 if(id==='memory-permissions.cjs')return {
  ...original,
  validateLocator:(row,blocks)=>validateLocator(row,blocks,load),
  validateLocators(memory,blocks){
   const status=load('status-wire.cjs').parseStatus(blocks.status),
    vars=blocks.vars.trim()?load('strict-json.cjs').strictJSON(blocks.vars):{};
   for(const row of memory.权限)validateLocator(row,blocks,load);
   for(const [type,objects]of Object.entries(status))if(type!=='叙事状态')for(const [name,fields]of Object.entries(objects))for(const field of Object.keys(fields)){
    if(!memory.权限.some(row=>row.区块==='status'&&JSON.stringify(row.定位)===JSON.stringify([type,name,field])))fail('STATUS_PERMISSION_MISSING');
   }
   for(const op of vars.operations??[])if(!memory.权限.some(row=>row.区块==='vars'&&row.定位===op.path))fail('VARS_PERMISSION_MISSING');
  }
 };
 return original;
}
