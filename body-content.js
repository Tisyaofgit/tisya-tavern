import {bodyDisplayParts} from './native-body.js';
import {mountDisplayDocument} from './world-extra.js';
import {formatProse} from './prose.js';

// Consume a completed public display projection. Never execute card regex here.
// Static documents keep their own style boundary; live scripts remain owned by
// the host's original message, including when an independent reader is opened.
export function mountBodyContent(document,container,{display,formatBody,options={},onError=()=>{}}){
 const rows=[],parts=bodyDisplayParts(document,display)??[{text:display.body}];
 let alive=true,stamp=null;
 const failed=(node,source,error)=>{
  const note=document.createElement('p');note.className='public-note body-display-error';note.setAttribute('role','status');note.textContent='这一处正文美化暂时无法显示，原始文本保留。';
  const raw=document.createElement('details'),summary=document.createElement('summary'),pre=document.createElement('pre');summary.textContent='查看原始正文片段';pre.textContent=source;raw.append(summary,pre);node.append(note,raw);onError(error);
 };
 for(const part of parts){
  const node=document.createElement('div');node.className=part.html?'tisya-body-document':'tisya-body-prose';container.append(node);
  const row={node,source:part.html??part.text,prose:!part.html};rows.push(row);
  if(part.nativeHosted){
   const note=document.createElement('p');note.className='public-note';note.textContent='交互卡片在原消息中显示。';
   const raw=document.createElement('details'),summary=document.createElement('summary'),pre=document.createElement('pre');summary.textContent='查看卡片原文';pre.textContent=part.html;raw.append(summary,pre);node.append(note,raw);
  }else if(part.html){
   try{row.view=mountDisplayDocument(document,node,part.html,'正文卡片',{formatBody,onError:error=>failed(node,part.html,error)});for(const frame of node.querySelectorAll('iframe'))frame.dataset.tisyaBodyDocument='';}
   catch(error){failed(node,part.html,error);}
  }
 }
 function refresh(next=options,paused=false){
  if(!alive)return;options=next;const key=JSON.stringify(options);
  if(stamp!==key){for(const row of rows)if(row.prose){const folds=[...row.node.querySelectorAll('details')].map(n=>n.open);try{row.node.innerHTML=formatProse(document,row.source,formatBody,options);}catch(error){row.node.replaceChildren();failed(row.node,row.source,error);}row.node.querySelectorAll('details').forEach((n,i)=>{if(folds[i]!==undefined)n.open=folds[i];});}stamp=key;}
  for(const row of rows)row.view?.refresh(paused||options.动画效果===false);
 }
 refresh(options);
 return {refresh,capture:()=>rows.map(row=>({source:row.source,folds:row.view?row.view.capture():[...row.node.querySelectorAll('details')].map(n=>n.open)})),restore(state){if(!Array.isArray(state))return;rows.forEach((row,i)=>{const saved=state[i];if(saved?.source!==row.source)return;if(row.view)row.view.restore(saved.folds);else row.node.querySelectorAll('details').forEach((n,j)=>{if(typeof saved.folds?.[j]==='boolean')n.open=saved.folds[j];});});},dispose(){alive=false;for(const row of rows){row.view?.dispose();row.node.remove();}}};
}
