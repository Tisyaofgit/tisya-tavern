import {envelopeTags} from './engine/tags.mjs';
import {formatProse,proseStyles} from './prose.js';
import {projectRendering} from './rendering-resources.js';

const escape=text=>text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export function streamingMessageSource(context,node,message){
 const p=context.streamingProcessor,id=Number(node.getAttribute('mesid'));
 if(!p||p.isFinished||p.isStopped||p.messageId!==id||context.chat?.[id]!==message||(p.messageDom?.[0]??p.messageDom)!==node||typeof p.result!=='string')return message.mes;
 return p.result;
}
// Walk only envelope-level blocks. Text resembling a body inside task/vars or
// another machine block never becomes public prose. Incomplete tags stay hidden.
export function readStreamingReply(source){
 const tags=envelopeTags(source);if(!tags)return null;
 const open=new RegExp('^\\s*<'+escape(tags.reply)+'(?=[\\s>])[^>]*>','i').exec(source);if(!open)return null;
 const inverse=Object.fromEntries(Object.entries(tags).map(([k,v])=>[v.toLowerCase(),k]));
 let at=open[0].length,title='',body=null,bodyClosed=false;const seen=new Set();
 while(at<source.length){
  const m=/^\s*<([_A-Za-z][\w.-]*)(?=[\s/>])([^>]*?)(\/?)>/.exec(source.slice(at));if(!m)break;
  const key=inverse[m[1].toLowerCase()];if(!key||key==='reply'||seen.has(key)&&key!=='anchor')break;seen.add(key);at+=m[0].length;
  if(m[3])continue;
  const close=new RegExp('</'+escape(m[1])+'\\s*>','ig');close.lastIndex=at;const end=close.exec(source);
  if(key==='body'){
   body=source.slice(at,end?end.index:source.length);bodyClosed=!!end;
   if(!end){body=body.replace(/<[^>]*$/,'').replace(/@rendering\{[^}]*$/,'');}
   break;
  }
  if(!end)break;
  if(key==='title')title=source.slice(at,end.index).split('|')[0].trim();
  at=close.lastIndex;
 }
 return {title,body,bodyClosed};
}

function rows(body){
 const out=[];let start=0,fence=null,offset=0;
 for(const line of body.split(/(?<=\n)/)){
  const marker=/^\s*(`{3,}|~{3,})/.exec(line)?.[1];
  if(marker){if(!fence)fence=marker;else if(marker[0]===fence[0]&&marker.length>=fence.length)fence=null;}
  if(!fence&&offset>start&&(/^\s*\r?\n$/.test(line)||/^\s*(?:\[P?\d+\]|【P?\d+】|P\d+[.、:：]?|\d+[.、．:：)]|\d+[ \t\u3000])/.test(line))){const raw=body.slice(start,offset).trim();if(raw)out.push(raw);start=offset;}
  offset+=line.length;
 }
 const tail=body.slice(start).trim();if(tail)out.push(tail);return out;
}

// This surface owns no state writes, actions, scripts, caches or settlement.
// Completed paragraphs keep their DOM; only a changed trailing paragraph grows.
export function mountStreamingMessage(document,{formatBody,getAppearance,styleText,onError}){
 const host=document.createElement('div');host.className='tisya-message-visual tisya-message-stream';
 const root=host.attachShadow({mode:'open'}),style=document.createElement('style'),page=document.createElement('div'),heading=document.createElement('h2'),body=document.createElement('div'),note=document.createElement('p');
 page.className='page';body.className='story';note.className='loading-note';note.setAttribute('role','status');page.append(heading,body,note);root.append(style,page);
 let source=null,appearance=null,parts=[];
 return {host,update(value,{pending=true}={}){
  const data=readStreamingReply(value);if(!data)return false;
  const options=getAppearance('body'),stamp=JSON.stringify(options);
  if(source===value&&appearance===stamp){note.textContent=pending?'正在生成…':'生成已结束，回复尚未通过完整校验；已收到的正文保留。';return true;}
  heading.textContent=data.title||'缇斯亚 · 回声';
  const next=rows(data.body??'');
  for(let i=0;i<next.length;i++){
   let section=body.children[i];if(!section){section=document.createElement('section');section.className='reading-paragraph';section.dataset.paragraph='P'+(i+1);body.append(section);}
   if(parts[i]===next[i]&&appearance===stamp)continue;
   const raw=next[i].replace(/^\s*(?:\[P?\d+\]|【P?\d+】|P\d+[.、:：]?|\d+[.、．:：)]|\d+[ \t\u3000])\s*/,''),text=document.createElement('div');
   try{text.innerHTML=formatProse(document,projectRendering(raw,'body'),formatBody,options);}catch(e){text.textContent=raw;onError(e);}
   section.replaceChildren(text);
  }
  while(body.children.length>next.length)body.lastElementChild.remove();
  parts=next;source=value;appearance=stamp;style.textContent=styleText+'\n'+proseStyles(options);
  note.textContent=pending?'正在生成…':'生成已结束，回复尚未通过完整校验；已收到的正文保留。';
  host.dataset.streaming=String(pending);return true;
 },dispose(){host.remove();}};
}
