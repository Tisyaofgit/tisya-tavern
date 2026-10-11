'use strict';
const {jsonClone}=require("./json-serialization.cjs");
const DATA=require('./output-template-data.cjs');
const clone=jsonClone;
const xml=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const HEART_ARRAY_RULE='values.heart_type为本轮开启的并列方向。首尾各自逐项填写有实际对象和公开依据的方向，多项适用须全部保留；每处每方向至多一条，不把方向分摊到首尾。仅略去无依据的方向，其他方向继续保留，不虚构用户发言或剧情。task.heart评本轮输入与公开开局；next.heart评成稿与进展，各方向写新内容，不复读首块。有内容对应非空items；全部无内容才填沉默和空items。';
function selectedHeartRule(text,active){
 if(!active)return text;
 return text.replace('首尾任务分别填写心声，内容各异。','').replace('有内容对应非空items，沉默对应空items。每方向至多一条。','').replace('mood从values.mood选择图鉴表情名称，无合适对象填null，不生成新的情绪枚举。','');
}
function moodRule(moods){
 return moods.some(name=>typeof name==='string')
  ? 'values.mood的非null名称均有绑定图片。按每条心声语气选择最贴切名称；有合适表情就使用，仅全部不适合时填null，不照抄历史null或默认填null。名称与列表完全一致，使用JSON字符串的英文双引号，不自创、改名或写图片路径；null不加引号。替换{表情名}；首尾逐条选择，可以重复，无需轮换。'
  : '本轮没有已绑定图片的可用表情名称。每条mood填写JSON空值null，不加引号；不虚构表情或图片路径。';
}
// Used by both the direct compiler and the exported EJS preset. Only existing
// context fields are required, so the preset also runs on Foundation 0.11.2.
function heartTemplate(active,types,position,moods){
 const mood=moods.some(name=>typeof name==='string')?'{表情名}':null;
 return active?{status:'有内容',items:types.map(type=>({type,mood,text:'{'+position+'·'+type+'}'}))}:{status:'关闭',items:[]};
}
function variableRule(enabled){
 return enabled
 ? '变量变更只填vars.operations；路径相对数据根，使用JSON Pointer。无变更填[]。'
 : 'vars留空。';
}
function variableTemplate(enabled){return enabled?'<vars format="json">{"protocol":"mvu-json-patch","operations":[]}</vars>':'<vars/>';}

