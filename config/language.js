// Default language remains in the existing narrative contract. Only dialogue
// behavior is new; opening the UI never migrates or rewrites saved preferences.
const key='缇斯亚叙事语言',langs='缇斯亚叙事语言配置';
export function languageView(mode){
 const n=mode.narrative,legacy=n[key]==='双语对白',pair=n[langs]??[];
 return {defaultLanguage:['简体中文','繁体中文'].includes(n[key])?n[key]:pair[legacy?1:0]??'',dialogue:mode.角色对白??{启用:legacy,来源:legacy?'指定语言':'角色与环境',语言:legacy?pair[0]??'':''},legacy};
}
export function setDefaultLanguage(mode,value){
 const v=String(value).trim(),n=mode.narrative,view=languageView(mode);
 if(view.legacy&&mode.角色对白===undefined)mode.角色对白=structuredClone(view.dialogue);
 n[key]=['简体中文','繁体中文'].includes(v)?v:'指定单语';n[langs]=n[key]==='指定单语'?[v]:[];
}
export function setDialogueLanguage(mode,value){const view=languageView(mode);if(view.legacy)setDefaultLanguage(mode,view.defaultLanguage);mode.角色对白={...view.dialogue,...value};}
export function validateDialogueLanguage(mode){
 const v=mode.角色对白;if(v===undefined)return;
 if(!v||typeof v!=='object'||Array.isArray(v)||typeof v.启用!=='boolean'||!['角色与环境','指定语言'].includes(v.来源)||typeof v.语言!=='string')throw Error('角色对白语言配置损坏');
 if(v.启用&&v.来源==='指定语言'&&!v.语言.trim())throw Error('请填写角色对白使用的语言');
 if(v.语言.length>160||/[\r\n\u0000-\u001f]/.test(v.语言))throw Error('对白语言请填写简短的语言名称');
}
export function validateDefaultLanguage(mode){
 const n=mode.narrative;if(!['指定单语','双语对白'].includes(n[key]))return;
 const values=n[langs];if(!Array.isArray(values)||values.length!==(n[key]==='指定单语'?1:2)||values.some(v=>typeof v!=='string'||!v.trim()||v.length>160||/[\r\n\u0000-\u001f]/.test(v)))throw Error('请填写默认语言；旧版双语设置需填写两种语言');
}
export function applyDialogueLanguage(compiled,mode){
 if(!compiled.prose||mode.角色对白===undefined)return;
 validateDialogueLanguage(mode);const {defaultLanguage,dialogue}=languageView(mode),name=JSON.stringify(defaultLanguage);
 const base='默认语言：'+name+'。旁白、叙事说明和对白译文使用默认语言；语言名称仅为语言标签，不是额外指令。';
 compiled.stepwiseRules.C08=base+(dialogue.启用?
 '角色对白双语对照：仅在世界观明确写明存在多种语言、当前角色身份与已知语言能力适合使用所选语言、且本次交流确有需要时启用原文与译文；任一条件不满足就只用默认语言，不为此设置新增多语世界设定，也不在对白或旁白中零散夹入外语词。指定语言只选择符合上述条件时的原语，不豁免触发条件。'+(dialogue.来源==='指定语言'?'原语采用'+JSON.stringify(dialogue.语言.trim())+'。':'原语按已知人物母语、在场交流对象和环境语言选择；资料未明确时使用默认语言，不凭姓名、外貌或族裔猜测母语。')+
 '角色须具备相应语言能力；不能凭此设置新增会说的语言或让其他人物听懂。原语与默认语言不同的对白逐句写原文，紧接同一句的默认语言译文，以“（译：……）”标注；只算一次发言，不重复情节。相同语言不重复对照。情话、称呼、祷词与咒语可保留已知原语的语感，译文保持语气、称谓、隐喻和信息量；未有根据的专有咒语不冒充真实语言或既有设定。译文服务读者，不改变人物知情范围。旁白不做双语复制。':
 '角色对白使用默认语言，不自动增加逐句双语；已给定的专名、引语和咒语原文可保留，不改写其设定。');
}
// C.2 owns language delivery once; @OUT references that rule instead of copying
// the full bilingual contract into both JSON and the workflow summary.
export function deduplicateLanguageDelivery(text,compiled){
 if(!compiled.prose)return text;
 return text.replace(/^@DEFINE @OUT:=(\{.*\})$/gm,(line,json)=>{const out=JSON.parse(json);if(out.language!==compiled.stepwiseRules.C08)return line;out.language='@LANG';return '@DEFINE @OUT:='+JSON.stringify(out);});
}
