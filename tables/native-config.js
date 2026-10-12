import {check,copy,object} from './schema.js';
import {digest} from './books.js';
export const NATIVE_PATH='tisya.worldbooks';
export const EMPTY_NATIVE=Object.freeze({presets:[],worldbooks:[],regexes:[]});
const text=(v,label)=>check(typeof v==='string'&&v.trim()===v&&v.length>0,label+'不能为空或含首尾空白');
const scopes=['global','character','preset'];
const noExtra=(v,keys,label)=>check(Object.keys(v).every(k=>keys.includes(k)),label+'含未登记字段');
export function validateNativeConfig(value=EMPTY_NATIVE){
 check(object(value),'原生配置必须是对象');noExtra(value,['presets','worldbooks','regexes'],'原生配置');const out=copy(value);
 for(const k of ['presets','worldbooks','regexes']){out[k]??=[];check(Array.isArray(out[k]),k+'必须为列表');}
 const seen=new Set();function unique(key){check(!seen.has(key),'原生配置目标重复：'+key);seen.add(key);}
 function scope(row){check(scopes.includes(row.scope),'作用域必须是 global、character 或 preset');if(row.target!==undefined)check(typeof row.target==='string','作用域目标必须是文本');}
 for(const p of out.presets){check(object(p),'预设格式无效');noExtra(p,['name','prompts'],'预设');text(p.name,'预设名称');check(!['in_use','current'].includes(p.name),'预设名称为保留字');check(Array.isArray(p.prompts),'预设提示词必须是列表');unique('preset:'+p.name);const ids=new Set();for(const row of p.prompts){check(object(row),'预设提示词无效');noExtra(row,['id','name','content','role','enabled'],'预设提示词');text(row.id,'提示词 ID');text(row.name,'提示词名称');check(!ids.has(row.id),'提示词 ID 重复');ids.add(row.id);check(typeof row.content==='string'&&['system','user','assistant'].includes(row.role)&&typeof row.enabled==='boolean','提示词类型无效');}}
 for(const w of out.worldbooks){check(object(w),'世界书格式无效');noExtra(w,['name','scope','target','entries'],'世界书');text(w.name,'世界书名称');scope(w);unique('book:'+w.scope+':'+(w.target??'')+':'+w.name);check(Array.isArray(w.entries),'世界书条目必须是列表');const names=new Set();for(const e of w.entries){check(object(e),'世界书条目无效');noExtra(e,['name','content','keys','constant','enabled'],'世界书条目');text(e.name,'条目名称');check(!names.has(e.name),'书内条目同名');names.add(e.name);check(typeof e.content==='string'&&Array.isArray(e.keys)&&e.keys.every(k=>typeof k==='string'&&k.trim())&&typeof e.constant==='boolean'&&typeof e.enabled==='boolean','世界书条目字段无效');check(e.constant||e.keys.length||!e.enabled,'绿灯条目需要至少一个关键词');}}
 for(const r of out.regexes){check(object(r),'正则配置无效');noExtra(r,['id','name','scope','target','find','replace','flags','enabled','display','prompt','sources'],'正则');text(r.id,'正则 ID');text(r.name,'正则名称');scope(r);unique('regex:'+r.scope+':'+(r.target??'')+':'+r.id);text(r.find,'查找表达式');check(typeof r.replace==='string'&&typeof r.flags==='string','正则替换／标志无效');try{new RegExp(r.find,r.flags);}catch(e){throw Error('正则 '+r.name+' 无效：'+e.message);}check(['enabled','display','prompt'].every(k=>typeof r[k]==='boolean')&&(r.display||r.prompt),'正则须选择显示或提示词范围');check(Array.isArray(r.sources)&&r.sources.length&&r.sources.every(s=>['ai_output','user_input','slash_command','world_info'].includes(s)),'正则来源范围无效');}
 return out;
}
export const NATIVE_CONTRACT='仅当创世目标需要自动配置时，在 artifacts.native 提供 {presets:[],worldbooks:[],regexes:[]}；无需时省略。presets 每项 {name,prompts:[{id,name,role:"system",content,enabled:true}]}。worldbooks 每项 {name,scope:"character",target:"角色头像ID或预设名；留空表示当前",entries:[{name,content,keys:[],constant:false,enabled:true}]}；constant=true为蓝灯，false为绿灯，启用的绿灯必须有关键词。scope 只选 global、character、preset 之一。regexes 每项 {id,name,scope,target,find:"不带斜杠的表达式",replace,flags:"g",enabled:true,display:true,prompt:false,sources:["ai_output"]}。没有需要的正则不创建占位规则。已有同名条目和配置保留；新增内容须对应用户确认的蓝图。此处只设计文本配置，不含脚本、凭据或 API 地址。';
export function createNativeConfiguration({getHelper=()=>globalThis.TavernHelper,getContext,regexGate=null}){
 let busy=false,receipts=[],scanFault=null;
 function snapshot(){const c=getContext(),card=c.characters?.[c.characterId]?.avatar,preset=c.getPresetManager?.('openai')?.getSelectedPresetName?.();return {chat:c.chatId,card,group:c.groupId,preset};}
 function resolveTargets(raw){const spec=validateNativeConfig(raw),s=snapshot();for(const row of [...spec.worldbooks,...spec.regexes]){if(row.scope==='global')row.target='';else if(!row.target){check(!(s.group&&row.scope==='character'),'群组配置请明确选择角色头像 ID');row.target=s[row.scope==='character'?'card':'preset'];text(row.target,'当前作用域目标');}}return spec;}
 const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 const log=(kind,name,status,detail='')=>receipts.push({kind,name,status,detail});
 async function apply(raw){check(!busy,'原生配置正在创建');const spec=resolveTargets(raw),captured=snapshot(),h=getHelper(),manager=getContext().getPresetManager?.('openai');receipts=[];busy=true;
  const guard=()=>check(same(captured,snapshot()),'聊天、角色或预设已切换，剩余配置未写入');
  function requireAPI(...keys){for(const k of keys)check(typeof h?.[k]==='function','自动配置需要新版酒馆助手 API：'+k);}
  function target(row){if(row.scope==='global')return '';const t=row.target||captured[row.scope==='character'?'card':'preset'];text(t,(row.scope==='character'?'角色':'预设')+'目标');if(row.scope==='character')check(getContext().characters?.some(c=>c.avatar===t),'角色目标须为现有角色头像 ID：'+t);return t;}
  try{
   // Resolve and preflight every destination before the first mutation.
   for(const row of [...spec.worldbooks,...spec.regexes])row.target=target(row);
   if(spec.presets.length)requireAPI('getPresetNames','getPreset','createPreset');
   if(spec.presets.some(p=>!h.getPresetNames().includes(p.name)))check(object(h.default_preset),'宿主缺少预设默认模板');
   if(spec.worldbooks.length)requireAPI('getWorldbookNames','getWorldbook','createWorldbook','updateWorldbookWith');
   if(spec.worldbooks.some(w=>w.scope==='global'))requireAPI('getGlobalWorldbookNames','rebindGlobalWorldbooks');
   if(spec.worldbooks.some(w=>w.scope==='character'))requireAPI('getCharWorldbookNames','rebindCharWorldbooks');
   if(spec.regexes.length)requireAPI('getTavernRegexes','updateTavernRegexesWith');
   const presetTargets=[...spec.worldbooks,...spec.regexes].filter(x=>x.scope==='preset');
   if(presetTargets.length){requireAPI('getPresetNames');for(const t of presetTargets)check(h.getPresetNames().includes(t.target)||spec.presets.some(p=>p.name===t.target),'目标预设不存在：'+t.target);}
   if(spec.worldbooks.some(w=>w.scope==='preset'))check(typeof manager?.readPresetExtensionField==='function'&&typeof manager?.writePresetExtensionField==='function','宿主缺少预设扩展字段接口');
   for(const p of spec.presets){guard();if(h.getPresetNames().includes(p.name)){log('预设',p.name,'保留已有');continue;}
    const native=copy(h.default_preset);native.extensions={};native.prompts_unused=[];
    if(p.prompts.length){native.prompts=native.prompts.filter(x=>x.content===undefined);for(const [i,row]of p.prompts.entries())native.prompts.splice(i,0,{...copy(row),id:'tisya-'+row.id,position:{type:'relative'}});}
    check(await h.createPreset(p.name,native)===true,'预设创建未确认：'+p.name);guard();check(h.getPresetNames().includes(p.name),'新预设读回失败');log('预设',p.name,'已创建');
   }
   for(const w of spec.worldbooks){guard();const wanted=w.entries.map(e=>({name:e.name,content:e.content,enabled:e.enabled,strategy:{type:e.constant?'constant':'selective',keys:copy(e.keys),keys_secondary:{logic:'and_any',keys:[]},scan_depth:'same_as_global'},position:{type:'after_character_definition',role:'system',depth:0,order:100},probability:100,recursion:{prevent_incoming:true,prevent_outgoing:true,delay_until:null},effect:{sticky:null,cooldown:null,delay:null}}));
    if(!(await h.getWorldbookNames()).includes(w.name)){check(await h.createWorldbook(w.name,wanted)===true,'世界书创建未确认：'+w.name);log('世界书',w.name,'已创建');}
    else {const old=await h.getWorldbook(w.name),missing=wanted.filter(e=>!old.some(x=>x.name===e.name));if(missing.length){guard();await h.updateWorldbookWith(w.name,entries=>{guard();return [...entries,...copy(missing.filter(e=>!entries.some(x=>x.name===e.name)))];},{render:'debounced'});}log('世界书',w.name,missing.length?'已补建条目':'保留已有',missing.length+' 条新增；同名条目保持原值');}
    guard();const after=await h.getWorldbook(w.name);check(wanted.every(e=>after.some(x=>x.name===e.name)),'世界书条目读回失败：'+w.name);
    if(w.scope==='global'){const prior=await h.getGlobalWorldbookNames();guard();if(!prior.includes(w.name))await h.rebindGlobalWorldbooks([...prior,w.name]);const now=await h.getGlobalWorldbookNames();check([...prior,w.name].every(n=>now.includes(n)),'全局书绑定未确认');}
    if(w.scope==='character'){const prior=await h.getCharWorldbookNames(w.target);guard();check(Array.isArray(prior.additional),'角色书绑定格式无效');if(prior.primary!==w.name&&!prior.additional.includes(w.name))await h.rebindCharWorldbooks(w.target,{primary:prior.primary,additional:[...prior.additional,w.name]});const now=await h.getCharWorldbookNames(w.target);check(now.primary===prior.primary&&prior.additional.every(n=>now.additional.includes(n))&&(now.primary===w.name||now.additional.includes(w.name)),'角色书绑定未确认');}
    if(w.scope==='preset'){const prior=manager.readPresetExtensionField({name:w.target,path:NATIVE_PATH})??[];check(Array.isArray(prior)&&prior.every(x=>typeof x==='string'),'预设世界书关联损坏，保留原值');guard();if(!prior.includes(w.name))await manager.writePresetExtensionField({name:w.target,path:NATIVE_PATH,value:[...prior,w.name]});const now=manager.readPresetExtensionField({name:w.target,path:NATIVE_PATH});check(Array.isArray(now)&&[...prior,w.name].every(n=>now.includes(n)),'预设书关联未确认');}
    guard();log('绑定',w.name,'已绑定',w.scope+(w.target?' · '+w.target:''));
   }
   const groups=new Map();for(const r of spec.regexes){const key=r.scope+'\0'+r.target;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r);}
   for(const rows of groups.values()){const first=rows[0],option={type:first.scope,...(first.target?{name:first.target}:{})};guard();const old=await h.getTavernRegexes(option);check(Array.isArray(old),'正则读取结果无效');const wanted=[];
    for(const r of rows)wanted.push({id:'tisya-'+(await digest([r.scope,r.target,r.id])).slice(0,24),script_name:r.name,enabled:r.enabled,find_regex:new RegExp(r.find,r.flags).toString(),replace_string:r.replace,trim_strings:[],source:Object.fromEntries(['user_input','ai_output','slash_command','world_info'].map(k=>[k,r.sources.includes(k)])),destination:{display:r.display,prompt:r.prompt},run_on_edit:true,min_depth:null,max_depth:null});
    const exists=(list,r)=>list.some(e=>e.id===r.id||e.script_name===r.script_name);const missing=wanted.filter(r=>!exists(old,r));
    if(missing.length){guard();await h.updateTavernRegexesWith(list=>{guard();return [...list,...copy(missing.filter(r=>!exists(list,r)))];},option);}
    guard();const after=await h.getTavernRegexes(option);check(wanted.every(r=>exists(after,r)),'正则保存读回失败');
    // Opening a previously denied scope would also activate unrelated rules.
    // Only a genuinely empty scope can be auto-enabled without changing those.
    if(!old.length&&missing.length&&regexGate)await regexGate.enable(first.scope,first.target);
    const allowed=regexGate?regexGate.allowed(first.scope,first.target):first.scope==='global';
    for(const r of wanted)log('正则',r.script_name,exists(old,r)?'保留已有':'已创建',first.scope+(allowed?'':' · 原作用域开关未开启，请在原生正则页启用'));
   }
   guard();return copy(receipts);
  }catch(e){const err=Error('自动配置未完成：'+e.message+(receipts.length?'；已完成项目保留，可再次补建':'；尚未确认任何项目'));err.receipts=copy(receipts);throw err;}finally{busy=false;}
 }
 async function scanEntries(payload){
  const captured=snapshot(),c=getContext(),manager=c.getPresetManager?.('openai');if(!captured.preset||!manager?.readPresetExtensionField)return;
  const names=manager.readPresetExtensionField({name:captured.preset,path:NATIVE_PATH});if(names==null)return;check(Array.isArray(names)&&names.every(n=>typeof n==='string'),'预设世界书关联损坏');if(!names.length)return;check(Array.isArray(payload?.chatLore),'世界书扫描数据格式不支持');
  const existing=new Set(Object.values(payload).filter(Array.isArray).flat().filter(object).map(e=>e.world+'\0'+e.uid));
  for(const name of new Set(names)){const data=await c.loadWorldInfo(name);check(same(captured,snapshot()),'预设已切换，停止世界书注入');check(object(data?.entries),'预设关联世界书不存在或损坏：'+name);for(const e of Object.values(data.entries)){check(Number.isSafeInteger(e.uid),'世界书条目缺少 UID');const key=name+'\0'+e.uid;if(!existing.has(key)){payload.chatLore.push({...copy(e),world:name});existing.add(key);}}}
 }
 async function entriesLoaded(payload){try{await scanEntries(payload);}catch(e){scanFault=e;throw e;}}
 return {apply,resolveTargets,entriesLoaded,clearScan(){scanFault=null;},assertReady(){if(scanFault)throw scanFault;},state:()=>({busy,receipts:copy(receipts)})};
}

// Use the host's native allow-lists. Do not re-enable the regex extension.
export function createRegexGate({getContext,isScopedScriptsAllowed,allowScopedScripts,isPresetScriptsAllowed,allowPresetScripts,saveSettings}){
 const disabled=()=>getContext().extensionSettings.disabledExtensions?.includes('regex');
 return {allowed(scope,target){if(disabled())return false;return scope==='global'||(scope==='character'?isScopedScriptsAllowed(getContext().characters.find(c=>c.avatar===target)):isPresetScriptsAllowed('openai',target));},async enable(scope,target){
  if(disabled()||scope==='global')return;const settings=getContext().extensionSettings,key=scope==='character'?'character_allowed_regex':'preset_allowed_regex',prior=copy(settings[key]);
  if(scope==='character')allowScopedScripts(getContext().characters.find(c=>c.avatar===target));else allowPresetScripts('openai',target);
  const expected=JSON.stringify(settings[key]);try{check(await saveSettings()===true,'正则作用域开启尚未确认保存');}catch(e){if(JSON.stringify(settings[key])===expected){if(prior===undefined)delete settings[key];else settings[key]=prior;}throw e;}
 }};
}
