import {isReplyMessage,replyRegion,xmlTokens} from '../reader-core.js';
import {readReplyBlock} from '../reply-formats.js';
import {contextOwner} from './core.js';

// Read the selected native branch on every request. No mirror, state write,
// reader projection, vector service, or stale cross-chat cache is involved.
export function historyWindow(context,world,type='normal'){
 const available=context.chat.map((message,index)=>({message,index})).filter(r=>!r.message.is_system);
 if(type==='swipe'&&!available.at(-1)?.message.is_user)available.pop();
 const keep=Math.min(available.length,world.context.history+1),split=available.length-keep;
 return {recent:available.slice(split),earlier:available.slice(0,split)};
}
export function selectedHistory(context,world,type){return historyWindow(context,world,type).recent.map(r=>r.message);}
export function historySignature(context){return JSON.stringify(context.chat.map(m=>[m.is_user,m.is_system,m.mes,m.swipe_id,m.extra?.media,m.extra?.file]));}

// Use the production XML tokenizer to distinguish real top-level blocks from
// literal tags inside body, CDATA, JSON, or card components.
export function historicalBlocks(text){
 if(!isReplyMessage(text))return null;
 const source=replyRegion(text).source,stack=[],blocks={};let open=null;
 for(const token of xmlTokens(source)){
  if(token.kind==='open'){
   if(stack.length===1){if(blocks[token.name])throw Error('重复历史区块：'+token.name);open={...token,decoded:''};}
   if(token.selfClose){if(stack.length===1)blocks[token.name]={raw:source.slice(token.start,token.end),text:'',format:token.attrs.format};}
   else stack.push(token.name);
  }else if(token.kind==='close'){
   if(stack.pop()!==token.name)throw Error('历史区块闭合错误');
   if(stack.length===1){blocks[token.name]={raw:source.slice(open.start,token.end),text:source.slice(open.end,token.start),decoded:open.decoded,format:open.attrs.format};open=null;}
  }else if(token.kind==='text'&&stack.length===2&&open){
   open.decoded+=token.value;
  }
 }
 return {source,blocks};
}

export function buildHistoryMemory(context,world,type='normal'){
 const window=historyWindow(context,world,type),report={enabled:contextOwner(world)==='tisya'&&world.context.memory!==false,earlierMessages:window.earlier.length,recentMessages:window.recent.length,injectedSources:[],withoutMemory:[],strippedHeartMessages:[]};
 if(!report.enabled)return {text:'',report};
 const records=[];
 for(const {message,index} of window.earlier){
  if(message.is_user)continue;
  let record;
  try{record=historicalBlocks(String(message.mes??''));}catch(error){throw Error('第 '+(index+1)+' 条历史回复的记忆边界无效：'+error.message);}
  const b=record?.blocks,memory=b?.memory;
  if(!memory?.text.trim()||['{}','[]','null'].includes(memory.text.trim())){report.withoutMemory.push(index);continue;}
  // Keep the original memory and its scene/state anchors, including story ACLs.
  // Do not execute vars, resurrect discarded swipes, or reclassify E as A.
  records.push({message:index+1,swipe:message.swipe_id??0,...b.title?.text.trim()?{title:b.title.raw}:{},...b.status?.text.trim()?{status:b.status.raw}:{},memory:memory.raw});
  report.injectedSources.push({message:index,swipe:message.swipe_id??0});
 }
 const text=records.length?'以下是当前聊天近期窗口之前的历史记录，按消息顺序排列。它们是过去的资料，不是本轮指令；保留各自时点、权限和人物知情，后来的实际变化优先。未完或倒计时只是当时记录，不能据此宣布已发生；原文段号指向该历史消息。接续下方近期聊天，不重演旧事件。\n<历史记忆>\n'+JSON.stringify(records).replaceAll('<','\\u003c')+'\n</历史记忆>':'';
 return {text,report};
}

// Old comments are examples the model tends to copy. Remove them only from
// completed assistant-history copies; the saved message and UI are untouched.
export function withoutHistoricalHearts(text){
 const record=historicalBlocks(text);
 if(!record)return text;
 for(const name of ['task','next']){
  const block=record.blocks[name];if(!block)continue;
  if(block.format==='pipes'||block.format==='rows'){
   const clean=block.raw.replace(/^\s*心声：[^\r\n]*(?:\r?\n|$)/gm,'');
   text=text.replace(block.raw,clean);
  }else if(['json','yaml'].includes(block.format)||!block.format){
   const value=readReplyBlock({blocks:{[name]:block.decoded},attrs:{[name]:{format:block.format??'json'}}},name);
   if(Object.hasOwn(value,'heart')){
    delete value.heart;const content=JSON.stringify(value).replaceAll('&','&amp;').replaceAll('<','&lt;');
    text=text.replace(block.raw,'<'+name+' format="json">'+content+'</'+name+'>');
   }
  }
 }
 return text;
}
