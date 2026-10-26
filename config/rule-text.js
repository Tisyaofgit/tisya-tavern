import {NARRATIVE as N} from '../settings-core.js';

// User-authored wording is data, separate from the selected option and the
// machine output grammar. The mode is projected from the global configuration
// authority by config/core; opening an editor never materializes defaults.
export const NARRATIVE_RULE_FIELD='叙事指令';
const IDS=new Set(['A01','A02','A03','A04','A05','A06','B01','B02','B03','B04','B05','B06','C02','C03','C04','C05','C09','C10','D01','D02','D03','D04']);
const rows=N.rows.filter(row=>IDS.has(row.id));
const byId=new Map(rows.map(row=>[row.id,row]));
const own=(value,key)=>Object.hasOwn(value,key);
const defaultWording={
 B02:{'多人物轮换':'按完整段落切换人物视角，用动作、称谓和环境承接，让读者自然辨明人物与地点。各段主体稳定，不在句内跳转认知；除非用户明确要求，不另起姓名或场景标签。'},
 B04:{'分段多人物内心':'不同人物的内心分别成段，用自然叙述交代主体并承接现场，内容限定于该人物所知；插段结束自然接回主镜头。玩家内心遵守独立授权。除非用户明确要求，不另起【姓名】或心理描写标签。'},
 B05:{'场景切换时':'只在场景切换处交代相关旁线，用人物行动和环境变化自然交代时地及主线关联，再接回主镜头。角色所知保持隔离，公开内容服从秘密边界；除非用户明确要求，不另起场景标签。','独立分段穿插':'相关旁线以独立自然段穿插，用人物行动和环境变化交代时地及主线关联，按自身因果发展，再自然接回主镜头。角色所知保持隔离；除非用户明确要求，不另起人物或场景标签。'},
};
function record(value,label){
 if(!value||typeof value!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw Error(label+'格式无效，原设置保留');
 for(const key of Reflect.ownKeys(value)){const descriptor=Object.getOwnPropertyDescriptor(value,key);if(typeof key!=='string'||!descriptor?.enumerable||!own(descriptor,'value')||['__proto__','prototype','constructor'].includes(key))throw Error(label+'含不支持的字段，原设置保留');}
 return value;
}
function selectedRow(id,choice){
 const row=byId.get(id);if(!row||!row.allowed.includes(choice)||choice==='指定 NPC'||typeof row.rules?.[choice]!=='string')throw Error('没有可编辑的叙事提示词：'+id);
 return row;
}
export function narrativeRuleDefault(id,choice){const row=selectedRow(id,choice);return defaultWording[id]?.[choice]??row.rules[choice];}
export function validateNarrativeRules(value){
 if(value===undefined)return;
 record(value,'叙事提示词');
 for(const [id,options]of Object.entries(value)){
  if(!byId.has(id))throw Error('未知的叙事提示词字段：'+id);
  record(options,'叙事提示词选项');
  for(const [choice,text]of Object.entries(options)){selectedRow(id,choice);if(typeof text!=='string')throw Error('叙事提示词正文必须是文本：'+id);}
 }
}
export function narrativeRuleRows(mode){
 const overrides=mode?.[NARRATIVE_RULE_FIELD];validateNarrativeRules(overrides);
 return rows.flatMap(row=>{const choice=mode?.narrative?.[row.variable];if(!row.allowed.includes(choice)||choice==='指定 NPC')return [];
  const custom=own(overrides?.[row.id]??{},choice),defaultText=narrativeRuleDefault(row.id,choice);
  return [{id:row.id,label:row.label,choice,defaultText,text:custom?overrides[row.id][choice]:defaultText,custom}];});
}
export function setNarrativeRule(mode,id,choice,text){
 selectedRow(id,choice);if(typeof text!=='string')throw Error('叙事提示词正文必须是文本');validateNarrativeRules(mode[NARRATIVE_RULE_FIELD]);
 mode[NARRATIVE_RULE_FIELD]={...(mode[NARRATIVE_RULE_FIELD]??{}),[id]:{...(mode[NARRATIVE_RULE_FIELD]?.[id]??{}),[choice]:text}};
}
export function resetNarrativeRule(mode,id,choice){
 selectedRow(id,choice);validateNarrativeRules(mode[NARRATIVE_RULE_FIELD]);if(!mode[NARRATIVE_RULE_FIELD])return;
 const next=structuredClone(mode[NARRATIVE_RULE_FIELD]);if(next[id]){delete next[id][choice];if(!Object.keys(next[id]).length)delete next[id];}
 if(Object.keys(next).length)mode[NARRATIVE_RULE_FIELD]=next;else delete mode[NARRATIVE_RULE_FIELD];
}
export function applyNarrativeRules(compiled,mode){
 validateNarrativeRules(mode?.[NARRATIVE_RULE_FIELD]);if(!compiled.prose)return compiled;
 const r=compiled.stepwiseRules;
 for(const entry of narrativeRuleRows(mode)){
  if(!entry.custom&&!own(defaultWording[entry.id]??{},entry.choice))continue;
  const before=r[entry.id];r[entry.id]=entry.text;
  // These read-only projections are not another authority. The delivery
  // compiler consumes stepwiseRules; keep diagnostic text in step as well.
  if(before)for(const key of Object.keys(compiled.text??{}))if(typeof compiled.text[key]==='string')compiled.text[key]=compiled.text[key].replaceAll(before,entry.text);
 }
 if(compiled.text)compiled.text.camera=['B01','B02','B03','B04','B05','B06'].map(id=>r[id]??'').join('');
 return compiled;
}
