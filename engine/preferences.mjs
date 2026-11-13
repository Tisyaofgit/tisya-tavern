import catalog from './preference-options.json' with {type:'json'};
import {clone,fail} from './common.mjs';
import {storyAvatar,avatarReference} from './identity.mjs';
import {validatePreferenceSource} from './preference-sources.mjs';

export const PREFERENCE_GROUPS=catalog.groups;
export const USER_PREFERENCE_GROUP={id:'USER',label:'用户偏好',section:'用户偏好',slot:'tisya_contractor_wish',multiple:false,options:[]};
export const preferenceGroup=id=>id==='USER'?USER_PREFERENCE_GROUP:PREFERENCE_GROUPS.find(g=>g.id===id);
export const effectivePreferences=config=>({
 choices:{...(config.playDefaults?.choices??{}),...(config.story?.play?.choices??{})},
 parameters:{...(config.playDefaults?.parameters??{}),...(config.story?.play?.parameters??{})},
});
export function validatePreferences(value={}){
 validatePreferenceTexts(value.textOverrides??{});
 if(Object.values(value.textOverrides??{}).some(row=>row.source||Object.hasOwn(row,'_sourceGateState')))fail('PREFERENCE_SOURCE_SCOPE','世界书来源引用属于当前故事；跨故事请导出原文副本后明确采用');
 for(const [id,selection] of Object.entries(value.choices??{})){
  const group=PREFERENCE_GROUPS.find(g=>g.id===id);
  if(!group)fail('PREFERENCE_GROUP','配置分组不存在：'+id);
  if(selection===null)continue;
  if(group.multiple?!Array.isArray(selection):typeof selection!=='string')fail('PREFERENCE_SELECTION','配置选择类型不符：'+id);
  for(const key of group.multiple?selection:[selection])if(!group.options.some(o=>o.id===key)&&!/^custom:[a-zA-Z0-9_-]+$/.test(key))fail('PREFERENCE_OPTION','配置选项不存在：'+key);
 }
 const p=value.parameters??{};
 if(p.history_messages!=null&&(!Number.isSafeInteger(p.history_messages)||p.history_messages<0))fail('HISTORY_COUNT','历史聊天条数须为非负整数');
 if(p.min_length!=null||p.max_length!=null){const min=p.min_length,max=p.max_length;if([min,max].some(v=>v!=null&&(!Number.isSafeInteger(v)||v<0))||min!=null&&max!=null&&max<min)fail('PREFERENCE_LENGTH','篇幅范围无效');}
 return value;
}
const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const keyOf=effect=>/^@([^\s:={]+)\s*(?::=|::|=)/u.exec(effect)?.[1];
export function replaceDirective(text,key,effect,closing){
 const re=new RegExp('^@'+escape(key)+'\\s*(?::=|::|=)[\\s\\S]*?(?=^@[^\\s:={]+\\s*(?::=|::|=)|^</|^\\[/|(?![\\s\\S]))','mu');
 if(re.test(text))return text.replace(re,()=>effect?effect+'\n':'');
 if(!effect)return text;
 const at=closing?text.indexOf(closing):-1;
 if(at>=0)return text.slice(0,at)+effect+'\n'+text.slice(at);
 const end=/^<\/[^>]+>|^\[\/[^\]]+\]/m.exec(text);
 return end?text.slice(0,end.index)+effect+'\n'+text.slice(end.index):text+'\n'+effect;
}
export function expandPreferenceText(text,config,parameters){return text
  .replaceAll('{{main_language}}',parameters.main_language||'中文')
  .replaceAll('{{active_avatar_dossier_id}}',avatarReference(storyAvatar(config).binding)||parameters.active_avatar_dossier_id||config.story?.userName||'user')
  .replaceAll('{{user_custom_wish_raw_text}}',config.story?.wish??'')
  .replaceAll('personaDescription','tisya_user_identity');}
