import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {baseline,matrixPreset,MATRIX_REVISION,REPLY_ENVELOPE_RULE,compilePrompts,applyCompiledMessages} from '../engine/config.mjs';
import {DEFAULT_TAGS} from '../engine/tags.mjs';
import {cardDefinitionSource} from '../tables/card-source.js';

const marker='@ENVELOPE :: Whole response boundary';
const history=[
 {role:'assistant',content:'<start></start><reply id="tisya-onepass-1"><body>HISTORY 原文：<StatusPlaceHolderImpl/></body><vars><UpdateVariable><JSONPatch>[{"op":"replace","path":"/x","value":2}]</JSONPatch></UpdateVariable></vars></reply>'},
 {role:'user',content:'用户原话：<reply>只是引用</reply>，{{user}} 保留。'},
 {role:'tool',content:'{"raw":"<start></start>","exact":false}'}
];
const cardMaterial={role:'system',content:'[ORIGINAL_CARD]\n原卡逐字正文：<start></start>；<StatusPlaceHolderImpl/>；<UpdateVariable>原卡独立协议材料</UpdateVariable>。\n[/ORIGINAL_CARD]'};
function finalPayload({tags=DEFAULT_TAGS,override,oldPreset=false,cardRows=[cardMaterial]}={}){
 const source=structuredClone(baseline),registry=source.prompts.find(p=>p.identifier==='tisya_registry');
 if(oldPreset)registry.content=registry.content.replace(/^@ENVELOPE :: Whole response boundary\n[\s\S]*?^@END_ENVELOPE\n?/gm,'');
 const config={tags:{...tags},prompts:override===undefined?{}:{tisya_registry:override},story:{userName:'绑定人物',wish:''}},slots={tisya_user_identity:'唯一绑定人物档案',tisya_contractor_wish:'保留玩家当轮要求'};
 const expand=text=>text.replace(/\{\{(tisya_[\w]+)\}\}/g,(_,key)=>slots[key]??'').replaceAll('{{user}}','宿主人物').replaceAll('{{char}}','原卡人物');
 const order=source.prompt_order.find(row=>row.character_id===100001).order,enabled=new Set(order.filter(row=>row.enabled).map(row=>row.identifier));
 const messages=source.prompts.filter(row=>!row.marker&&row.enabled!==false&&enabled.has(row.identifier)&&expand(row.content??'').trim()).map(row=>({role:row.role??'system',content:expand(row.content)}));
 const originalRows=[...structuredClone(cardRows),...structuredClone(history)];messages.push(...originalRows);const before=structuredClone(messages),sourceBefore=structuredClone(source);
 const compiled=compilePrompts(source,config,slots),result=applyCompiledMessages(messages,source,compiled,expand);
 assert.deepEqual(messages,before,'final request preparation does not edit the host message input');assert.deepEqual(source,sourceBefore,'preset source is not rewritten');assert.deepEqual(result.slice(-originalRows.length),originalRows,'original card and all history roles remain exact');
 return {source,compiled,result,system:result.filter(row=>row.role==='system').map(row=>row.content).join('\n')};
}
function assertContract(text,tags=DEFAULT_TAGS){
 assert.equal(text.split(marker).length-1,1);assert.equal(text.split('@END_ENVELOPE').length-1,1);assert.equal([...text.matchAll(/(?:^|\n)\[REGISTRY\]\s*\n/g)].length,1);
 const contract=text.slice(text.indexOf(marker),text.indexOf('@END_ENVELOPE'));
 assert(contract.includes('禁止在唯一 '+tags.reply+' 根块之前或之后输出任何内容'));
 assert(contract.includes('从 <'+tags.reply+' id="tisya-onepass-1"> 开始'));
 assert(contract.includes('以对应的 </'+tags.reply+'> 结束'));
 assert(contract.includes('原卡标记与美化标签放在 '+tags.body+' 对应位置'));
 assert(contract.includes('独立扩展面板的显示标记放在 '+tags.extra));
 assert(contract.includes('两处都使用当前启用的正则渲染'));
 assert(contract.includes('每个显示组件只在实际展示位置输出一次'));
 assert(contract.includes('先读取本轮已注入的角色卡、世界书和输出格式条目'));
 assert(contract.includes('完整同组标签连续放在 '+tags.extra));
 assert(contract.includes('并保留面板之间的先后顺序'));
 assert(contract.includes('正文内联的弹幕、信笺和局部美化仍在 '+tags.body+' 原位置'));
 assert(contract.includes('中文标签保持原名'));
 assert(contract.includes('禁止额外包裹反引号或 Markdown 代码围栏'));
 assert(contract.includes(tags.extra+' 同时收纳唯一的 '+tags.cells+' 与 '+tags.vars+' 直接子块'));
 assert(contract.includes('隐藏的机器数据，不复制到可见正文或扩展面板'));
 assert(contract.includes('完整原生 UpdateVariable 更新只放在 '+tags.extra+' 内的 '+tags.vars));
 assert(contract.includes('显示标记不得塞进 '+tags.vars+' 或 '+tags.cells));
 assert(contract.includes('本轮明确请求进入该页面时输出：正文就地页面放在 '+tags.body+'，独立面板放在 '+tags.extra));
 assert(!contract.includes('显示占位符只放在 '+tags.extra));
 assert(contract.includes('Markdown 代码围栏或第二个回复根块'));
 return contract;
}

