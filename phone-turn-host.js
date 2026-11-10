import {chatKey,ensureMessages,captureMessages} from './engine/controller.mjs';
import {sha256} from './engine/common.mjs';
import {normalizeEnvelope} from './engine/tags.mjs';
import {extractPhonePayload,findPhoneMarkers} from './phone-protocol.mjs';

export const PHONE_TURN_KEY='缇斯亚手机本轮';
export const PHONE_SOURCE_KEY='缇斯亚手机来源';
const copy=value=>structuredClone(value);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function fail(code,message,details){const error=new Error(message);error.code=code;if(details)error.details=details;throw error;}
function need(ok,code,message){if(!ok)fail(code,message);}
function scope(c){const key=chatKey(c);need(key&&c.chatMetadata&&Array.isArray(c.chat),'PHONE_CONTEXT','请先打开一个完整聊天。');return {key,meta:c.chatMetadata,id:c.chatId,character:c.characterId,group:c.groupId};}
function matches(c,s){return chatKey(c)===s.key&&c.chatMetadata===s.meta;}
export function phoneSource(message,raw=String(message?.mes??'')){
 const uid=message?.extra?.tisya_engine?.uid;
 need(typeof uid==='string'&&uid,'PHONE_MESSAGE_ID','手机来源尚未绑定稳定消息 ID。');
 const candidate=sha256(raw);
 return {sourceId:uid+':'+candidate,uid,candidate,raw};
}
export function readPhoneRequestId(raw){
 return extractPhonePayload(normalizeEnvelope(String(raw??'')))?.requestId??null;
}

function selectedPhoneSources(c,state){
 const messages=captureMessages(c),sources=[];let user=null;
 for(const m of messages){
  if(m.role==='user'){user=c.chat.find(x=>x?.extra?.tisya_engine?.uid===m.uid);continue;}
  if(m.role!=='assistant')continue;
  const candidate=sha256(m.text),sourceId=m.uid+':'+candidate;
  if(state?.rejectedSources?.[sourceId])continue;
  let requestId;
  try{requestId=readPhoneRequestId(m.text);if(requestId)need(user?.extra?.[PHONE_TURN_KEY]?.requests?.some(r=>r.requestId===requestId),'PHONE_SOURCE_OWNERSHIP','手机回复未找到对应用户回合的归属记录；原状态已保留。');}catch(error){error.phoneReplyInvalid=true;error.phoneRejectedSource={sourceId,uid:m.uid,candidate,raw:m.text};throw error;}
  sources.push({sourceId,uid:m.uid,candidate,raw:normalizeEnvelope(m.text),requestId});
 }
 return sources;
}

