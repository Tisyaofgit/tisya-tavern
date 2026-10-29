import {QUALITY_PRESET_SETTINGS} from './config/response-speed.js';
import bundled from './presets/Tisya.json' with {type:'json'};
import {keepPresetConnection} from './preset-connection.js';
import {presetLoadMismatch} from './preset-load-check.js';

export const BUILTIN_PRESET_NAME='Tisya';
export const BUILTIN_PRESET_REVISION=bundled.extensions.tisya_builtin.revision;
const clone=value=>structuredClone(value);
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const updateError=(message,saved=false)=>Object.assign(Error(message+'。请点“更新 Tisya 预设”重试。'),{tisyaPresetUpdate:true,tisyaPresetSaved:saved});
const fail=message=>{throw updateError('Tisya 内置预设同步失败：'+message);};
const inFlight=new WeakMap();

// Save through PresetManager. Its updateList always selects the saved preset;
// register the acknowledged record in its native list without changing selection.
// Verified against TauriTavern a1855be4: preset-manager.js savePreset/getPresetList.
export function installBuiltInPreset(context,document,{isBusy=()=>false,timeout=5000,force=false}={}){
 const manager=context.getPresetManager?.('openai');
 if(!manager)return Promise.reject(updateError('宿主的聊天补全预设接口尚未就绪'));
 if(inFlight.has(manager))return inFlight.get(manager);
 const operation=install().catch(error=>{error.tisyaPresetUpdate=true;throw error;}).finally(()=>inFlight.delete(manager));inFlight.set(manager,operation);return operation;
 async function install(){
  for(const key of ['getAllPresets','getCompletionPresetByName','getSelectedPresetName','getPresetList','savePreset','findPreset','selectPreset'])if(typeof manager[key]!=='function')fail('宿主缺少 '+key);
  const exists=manager.getAllPresets().includes(BUILTIN_PRESET_NAME);
  const previous=exists?manager.getCompletionPresetByName(BUILTIN_PRESET_NAME):null;
  if(exists&&!object(previous))fail('已有同名预设无法读取');
  const active=manager.getSelectedPresetName()===BUILTIN_PRESET_NAME;
  const savedCurrent=previous?.extensions?.tisya_builtin?.revision===BUILTIN_PRESET_REVISION;
  if(!force&&savedCurrent&&(!active||context.chatCompletionSettings?.extensions?.tisya_builtin?.revision===BUILTIN_PRESET_REVISION))return {name:BUILTIN_PRESET_NAME,revision:BUILTIN_PRESET_REVISION,status:'current',active};
  if(isBusy())fail('当前仍在生成，尚未覆盖预设');
  const select=typeof manager.select==='string'?document.querySelector(manager.select):(manager.select?.[0]??manager.select);
  if(select?.tagName!=='SELECT')fail('宿主预设选择器尚未就绪');
  const list=manager.getPresetList(),names=list?.preset_names;
  if(!Array.isArray(list?.presets)||!object(names))fail('聊天补全预设列表格式不受支持');
  if(exists&&(!Object.hasOwn(names,BUILTIN_PRESET_NAME)||list.presets[names[BUILTIN_PRESET_NAME]]!==previous))fail('已有预设列表与读取结果不一致');
  const before=context.eventTypes?.OAI_PRESET_CHANGED_BEFORE,after=context.eventTypes?.OAI_PRESET_CHANGED_AFTER;
  if(!before||!after||!context.eventSource?.on||!context.eventSource?.removeListener)fail('宿主缺少预设刷新事件');
  const extensions=active?context.chatCompletionSettings?.extensions:previous?.extensions;
  if(extensions!=null&&!object(extensions))fail('已有预设扩展字段格式无效');
  const write=force||!savedCurrent;
  const next=write?{...clone(previous??{}),...clone(bundled),extensions:{...clone(extensions??{}),...clone(bundled.extensions)}}:clone(previous);
  if(write)await manager.savePreset(BUILTIN_PRESET_NAME,next,{skipUpdate:true});
  // No speculative local mutation precedes the native save acknowledgement.
  const current=manager.getPresetList();
  if(current.presets!==list.presets||current.preset_names!==names)fail('预设列表在更新期间变化，当前载入尚未确认');
  const index=Object.hasOwn(names,BUILTIN_PRESET_NAME)?names[BUILTIN_PRESET_NAME]:list.presets.length;
  list.presets[index]=next;names[BUILTIN_PRESET_NAME]=index;
  if(![...select.options].some(option=>option.text===BUILTIN_PRESET_NAME)){
   const selected=select.value,option=document.createElement('option');option.value=String(index);option.textContent=BUILTIN_PRESET_NAME;select.appendChild(option);if(selected)select.value=selected;
  }
  if(manager.getCompletionPresetByName(BUILTIN_PRESET_NAME)?.extensions?.tisya_builtin?.revision!==BUILTIN_PRESET_REVISION)fail('原生列表读取未确认新版本');
  if(manager.getSelectedPresetName()===BUILTIN_PRESET_NAME){
   if(isBusy())fail('新预设已保存，但生成正在进行；结束后再更新载入');
   await refresh();
  }
  return {name:BUILTIN_PRESET_NAME,revision:BUILTIN_PRESET_REVISION,status:write?(exists?'updated':'installed'):'refreshed',active:manager.getSelectedPresetName()===BUILTIN_PRESET_NAME};
  function refresh(){
   return new Promise((resolve,reject)=>{
    const binding=context.chatCompletionSettings.bind_preset_to_connection;
    let timer,protectedChange=false;
    const cleanup=()=>{clearTimeout(timer);context.eventSource.removeListener(before,protect);context.eventSource.removeListener(after,done);if(protectedChange){context.chatCompletionSettings.bind_preset_to_connection=binding;const input=document.getElementById('bind_preset_to_connection');if(input)input.checked=!!binding;context.saveSettingsDebounced?.();}};
    const protect=change=>{
     if(change.presetName!==BUILTIN_PRESET_NAME)return;
     protectedChange=true;keepPresetConnection({...change,settings:change.settings??context.chatCompletionSettings});
     // Refresh only the shipped prompt fields, preserving active sampling/API settings.
     for(const key of Object.keys(change.preset))if(!Object.hasOwn(bundled,key)||Object.hasOwn(QUALITY_PRESET_SETTINGS,key))delete change.preset[key];
     change.preset.extensions={...clone(context.chatCompletionSettings.extensions??{}),...clone(bundled.extensions)};
    };
    const done=()=>{if(!protectedChange)return;cleanup();if(manager.getSelectedPresetName()!==BUILTIN_PRESET_NAME)return reject(updateError('Tisya 已保存，但当前选择在刷新时变化；请重新选中 Tisya',true));const mismatch=presetLoadMismatch(context.chatCompletionSettings,next);if(mismatch)return reject(updateError('Tisya 已保存，当前载入校验未通过：'+mismatch,true));resolve();};
    context.eventSource.on(before,protect);context.eventSource.on(after,done);
    timer=setTimeout(()=>{cleanup();reject(updateError('Tisya 已保存，但宿主预设刷新超时',true));},timeout);
    try{manager.selectPreset(manager.findPreset(BUILTIN_PRESET_NAME));}catch(e){cleanup();reject(e);}
   });
  }
 }
}