test('generated preset and the actual default compiled model payload contain one whole-response boundary',()=>{
 const preset=JSON.parse(readFileSync(new URL('../presets/Tisya.json',import.meta.url),'utf8'));
 assert.equal(preset.extensions.tisya_builtin.revision,MATRIX_REVISION);assert.equal(preset.prompts.find(p=>p.identifier==='tisya_registry').content,matrixPreset().prompts.find(p=>p.identifier==='tisya_registry').content);
 const {system}=finalPayload();assertContract(system);assert.equal(system.split(REPLY_ENVELOPE_RULE).length-1,1);
});

test('custom tag names reach the whole boundary, both display locations, and hidden extra/cells/vars ownership',()=>{
 const tags={...DEFAULT_TAGS,reply:'scene.',body:'story-',anchor:'beat',extra:'cardExtra',cells:'deltaCells',vars:'nativeVars',archive:'archiveRows',actions:'choices'},out=finalPayload({tags}),contract=assertContract(out.system,tags);
 assert.doesNotMatch(contract,/<\/?reply\b/);assert(contract.includes('story-、beat、choices'));
 const registry=out.compiled.prompts.find(row=>row.identifier==='tisya_registry').content;assert(registry.includes('<scene. id="tisya-onepass-1">'));assert(registry.includes('</scene.>'));
 assert.equal(out.result.find(row=>row.content===cardMaterial.content)?.content,cardMaterial.content,'custom tag rewriting does not touch original card material');
});

test('an existing registry override and an old loaded preset still produce exactly one current boundary',()=>{
 const oldRegistry='[REGISTRY]\n用户旧自定义合同保留。\n<reply id="tisya-onepass-1"><body>剧情</body><extra>原卡占位符</extra><vars>原卡变量</vars></reply>\n[/REGISTRY]';
 for(const override of [oldRegistry,oldRegistry.replace('[REGISTRY]','[REGISTRY]\n'+REPLY_ENVELOPE_RULE+'\n'+REPLY_ENVELOPE_RULE)]){
  const {system}=finalPayload({override,oldPreset:true});assertContract(system);assert(system.includes('用户旧自定义合同保留。'));assert.equal(system.split(REPLY_ENVELOPE_RULE).length-1,1);
 }
});

test('final prompt fragment replacement refuses duplicate or missing registry inputs instead of guessing which system text to edit',()=>{
 const source=structuredClone(baseline),registry=source.prompts.find(p=>p.identifier==='tisya_registry'),minimal={prompts:[registry],order:[{identifier:'tisya_registry',enabled:true}]},config={tags:DEFAULT_TAGS,prompts:{tisya_registry:'[REGISTRY]\n自定义新合同\n[/REGISTRY]'},story:{userName:'角色'}};
 const compiled=compilePrompts(minimal,config,{});assert.throws(()=>applyCompiledMessages([{role:'system',content:registry.content+'\n'+registry.content}],minimal,compiled),{code:'PROMPT_MATCH'});assert.throws(()=>applyCompiledMessages([{role:'system',content:'missing'}],minimal,compiled),{code:'PROMPT_MATCH'});
});

test('compiled request keeps original card format groups while routing independent panels to extra without display templates',()=>{
 const stateFormat='<日期>{{日期}}</日期>\n<时间>{{时间}}</时间>\n<天气>{{天气}}</天气>\n<地点>{{地点}}</地点>\n<评语>{{评语}}</评语>';
 const card={data:{name:'中性格式卡',description:'正文内联弹幕保留在动作之间。',character_book:{entries:[
  {id:1,comment:'状态输出格式',enabled:true,content:'正文结束前输出以下整组状态字段，字段顺序固定：\n'+stateFormat},
  {id:2,comment:'音乐输出格式',enabled:true,content:'在状态栏之前输出 <bgm>当前bgm:歌名 - 歌手</bgm>。'},
  {id:3,comment:'关闭定义',enabled:false,content:'DISABLED_FORMAT_SENTINEL'}
 ]},extensions:{regex_scripts:[{findRegex:'<日期>.*',replaceString:'<html><script>DISPLAY_TEMPLATE_SENTINEL()</script></html>'}]}}};
 const before=structuredClone(card),material=cardDefinitionSource(card),rows=[{role:'system',content:material}],{result,system}=finalPayload({cardRows:rows});
 assertContract(system);assert.equal(system.split(REPLY_ENVELOPE_RULE).length-1,1);
 assert.equal(result.find(row=>row.content===material)?.content,material);
 assert(system.includes(stateFormat));assert(system.includes('在状态栏之前输出 <bgm>当前bgm:歌名 - 歌手</bgm>。'));
 assert.match(system,/原卡要求这些面板位于[^。\n]*“正文结束前”[^。\n]*“消息末尾”[^。\n]*旧 context 容器内[^。\n]*同样归入 extra/);
 assert(system.includes('并保留面板之间的先后顺序'));
 assert.doesNotMatch(system,/DISPLAY_TEMPLATE_SENTINEL|DISABLED_FORMAT_SENTINEL/);assert.deepEqual(card,before);
});