export function createPhoneTurnHost({getContext,persistMetadata,phoneService,isGenerating=()=>null,onChange=()=>{},onError=()=>{}}){
 let active=null,alive=true,epoch=0,reconcileTail=Promise.resolve();
 const service=async c=>{need(alive,'PHONE_DISPOSED','手机入口已经关闭。');return typeof phoneService==='function'?await phoneService(c??getContext()):phoneService;};
 function valid(run){need(alive&&active===run&&run.epoch===epoch&&matches(getContext(),run.scope),'PHONE_CONTEXT_CHANGED','手机本轮所属聊天已变化，未使用过期请求。');}
 async function identities(c){if(ensureMessages(c)){need(typeof c.saveChat==='function','PHONE_MESSAGE_SAVE','宿主缺少消息身份保存接口。');need(await c.saveChat()!==false,'PHONE_MESSAGE_SAVE','宿主没有确认消息身份保存。');}}
 const selectedSources=(c,svc)=>selectedPhoneSources(c,svc.getState());
 async function synchronize(){
  const c=getContext(),s=scope(c),svc=await service(c);if(!svc)return null;
  await identities(c);need(matches(getContext(),s),'PHONE_CONTEXT_CHANGED','聊天在读取手机历史时已切换。');
  const sources=selectedSources(c,svc),stamp=JSON.stringify(sources),result=await svc.reconcile({chatKey:s.key,sources});
  need(matches(getContext(),s)&&JSON.stringify(selectedSources(getContext(),svc))===stamp,'PHONE_HISTORY_CHANGED','手机历史在同步期间已变化，请重新打开。');onChange();return result;
 }
 function reconcile(){const work=reconcileTail.catch(()=>{}).then(synchronize);reconcileTail=work;return work;}
 async function begin(type='normal',options={},dryRun=false){
  if(dryRun||options?.dryRun||['quiet','impersonate'].includes(type))return;
  need(!active,'PHONE_TURN_BUSY','上一轮手机请求尚未结束。');
  const c=getContext(),s=scope(c),run={scope:s,type,epoch,request:null,bound:false};active=run;
  try{
   const svc=await service(c);valid(run);if(!svc){active=null;return;}run.service=svc;
   await identities(c);valid(run);await reconcile();valid(run);
   const lastUser=c.chat.findLast(m=>m?.is_user&&!m.is_system),lastAssistant=c.chat.findLast(m=>m&&!m.is_user&&!m.is_system);
   const rejected=lastAssistant?svc.getState().rejectedSources?.[phoneSource(lastAssistant).sourceId]:null;
   const replay=['swipe','regenerate','continue'].includes(type)?rejected?.requestId??readPhoneRequestId(lastAssistant?.mes):null;
   const prepared=await svc.prepareTurn({chatKey:s.key,anchorUid:lastUser?.extra?.tisya_engine?.uid??null,type,...(replay?{replayRequestId:replay}:{})});run.request=prepared?copy(prepared):null;valid(run);
   if(!prepared||!prepared.messages?.length){active=null;return;}
   need(typeof prepared.requestId==='string'&&prepared.requestId&&Array.isArray(prepared.messages)&&prepared.messages.every(m=>['system','user','assistant'].includes(m.role)&&typeof m.content==='string'),'PHONE_TURN_INVALID','手机本轮提示词格式无效。');
   run.request=copy(prepared);run.promptSignature=sha256(JSON.stringify(prepared.messages));
   run.prefix=captureMessages(c);run.latestUser=lastUser;run.latestUserText=lastUser?.mes;run.initialLength=c.chat.length;
   onChange();return copy(prepared);
  }catch(error){
   if(active===run)active=null;
   // A stop can arrive while the metadata save inside prepareTurn is pending.
   // Once it settles we know its request identity and can release only that
   // captured request. A different chat is never written through the old scope.
   if(run.request?.requestId&&matches(getContext(),s))try{await run.service?.failTurn({requestId:run.request.requestId,error:{code:error.code??'PHONE_PREPARE_FAILED',message:error.message}});}catch(saveError){onError(saveError);}
   throw error;
  }
 }
 async function directions({prepare=false}={}){
  const run=active;if(!run?.request)return [];valid(run);
  const c=getContext();
  if(prepare)return copy(run.request.messages);
  const user=c.chat.findLast(m=>m?.is_user&&!m.is_system);
  need(user,'PHONE_TURN_USER','手机操作尚未绑定到这一轮用户消息。');
  if(run.bound){need(user===run.boundUser&&user.mes===run.boundText,'PHONE_TURN_CHANGED','本轮用户消息已经改变，请重新生成。');return copy(run.request.messages);}
  await identities(c);valid(run);
  // Existing source rows must remain unchanged. A new user row and the empty
  // assistant placeholder may have been appended by the native send pipeline.
  const prefix=captureMessages(c).slice(0,run.initialLength);
  if(!['swipe','regenerate','continue'].includes(run.type))need(same(prefix,run.prefix),'PHONE_HISTORY_CHANGED','本轮之前的聊天已经改变，未发送手机操作。');
  else need(user===run.latestUser&&user.mes===run.latestUserText,'PHONE_TURN_CHANGED','重生成对应的用户消息已经改变。');
  const before=user.extra,prior=before?.[PHONE_TURN_KEY];
  need(prior===undefined||prior?.format==='tisya.phone-turn-bindings/1'&&Array.isArray(prior.requests),'PHONE_BINDING_INVALID','用户消息的手机归属记录损坏，未覆盖。');
  const binding={requestId:run.request.requestId,promptSignature:run.promptSignature};
  const existing=prior?.requests.find(x=>x.requestId===binding.requestId);
  need(!existing||same(existing,binding),'PHONE_BINDING_CONFLICT','同一手机请求对应了不同提示词，未覆盖。');
  if(!existing){
   const next={...before,[PHONE_TURN_KEY]:{format:'tisya.phone-turn-bindings/1',requests:[...(prior?.requests??[]),binding]}};user.extra=next;
   try{need(await c.saveChat()!==false,'PHONE_BINDING_SAVE','宿主没有确认手机本轮归属保存。');valid(run);need(c.chat.includes(user),'PHONE_TURN_CHANGED','本轮用户消息已不存在。');}
   catch(error){if(user.extra===next)user.extra=before;throw error;}
  }
  run.bound=true;run.boundUser=user;run.boundText=user.mes;return copy(run.request.messages);
 }
 async function finished({accepted=true}={}){
  const run=active;if(!run)return;let receiving=null,checkingReply=false;
  try{
   valid(run);if(!accepted||!run.bound){await run.service?.failTurn({requestId:run.request?.requestId,error:{code:'PHONE_TURN_NOT_ACCEPTED',message:'正文请求没有完成，手机待发操作保留。'}});return;}
   const c=getContext();await identities(c);valid(run);
   checkingReply=true;const selected=selectedSources(c,run.service),last=selected.at(-1);receiving=last;
   if(last?.requestId===run.request.requestId){
    const result=await run.service.acceptTurn({...last,chatKey:run.scope.key});checkingReply=false;valid(run);
    const message=c.chat.find(m=>m?.extra?.tisya_engine?.uid===last.uid);
    if(message&&sha256(String(message.mes??''))===last.candidate){
     const before=message.extra,next={...before,[PHONE_SOURCE_KEY]:{format:'tisya.phone-source/1',requestId:last.requestId,sourceId:last.sourceId,candidate:last.candidate}};message.extra=next;
     try{need(await c.saveChat()!==false,'PHONE_SOURCE_SAVE','手机已接纳，但宿主没有确认来源索引保存。');}catch(error){if(message.extra===next)message.extra=before;throw error;}
    }
    await run.service.reconcile({chatKey:run.scope.key,sources:selected});onChange();return result;
   }
   // A pending candidate intentionally exposes its earlier accepted source.
   // Reconciliation will settle a later explicit candidate adoption.
   await run.service.reconcile({chatKey:run.scope.key,sources:selected});
   await run.service.failTurn({requestId:run.request.requestId,error:{code:'PHONE_REPLY_MISSING',message:'正文已保留；本轮没有可接纳的手机扩展，待发操作仍保留。'}});
  }catch(error){onError(error);try{const rejected=error.phoneRejectedSource??receiving,last=captureMessages(getContext()).filter(m=>m.role==='assistant').at(-1),lastSource=last?last.uid+':'+sha256(last.text):null;if(checkingReply&&error.phoneReplyInvalid&&rejected?.sourceId===lastSource&&run.bound&&matches(getContext(),run.scope)&&!run.service.getState().frames[rejected.sourceId])await run.service.rejectSource({...rejected,raw:last.text,requestId:run.request.requestId,error});await run.service?.failTurn({requestId:run.request?.requestId,error:{code:error.code??'PHONE_ACCEPT_FAILED',message:error.message}});}catch(saveError){onError(saveError);}return {failed:true,error:{code:error.code,message:error.message}};
  }finally{if(active===run)active=null;onChange();}
 }
 async function stopped(){const run=active;active=null;epoch++;if(run?.request)await run.service.failTurn({requestId:run.request.requestId,error:{code:'PHONE_TURN_STOPPED',message:'本轮生成已停止；手机操作保留，未消费未完成回复。'}});onChange();}
 function contextChanged(){active=null;epoch++;onChange();}
 async function recoverPending({confirmedEnded=false}={}){
  need(confirmedEnded===true,'PHONE_RECOVERY_CONFIRM','请先确认上一轮生成已经结束。');
  need(!active&&isGenerating()===false,'PHONE_RECOVERY_BUSY','请先停止并等待原生生成结束，再恢复手机待发操作。');
  const c=getContext(),owner=scope(c),svc=await service(c);await reconcile();
  need(matches(getContext(),owner)&&!active&&isGenerating()===false,'PHONE_CONTEXT_CHANGED','聊天或生成状态已经变化，未恢复旧请求。');
  const requests=Object.values(svc.getState().requests).filter(r=>r.status==='prepared');
  for(const request of requests){need(matches(getContext(),owner)&&!active&&isGenerating()===false,'PHONE_CONTEXT_CHANGED','恢复期间聊天或生成状态已经变化。');await svc.failTurn({requestId:request.requestId,error:{code:'PHONE_RECOVERED',message:'用户确认上一轮已结束，尚未接纳的手机操作恢复待发。'}});}
  onChange();return {recovered:requests.length};
 }
 return {begin,directions,finished,stopped,contextChanged,reconcile,recoverPending,service,source:phoneSource,
  async snapshot(sourceId){const svc=await service(getContext());return svc?svc.snapshot(sourceId):null;},
  state:()=>({active:!!active,requestId:active?.request?.requestId??null,epoch,alive}),
  dispose(){alive=false;active=null;epoch++;},
 };
}

