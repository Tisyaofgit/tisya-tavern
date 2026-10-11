'use strict';
const {jsonClone}=require("./json-serialization.cjs");
const {PROTOCOL:{esc}}=require('./narrative-protocol.cjs');
const QUESTIONS=['身份与授权','资料与知情','人物与关系','行动与因果','数值与机制','文风与表现','成稿与交付'];
const ACTION_TYPES=Object.freeze(['交流','调查','移动','操作','战斗','休整','其他']);
const DIRECTIONS=['输入评价','回应用户评价','剧情吐槽'];
const HEART_RULES={输入评价:'站在创作者立场，面向用户吐槽其本轮扮演指令对人物处境、选择与关系造成的影响。吐槽对象为发出指令的用户。',回应用户评价:'以缇斯亚身份直接回应用户对缇斯亚说的话、问题或感想，与用户聊天互动。',剧情吐槽:'短评本轮剧情走向。'};
function makeOutputSchema({outputOptions,ruleValues={},actionRange=null}){
 const bounds=require('./action-range.cjs').resolveActionRange(actionRange);
 const o=outputOptions;
 if(!o||typeof o.summary!=='boolean'||typeof o.heartEnabled!=='boolean'||!Array.isArray(o.heartDirections)||new Set(o.heartDirections).size!==o.heartDirections.length||o.heartDirections.some(d=>!DIRECTIONS.includes(d)))throw Error('OUTPUT_OPTIONS_INVALID');
 if(!/^[0-9a-f]{32}$/.test(o.generationId))throw Error('OUTPUT_GENERATION_ID');
 if(!o.heartEnabled&&o.heartDirections.length)throw Error('OUTPUT_HEART_DISABLED_DIRECTIONS');
 const s=jsonClone(require('./independent-schema.cjs')),h=s.$defs.heart;
 s.properties.next.properties.actions.minItems=bounds.下限;s.properties.next.properties.actions.maxItems=bounds.上限;
 const enabled=o.heartEnabled&&o.heartDirections.length>0;
 h.description='首尾任务分别填写心声，内容各异。';
 if(o.emotionNames!==undefined){if(!Array.isArray(o.emotionNames)||o.emotionNames.some(n=>typeof n!=='string'||!n.trim()))throw Error('OUTPUT_EMOTION_NAMES');h.properties.items.items.properties.mood.enum=[null,...o.emotionNames];}
 h.properties.status.enum=enabled?['有内容','沉默']:['关闭'];
 h.properties.items.maxItems=enabled?o.heartDirections.length:0;
 h.properties.items.items.properties.type=enabled?{enum:o.heartDirections}:{type:'string'};
 const tone=(ruleValues.C02||'').split('场外的缇斯亚')[1];
 h.properties.items.items.properties.text.description=enabled?o.heartDirections.map(d=>d+'：'+HEART_RULES[d]).join('')+(ruleValues.D04||'沿用self_voice与self_known。')+(tone?'缇斯亚'+tone:'')+'只评可公开内容，纯文本。':'';
 h.oneOf=enabled?[{properties:{status:{const:'有内容'},items:{minItems:1}}},{properties:{status:{const:'沉默'},items:{maxItems:0}}}]:[{properties:{status:{const:'关闭'},items:{maxItems:0}}}];
 const plan=s.properties.task.properties.tasks.items.properties.plan;
 if(!o.summary){plan.const='';plan.description='保留空串。';}else plan.description=(ruleValues.D03||'简短填写安排与必要依据。')+'角色打算只填characters。';
 return s;
}
function buildOutput({prose,outputOptions,ruleValues,task}){
 return prose?'<output><schema><![CDATA['+JSON.stringify(makeOutputSchema({outputOptions,ruleValues}))+']]></schema></output>':'<output>'+esc(task.output)+'</output>';
}
module.exports={buildOutput,makeOutputSchema,QUESTIONS,DIRECTIONS,ACTION_TYPES,HEART_RULES};
