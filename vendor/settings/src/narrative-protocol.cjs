'use strict';
const P=require('./narrative-protocol-data.cjs');
const {MATERIAL_SLOTS}=require('./narrative-material-slots.cjs');
const STEP_KEY='缇斯亚叙事步序';
const KEYS=[STEP_KEY,...P.features.map(f=>f[1])];
const TOKENS=['@@TISYA_WORLD_BEFORE@@','@@TISYA_WORLD_AFTER@@','@@TISYA_HISTORY@@','@@TISYA_EXAMPLES@@'];
function esc(v){return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/{/g,'&#123;').replace(/}/g,'&#125;').replace(/@@TISYA_/g,'&#64;@TISYA_');}
// Restore only the owned output-envelope tag. Parameter XML/macros stay escaped.
function formatOutput(v){return esc(v).replace(/&lt;(\/?tisha-thought)&gt;/g,'<$1>').replace(/&quot;/g,'"').replace(/&#123;/g,'{').replace(/&#125;/g,'}').replace(/\{\{/g,'&#123;&#123;').replace(/\}\}/g,'&#125;&#125;');}
function node(tag,text){return '<'+tag+'>'+text+'</'+tag+'>';}
function defaults(){return {[STEP_KEY]:Object.values(P.step_names),...Object.fromEntries(P.features.map(f=>[f[1],true]))};}
function validate(settings){
 const steps=settings[STEP_KEY];
 if(!Array.isArray(steps)||new Set(steps).size!==steps.length||steps.some(s=>!Object.values(P.step_names).includes(s)))throw Error('STEP_CONFIG');
 for(const [,key]of P.features)if(typeof settings[key]!=='boolean')throw Error('FEATURE_CONFIG');
}
function qa(q){return '<qa '+Object.entries(q).map(([k,v])=>k+'="'+esc(v)+'"').join(' ')+'/>';}
function body(key,depth){const t=P.templates[key];return node('law',esc(t.law))+t.qa.slice(0,depth==='精简'?1:undefined).map(qa).join('')+(depth==='深入'&&P.deep[key]?qa(Object.fromEntries(['q','a','check','repair'].map((k,i)=>[k,P.deep[key][i]]))):'');}
function macro(tag,name){return '{{#if '+name+'}}<'+tag+'>{{'+name+'}}</'+tag+'>{{/if}}';}
function compile({settings,values,task,playerArchive,memory,cardflow,extensions,output,outputEnabled=true,ruleValues,reservedMaterials={}}){
 validate(settings);
 const narrative=task.name==='叙事',mode=values.A06;
 // Utility discussion/summary uses its own task, without fiction-only steps.
 const prose=narrative&&['互动叙事','大纲扩写'].includes(mode);
 const enabled=prose?Object.keys(P.step_names).filter(k=>settings[STEP_KEY].includes(P.step_names[k])):[];
 const groups={};
 for(const [id,value]of Object.entries(ruleValues)){
  if(id==='D05'||!P.slots[id]||(outputEnabled&&['C07','D03','D04'].includes(id)))continue;
  const [owner,slot]=P.slots[id];
  if(!enabled.includes(owner)&&owner!=='delivery')continue;
  if(!groups[owner])groups[owner]={};(groups[owner][slot]??=[]).push(value);
 }
 const settingsXML=k=>groups[k]?node('settings',Object.entries(groups[k]).map(([tag,text])=>node(tag,esc(text.join('')))).join('')):'';
 const auth=['A01','A02','A04'].map(k=>ruleValues[k]||'').join('');
 // One source occurrence per material. A disabled analysis step leaves its source at the same context boundary.
 const world=node('world_before',TOKENS[0])+node('world_after',TOKENS[1])+node('history',TOKENS[2])+(memory?node('recalled_memory',esc(memory)):'');
 const people=macro('player_persona','persona')+(playerArchive?node('player_archive',esc(playerArchive)):'')+node('role_card',macro('description','charDescription')+macro('personality','charPersonality')+macro('card_main','charPrompt')+macro('card_post','charInstruction'))+(cardflow?node('cardflow',esc(cardflow)):'');
 const scene=macro('scenario','scenario'),examples=node('examples',TOKENS[3]);
 const information={anchor:'BIND(@bindings); APPLY(@runtime,@task_bounds);',load:world,view:'REF(@bindings,@task_bounds);',cast:people,plot:scene,write:examples,review:'核对当前草稿与本轮实际已装配的约束。'};
 // Reserved inputs are an internal resolver contract, not automatic reads or defaults.
 for(const [id,m]of Object.entries(reservedMaterials)){
  const slot=MATERIAL_SLOTS.reserved.find(s=>s.id===id);
  if(!slot||!m||m.status!=='ok'||typeof m.text!=='string'||!Array.isArray(m.sources)||m.text&&!m.sources.length)throw Error('RESERVED_MATERIAL');
  if(m.text)information[slot.step]+=node(slot.tag,esc(m.text));
 }
 let xml='<protocol task="'+esc(prose?'叙事':task.name==='叙事'?mode:task.name)+'">';
 xml+=node('grammar','按编号执行。各步 information 已填入本轮资料，settings 已填入选定限制；每个 required 步及子项均执行：EXEC(law,QA) → CHECK(check) → REVISE(repair)。QA 只保留必要结论；EMIT 按输出契约交付。资料标签沿用资料权限。');
 xml+=node('flow',enabled.map((k,i)=>String(i+1).padStart(2,'0')+' RUN(@'+k+');').join(' ')+' RUN(@delivery);');
 // Common authorization is emitted once even if identity review is disabled.
 xml+=node('task_bounds',esc(auth));
 // This boundary remains when all optional analysis steps are switched off.
 xml+=node('runtime_binding','OWNER := Tisya; BIND(@bindings); APPLY(@runtime,@import,@execution_boundary,@output_contract);');
 if(groups.anchor)delete groups.anchor.agency;
 for(const k of Object.keys(P.step_names)){
  const on=enabled.includes(k),info=information[k];
  if(on){
   xml+='<'+k+' order="'+String(enabled.indexOf(k)+1).padStart(2,'0')+'" required="true">'+node('information',info)+settingsXML(k);
   xml+=body(k,values.D01);
   for(const [,key,locations]of P.features)if(settings[key])for(const [owner,tag]of locations)if(owner===k)xml+='<'+tag+' required="true">'+body(tag,'标准')+'</'+tag+'>';
   xml+='</'+k+'>';
  }else if(['load','cast','plot','write'].includes(k)||MATERIAL_SLOTS.reserved.some(slot=>slot.step===k&&reservedMaterials[slot.id]?.text))xml+=node('context_'+k,info);
 }
 if(!prose)xml+=node('task_work',esc(narrative?P.rules.A06[mode]:task.steps));
 if(extensions)xml+=node('extensions',esc(extensions));
 xml+=node('runtime_gate','CHECK(助手身份 == 缇斯亚; 作品人物有资料依据; 卡内主持流程已归入当前任务; 输出顺序 == @output); 发现身份漂移，先恢复缇斯亚调度归属，再重写受影响内容。资料不足时交付已有结果与必要问题；禁止将缺口补成与缇斯亚相遇的剧情。检查结论留在执行过程，成品只含输出契约所列内容。');
 xml+='<delivery required="true">'+settingsXML('delivery')+(outputEnabled?'':node('output',formatOutput(output)))+node('do','FORMAT(@output); EMIT(成品); RETURN(@self);')+body('delivery','标准')+'</delivery></protocol>';
 // All native source markers must occur exactly once in the approved host order.
 let last=-1;for(const token of TOKENS){if(xml.split(token).length!==2||xml.indexOf(token)<=last)throw Error('PROTOCOL_MARKER');last=xml.indexOf(token);}
 return xml;
}
module.exports={PROTOCOL:{P,STEP_KEY,KEYS,TOKENS,MATERIAL_SLOTS,esc,defaults,validate,compile}};