// DOM presentation is read-only. Frames consume immutable snapshots through
// the parent's phone facade; re-rendering never dispatches or accepts a turn.
export function mountPhoneMarkers(document,body,message,{phoneUrl,contextKey=document.defaultView?.Tisya?.phone?.contextKey?.(),onError=()=>{}}){
 const source=phoneSource(message),created=[];
 const excluded='pre,code,script,style,textarea,input,button,a,iframe,[data-tisya-phone-marker]';
 const blocks='p,li,dt,dd,h1,h2,h3,h4,h5,h6,td,th,blockquote,section,article,div';
 const walker=document.createTreeWalker(body,document.defaultView.NodeFilter.SHOW_TEXT),groups=[];let group=null;
 // The established prose formatter wraps punctuation (including the colon) in
 // inline spans. Read consecutive safe text nodes within one paragraph as a
 // single logical string; never cross a block or a code/link/interactive node.
 for(let node=walker.nextNode();node;node=walker.nextNode()){
  if(node.parentElement?.closest(excluded)){group=null;continue;}
  const block=node.parentElement?.closest(blocks)??body;
  if(!group||group.block!==block){group={block,text:'',nodes:[]};groups.push(group);}
  const start=group.text.length;group.text+=node.nodeValue;group.nodes.push({node,start,end:group.text.length});
 }
 function frameFor(id){
  const shell=document.createElement('span'),frame=document.createElement('iframe');shell.dataset.tisyaPhoneMarker=id;shell.className='tisya-phone-snapshot';
  const url=new URL(phoneUrl,document.baseURI);need(url.origin===new URL(document.baseURI).origin,'PHONE_FRAME_ORIGIN','手机定格页面须与宿主同源。');need(typeof contextKey==='string'&&contextKey,'PHONE_FRAME_CONTEXT','手机定格页面尚未取得聊天归属。');url.searchParams.set('chat',contextKey);url.searchParams.set('frozen',source.sourceId);url.searchParams.set('marker',id);
  frame.src=url.href;frame.title='当时的手机 · '+id;frame.loading='lazy';frame.setAttribute('sandbox','allow-scripts allow-same-origin');
  frame.style.cssText='display:block;width:100%;height:360px;border:0;border-radius:14px;background:#f5f5f1;';shell.style.cssText='display:block;width:100%;max-width:430px;margin:14px auto;';shell.append(frame);created.push(shell);return shell;
 }
 for(const part of groups){
  for(const match of findPhoneMarkers(part.text).reverse()){
   const first=part.nodes.find(row=>row.start<=match.start&&row.end>match.start),last=part.nodes.find(row=>row.start<match.end&&row.end>=match.end);
   if(!first||!last)continue;const shell=frameFor(match.id),from=match.start-first.start,to=match.end-last.start;
   if(first.node===last.node){const suffix=first.node.nodeValue.slice(to);first.node.nodeValue=first.node.nodeValue.slice(0,from);first.node.after(shell,document.createTextNode(suffix));}
   else{const range=document.createRange();need(typeof range.setStart==='function'&&typeof range.setEnd==='function','PHONE_FRAME_DOM','当前浏览器不支持跨行内排版的手机标记。');range.setStart(first.node,from);range.setEnd(last.node,to);range.deleteContents();range.insertNode(shell);range.detach?.();}
  }
 }
 return {dispose(){for(const node of created)node.remove();}};
}
