import {compileFullNarrative,compileFullPreflight,toImportablePreset,fullSourceEntries,fullPreflightSourceEntries} from './preset.mjs';

const clone=structuredClone;
const check=(ok,message)=>{if(!ok)throw Error('V3 预设：'+message);};
export const TISYA_PRESET_VERSION='tisya.full.v3-w30';
const groups=new Set(['worldInfoBefore','worldInfoAfter','dialogueExamples','chatHistory','tisya_author_note_before','tisya_author_note_after','tisya_after_current']);
const dynamic=new Set([...groups,'tisya_material_task_material','tisya_material_rule_material','tisya_material_environment','tisya_material_gameplay','tisya_material_lorebook','tisya_material_character_card','tisya_material_user_identity','tisya_material_current_state','tisya_material_memory_archive','tisya_material_world_progression','tisya_material_foreshadow','tisya_material_tool_result','tisya_material_card_extensions','tisya_current_input','chatHistory','chatHistory／当前user']);
const labels={worldInfoBefore:'原生世界书 · 前置',worldInfoAfter:'原生世界书 · 后置',dialogueExamples:'角色卡对话示例',tisya_author_note_before:'作者注 · 故事前',tisya_author_note_after:'作者注 · 故事后',tisya_after_current:'当前输入之后的深度资料',tisya_material_character_card:'角色卡资料',tisya_material_user_identity:'当前用户身份',tisya_material_lorebook:'世界书与额外资料',tisya_material_task_material:'世界定义',tisya_material_current_state:'当前档案与状态',tisya_material_memory_archive:'历史记忆',tisya_material_world_progression:'待办与本轮推进',tisya_current_input:'本轮输入及归档来源',chatHistory:'近期摘要与原生深度资料','chatHistory／当前user':'当前用户输入'};
const neutralRegistry={tables:[],types:[]};
export function defaultPresetMessages(stage){
 check(['writer','preflight'].includes(stage),'未知任务');
 return stage==='writer'?compileFullNarrative({snapshot:{rows:[],scope:{},creativeBrief:{}},currentUser:'',includeEmpty:true}):compileFullPreflight({input:{requestKey:'preset-template',view:{registry:neutralRegistry,rows:[]},archiveSources:[]},includeEmpty:true});
}
export function createRuntimePreset(stage){
 const messages=defaultPresetMessages(stage).filter(m=>!m.identifier.startsWith('native:'));
 const expected=stage==='writer'?fullSourceEntries():fullPreflightSourceEntries();
 for(const item of expected)if(!messages.some(m=>m.identifier===item.identifier))messages.push({identifier:item.identifier,role:item.role,content:''});
 const preset=toImportablePreset(messages.map(m=>({...m,content:dynamic.has(m.identifier)?'{{tisya_v3:'+m.identifier+'}}':m.content})),{name:stage==='writer'?'Tisya':'Tisya Auxiliary (embedded)'});
 for(const p of preset.prompts)p.name=labels[p.identifier]??p.name;
 Object.assign(preset.extensions.tisya,{exportKind:'runtime-template',stage,templateVersion:1,version:TISYA_PRESET_VERSION,dynamicMaterials:'Visible tisya_v3 slots are filled from the current bound session. Static entries remain editable.'});
 return preset;
}

/** Selected preset owns order, roles, switches and edited text; host owns data. */
export function assembleRuntimePreset(stage,preset,compiled){
 check(preset?.extensions?.tisya?.exportKind==='runtime-template'&&preset.extensions.tisya.stage===stage,'请选择对应的 W30 完整配套预设；静态规则导出稿不能用来生成');
 check(Array.isArray(preset.prompts),'缺少条目');
 const defaults=new Map(defaultPresetMessages(stage).map(m=>[m.identifier,m]));
 const values=new Map(compiled.filter(m=>!m.templateAnchor).map(m=>[m.identifier,m]));
 const grouped=new Map();for(const m of compiled)if(m.templateAnchor){if(!grouped.has(m.templateAnchor))grouped.set(m.templateAnchor,[]);grouped.get(m.templateAnchor).push(m);}
 const order=preset.order??preset.prompt_order?.find(o=>o.character_id===100001)?.order??preset.prompt_order?.[0]?.order;
 check(Array.isArray(order),'缺少条目顺序');
 const entries=new Map();for(const p of preset.prompts){check(typeof p.identifier==='string'&&!entries.has(p.identifier),'条目标识重复');entries.set(p.identifier,p);}
 const seen=new Set(),used=new Set(),out=[];
 for(const entry of order){check(entry&&typeof entry.identifier==='string'&&!seen.has(entry.identifier),'顺序表含重复标识');seen.add(entry.identifier);const p=entries.get(entry.identifier);check(p,'顺序表引用不存在的条目');if(entry.enabled===false||p.enabled===false)continue;
  check(['system','user','assistant'].includes(p.role),'条目角色无效');check(typeof p.content==='string','条目内容须为文字');
  let content=p.content;
  if(!dynamic.has(p.identifier)&&defaults.has(p.identifier)&&content===defaults.get(p.identifier).content)content=values.get(p.identifier)?.content??content;
  const fragments=content.split(/(\{\{tisya_v3:[^{}]+\}\})/g);let buffer='';
  const flush=()=>{if(buffer)out.push({identifier:p.identifier,role:p.role,content:buffer});buffer='';};
  for(const fragment of fragments){
   const match=/^\{\{tisya_v3:([^{}]+)\}\}$/.exec(fragment);
   if(!match){check(!fragment.includes('{{tisya_v3:'),'资料槽表达式未闭合');buffer+=fragment;continue;}
   const id=match[1];check(dynamic.has(id),'未知资料槽 '+id);check(!used.has(id),'资料槽重复 '+id);used.add(id);
   if(groups.has(id)){flush();out.push(...(grouped.get(id)??[]).map(({templateAnchor,...m})=>clone(m)));}
   else buffer+=values.get(id)?.content??'';
  }
  flush();
 }
 const required=stage==='writer'?'chatHistory／当前user':'tisya_current_input';
 check(used.has(required),'当前输入资料槽未启用，已停止发送');
 if(stage==='preflight'){for(const id of ['tisya_registry','tisya_think_commit'])check(out.some(m=>m.identifier===id&&m.content.trim()),'辅助预设缺少已启用的任务协议：'+id);check(used.has('tisya_material_current_state'),'辅助预设缺少当前档案资料槽');}
 return out;
}
