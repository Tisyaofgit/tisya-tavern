import {clone,fail} from './common.mjs';
import {PREFERENCE_GROUPS,preferenceGroup,preferenceTextKey,validatePreferenceTexts,validatePreferences,effectivePreferences,selectedPreferenceText} from './preferences.mjs';
export const PREFERENCE_PACKAGE_FORMAT='tisya.preferences/1';
const allowed=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(k=>keys.includes(k));
const parameters=['main_language','min_length','max_length','history_messages'];
export function validatePreferencePackage(value){
 if(!allowed(value,['format','entries'])||value.format!==PREFERENCE_PACKAGE_FORMAT||!Array.isArray(value.entries)||!value.entries.length||value.entries.length>1000)fail('PREFERENCE_PACKAGE','偏好包格式或版本无效');
 const seen=new Set();for(const entry of value.entries){
  if(!allowed(entry,['record','scope','parameters','source'])||!['story','global'].includes(entry.scope)||typeof entry.source!=='string'||!allowed(entry.parameters,parameters)||!allowed(entry.record,['id','group','selection','text','enabled','kind','name','evidence_quote']))fail('PREFERENCE_PACKAGE_FIELDS','偏好包包含未支持的字段');
  const r=entry.record,key=preferenceTextKey(r.group,r.selection,true);validatePreferenceTexts({[key]:r});validatePreferences({parameters:entry.parameters});
  if(seen.has(entry.scope+':'+key))fail('PREFERENCE_PACKAGE_DUPLICATE','偏好包包含重复条目');seen.add(entry.scope+':'+key);
 }
 return clone(value);
}
export function packageEntries(source,config,rows,scope='story'){
 const view=scope==='global'?{...config,story:{...config.story,play:{}}}:config,value=effectivePreferences(view),records=scope==='global'?config.playDefaults?.textOverrides??{}:{...config.playDefaults?.textOverrides,...rows},result=new Map();
 const params=Object.fromEntries(parameters.filter(k=>value.parameters[k]!=null).map(k=>[k,value.parameters[k]]));
 for(const group of PREFERENCE_GROUPS){if(['W','N01'].includes(group.id))continue;const selection=value.choices[group.id]??null,key=preferenceTextKey(group.id,selection),record=records[key];
  const text=record?.enabled!==false&&record?record.text:selectedPreferenceText(source,view,group,scope==='story'?rows:{});
  if(!text.trim())continue;
  result.set(key,{record:record?clone(record):{id:'builtin:'+key,group:group.id,selection:JSON.stringify(selection),text,enabled:true,kind:'override'},scope,parameters:clone(params),source:record?'用户编辑原文':'当前预设／内置原文'});
 }
 for(const [key,record]of Object.entries(records))if(!result.has(key))result.set(key,{record:clone(record),scope,parameters:clone(params),source:'用户保存条目'});
 return [...result.values()].map(entry=>({...entry,record:Object.fromEntries(Object.entries(entry.record).filter(([key])=>['id','group','selection','text','enabled','kind','name','evidence_quote'].includes(key)))}));
}
export function makePreferencePackage(entries){return validatePreferencePackage({format:PREFERENCE_PACKAGE_FORMAT,entries:clone(entries)});}
export function planPreferenceImport(value,existing){
 const pack=validatePreferencePackage(value);return pack.entries.map(entry=>{const key=preferenceTextKey(entry.record.group,entry.record.selection,true);return {entry,key,conflict:Object.hasOwn(existing,key),action:Object.hasOwn(existing,key)?'keep':'add'};});
}
export function applyPreferenceImport(plans,target){
 const next=clone(target);for(const {entry,action}of plans){
  validatePreferencePackage({format:PREFERENCE_PACKAGE_FORMAT,entries:[entry]});if(action==='keep')continue;
  if(!['add','overwrite','duplicate'].includes(action))fail('PREFERENCE_IMPORT_ACTION','请选择导入冲突处理方式');
  let r=clone(entry.record),key=preferenceTextKey(r.group,r.selection,true);
  if(action==='duplicate'){const group=preferenceGroup(r.group),id=crypto.randomUUID();r={...r,id,kind:r.group==='USER'?'user':'custom',name:(r.name??group.label)+'副本',selection:JSON.stringify(r.group==='USER'?id:group.multiple?['custom:'+id]:'custom:'+id)};key=preferenceTextKey(r.group,r.selection,true);}
  else if(action==='add'&&Object.hasOwn(next,key))fail('PREFERENCE_IMPORT_CONFLICT','导入期间出现同名条目，请重新预览');
  else if(next[key]){r.id=next[key].id;if(r.group==='USER'){if(r.evidence_quote!==next[key].evidence_quote)fail('PREFERENCE_EVIDENCE','反馈原话不同，请选择另存新项');r.legacy=next[key].legacy;}}
  // Download/import is registration only. Adoption is a separate user action.
  next[key]={...r,enabled:false};
 }
 validatePreferenceTexts(next);return next;
}
