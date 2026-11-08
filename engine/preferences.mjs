import catalog from './preference-options.json' with {type:'json'};
import {clone,fail} from './common.mjs';
import {storyAvatar,avatarReference} from './identity.mjs';

export const PREFERENCE_GROUPS=catalog.groups;
export const effectivePreferences=config=>({
 choices:{...(config.playDefaults?.choices??{}),...(config.story?.play?.choices??{})},
 parameters:{...(config.playDefaults?.parameters??{}),...(config.story?.play?.parameters??{})},
});
export function validatePreferences(value={}){
 for(const [id,selection] of Object.entries(value.choices??{})){
  const group=PREFERENCE_GROUPS.find(g=>g.id===id);
  if(!group)fail('PREFERENCE_GROUP','配置分组不存在：'+id);
  if(selection===null)continue;
  if(group.multiple?!Array.isArray(selection):typeof selection!=='string')fail('PREFERENCE_SELECTION','配置选择类型不符：'+id);
  for(const key of group.multiple?selection:[selection])if(!group.options.some(o=>o.id===key))fail('PREFERENCE_OPTION','配置选项不存在：'+key);
 }
 const p=value.parameters??{};
 if(p.history_messages!=null&&(!Number.isSafeInteger(p.history_messages)||p.history_messages<0))fail('HISTORY_COUNT','历史聊天条数须为非负整数');
 if(p.min_length!=null||p.max_length!=null){const min=p.min_length??2000,max=p.max_length??5000;if(!Number.isSafeInteger(min)||!Number.isSafeInteger(max)||min<0||max<min)fail('PREFERENCE_LENGTH','篇幅范围无效');}
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
function effects(group,selection,config,parameters){
 const ids=group.multiple?selection:[selection];
 return ids.map(id=>group.options.find(o=>o.id===id).effect).map(text=>text
  .replaceAll('{{main_language}}',parameters.main_language||'中文')
  .replaceAll('{{active_avatar_dossier_id}}',avatarReference(storyAvatar(config).binding)||parameters.active_avatar_dossier_id||config.story?.userName||'user')
  .replaceAll('{{user_custom_wish_raw_text}}',config.story?.wish??'')
  .replaceAll('personaDescription','tisya_user_identity'));
}
export function wishPreferences(config){
 const value=validatePreferences(effectivePreferences(config)),selection=value.choices.W;
 const base=PREFERENCE_GROUPS.find(g=>g.id==='W').base_effect;
 if(selection==null)return config.story?.wish?[base,config.story.wish].join('\n'):'';
 const result=effects(PREFERENCE_GROUPS.find(g=>g.id==='W'),selection,config,value.parameters);
 if(!selection.includes('W07')&&config.story?.wish)result.push(config.story.wish);
 return result.length?[base,...result].join('\n'):'';
}
export function applyPreferences(entries,config){
 const value=validatePreferences(effectivePreferences(config));
 const avatar=storyAvatar(config);
 if(avatar.choice==='N01-B'&&!avatar.binding)fail('USER_BINDING_REQUIRED','请在“用户身份”选择全局基点书的【角色】档案');
 if(avatar.managed)value.choices.N01=avatar.choice;
 for(const group of PREFERENCE_GROUPS){
  const selection=value.choices[group.id];if(selection==null||group.id==='W')continue;
  const row=entries.find(p=>p.identifier===group.slot);if(!row)fail('PREFERENCE_SLOT','配置所属提示词槽不存在：'+group.slot);
  const selected=effects(group,selection,config,value.parameters),keys=new Set(group.options.map(o=>keyOf(o.effect)));
  if(group.id==='S04-Sculpt')keys.add('ART.SCULPT');
  for(const key of keys)row.content=replaceDirective(row.content,key,'');
  const closing=group.id==='TECH'?'</TechniqueCorpus>':group.id==='CORP'?'</ScenarioPersonaCorpus>':['LIT','MOTIF'].includes(group.id)?'</LiteraryPlayCorpus>':undefined;
  for(const effect of selected)row.content=replaceDirective(row.content,keyOf(effect),effect,closing);
 }
 const parameters=value.parameters;
 if(parameters.main_language&&!value.choices.N11){const row=entries.find(p=>p.identifier==='tisya_pref_narrative');row.content=replaceDirective(row.content,'LANG.GATE','@LANG.GATE := 全文主语言：'+parameters.main_language+'；符合当前世界与人物设定的外语对白随句给出主语言译注。');}
 return clone(parameters);
}
