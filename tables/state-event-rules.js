import {compileStateFormulas} from './state-formulas.js';
const check=(ok,message)=>{if(!ok)throw Error(message);};
export function parseStateEvents(text=''){
 check(typeof text==='string'&&text.length<=32000,'事件登记文本无效');
 const rules=text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean).map(source=>{
  const parts=source.split(/[｜|]/).map(x=>x.trim());check(parts.length===3&&parts.every(Boolean),'事件须写 事件名｜运行公式｜触发后文本');
  const [name,action,narrative]=parts;check(name.length<=80&&action.length<=80&&narrative.length<=2000,'事件名称或文本过长');return {name,action,narrative,source};
 });check(rules.length<=64&&new Set(rules.map(r=>r.name)).size===rules.length,'事件名称重复或超过64项');return rules;
}
export function validateStateEvents(catalog){
 const rules=parseStateEvents(catalog.events??'');if(!rules.length)return true;
 const {actions,vocabulary}=compileStateFormulas(catalog);
 for(const rule of rules){check(actions.some(a=>a.name===rule.action&&!a.automatic),'事件引用的运行公式不存在：'+rule.action);check(vocabulary.fields.some(f=>f.aliases?.includes('已触发事件“'+rule.name+'”')),'事件触发标记未登记');}
 const flagKeys=new Set(vocabulary.fields.filter(f=>f.aliases?.some(a=>a.startsWith('已触发事件“'))).map(f=>f.key));
 check(actions.every(a=>a.effects.every(e=>!flagKeys.has(e.target.key))),'事件标记由事件结算保存，运行公式不能改写');return true;
}
