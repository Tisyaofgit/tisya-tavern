'use strict';
const {inspectStaticDisplay,mountStaticDisplay}=require('./static-display.cjs');
const {CARD_MOTION_CSS,validCardFolds}=require('./display-card-state.cjs');
const {observeDisplaySize}=require('./display-size.cjs');
const {inspectCardPanel}=require('./card-panel-profile.cjs');
const {cardPanelRuntime}=require('./card-panel-runtime.cjs');
const {inspectMvuPanel}=require('./mvu-panel-profile.cjs');
const {mvuPanelRuntime}=require('./mvu-panel-runtime.cjs');
const escape=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const fault=(code,details)=>Object.assign(new Error(code),{code,details});

// One authored HTML document per iframe. Joining two HTML documents destroys
// their styles/IDs and rerunning all scripts in the host would grant API access.
function splitDisplayDocuments(html){
 if(typeof html!=='string'||html.length>2000000)throw fault('TISYA_DISPLAY_SIZE');
 const lines=html.match(/[^\n]*\n|[^\n]+$/g)||[],parts=[];let plain='',fence=null,body='';
 const flush=()=>{if(plain.trim())parts.push({kind:'fragment',html:plain});plain='';};
 for(const line of lines){
  const start=/^ {0,3}(`{3,}|~{3,})([^\r\n]*)\r?\n?$/.exec(line);
  if(!fence){
   if(!start){plain+=line;continue;}
   fence={mark:start[1][0],length:start[1].length,info:start[2].trim().toLowerCase()};body='';continue;
  }
  if(start&&start[1][0]===fence.mark&&start[1].length>=fence.length&&!start[2].trim()){
   const isHTML=['html','htm'].includes(fence.info)||(!fence.info&&/^\s*(?:<!doctype\s+html\b|<html\b)/i.test(body));
   if(isHTML){flush();parts.push({kind:'document',html:body});}
   else plain+='<pre><code>'+escape(body)+'</code></pre>';
   fence=null;body='';
  }else body+=line;
 }
 if(fence)throw fault('TISYA_DISPLAY_FENCE_INCOMPLETE');
 flush();if(parts.length>32)throw fault('TISYA_DISPLAY_DOCUMENT_LIMIT');
 return parts;
}

function inspectDisplayDocuments(document,html){
 return splitDisplayDocuments(html).map(part=>{
  const adapted=inspectCardPanel(document,part.html)||inspectMvuPanel(document,part.html);if(adapted)return {...part,...adapted,runtime:adapted.profile.kind==='mvu-readonly'?'mvu-readonly':'registered-panel'};
  if(part.kind==='fragment'){
   try{inspectStaticDisplay(document,part.html);return {...part,runtime:'static'};}
   catch(e){if(!['CARD_EXECUTION_ENVIRONMENT_REQUIRED','EXTERNAL_RESOURCE_DISPLAY_UNSUPPORTED'].includes(e.message))throw e;}
  }
  const t=document.createElement('template');t.innerHTML=part.html;
  // Remote libraries, EJS and host APIs require their own compatibility layer.
  // This display realm only supports authored DOM/CSS and inline JavaScript.
  if(t.content.querySelector('script[src]'))throw fault('CARD_EXTERNAL_SCRIPT_UNSUPPORTED');
  if(/<%/.test(part.html))throw fault('TEMPLATE_RUNTIME_REQUIRED');
  return {...part,runtime:'isolated-dom'};
 });
}

// Runs in an opaque-origin iframe. The parent accepts size/readiness/folds/errors
// only; no message, variable, input, model, storage or arbitrary API bridge.
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
  sizing=observeSize(document,height=>post('size',{height}),sendError);
  document.addEventListener('toggle',sendState,true);
  sendState();parent.postMessage({tisyaCard:token,type:'ready'},'*',[controlChannel.port2]);
  if(profile)panelRuntime(profile,rpc);
 },{once:true});
}

function cardDocumentSource(html,token,profile=null){
 const policy="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline' https: data:; img-src https: data: blob:; font-src https: data: blob:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"+(profile?.kind==='opening'?'; media-src https:':'');
 const data=JSON.stringify(profile).replace(/</g,'\\u003c');
 const particles=profile?.kind==='opening'?'<script>'+require('../vendor/runtime/particles-source.cjs')+'</script>':'';
 const libraries=profile?.kind==='mvu-readonly'?(profile.libraries??[]).map(name=>'<script>'+(name==='jquery'?require('../vendor/runtime/jquery-source.cjs'):require('../vendor/runtime/lodash-source.cjs')).replace(/<\/script/gi,'<\\/script')+'</script>').join(''):'';
 const runtime=profile?.kind==='mvu-readonly'?mvuPanelRuntime:cardPanelRuntime;
 const head='<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="'+policy+'"><style>html{background:transparent;color-scheme:dark}body{display:flow-root;margin:0;overflow-wrap:anywhere}img{max-width:100%}'+CARD_MOTION_CSS+'</style>'+particles+libraries+'<script>('+cardBootstrap.toString()+')('+JSON.stringify(token)+','+observeDisplaySize.toString()+','+(profile?runtime.toString():'null')+','+data+');</script>';
 // Put CSP/bootstrap before any authored script, without rewriting its body.
 const h=/^\s*(?:<!doctype[^>]*>\s*)?<html\b[^>]*>\s*(?:<head\b[^>]*>)?/i.exec(html);
 if(h){const hasHead=/<head\b/i.test(h[0]);return html.slice(0,h[0].length)+(hasHead?head:'<head>'+head+'</head>')+html.slice(h[0].length);}
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

function mountDisplayDocuments(options){
 const {container,html,label}=options,parts=inspectDisplayDocuments(container.ownerDocument,html);
 if(parts.length===1&&parts[0].runtime==='static')return mountStaticDisplay({...options,html:parts[0].html});
 const children=[];container.replaceChildren();
 try{
  for(const [i,part]of parts.entries()){
   const section=container.ownerDocument.createElement('div');section.dataset.tisyaDisplayDocument=String(i);container.append(section);
   const p={...options,container:section,html:part.html,profile:part.profile??null,label:label+' '+(i+1)};
   children.push(part.runtime==='static'?mountStaticDisplay(p):mountIsolatedCard(p));
  }
 }catch(e){children.forEach(c=>c.dispose());throw e;}
 const ready=Promise.all(children.map(c=>c.ready));ready.catch(()=>{});
 // Source matching prevents a depth change from transferring one card's folds
 // to a different document that happens to occupy the same array position.
 return {ready,captureState:()=>({documents:children.map((c,i)=>({source:parts[i].html,state:c.captureState()}))}),restoreState(state){if(!Array.isArray(state?.documents))return;const used=new Set();children.forEach((c,i)=>{const at=state.documents.findIndex((row,j)=>!used.has(j)&&row?.source===parts[i].html);if(at>=0){used.add(at);c.restoreState(state.documents[at].state);}});},setPaused(value){children.forEach(c=>c.setPaused(value));},report:()=>({documents:parts.map(p=>p.runtime)}),dispose(){children.forEach(c=>c.dispose());container.replaceChildren();}};
}
module.exports={splitDisplayDocuments,inspectDisplayDocuments,cardDocumentSource,mountDisplayDocuments};