function outputParts(schema){
 const d=clone(DATA),h=schema.$defs.heart,active=h.properties.status.enum.includes('有内容');
 d.meta.values.mood=h.properties.items.items.properties.mood.enum??[null];
 d.meta.values.heart_status=h.properties.status.enum;
 d.meta.values.heart_type=h.properties.items.items.properties.type.enum||[];
 d.meta.heart_rule=active?h.properties.items.items.properties.text.description+'首尾各按已选方向填写有公开依据的短心声，每方向至多一条，text为1—80个可见字符。task评输入与开局，next评成稿与进展，不复读；无依据的方向省略，全无时填沉默与空items。mood选给定名称，无合适表情填null。':'首尾heart.status填关闭，items填空数组。';
 d.notes.task.tasks.plan=schema.properties.task.properties.tasks.items.properties.plan.description;
 if(schema.properties.task.properties.tasks.items.properties.plan.const==='')d.payloads.task.tasks[0].plan='';
 for(const k of ['task','next'])d.payloads[k].heart=heartTemplate(active,d.meta.values.heart_type,k==='task'?'开场':'收尾',d.meta.values.mood);
 for(const t of d.payloads.task.tasks){delete t.id;delete t.source;}for(const t of d.payloads.next.tasks){delete t.id;delete t.actions;}for(const a of d.payloads.next.actions)delete a.id;delete d.payloads.next.branches;
 const guidance=clone(require('./output-guidance.json'));
 d.notes=guidance.字段;d.notes.task+=schema.properties.task.properties.tasks.items.properties.plan.const===''?'plan留空字符串。':schema.properties.task.properties.tasks.items.properties.plan.description;
 d.payloads.task.audit=d.meta.values.audit.map(kind=>({kind,status:'{status}',evidence:'{evidence}'}));
 d.payloads.next.actions=Array.from({length:schema.properties.next.properties.actions.minItems},()=>({type:'{type}',text:'{text}',source:'{source}'}));

 return d;
}
// Source and user-editable preset share one literal template and the same selected values.
function assemble(d,{generationId,range,actionRange,countRule,editable=false,mvuEnabled=false}){
 const j=x=>xml(JSON.stringify(x)),ejs=s=>'<% '+s+' %>';
 const copyRule='保留body与next的范围。';
 const countTail='满足body范围；精确字数须有实际计数，无计数结果将成稿与交付记待确认，格式闭合不代替篇幅核验。';
 const bodyWrite='填写正文成稿与自然段；闭合body后填写尾部区块。';
 const directMeta={...d.meta,heart_rule:d.meta.heart_rule,format:{填写:require('./output-guidance.json').填写.replace('task、title、next为YAML，status、memory和vars为JSON。','task、title、next、status、memory和vars为JSON。').replace(/YAML长文字[^。]*。/g,''),落位:require('./output-guidance.json').落位},fields:{...d.notes,status:require('./status-contract.json'),body:{count:countRule+countTail,write:bodyWrite},vars:variableRule(mvuEnabled)}};
 if(d.meta.values.heart_type.length)directMeta.mood_rule=moodRule(d.meta.values.mood);
 const header=editable?ejs(heartTemplate.toString()+';'+moodRule.toString()+';'+selectedHeartRule.toString()+';'+variableRule.toString()+';if(typeof c.mvuEnabled!=="boolean")throw new Error("TISYA_MVU_OUTPUT_CONTEXT_REQUIRED");var meta='+JSON.stringify(d.meta)+';meta.format={填写:'+JSON.stringify(copyRule)+'};meta.values=JSON.parse(c.outputValues);meta.heart_rule=c.heartRule;meta.fields='+JSON.stringify(d.notes)+';meta.fields.task+=c.outputSummary?"plan填简短公开安排。":"plan留空。";meta.fields.body={count:c.countRule+'+JSON.stringify(countTail)+',write:'+JSON.stringify(bodyWrite)+'};meta.fields.vars=variableRule(c.mvuEnabled);if(c.heartActive)meta.mood_rule=moodRule(meta.values.mood);print(emit(meta));'):j(directMeta);
 let text=header+'\n<reply>\n';
 for(const tag of ['task','title']){
  text+='<'+tag+' format="json"'+(tag==='task'?' audit_count="7"':'')+'>\n';
  text+=editable&&tag==='task'?ejs('var payload='+JSON.stringify(d.payloads.task)+';if(!c.outputSummary)payload.tasks[0].plan="";payload.heart=heartTemplate(c.heartActive,meta.values.heart_type,"开场",meta.values.mood);print(emit(payload));'):j(d.payloads[tag]);
  text+='\n</'+tag+'>\n';
 }
 text+='<body min="'+range.下限+'" max="'+range.上限+'" unit="'+range.单位+'">\n{正文}\n</body>\n<status format="json">{}</status>\n<extra>\n{附属展示}\n</extra>\n'+(editable?ejs('print(c.mvuEnabled?'+JSON.stringify(variableTemplate(true))+':'+JSON.stringify(variableTemplate(false))+');'):variableTemplate(mvuEnabled))+'\n<archive/>\n<memory format="json">'+(editable?ejs('print(emit(c.memoryTemplate));'):j(memoryTemplate()))+'</memory>\n<next format="json" actions_min="'+actionRange.下限+'" actions_max="'+actionRange.上限+'">\n';
 text+=editable?ejs('var payload='+JSON.stringify(d.payloads.next)+';payload.heart=heartTemplate(c.heartActive,meta.values.heart_type,"收尾",meta.values.mood);print(emit(payload));'):j(d.payloads.next);
 return text+'\n</next>\n</reply>';
}
function makeOutputXML({schema,generationId,range,countRule,mvuEnabled=false}){return assemble(outputParts(schema),{generationId,range,countRule,mvuEnabled,actionRange:{下限:schema.properties.next.properties.actions.minItems,上限:schema.properties.next.properties.actions.maxItems}});}
function editableTemplate(){return assemble(outputParts(require('./output-contract.cjs').makeOutputSchema({outputOptions:{generationId:'0'.repeat(32),heartEnabled:false,heartDirections:[],summary:true},ruleValues:{},actionRange:{下限:3,上限:6}})),{generationId:'<%= c.generationId %>',actionRange:{下限:'<%= c.actionRange.下限 %>',上限:'<%= c.actionRange.上限 %>'},range:{下限:'<%= c.range.下限 %>',上限:'<%= c.range.上限 %>',单位:'<%= c.range.单位 %>'},editable:true});}
function memoryTemplate(){const M=require('./story-memory.cjs'),q=clone(M.MEMORY_EMPTY);delete q.protocol;q.事件=[{...clone(M.MEMORY_EVENT),标题:'{事件标题}',梗概:'{本轮已经成立的事件梗概}'}];return q;}
module.exports={makeOutputXML,editableTemplate,outputParts,variableTemplate};
