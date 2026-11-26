import {clone,fail} from './common.mjs';
import {PREFERENCE_GROUPS,preferenceGroup,preferenceTextKey,validatePreferenceTexts} from './preferences.mjs';
import {compilePrompts} from './config.mjs';

export const PREFERENCE_TEXT_VERSION='tisya.preference-text/1';
export const PREFERENCE_TEXT_TABLE='T_PREF_SELECTION_OPTIONS';
export const preferenceTextFields=[
 {key:'preference_group',label:'偏好分组',type:'TEXT'},
 {key:'selection_key',label:'对应选择',type:'TEXT'},
 {key:'editor_kind',label:'编辑条目种类',type:'TEXT'},
 {key:'editor_enabled',label:'采用编辑原文',type:'BOOLEAN'},
];
export function extendPreferenceCatalog(catalog){
 const current=catalog.tables.find(t=>t.id===PREFERENCE_TEXT_TABLE);
 if(!current||preferenceTextFields.every(field=>current.fields.some(item=>item.key===field.key)))return catalog;
 const next=clone(catalog),table=next.tables.find(t=>t.id===PREFERENCE_TEXT_TABLE);
 if(table)for(const field of preferenceTextFields)if(!table.fields.some(f=>f.key===field.key))table.fields.push(clone(field));
 return next;
}
export function preferenceTextRows(state){
 const out={};
 for(const [id,row]of Object.entries(state?.tables?.[PREFERENCE_TEXT_TABLE]??{})){
  const v=row.values;if(v.option_version!==PREFERENCE_TEXT_VERSION)continue;
  const key=preferenceTextKey(v.preference_group,v.selection_key,true);
  if(Object.hasOwn(out,key))fail('PREFERENCE_TEXT_DUPLICATE','同一选择存在多条编辑原文，请在表单中核对');
  out[key]={id,group:v.preference_group,selection:v.selection_key,text:v.effect_directive,enabled:v.editor_enabled!==false,...(v.editor_kind?{kind:v.editor_kind}:{}),...(v.editor_kind==='custom'?{name:v.display_name}:{})};
 }
 for(const [id,row]of Object.entries(state?.tables?.T_PREF_SCOPES??{})){const v=row.values;out[preferenceTextKey('USER',id)]={id,group:'USER',selection:JSON.stringify(id),kind:'user',name:v.name??'',text:v.compiled_directive??'',evidence_quote:v.evidence_quote??'',enabled:v.enabled!==false&&(!!v.compiled_directive?.trim()||!!v.tag_id||['extension_pack','projection_setting'].includes(v.owner_type)),legacy:v.contrib_id!=='tisya.preference-editor/1',tag_id:v.tag_id??'',owner_type:v.owner_type??'user',scope_type:v.scope_type??'story',subject_ref:v.subject_ref??'',projection_tier:v.projection_tier??'',strength:v.strength??2,desired_frequency_weight:v.desired_frequency_weight??1,applicable_context:typeof v.applicable_context==='object'?v.applicable_context?.narrative??'':v.applicable_context??'',exceptions:typeof v.exceptions==='object'?v.exceptions?.narrative??'':v.exceptions??'',tag_config_json:v.tag_config_json??'',confirmation_state:v.confirmation_state==='用户确认候选'?'pending':'confirmed'};}
 validatePreferenceTexts(out);return out;
}
export function preferenceTextChanges(before,after){
 validatePreferenceTexts(after);const changes=[];
 for(const [key,row]of Object.entries(after)){
  if(JSON.stringify(row)===JSON.stringify(before[key]))continue;
  const group=preferenceGroup(row.group);
  if(group.id==='USER'){if(before[key]&&row.evidence_quote!==before[key].evidence_quote)fail('PREFERENCE_EVIDENCE','原始反馈不可被改写；请另建反馈条目');const tagValues=row.tag_id||before[key]?.tag_id||['extension_pack','projection_setting'].includes(row.owner_type)?{tag_id:row.tag_id??'',owner_type:row.owner_type??'user',scope_type:row.scope_type??'story',subject_ref:row.subject_ref??'',projection_tier:row.projection_tier??'',strength:row.strength??'喜爱',desired_frequency_weight:row.desired_frequency_weight??1,applicable_context:row.applicable_context?{narrative:row.applicable_context}:'',exceptions:row.exceptions?{narrative:row.exceptions}:'',tag_config_json:row.tag_config_json??'',confirmation_state:row.confirmation_state==='pending'?'用户确认候选':'用户明确'}:{};changes.push({tableId:'T_PREF_SCOPES',recordId:row.id,values:{name:row.name,compiled_directive:row.text,enabled:row.enabled,...tagValues,...(!before[key]?{evidence_quote:row.evidence_quote,contrib_id:'tisya.preference-editor/1'}:{})}});continue;}
  changes.push({tableId:PREFERENCE_TEXT_TABLE,recordId:row.id,values:{option_version:PREFERENCE_TEXT_VERSION,display_name:row.name??group.label+' · 编辑原文',effect_directive:row.text,injection_position:group.slot,preference_group:row.group,selection_key:row.selection,editor_enabled:row.enabled!==false,editor_kind:row.kind??'override'}});
 }
 for(const [key,row]of Object.entries(before))if(!Object.hasOwn(after,key))changes.push({tableId:row.group==='USER'?'T_PREF_SCOPES':PREFERENCE_TEXT_TABLE,recordId:row.id,remove:true});
 return changes;
}
export function previewPreferenceText(source,config,slots,rows,group){
 const compiled=compilePrompts(source,config,{...slots,tisya_preference_texts:JSON.stringify(rows)});
 const prompt=compiled.prompts.find(p=>p.identifier===group.slot);
 const order=compiled.prompt_order?.find(o=>o.character_id===100001)?.order??compiled.order;
 const enabled=prompt?.enabled!==false&&(!order||order.some(p=>p.identifier===group.slot&&p.enabled!==false));
 return {text:prompt?.content??'',enabled,slot:group.slot};
}