function effects(group,selection,config,parameters,textRows={}){
 const ids=group.multiple?selection:[selection];
 return ids.map(id=>{const builtin=group.options.find(o=>o.id===id);if(builtin)return expandPreferenceText(builtin.effect,config,parameters);const key=preferenceTextKey(group.id,group.multiple?[id]:id),custom=textRows[key]??config.playDefaults?.textOverrides?.[key];if(custom?.kind!=='custom'||custom.enabled===false)fail('PREFERENCE_CUSTOM_MISSING','自定义选项不存在或已停用：'+id);if(custom._sourceGateState==='pending')fail('PREFERENCE_CONDITION_MISSING','文风条件尚未完成本轮扫描');if(['not_matched','unknown'].includes(custom._sourceGateState))return null;return '@TISYA.CUSTOM.'+custom.id+' :=\n'+expandPreferenceText(custom.text,config,parameters);}).filter(value=>value!==null);
}
export function wishPreferences(config){
 const value=validatePreferences(effectivePreferences(config)),selection=value.choices.W;
 const base=PREFERENCE_GROUPS.find(g=>g.id==='W').base_effect;
 if(selection==null)return config.story?.wish?[base,config.story.wish].join('\n'):'';
 const result=effects(PREFERENCE_GROUPS.find(g=>g.id==='W'),selection,config,value.parameters);
 if(!selection.includes('W07')&&config.story?.wish)result.push(config.story.wish);
 return result.length?[base,...result].join('\n'):'';
}
export function applyPreferences(entries,config,textRows={}){
 validatePreferenceTexts(textRows);
 const value=validatePreferences(effectivePreferences(config));
 const avatar=storyAvatar(config);
 if(avatar.choice==='N01-B'&&!avatar.binding)fail('USER_BINDING_REQUIRED','请在“用户身份”选择基点书的【角色】档案');
 if(avatar.managed)value.choices.N01=avatar.choice;
 for(const group of PREFERENCE_GROUPS){
  const selection=value.choices[group.id];if(selection==null||group.id==='W')continue;
  const row=entries.find(p=>p.identifier===group.slot);if(!row)fail('PREFERENCE_SLOT','配置所属提示词槽不存在：'+group.slot);
  const selected=effects(group,selection,config,value.parameters,textRows),keys=new Set(group.options.map(o=>keyOf(o.effect)));
  if(group.id==='S04-Sculpt')keys.add('ART.SCULPT');
  for(const key of keys)row.content=replaceDirective(row.content,key,'');
  const closing=group.id==='TECH'?'</TechniqueCorpus>':group.id==='CORP'?'</ScenarioPersonaCorpus>':['LIT','MOTIF'].includes(group.id)?'</LiteraryPlayCorpus>':undefined;
  for(const effect of selected)row.content=replaceDirective(row.content,keyOf(effect),effect,closing);
 }
 for(const group of PREFERENCE_GROUPS){
  if(['W','N01'].includes(group.id))continue;
  const key=preferenceTextKey(group.id,value.choices[group.id]),override=textRows[key]??config.playDefaults?.textOverrides?.[key];
  if(!override||override.enabled===false||override.kind==='custom')continue;
  const row=entries.find(p=>p.identifier===group.slot);if(!row)fail('PREFERENCE_SLOT','配置所属提示词槽不存在：'+group.slot);
  const selection=value.choices[group.id];
  for(const id of Array.isArray(selection)?selection:[selection])if(typeof id==='string'&&id.startsWith('custom:'))row.content=replaceDirective(row.content,'TISYA.CUSTOM.'+id.slice(7),'');
  for(const key of new Set(group.options.map(o=>keyOf(o.effect))))row.content=replaceDirective(row.content,key,'');
  if(group.id==='S04-Sculpt')row.content=replaceDirective(row.content,'ART.SCULPT','');
  const closing=group.id==='TECH'?'</TechniqueCorpus>':group.id==='CORP'?'</ScenarioPersonaCorpus>':['LIT','MOTIF'].includes(group.id)?'</LiteraryPlayCorpus>':undefined;
  row.content=replaceDirective(row.content,'TISYA.PREFERENCE.'+group.id,'@TISYA.PREFERENCE.'+group.id+' :=\n'+expandPreferenceText(override.text,config,value.parameters),closing);
 }
 const parameters=value.parameters;
 if(parameters.main_language&&!value.choices.N11){const row=entries.find(p=>p.identifier==='tisya_pref_narrative');row.content=replaceDirective(row.content,'LANG.GATE','@LANG.GATE := 全文主语言：'+parameters.main_language+'；符合当前世界与人物设定的外语对白随句给出主语言译注。');}
 return clone(parameters);
}

