'use strict';
const {NARRATIVE:N}=require('./narrative.cjs');
const {HEART_RULES}=require('./output-contract.cjs');
function corpus(c,context){if(c.rest)return Object.entries(c.rest.entries).filter(([id])=>!context?.activeEntries||context.activeEntries.includes(id)).map(([,text])=>text).filter(Boolean).join('\n');const enabled=id=>!context?.activeEntries||context.activeEntries.includes(id);return [enabled('tisya_narrative_protocol')&&c.stepwise.protocol,enabled('tisya_character_thinking')&&c.stepwise.character,c.prose?(c.outputEnabled&&enabled('tisya_output')?c.outputXML:enabled('tisya_narrative_close')&&!c.outputEnabled?c.plainOutput:''):enabled('tisya_narrative_close')&&c.utility].filter(Boolean).join('\n');}
function difference(a,b){let x=0,z=0;while(x<a.length&&x<b.length&&a[x]===b[x])x++;while(z<a.length-x&&z<b.length-x&&a[a.length-1-z]===b[b.length-1-z])z++;return a.slice(x,a.length-z);}
function createInjectionPreview(settings,output,context){
 if(context?.presetState&&context.presetState!=='match')return {get:()=>({text:'',note:'当前聊天未使用可核验的配套预设，此项原文暂不可确认。'})};
 let c;try{c=N.previewSettings(settings,output,context);}catch(e){return {get:()=>({text:'',note:'组合尚未通过校验：'+N.message(e,settings)})};}
 const full=corpus(c,context),contains=s=>s&&full.includes(s),none=note=>({text:'',note});
 function get(id){
  const row=N.rows.find(r=>r.id===id);
  if(row){
   const raw=c.stepwiseRules[id];if(contains(raw))return {text:raw,note:''};
   if(id==='C07'&&c.prose)return {text:c.outputEnabled?'<body min="'+c.range.下限+'" max="'+c.range.上限+'" unit="'+c.range.单位+'">':c.plainOutput,note:''};
   if(id==='E01'&&c.prose&&c.outputEnabled)return {text:'<actions format="pipes" actions_min="'+c.actionRange.下限+'" actions_max="'+c.actionRange.上限+'">',note:''};
   // Changes are compared through the same compiler. Only a literal slice of
   // this draft's emitted text may be shown, never another field's whole group.
   if(row.type==='string')for(const alt of row.allowed??[]){if(alt===settings[row.variable]||['指定 NPC','选文风卡'].includes(alt))continue;try{const other=N.previewSettings({...settings,[row.variable]:alt},output,context);for(const key of Object.keys(c.text)){const current=c.text[key],next=other.text[key];if(typeof current!=='string'||typeof next!=='string'||current===next)continue;const text=difference(current,next);if(text&&contains(text))return {text,note:'当前选项对应的装配片段'};}}catch(_){} }
   if(id==='C06'){const text=(settings[row.variable]||[]).map(k=>N.protocol.P.focus_rules[k]).filter(contains).join('');if(text)return {text,note:''};}
   return none(c.prose?'当前组合不单独注入此项；可能由共用流程约束，或对应步骤/输出已关闭。':'当前任务不进入这项叙事配置；选值保留。');
  }
  if(id==='summary')return c.prose&&c.outputEnabled?{text:c.planRule,note:output.summary?'':'关闭摘要时按此原文保留空值。'}:none('当前任务没有结构化任务摘要。');
  if(HEART_RULES[id])return c.heartActive&&output.directions.includes(id)&&contains(HEART_RULES[id])?{text:HEART_RULES[id],note:''}:none('本方向当前不注入。');
  if(id==='mvu')return c.prose&&c.outputEnabled?{text:typeof c.varsTemplate==='string'?c.varsTemplate:JSON.stringify(c.varsTemplate),note:settings['缇斯亚MVU兼容']?'启用兼容后仍需角色卡提供有效初值。':'当前未开启MVU兼容。'}:none('当前普通交付不生成变量更新载荷。');
  const feature=N.protocol.P.features.find(x=>x[1]===id),step=Object.entries(N.protocol.P.step_names).find(([,v])=>v===id);
  if(feature||step){const edited={...settings};if(feature)edited[id]=!settings[id];else edited[N.protocol.STEP_KEY]=settings[N.protocol.STEP_KEY].includes(id)?settings[N.protocol.STEP_KEY].filter(x=>x!==id):[...settings[N.protocol.STEP_KEY],id];let other;try{other=N.previewSettings(edited,output,context);}catch(e){return none(N.message(e,settings));}const enabled=feature?settings[id]:settings[N.protocol.STEP_KEY].includes(id);if(!enabled)return none('已关闭本项扩展；必要资料与共用约束仍按现行流程保留。');const previous=new Set(corpus(other,context).split('\n'));const lines=full.split('\n').filter(line=>line.trim()&&!previous.has(line));if(lines.length)return {text:lines.join('\n'),note:'本项实际增加的原文'};return none('当前组合共用其他已开启步骤的约束，本项没有额外独立文字。');}
  if(id==='task'){const text=c.prose?c.text.mode:c.utility;return contains(text)?{text,note:''}:none('对应预设条目未启用，本项当前不注入。');}
  return none('该项不直接注入固定文字。');
 }
 return {get,execution:c};
}
module.exports={createInjectionPreview,corpus};
