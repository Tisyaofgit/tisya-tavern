import {createRuntimePreset,TISYA_PRESET_VERSION} from './preset-template.mjs';
import {keepPresetConnection} from '../preset-connection.js';

const clone=structuredClone;
const fail=message=>{throw Error('Tisya 预设安装：'+message);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
// Only portable generation controls are copied. Credentials, URLs and model
// selection remain with the host connection manager.
const parameters=['temperature','frequency_penalty','presence_penalty','top_p','top_k','top_a','min_p','repetition_penalty','openai_max_context','openai_max_tokens','max_context_unlocked','stream_openai','seed','reasoning_effort','verbosity','custom_prompt_post_processing'];
export function portablePresetParameters(value={}){return Object.fromEntries(parameters.filter(k=>Object.hasOwn(value,k)).map(k=>[k,clone(value[k])]));}
export function readInstalledPreset(context){
 const manager=context.getPresetManager?.('openai');
 if(!manager?.getAllPresets().includes('Tisya'))fail('缺少 Tisya，请重新载入插件以自动安装');
 const preset=clone(manager.getCompletionPresetByName('Tisya'));
 if(preset?.extensions?.tisya?.version!==TISYA_PRESET_VERSION)fail('插件与预设版本不一致，请重新载入插件完成升级');
 if(manager.getSelectedPresetName()==='Tisya')for(const key of ['prompts','prompt_order'])if(context.chatCompletionSettings?.[key])preset[key]=clone(context.chatCompletionSettings[key]);
 return preset;
}

/** Save the previous version before replacing the managed release. Same-version
 * edits are untouched; failed backups or writes stop startup, never fall back. */
export async function ensureInstalledPreset({getContext,now=()=>new Date(),uuid=()=>crypto.randomUUID()}={}){
 const context=getContext(),manager=context.getPresetManager?.('openai');
 for(const key of ['getAllPresets','getCompletionPresetByName','getSelectedPresetName','savePreset','selectPreset','findPreset'])if(typeof manager?.[key]!=='function')fail('宿主缺少 '+key);
 const exists=manager.getAllPresets().includes('Tisya'),stored=exists?clone(manager.getCompletionPresetByName('Tisya')):null;
 if(stored?.extensions?.tisya?.version===TISYA_PRESET_VERSION)return {status:'current',version:TISYA_PRESET_VERSION};
 const previous=clone(stored);
 if(previous&&manager.getSelectedPresetName()==='Tisya')for(const key of ['prompts','prompt_order'])if(context.chatCompletionSettings?.[key])previous[key]=clone(context.chatCompletionSettings[key]);
 let backup=null;
 if(previous){
  backup='Tisya backup '+now().toISOString().replace(/[:.]/g,'-')+' '+uuid();
  // skipUpdate avoids activating the archival copy. The host persists it and
  // exposes it in its preset list on the next load.
  await manager.savePreset(backup,previous,{skipUpdate:true});
 }
 const preset=createRuntimePreset('writer');Object.assign(preset,portablePresetParameters(previous??{}));
 const event=context.eventTypes?.OAI_PRESET_CHANGED_BEFORE;
 if(!event||typeof context.eventSource?.on!=='function'||typeof context.eventSource?.removeListener!=='function')fail('宿主缺少预设切换保护事件');
 const protect=change=>{if(change.presetName==='Tisya')keepPresetConnection({...change,settings:change.settings??context.chatCompletionSettings});};
 context.eventSource.on(event,protect);
 try{
  await manager.savePreset('Tisya',preset);
  // savePreset updates the list asynchronously; selectPreset waits for the
  // official application promise, including the connection protection hook.
  await manager.selectPreset(manager.findPreset('Tisya'));
  const actual=manager.getCompletionPresetByName('Tisya');
  if(!same(actual?.prompts,preset.prompts)||!same(actual?.prompt_order,preset.prompt_order)||actual?.extensions?.tisya?.version!==TISYA_PRESET_VERSION)fail('保存后读回不一致');
  if(manager.getSelectedPresetName()!=='Tisya')fail('宿主未选中 Tisya');
 }finally{context.eventSource.removeListener(event,protect);}
 return {status:exists?'updated':'installed',version:TISYA_PRESET_VERSION,backup};
}
