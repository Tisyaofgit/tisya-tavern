// One assembled constraint layer; mode workflows consume it without reprinting it.
export const PREFERENCE_ENTRY='tisya_material_rule_material';
export function preferenceFirst(order){
 const rows=order.filter(x=>x.identifier!==PREFERENCE_ENTRY),entry=order.find(x=>x.identifier===PREFERENCE_ENTRY);
 if(entry){const at=rows.findIndex(x=>x.identifier==='tisya_task_start');rows.splice(at<0?0:at,0,entry);}return rows;
}
export function assemblePreferenceLayer(compiled){
 if(compiled.taskMode)return compiled;
 const e=compiled.rest.entries;
 if(e[PREFERENCE_ENTRY]?.includes('[USER.PREFERENCES]'))return compiled;
 const constraints=[],inner='tisya_inner_chain';
 // Move exact selected wording only. Stage results, evidence checks and output
 // serializers remain owned by the mode; disabled options are never injected.
 const rules=[...Object.entries(compiled.stepwiseRules??{}).filter(([id,value])=>/^(A0[1-6]|B0[1-6]|C0[1-689]|C10|D0[2-5])$/.test(id)&&value),...Object.entries(compiled.resolvedPreferences??{}),...Object.entries(compiled.extensionRules??{}).filter(([,value])=>value)];
 for(const [id,value]of rules){
  const parts=id==='C02'?value.split(/(?=场外的缇斯亚)/):[value];
  for(const [i,part]of parts.entries()){
   const owners=Object.keys(e).filter(key=>key!==PREFERENCE_ENTRY&&e[key]?.includes(part));
   if(!owners.length)continue;
   const ref='@PREF.'+id+(parts.length>1?'.'+(i+1):'');constraints.push(ref+' '+part);
   for(const key of owners)e[key]=e[key].replaceAll(part,ref+' ');
  }
 }
 // The prohibition catalogue is configuration, not a thinking step.
 e.tisya_registry=e.tisya_registry?.replace(/^@F\.(?:08|09|10|11) [\s\S]*?(?=^@(?:M|F)\.\d{2} |^\[\/REGISTRY\])/gm,rule=>{constraints.push(rule.trim());return '';});
 if(constraints.length)e[PREFERENCE_ENTRY]='[USER.PREFERENCES]\n已选配置与必须执行的约束；先于输入预处理生效。作用域以本轮已核对配置及 TISYA.DATA.PREFERENCES 为准，候选偏好不生效。配置不授予事实、人物知识或写入权限；遇到无法兼容的明确要求保留冲突，不自行扩大授权。\n'+constraints.join('\n')+'\n[/USER.PREFERENCES]';
 if(e[inner])e[inner]=e[inner].replace('[INNER]','[INNER]\n@GUIDE consume the already resolved preference layer; inspect relevant evidence and missing facts, distinguish actors’ knowledge and goals, consider plausible alternatives within time/resources/authorization, anchor each adopted consequence to its cause. Expand only relevant dimensions; uncertainty and unexecuted alternatives remain unresolved. Keep reasoning private.');
 return compiled;
}
