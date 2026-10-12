// Generated from verified r243 card-display.cjs with a display-only document adapter.
import {observeDisplaySize,CARD_MOTION_CSS} from './visual-core.js';
const fault=(code,details)=>Object.assign(new Error(code),{code,details});
const validCardFolds=v=>Array.isArray(v)&&v.length<=2048&&v.every(x=>typeof x==='boolean');
function cardBootstrap(token,observeSize,panelRuntime,profile){
 const post=(type,value)=>parent.postMessage({tisyaCard:token,type,...value},'*');
 const controlChannel=new MessageChannel();
 let failed=false,loaded=false,appliedRevision=0,sizing=null,rpcId=0;const calls=new Map();
 function rpc(method,payload){return new Promise((resolve,reject)=>{const id=++rpcId,timer=setTimeout(()=>{calls.delete(id);reject({code:'TISYA_PANEL_TIMEOUT'});},30000);calls.set(id,{resolve,reject,timer});controlChannel.port1.postMessage({tisyaCard:token,type:'panel',id,method,payload});});}
 const sendError=event=>{failed=true;post('error',{code:'CARD_SCRIPT_ERROR',message:String(event.message||event.reason?.message||event.reason||'script failed').slice(0,240)});};
 addEventListener('error',event=>{if(event.target===window)sendError(event);});
 addEventListener('unhandledrejection',sendError);
 const resize=()=>sizing?.refresh();
 const sendState=()=>post('state',{revision:appliedRevision,details:[...document.querySelectorAll('details')].slice(0,2048).map(n=>n.open)});
 controlChannel.port1.onmessage=event=>{
  const d=event.data;if(!d||d.tisyaCard!==token)return;
  if(d.type==='panel-result'){const c=calls.get(d.id);if(c){calls.delete(d.id);clearTimeout(c.timer);if(d.error)c.reject(d.error);else c.resolve(d.value);}return;}if(d.type!=='control')return;
  if(typeof d.paused==='boolean')document.documentElement.toggleAttribute('data-tisya-card-paused',d.paused);
  if(loaded&&Number.isSafeInteger(d.revision)&&d.revision>=appliedRevision&&Array.isArray(d.details)&&d.details.length<=2048&&d.details.every(v=>typeof v==='boolean')){
   if(d.revision>appliedRevision){appliedRevision=d.revision;[...document.querySelectorAll('details')].forEach((n,i)=>{if(i<d.details.length&&n.open!==d.details[i])n.open=d.details[i];});}sendState();resize();
  }
 };
 addEventListener('DOMContentLoaded',()=>{
  if(failed)return;
  loaded=true;

 const settle=()=>{
  if(!document.documentElement.hasAttribute('data-tisya-card-paused')&&!matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  for(const animation of document.getAnimations()){
   const end=animation.effect?.getComputedTiming().endTime;
   if(Number.isFinite(end)&&animation.playState!=='finished'&&animation.playState!=='idle')animation.currentTime=end;
  }
 };
 const motionObserver=new MutationObserver(settle);
 motionObserver.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class','style','hidden','data-tisya-card-paused']});
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');reduced.addEventListener('change',settle);
 document.addEventListener('animationstart',settle,true);settle();

  sizing=observeSize(document,height=>post('size',{height}),sendError);
  document.addEventListener('toggle',sendState,true);
  sendState();parent.postMessage({tisyaCard:token,type:'ready'},'*',[controlChannel.port2]);
  if(profile)panelRuntime(profile,rpc);
 },{once:true});
}

function cardDocumentSource(html,token){
 const policy="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline' https: data:; img-src https: data: blob:; font-src https: data: blob:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
 const head='<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="'+policy+'"><style>html{background:transparent;color-scheme:dark}body{display:flow-root;margin:0;overflow-wrap:anywhere;color:#dce5d4;font:16px/1.8 serif}*,*::before,*::after{box-sizing:border-box}input,select,textarea{min-width:0;max-width:100%}img{max-width:100%}'+CARD_MOTION_CSS+'</style><script>('+cardBootstrap.toString()+')('+JSON.stringify(token)+','+observeDisplaySize.toString()+',null,null);<'+ '/script>';
 const h=/^\s*(?:<!doctype[^>]*>\s*)?<html\b[^>]*>\s*(?:<head\b[^>]*>)?/i.exec(html);
 if(h)return html.slice(0,h[0].length)+(/<head\b/i.test(h[0])?head:'<head>'+head+'</head>')+html.slice(h[0].length);
 return '<!doctype html><html><head>'+head+'</head><body>'+html+'</body></html>';
}
function mountIsolatedCard({container,html,label,profile=null,cardBridge,onError=()=>{}}){
 const doc=container.ownerDocument,win=doc.defaultView,frame=doc.createElement('iframe');
 const token=Array.from(win.crypto.getRandomValues(new Uint32Array(4)),n=>n.toString(16).padStart(8,'0')).join('');frame.title=label;frame.dataset.tisyaCardDisplay='';frame.dataset.tisyaCardRuntime='isolated-dom';
 frame.setAttribute('sandbox','allow-scripts');frame.referrerPolicy='no-referrer';
 frame.style.cssText='display:block;width:100%;max-width:100%;height:1px;border:0;background:transparent;box-sizing:border-box';
 let alive=true,settled=false,loaded=false,paused=false,details=[],pendingFolds=null,restoreRevision=0,controlPort=null,timer,resolveReady,rejectReady;
 let readBusy=false,actionBusy=false;
 async function panelRequest(event){const d=event.data;if(!alive||!profile||!d||d.tisyaCard!==token||d.type!=='panel'||!Number.isSafeInteger(d.id))return;let value,error,acquired=false;const action=d.method==='action';
  try{if(!['read','action',...(profile.kind==='mvu-readonly'?['worldbook']:[])].includes(d.method)||!cardBridge)throw fault('TISYA_PANEL_UNAVAILABLE');if(action&&(paused||profile.kind==='mvu-readonly'))throw fault('TISYA_PANEL_READ_ONLY');if(action?actionBusy:readBusy)throw fault('TISYA_PANEL_BUSY');if(action)actionBusy=true;else readBusy=true;acquired=true;value=await cardBridge(profile,d.method,d.payload);}
  catch(e){error={code:e.code||e.message};}finally{if(acquired){if(action)actionBusy=false;else readBusy=false;}}
  if(alive)controlPort.postMessage({tisyaCard:token,type:'panel-result',id:d.id,...(error?{error}:{value})});
 }
 // The function may run in Tavo's sibling message iframe. A transferred port
 // binds this card without mistaking the function realm for the DOM parent.
 const control=()=>{if(alive&&loaded)controlPort.postMessage({tisyaCard:token,type:'control',paused,...(pendingFolds?{details:pendingFolds,revision:restoreRevision}:{})});};
 const ready=new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;});ready.catch(()=>{});
 function failure(error){if(!alive)return;if(!settled){settled=true;clearTimeout(timer);rejectReady(error);}else onError(error);}
 function receive(event){
  const d=event.data;if(!alive||event.source!==frame.contentWindow||!d||d.tisyaCard!==token)return;
  if(d.type==='size'){
   if(!Number.isFinite(d.height)||d.height<0||d.height>200000){failure(fault('TISYA_CARD_FRAME_SIZE'));return;}
   const height=Math.max(1,Math.ceil(d.height))+'px';if(frame.style.height!==height)frame.style.height=height;
  }else if(d.type==='ready'){
   if(loaded)return;if(event.ports.length!==1){failure(fault('TISYA_CARD_CONTROL_PORT'));return;}controlPort=event.ports[0];
   loaded=true;controlPort.onmessage=panelRequest;control();
   if(!settled){settled=true;clearTimeout(timer);resolveReady();}
  }else if(d.type==='state'&&d.revision===restoreRevision&&validCardFolds(d.details)){details=[...d.details];pendingFolds=null;}
  else if(d.type==='error')failure(fault('CARD_SCRIPT_ERROR',{message:typeof d.message==='string'?d.message.slice(0,240):'script failed'}));
 }
 win.addEventListener('message',receive);timer=setTimeout(()=>failure(fault('TISYA_CARD_FRAME_TIMEOUT')),15000);
 frame.srcdoc=cardDocumentSource(html,token,profile);container.replaceChildren(frame);
 return {frame,ready,captureState:()=>({details:[...(pendingFolds||details)]}),restoreState(state){if(validCardFolds(state?.details)){restoreRevision++;pendingFolds=[...state.details];details=[...state.details];control();}},setPaused(value){paused=value===true;control();},report:()=>({runtime:'isolated-dom',hostAPIs:false}),dispose(){if(!alive)return;alive=false;clearTimeout(timer);win.removeEventListener('message',receive);controlPort?.close();frame.remove();if(!settled){settled=true;rejectReady(fault('TISYA_DISPLAY_CANCELLED'));}}};
}

export {mountIsolatedCard};
