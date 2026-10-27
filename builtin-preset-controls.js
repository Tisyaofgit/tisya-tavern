import {installBuiltInPreset,BUILTIN_PRESET_NAME,BUILTIN_PRESET_REVISION} from './builtin-preset.js';
import {presetLoadMismatch} from './preset-load-check.js';
import bundled from './presets/Tisya.json' with {type:'json'};

export function createPresetUpdateController({getContext,document,isBusy,install=installBuiltInPreset}){
 let receipt=null,error=null,pending=null;
 const listeners=new Set(),state=()=>({receipt,error,busy:!!pending}),notify=()=>{for(const fn of listeners)fn(state());};
 function update({force=false}={}){
  if(pending)return pending;
  pending=Promise.resolve().then(()=>install(getContext(),document,{isBusy,force})).then(value=>{receipt=value;error=null;return value;},failure=>{error=failure;throw failure;}).finally(()=>{pending=null;notify();});
  notify();return pending;
 }
 return {state,update,subscribe(fn){listeners.add(fn);fn(state());return ()=>listeners.delete(fn);},assertReady(){
  const context=getContext();if(context.getPresetManager?.('openai')?.getSelectedPresetName?.()!==BUILTIN_PRESET_NAME)return;
  if(pending)throw Error('Tisya 预设正在更新，请稍后发送');
  if(error?.tisyaPresetSaved&&!presetLoadMismatch(context.chatCompletionSettings,bundled)){error=null;receipt={name:BUILTIN_PRESET_NAME,revision:BUILTIN_PRESET_REVISION,status:'refreshed',active:true};notify();}
  if(error)throw error;
 }};
}

export function presetUpdateMessage({receipt,error,busy}){
 if(busy)return '正在更新并核对载入结果…';
 if(error)return String(error.message??error);
 if(receipt)return receipt.active===false?'Tisya 预设已更新；当前使用的其他预设保持选中。':'Tisya 预设已就绪。';
 return '将内置新版提示词写入同名 Tisya，并刷新当前载入。';
}

export function mountPresetUpdateControl(container,controller,{onError=()=>{},onOpenPresets}={}){
 const document=container.ownerDocument,section=document.createElement('section'),status=document.createElement('p'),note=document.createElement('small'),button=document.createElement('button');
 section.className='tisya-preset-update';section.style.cssText='margin:12px 0;padding:14px;border:1px solid #b7a46f66;border-radius:10px;background:#061b14;color:#e2ddc8;';
 status.setAttribute('role','status');status.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;margin:0 0 10px';
 note.textContent='覆盖 Tisya 的提示词手改；保留连接、模型、聊天和其他预设。';note.style.cssText='display:block;opacity:.8;margin-bottom:10px';
 button.type='button';button.textContent='更新 Tisya 预设';button.style.cssText='min-height:44px;white-space:normal;font:inherit';
 const retry=()=>controller.update({force:true}).catch(onError);button.addEventListener('click',retry);section.append(status,note,button);
 if(onOpenPresets){const open=document.createElement('button');open.type='button';open.textContent='打开预设管理';open.style.cssText='min-height:44px;white-space:normal;font:inherit';open.onclick=onOpenPresets;section.append(open);}
 container.prepend(section);
 const unsubscribe=controller.subscribe(value=>{status.textContent=presetUpdateMessage(value);button.disabled=value.busy;button.textContent=value.busy?'正在更新…':'更新 Tisya 预设';});
 return {dispose(){unsubscribe();button.removeEventListener('click',retry);section.remove();}};
}

export function showPresetUpdateError(document,toastr,error,retry){
 const toast=toastr?.error(String(error.message??error),'Tisya 预设待更新',{timeOut:0,extendedTimeOut:0,closeButton:true,escapeHtml:true});
 const node=toast?.[0]??toast;
 if(node?.appendChild){
  const button=document.createElement('button');button.type='button';button.textContent='更新 Tisya 预设';button.style.cssText='display:block;min-height:44px;margin-top:8px;font:inherit';
  button.onclick=async event=>{event.stopPropagation();button.disabled=true;button.textContent='正在更新…';try{await retry();toastr?.clear?.(toast);node.remove();}catch(failure){const message=node.querySelector('.toast-message');if(message)message.textContent=String(failure.message??failure);button.disabled=false;button.textContent='重试更新 Tisya 预设';}};
  node.appendChild(button);
 }
 return toast;
}