// Editable prose has one owner per scope. Story records live in the formal
// selection table; cross-story defaults remain in the existing config owner.
export function preferenceTextKey(group,selection,encoded=false){return group+':'+(encoded?selection:JSON.stringify(selection??null));}
export function validatePreferenceTexts(rows={}){
 if(!rows||typeof rows!=='object'||Array.isArray(rows))fail('PREFERENCE_TEXT','编辑原文须为记录集合');
 const identities=new Set(),sourceRoutes=new Set();
 for(const [key,row]of Object.entries(rows)){
  const group=!['W','N01'].includes(row?.group)?preferenceGroup(row?.group):null;
  if(!group||typeof row.id!=='string'||!row.id||typeof row.text!=='string'||typeof row.selection!=='string'||typeof row.enabled!=='boolean'||key!==preferenceTextKey(row.group,row.selection,true))fail('PREFERENCE_TEXT','编辑原文记录无效');
  const identity=(group.id==='USER'?'user:':'selection:')+row.id;
  if(identities.has(identity))fail('PREFERENCE_IDENTITY_CONFLICT','偏好条目身份冲突；请保留本地或另存新项');
  identities.add(identity);
  if(row.source){validatePreferenceSource(row.source);if(sourceRoutes.has(row.source.routeId))fail('PREFERENCE_SOURCE','不同偏好条目不能覆盖同一来源路由');sourceRoutes.add(row.source.routeId);if(row.kind!=='custom'||!['文风与凝视','技法与场合'].includes(group.section))fail('PREFERENCE_SOURCE','来源只能绑定文风或技法自定义项');}
  let selection;try{selection=JSON.parse(row.selection);}catch{fail('PREFERENCE_TEXT','原文对应选择无效');}
  if(group.id==='USER'){if(row.kind!=='user'||selection!==row.id||typeof row.name!=='string'||typeof row.evidence_quote!=='string')fail('USER_PREFERENCE','用户偏好字段无效');}
  else validatePreferences({choices:{[group.id]:selection}});
  if(row.kind!=null&&!['custom','override','user'].includes(row.kind))fail('PREFERENCE_TEXT_KIND','偏好条目种类无效');
  if(row.kind==='custom'&&(typeof row.name!=='string'||!row.name.trim()||JSON.stringify(selection)!==JSON.stringify(group.multiple?['custom:'+row.id]:'custom:'+row.id)))fail('PREFERENCE_CUSTOM','自定义选项名称或身份无效');
  if(row.kind==='user'&&row.enabled&&!row.name.trim())fail('USER_PREFERENCE_NAME','用户偏好名称不能为空');
  if(row.enabled&&!row.text.trim())fail('PREFERENCE_TEXT_EMPTY','编辑原文不能为空；停用请使用分组选项');
 }
 return rows;
}
export function groupOriginalText(source,config,group){
 const raw=config.prompts?.[group.slot]??source?.prompts?.find(p=>p.identifier===group.slot)?.content;
 if(typeof raw!=='string')fail('PREFERENCE_SOURCE','当前预设原文尚未读取');
 const keys=new Set(group.options.map(o=>keyOf(o.effect)));if(group.id==='S04-Sculpt')keys.add('ART.SCULPT');
 const blocks=[...raw.matchAll(/^@([^\s:={]+)\s*(?::=|::|=)[\s\S]*?(?=^@[^\s:={]+\s*(?::=|::|=)|^<\/|^\[\/|(?![\s\S]))/gmu)];
 return blocks.filter(m=>keys.has(m[1])).map(m=>m[0].trimEnd()).join('\n');
}
export function selectedPreferenceText(source,config,group,textRows={}){
 const value=effectivePreferences(config),selected=value.choices[group.id];
 return selected==null?groupOriginalText(source,config,group):effects(group,selected,config,value.parameters,textRows).join('\n');
}

export function preferenceOptions(group,config,rows={}){
 const custom=Object.values({...config.playDefaults?.textOverrides,...rows}).filter(r=>r.group===group.id&&r.kind==='custom'&&r.enabled!==false).map(r=>({id:'custom:'+r.id,label:r.name,effect:r.text,custom:true}));
 return [...group.options,...custom];
}

export function userPreferenceMaterial(config,rows={}){
 return Object.values({...config.playDefaults?.textOverrides,...rows}).filter(r=>r.group==='USER'&&r.enabled&&r.legacy!==true).map(r=>'用户偏好：'+r.name+'\n'+expandPreferenceText(r.text,config,effectivePreferences(config).parameters)).join('\n\n');
}

export function preferenceWishSlot(config,slots={}){
 const rows=slots.tisya_preference_texts?JSON.parse(slots.tisya_preference_texts):{},text=userPreferenceMaterial(config,rows);
 return [slots.tisya_contractor_wish,text?'[USER.PREFERENCES]\n'+text+'\n[/USER.PREFERENCES]':''].filter(Boolean).join('\n');
}
