import {copy,check} from './schema.js';
export const BUILTIN_STYLE_RULES=Object.freeze([{"id": "builtin.phrase.8", "name": "生理性", "kind": "literal", "pattern": "生理性", "flags": "", "enabled": true, "instruction": "依实际动作、感受重写整句，不只替换近义词", "source": "缇斯亚文风设置 / 明确禁词补录"}, {"id": "builtin.phrase.9", "name": "极其", "kind": "literal", "pattern": "极其", "flags": "", "enabled": true, "instruction": "用具体程度与事实表达，不只替换近义词", "source": "缇斯亚文风设置 / 明确禁词补录"}, {"id": "builtin.phrase.1", "name": "不易察觉", "kind": "literal", "pattern": "不易察觉", "flags": "", "enabled": true, "instruction": "依实际动作、感受重写整句，不只替换近义词", "source": "缇斯亚原预设 r243 / F.10"}, {"id": "builtin.phrase.2", "name": "几不可察", "kind": "literal", "pattern": "几不可察", "flags": "", "enabled": true, "instruction": "依实际动作、感受重写整句，不只替换近义词", "source": "缇斯亚原预设 r243 / F.10"}, {"id": "builtin.phrase.3", "name": "邪魅一笑", "kind": "literal", "pattern": "邪魅一笑", "flags": "", "enabled": true, "instruction": "依实际动作、感受重写整句，不只替换近义词", "source": "缇斯亚原预设 r243 / F.10"}, {"id": "builtin.phrase.4", "name": "嘴角勾起一抹", "kind": "literal", "pattern": "嘴角勾起一抹", "flags": "", "enabled": true, "instruction": "依实际动作、感受重写整句，不只替换近义词", "source": "缇斯亚原预设 r243 / F.10"}, {"id": "builtin.phrase.5", "name": "空气仿佛凝固", "kind": "literal", "pattern": "空气仿佛凝固", "flags": "", "enabled": true, "instruction": "依实际动作、感受重写整句，不只替换近义词", "source": "缇斯亚原预设 r243 / F.10"}, {"id": "builtin.phrase.6", "name": "气氛降至冰点", "kind": "literal", "pattern": "气氛降至冰点", "flags": "", "enabled": true, "instruction": "依实际动作、感受重写整句，不只替换近义词", "source": "缇斯亚原预设 r243 / F.10"}, {"id": "builtin.phrase.7", "name": "嘴上说不要身体却很诚实", "kind": "literal", "pattern": "嘴上说不要身体却很诚实", "flags": "", "enabled": true, "instruction": "依实际动作、感受重写整句，不只替换近义词", "source": "缇斯亚原预设 r243 / F.10"}, {"id": "builtin.regex.1", "name": "模糊修饰代替具体反应", "kind": "regex", "pattern": "一丝(莫名|难以言喻)?的?(情绪|情感|笑意|玩味|温柔|寒意)", "flags": "u", "enabled": true, "instruction": "模糊修饰代替具体反应", "source": "缇斯亚原预设 r243 / F.10"}, {"id": "builtin.regex.2", "name": "水体意象解释情绪", "kind": "regex", "pattern": "(心湖|心海).{0,12}(涟漪|波澜|石子)", "flags": "u", "enabled": true, "instruction": "水体意象解释情绪", "source": "缇斯亚原预设 r243 / F.10"}, {"id": "builtin.regex.3", "name": "先树无关否定再空泛定性或拔高", "kind": "regex", "pattern": "(不是|并非).{0,40}(而是|只是|更像)", "flags": "u", "enabled": true, "instruction": "先树无关否定再空泛定性或拔高", "source": "缇斯亚原预设 r243 / F.10"}, {"id": "builtin.regex.4", "name": "无过程宣布顿悟、宿命或关系升华", "kind": "regex", "pattern": "(这一刻|这一瞬间).{0,30}(终于明白|意味着|注定)", "flags": "u", "enabled": true, "instruction": "无过程宣布顿悟、宿命或关系升华", "source": "缇斯亚原预设 r243 / F.10"}, {"id": "builtin.regex.5", "name": "空泛宣示权力代替行动与关系依据", "kind": "regex", "pattern": "(不容置疑|不容拒绝|宣示主权|刻进灵魂|打上.{0,6}烙印)", "flags": "u", "enabled": true, "instruction": "空泛宣示权力代替行动与关系依据", "source": "缇斯亚原预设 r243 / F.10"}, {"id": "builtin.regex.6", "name": "尾句等待回复或抛给用户的选择题", "kind": "regex", "pattern": "^(?:(?:那么|接下来|现在)[，,：:]?\\s*)?(?:(?:[^。！？!?\\n]{0,40})?(?:等待|等着|等候)(?:用户的|你的|您的|下一轮的?|下轮的?)(?:回复|回应|回答|开口|决定)|你(?:是)?(?:选|选择)[^。！？!?]{1,80}还是[^。！？!?]{1,80}|你(?:要|会)[^。！？!?]{1,80}还是[^。！？!?]{1,80}|告诉我你的(?:答案|选择|决定)|决定权交到(?:了)?[^。！？!?]{0,8}手里|(?:你)?(?:接下来)?(?:想|要|打算)(?:怎么|如何)做)[。！？!?…]*$", "flags": "u", "enabled": true, "instruction": "只核对正文尾段末句是否把本轮写成等待用户的说明或额外逼选。具有场内目的的角色发问、必要决定与自然停顿仍可保留；命中需按语境核对，不自动删除正文，不统一成一种收尾。", "source": "缇斯亚原预设 r243 / F.10", "scope": "body-ending"}]);
export const STYLE_GUIDANCE='禁止定义式叙述、段末解释、首尾复述、预言式总结、逐句翻译潜台词、为凑字数堆砌感官和小动作。普通情绪与关系不写成医学或机械诊断。保留必要身份、数值、因果、情绪过渡、事实辨别和确有依据的专业情境。';
// Match every shipped rule field except the user's on/off value. A changed
// pattern, instruction, name, source, version or scope remains user-owned.
const LEGACY_ENDING_RULE=Object.freeze({"id": "builtin.regex.6", "name": "等待下轮的说明句收尾", "kind": "regex", "pattern": "(等待|等着|等候).{0,12}(回复|回应|回答|开口|决定)", "flags": "u", "enabled": true, "instruction": "等待下轮的说明句收尾", "source": "缇斯亚原预设 r243 / F.10"});
function currentStyleRule(row){
 if(!row||row.scope!==undefined||row.version!==undefined||!Object.entries(LEGACY_ENDING_RULE).every(([key,value])=>key==='enabled'||row[key]===value))return row;
 const current=BUILTIN_STYLE_RULES.find(item=>item.id===LEGACY_ENDING_RULE.id);
 return {...row,name:current.name,pattern:current.pattern,instruction:current.instruction,scope:current.scope};
}
export function styleRules(settings){const rows=settings.styleRules===undefined?copy(BUILTIN_STYLE_RULES):copy(settings.styleRules);check(Array.isArray(rows)&&rows.length<=300,'文风规则数量无效');const ids=new Set();for(const row of rows){check(typeof row.id==='string'&&!ids.has(row.id),'文风规则 ID 重复');ids.add(row.id);check(['literal','regex','instruction'].includes(row.kind)&&typeof row.enabled==='boolean'&&typeof row.pattern==='string'&&typeof row.name==='string','文风规则格式无效');if(row.kind==='regex')compileRule(row);}return rows.map(currentStyleRule);}
export function compileRule(row){check(row.pattern.length<=1000,'正则过长');check(/^[imsu]*$/.test(row.flags??'')&&new Set(row.flags??'').size===(row.flags??'').length,'正则标志只允许 i/m/s/u');try{return new RegExp(row.pattern,(row.flags??'')+'g');}catch{throw Error('禁词正则无效：'+row.name);}}
export function stylePrompt(rows){const enabled=rows.filter(r=>r.enabled);return enabled.length?STYLE_GUIDANCE+'\n'+enabled.map(r=>r.kind==='instruction'?r.pattern:r.kind==='literal'?'禁用词句：'+r.pattern+'；'+r.instruction:(r.scope==='body-ending'?'正文尾段末句核对候选 /':'禁用句式 /')+r.pattern+'/'+(r.flags??'')+'；'+r.instruction).join('\n'):'';}

