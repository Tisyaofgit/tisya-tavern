'use strict';
const {PROTOCOL:P}=require('./narrative-protocol.cjs');
const {makeOutputXML}=require('./output-template.cjs');
const {makeOutputSchema}=require('./output-contract.cjs');
function cameraText(v,r,characterRules){
 const person={第一:r.B01,第二:r.B01,第三:'采用第三人称，以人物姓名和代词保持指代清楚；'};
 const focus=v.B02==='玩家角色'?'主镜头跟随玩家及其可接触事物。':r.B02;
 const info=!characterRules?r.B03.replace('读者能接触的秘密服从本轮公开范围。',''):v.B03==='限知'?'依认知边界限定各段人物所知，推测标明线索与不确定性。':v.B03==='全知'?'叙述者统筹全局信息；人物所知依认知边界，读者可见依公开范围。':r.B03;
 const mind=v.B04==='分段多人物内心'?'多人物内心分别成段，段首明确主体，玩家心理依玩家授权。':v.B04==='视角人物内心'?'直接呈现当前视角人物的内心，玩家心理依玩家授权。':r.B04;
 const side=v.B05==='场景切换时'?'旁线只在场景切换处交代，标明时地、人物和主线关联；插段结束回主镜头。':v.B05==='独立分段穿插'?'相关旁线独立分段，开头明确人物与场景，按自身因果发展，结束后返回主镜头。':r.B05;
 return person[v.B01]+focus+info+mind+side;
}
function buildIndependentContext({request,settings,values:v,ruleValues:r,task,prose,outputEnabled,outputOptions,activeEntries,extensions={}}){
 P.validate(settings);
 const active=new Set(activeEntries||require('./independent-preset.cjs').prompts.filter(p=>p.enabled!==false).map(p=>p.identifier));
 const steps=new Set(settings['缇斯亚叙事步序']);
 const on=s=>steps.has(s),feature=s=>settings['缇斯亚叙事'+s]===true;
 const cast=on('人物反应')&&active.has('tisya_inner_chain');
 const characterRules=active.has('tisya_inner_chain');
 const plot=on('行动与剧情'),write=on('正文组织');
 const checks={bind:on('身份复核'),source:on('资料承接'),outline:on('资料承接'),format_plan:on('资料承接'),
 world_motion:plot&&active.has('tisya_inner_chain'),offstage_progress:plot&&active.has('tisya_inner_chain'),character_mode:cast,
 perceive:cast,motive:cast,continuity:cast,relationship:cast&&feature('角色自主'),resilience:cast&&feature('防绝望'),regard:cast&&feature('防神化'),voice:cast&&feature('角色鲜活'),initiative:cast&&feature('角色自主'),
 resolve:plot,stop:plot,open_path:plot&&feature('防绝望'),numeric:plot,data_changes:plot,camera:on('视角认知'),release:on('视角认知'),focus:write,dialogue:write,cliche:write&&feature('防八股'),plain_language:write&&feature('防名词堆砌'),vivid:write&&feature('文风鲜活'),draft_review:on('成稿总检'),deliver:true,body_length_gate:outputEnabled&&active.has('tisya_inner_chain')};

 const join=(...ids)=>ids.map(id=>r[id]||'').join('');
 const tone=(r.C02||'').split('场外的缇斯亚')[0];
 const text={mode:join('A06'),auth:join('A01','A02','A04'),style:join('C01')+tone+join('C08')+(checks.cliche&&v.C09==='克制套话'?'':join('C09'))+'应用已载入文风卡的具体技法，人物声口沿用人物档案。',planning:join('D01'),
 publicScope:join('B06').replace('内心插段、旁线、摘要与作者短评均遵守同一公开范围。','')+'公开范围覆盖正文、内心、旁线、任务、核验、心声、建议和原卡展示。',
 castScope:join('D02')+'分别形成各人物的行动意图。',outline:join('A03'),
 stop:'依玩家授权核对决定。'+join('A05','C03','C04'),camera:cameraText(v,r,characterRules),
 focus:'采用当前文体与文风卡。'+join('C06')+'依body范围细写关键过程、简写过渡，沿停点收束，保持段落与时序清楚。',
 dialogue:join('C05')+'使信息、行动或关系变化接成连贯自然段；删去空转解释，以实际互动和后果补足。',
 motive:'由性情、生活、本领、经历、关系、本人已知隐情与现状确定具体目标和现实代价。'+join('C10')+'未定动机保持未定，修正只为推进剧情安排的反应。'};

 text.focus=text.focus.replace('依body范围',outputEnabled?'依body范围':'依当前正文篇幅');
 const actionRange=require('./action-range.cjs').resolveActionRange(v.E01??null);
 const range=v.C07||{下限:1,上限:1,单位:'字'};
 const plainOutput='<output>'+P.esc(task.output.replace(/正文篇幅[^。]*。/g,''))+(settings['缇斯亚MVU兼容']===true?'本轮为普通交付，不输出变量更新。':'')+(prose?'正文篇幅为'+range.下限+'—'+range.上限+range.单位+'，只统计正文可见文字。':'')+'</output>';
 const countRule=range.单位==='字'?'净字计文字、字母和数字，排除标点、空白、表情、标签、样式和脚本；':'词数按正文可见文本的词边界统计；';
 const schema=prose&&outputEnabled?makeOutputSchema({outputOptions,ruleValues:r,actionRange}):null;
 const parts=schema?require('./output-template.cjs').outputParts(schema):null;
 const mvuEnabled=settings['缇斯亚MVU兼容']===true;
 const outputXML=schema?makeOutputXML({schema,generationId:outputOptions.generationId,range,countRule,mvuEnabled}):'';
 const result={extensionRules:extensions,stepwiseRules:r,stepwise:prose?require('./stepwise-protocol.cjs').renderStepwise({text,r,checks,outputEnabled}):{protocol:'',character:''},knowledgeRulesEnabled:characterRules,memoryTemplate:{...Object.fromEntries(Object.entries(require('./story-memory.cjs').MEMORY_EMPTY).filter(([k])=>k!=='protocol')),事件:[{...require('./story-memory.cjs').MEMORY_EVENT,标题:'{事件标题}',梗概:'{本轮已经成立的事件梗概}'}]},memoryRule:{用途:'录入新增内容；根键和有记录的子键完整，无新增用空数组。',事件:'梗概记事件主干，影响记新增后果；原文直接摘录body中完整的连续场景，保留动作、对白、停顿与反应的顺序；名场面可保留数段，不限制为一句镜头概述。不拆成独立台词；必要后果和知情限制在对应字段录入，不能靠短摘录冒充完整事件。结果填本轮呈现的待叙标题。时间用当前历法，未知填null；视角已知与后台分开记录。',伏笔:{词:'短触发词',对象:['已有对象名称'],动作:'埋下|推进|回收',依据:'已发生的依据'},认知:{主体:'已有对象名称',内容:'实际所知',来源:'目击、交谈等具体途径',确信:'确认|听闻|推测|误信'},设定变动:{对象:'已有对象名称',字段:'变更项',旧值:null,新值:null},设定原因:'有变动时填写依据。',未完事项:{事项:'事项名称',对象:['关联对象'],触发:'必要条件',状态:'待处理|完成|取消',依据:'本轮依据'},倒计时:{计时:'天|轮',延后:1,对象:['关联对象'],地点:null,内容:'到期后待叙的提醒内容',条件:[],失效:[]},倒计时边界:'记录未来待揭示信息；条件与失效仅填材料明确提供的条件，否则留空。期限不保证预定结果。'},结构版本:1,请求:request,prose,outputEnabled,mvuEnabled,varsTemplate:require('./output-template.cjs').variableTemplate(mvuEnabled),checks,text,range,actionRange,
 generationId:outputOptions?.generationId||request,outputSchema:schema?JSON.stringify(schema):'',outputXML,outputValues:parts?JSON.stringify(parts.meta.values):'',heartRule:parts?.meta.heart_rule||'',planRule:schema?.properties.task.properties.tasks.items.properties.plan.description||'',outputSummary:outputOptions?.summary===true,heartActive:outputOptions?.heartEnabled===true&&outputOptions.heartDirections.length>0,heartLimit:outputOptions?.heartDirections.length||0,
 countRule:range.单位==='字'?'净字计文字、字母和数字，排除标点、空白、表情、标签、样式和脚本；':'词数按正文可见文本的词边界统计；',
 plainOutput,utility:task.name==='世界生成'?'<world_generation>'+require('./world-generation-task.json')+'</world_generation><output>只交付一份完整的tisya.world.bundle/3 JSON，不加代码围栏；存在阻断缺口则说明缺口，不伪造完整世界包或保存回执。</output>':'<task_work>'+P.esc((task.name==='叙事'?r.A06:task.steps||task.goal)+(r.D04||'')+((r.C02||'').includes('场外的缇斯亚')?'场外的缇斯亚'+r.C02.split('场外的缇斯亚')[1]:''))+'</task_work>'+plainOutput};
 result.rest=require("./rest-protocol.cjs").renderRest(result,{activeEntries,task,extensions});
 return result;
}
module.exports={buildIndependentContext};
