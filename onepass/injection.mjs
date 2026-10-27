import {onePassEntries,isOnePassPreset,ONEPASS_ID} from './preset.mjs';
import {fullDefaultConfiguration,DEFAULT_MOODS} from '../six/preset.mjs';

let defaults;
const baseline=()=>defaults??=(onePassEntries(fullDefaultConfiguration(),DEFAULT_MOODS));
const alias=id=>id==='tisya_material_style_card'?'tisya_material_style':id;
const fail=(code,message)=>{throw Object.assign(Error(message),{code:'TISYA_ONEPASS_'+code});};
export function enabledOnePassEntries(source){
 const order=source.order??source.prompt_order?.find(x=>x.character_id===100001)?.order??[];
 return order.filter(x=>x.enabled).map(x=>source.prompts.find(p=>p.identifier===x.identifier)).filter(p=>p&&!p.marker&&p.enabled!==false);
}
// The imported file contains complete text. Apply current controls only to
// unchanged shipped entries; user-edited text, roles, ordering and switches stay owned by the preset.
export function resolveOnePassSource(source,entries){
 if(!isOnePassPreset(source))return source;
 return {...source,protocol:ONEPASS_ID,prompts:source.prompts.map(p=>{
  const id=alias(p.identifier),text=p.content??'';
  if(p.identifier==='tisya_selected_resources'&&text==='{{tisya_config_selected}}')return {...p,content:''};
  if(p.marker||!Object.hasOwn(entries,id))return {...p};
  if(text===baseline()[id]||text==='{{tisya_live_onepass_'+id+'}}')return {...p,content:entries[id]};
  return {...p};
 })};
}
function cells(messages,role){
 return messages.flatMap(m=>m.role!==role?[]:typeof m.content==='string'?[{get:()=>m.content,set:s=>{m.content=s;}}]:Array.isArray(m.content)?m.content.filter(p=>p?.type==='text'&&typeof p.text==='string').map(p=>({get:()=>p.text,set:s=>{p.text=s;}})):[]);
}
function occurrences(text,part){return part?text.split(part).length-1:0;}
export function applyOnePassSource(messages,source,resolved){
 const out=structuredClone(messages),next=new Map(resolved.prompts.map(p=>[p.identifier,p]));let expanded=0;
 for(const p of enabledOnePassEntries(source)){
  const before=p.content?.trim(),after=next.get(p.identifier)?.content?.trim();
  if(!before||after===undefined||before===after)continue;
  const candidates=cells(out,p.role??'system'),count=candidates.reduce((n,c)=>n+occurrences(c.get(),before),0);
  if(count>1)fail('DUPLICATE_ENTRY','本轮预设条目重复，未猜选替换：'+p.identifier);
  if(count===1){const cell=candidates.find(c=>c.get().includes(before));cell.set(cell.get().replace(before,()=>after));expanded++;}
 }
 return {messages:out,expanded};
}
export function assertOnePassInjection(messages,source,stateText){
 const system=cells(messages,'system').map(c=>c.get()).join('\n');
 const unresolved=/\{\{tisya_(?:live_onepass_[^{}]+|config_selected)\}\}/.exec(system);
 if(unresolved)fail('UNEXPANDED_MACRO','本次提示词尚有未展开的宏 '+unresolved[0]+'；未发送缺少提示词的请求。请确认扩展已完整重启并选用完整版预设。');
 const required=['main','tisya_task_start','tisya_registry','tisya_inner_chain','tisya_prepare_trigger'];
 const enabled=new Set(enabledOnePassEntries(source).map(p=>p.identifier));
 for(const id of required)if(!enabled.has(id))fail('MISSING_ENTRY','单次完整输出缺少已启用的必需条目：'+id);
 const registry=[...system.matchAll(/\[REGISTRY\]([\s\S]*?)\[\/REGISTRY\]/g)].filter(x=>x[1].includes('[ONEPASS.CONTRACT]'));
 if(registry.length!==1)fail('MISSING_CONTRACT','本次请求未注入唯一的单次完整回复格式，未发送。');
 const contract=registry[0][1],tags=['<reply id="'+ONEPASS_ID+'">','<task format="pipes">','<think phase="before">','<title','<body','<think phase="after">','<status','<extra','<vars','<archive','<memory','<actions'];
 const machineFormats=[...contract.matchAll(/<(?:status|vars|archive|memory) format="(.*?)">/g)].map(x=>x[1]);if(machineFormats.length!==4||!['json','pipes'].some(f=>machineFormats.every(x=>x===f)))fail('INCOMPLETE_CONTRACT','本次数据块格式不一致或尚未支持，未发送。');
 let cursor=0;for(const tag of tags){const at=contract.indexOf(tag,cursor);if(at<0)fail('INCOMPLETE_CONTRACT','本次回复格式缺少或错排 '+tag+'；未发送。');cursor=at+tag.length;}
 if(!system.includes('[ID]')||!system.includes('[TASK.START]')||!system.includes('[PREPARE_STEP]')||!system.includes('[CREATIVE.GUIDE]'))fail('MISSING_GUIDE','本次请求缺少身份、资料承接或完整创作指导，未发送。');
 const states=[...system.matchAll(/<ONEPASS_STATE>\s*([\s\S]*?)\s*<\/ONEPASS_STATE>/g)];
 const expected=/<ONEPASS_STATE>\s*([\s\S]*?)\s*<\/ONEPASS_STATE>/.exec(stateText??'');
 if(!expected||states.length!==1||states[0][1].trim()!==expected[1].trim())fail('MISSING_STATE','本次请求没有唯一且匹配的填表快照，未发送。');
 return {protocol:ONEPASS_ID,corePrompts:'expanded',blocks:11,state:'matched',stage:'settings-ready'};
}