// The caller may pass an already extracted body or the complete body envelope.
// Keep offsets in the caller's original string; other rules retain full-input
// matching. A scoped hit is review evidence, never a deletion or a send gate.
function bodyEnding(text){
 const body=/<body(?:\s[^>]*)?>([\s\S]*?)<\/body>/i.exec(text);
 const base=body?body.index+body[0].indexOf('>')+1:0;
 const content=body?body[1]:text,end=content.trimEnd().length;
 if(!end)return {text:'',offset:base};
 let paragraph=0,breaks=/\n[ \t]*\n/g,part;
 while((part=breaks.exec(content.slice(0,end))))paragraph=part.index+part[0].length;
 let terminal=end;
 while(terminal>paragraph&&/[。！？!?…"'”’」』）)]/.test(content[terminal-1]))terminal--;
 let start=paragraph;
 for(let i=paragraph;i<terminal;i++)if(/[。！？!?]/.test(content[i]))start=i+1;
 while(start<end&&/\s/.test(content[start]))start++;
 return {text:content.slice(start,end),offset:base+start};
}
export function scanStyle(text,rows){
 const hits=[];
 for(const row of rows.filter(r=>r.enabled&&r.kind!=='instruction')){
  const segment=row.scope==='body-ending'?bodyEnding(text):{text,offset:0};
  if(row.kind==='literal'){
   let at=segment.text.indexOf(row.pattern);
   while(row.pattern&&at>=0&&hits.length<200){hits.push({rule:row.id,name:row.name,text:row.pattern,offset:segment.offset+at});at=segment.text.indexOf(row.pattern,at+row.pattern.length);}
  }else{
   const re=compileRule(row);let match;
   while((match=re.exec(segment.text))&&hits.length<200){hits.push({rule:row.id,name:row.name,text:match[0],offset:segment.offset+match.index});if(!match[0])re.lastIndex++;}
  }
 }
 return hits;
}

export function routeStyleRules(entries){entries.tisya_registry=entries.tisya_registry.replace(/@F\.10 LANG_BAN \{[\s\S]*?\n\}/,'@F.10 LANG_BAN: apply enabled rules from TISYA.DATA.PREFERENCES.style and explicit user constraints;disabled rows have no effect;rewrite the whole affected sentence with factual actions/perceptions,not synonyms;retain necessary factual distinctions');return entries;}
