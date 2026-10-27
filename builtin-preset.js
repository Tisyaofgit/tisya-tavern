import bundled from './presets/Tisya.json' with {type:'json'};
import {keepPresetConnection} from './preset-connection.js';

export const BUILTIN_PRESET_NAME='Tisya';
export const BUILTIN_PRESET_REVISION=bundled.extensions.tisya_builtin.revision;
const clone=value=>structuredClone(value);
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const fail=message=>{throw Error('Tisya 内置预设同步失败：'+message+'。请完整重启后重试；未使用旧预设冒充更新成功。');};
const inFlight=new WeakMap();

// Save through PresetManager. Its updateList always selects the saved preset;
// register the acknowledged record in its native list without changing selection.
// Verified against TauriTavern a1855be4: preset-manager.js savePreset/getPresetList.
export function installBuiltInPreset(context,document,{isBusy=()=>false,timeout=5000}={}){
 const manager=context.getPresetManager?.('openai');
 if(!manager)return Promise.reject(Error('Tisya 内置预设需要宿主的聊天补全预设接口，请完整重启。'));
 if(inFlight.has(manager))return inFlight.get(manager);
 const operation=install().finally(()=>inFlight.delete(manager));inFlight.set(manager,operation);return operation;
 async function install(){
  for(const key of ['getAllPresets','getCompletionPresetByName','getSelectedPresetName','getPresetList','savePreset','findPreset','selectPreset'])if(typeof manager[key]!=='function')fail('宿主缺少 '+key);
  const exists=manager.getAllPresets().includes(BUILTIN_PRESET_NAME);
  const previous=exists?manager.getCompletionPresetByName(BUILTIN_PRESET_NAME):null;
  if(exists&&!object(previous))fail('已有同名预设无法读取');
  const active=manager.getSelectedPresetName()===BUILTIN_PRESET_NAME;
  if(previous?.extensions?.tisya_builtin?.revision===BUILTIN_PRESET_REVISION&&(!active||context.chatCompletionSettings?.extensions?.tisya_builtin?.revision===BUILTIN_PRESET_REVISION))return {name:BUILTIN_PRESET_NAME,revision:BUILTIN_PRESET_REVISION,status:'current'};
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
  const next={...clone(previous??{}),...clone(bundled),extensions:{...clone(extensions??{}),...clone(bundled.extensions)}};
  await manager.savePreset(BUILTIN_PRESET_NAME,next,{skipUpdate:true});
  // No speculative local mutation precedes the native save acknowledgement.
  const current=manager.getPresetList();
  if(current.presets!==list.presets||current.preset_names!==names)fail('原生保存完成，但预设列表已替换；请重启读取已保存版本');
  const index=Object.hasOwn(names,BUILTIN_PRESET_NAME)?names[BUILTIN_PRESET_NAME]:list.presets.length;
  list.presets[index]=next;names[BUILTIN_PRESET_NAME]=index;
  if(![...select.options].some(option=>option.text===BUILTIN_PRESET_NAME)){
   const selected=select.value,option=document.createElement('option');option.value=String(index);option.textContent=BUILTIN_PRESET_NAME;select.appendChild(option);if(selected)select.value=selected;
  }
  if(manager.getCompletionPresetByName(BUILTIN_PRESET_NAME)?.extensions?.tisya_builtin?.revision!==BUILTIN_PRESET_REVISION)fail('原生列表读取未确认新版本');
  if(manager.getSelectedPresetName()===BUILTIN_PRESET_NAME){
   if(isBusy())fail('新预设已保存，但生成正在进行；请重启后载入');
   await refresh();
  }
  return {name:BUILTIN_PRESET_NAME,revision:BUILTIN_PRESET_REVISION,status:exists?'updated':'installed'};
  function refresh(){
   return new Promise((resolve,reject)=>{
    const binding=context.chatCompletionSettings.bind_preset_to_connection;
    let timer,protectedChange=false;
    const cleanup=()=>{clearTimeout(timer);context.eventSource.removeListener(before,protect);context.eventSource.removeListener(after,done);if(protectedChange){context.chatCompletionSettings.bind_preset_to_connection=binding;const input=document.getElementById('bind_preset_to_connection');if(input)input.checked=!!binding;context.saveSettingsDebounced?.();}};
    const protect=change=>{
     if(change.presetName!==BUILTIN_PRESET_NAME)return;
     protectedChange=true;keepPresetConnection({...change,settings:change.settings??context.chatCompletionSettings});
     // Refresh only the shipped prompt fields, preserving active sampling/API settings.
     for(const key of Object.keys(change.preset))if(!Object.hasOwn(bundled,key))delete change.preset[key];
     change.preset.extensions={...clone(context.chatCompletionSettings.extensions??{}),...clone(bundled.extensions)};
    };
    const done=()=>{cleanup();if(manager.getSelectedPresetName()!==BUILTIN_PRESET_NAME)return reject(Error('Tisya 已保存，但当前选择在刷新时变化；请重新选中 Tisya。'));if(!protectedChange||JSON.stringify(context.chatCompletionSettings.prompts)!==JSON.stringify(bundled.prompts)||JSON.stringify(context.chatCompletionSettings.prompt_order)!==JSON.stringify(bundled.prompt_order))return reject(Error('Tisya 已保存，但宿主尚未载入新版提示词；请完整重启。'));resolve();};
    context.eventSource.on(before,protect);context.eventSource.on(after,done);
    timer=setTimeout(()=>{cleanup();reject(Error('Tisya 已保存，但宿主预设刷新超时；请完整重启。'));},timeout);
    try{manager.selectPreset(manager.findPreset(BUILTIN_PRESET_NAME));}catch(e){cleanup();reject(e);}
   });
  }
 }
}
