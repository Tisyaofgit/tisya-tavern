const fissureEdge=new URL('./assets/actions/fissure-edge.png',import.meta.url).href;
import {usesV3Reply} from './reply-protocol.js';
import {readV3Details} from './six/reply.mjs';
import {isOnePassReply,readOnePassDetails} from './onepass/reply.mjs';
export const readReplyDetails=source=>isOnePassReply(source)?readOnePassDetails(source):usesV3Reply(source)?readV3Details(source):readLegacyDetails(source);
import {validateMemoryProjection} from './reader-core.js';
import {emotionCatalog} from './emotion-catalog.js';
import {readReplyBlock,readPublicReplyEnvelope,readReplyMemory} from './reply-formats.js';

const fail=()=>{throw Object.assign(Error('TISYA_READER_DETAILS_INVALID'),{code:'TISYA_READER_DETAILS_INVALID'});};
function heart(value){
 if(!value||!['有内容','沉默','关闭'].includes(value.status)||!Array.isArray(value.items)||value.items.length>3||(value.status==='有内容')!==(value.items.length>0))fail();
 const items=value.items.map(row=>{if(!row||typeof row.type!=='string'||!row.type.trim()||typeof row.text!=='string'||row.text.length>1000||!(row.mood===null||typeof row.mood==='string'))fail();return {type:row.type,text:row.text,mood:row.mood};});
 return {status:value.status,items};
}
// Public summaries retain the original task.plan field. Internal input, stop,
// references, unlocks and next planning never become presentation data.
function readLegacyDetails(source){
 const envelope=readPublicReplyEnvelope(source),task=readReplyBlock(envelope,'task'),next=readReplyBlock(envelope,'next');
 if(!Array.isArray(task.audit))fail();
 const audit=task.audit.map(row=>{if(!row||['kind','status','evidence'].some(k=>typeof row[k]!=='string'||!row[k].trim()))fail();return {kind:row.kind,status:row.status,evidence:row.evidence};});
 let rounds;try{
  if(!Array.isArray(task.tasks)||!Array.isArray(next.delivered))fail();
  const tasks=(envelope.wire?task.tasks:[]).flatMap((row,i)=>{if(!row||typeof row.plan!=='string')fail();return row.plan.trim()?[{label:'任务 '+String(i+1).padStart(2,'0'),text:row.plan}]:[];});
  const delivered=next.delivered.map(text=>{if(typeof text!=='string')fail();return {text};});
  let pending=[],pendingError=false;
  try{const memory=readReplyMemory(source);if(memory?.protocol==='tisya.lab.memory/5'){validateMemoryProjection({...memory,权限:[]},{body:envelope.blocks.body});pending=[];}}catch{pendingError=true;}
  rounds={tasks,delivered,pending,pendingError};
 }catch{rounds={error:true,tasks:[],delivered:[],pending:[]};}
 const taskHeart=heart(task.heart),nextHeart=heart(next.heart);
 // Report an observed source defect without silently rewriting or dropping a
 // selected direction. Punctuation/spacing alone do not make a new comment.
 const normalized=s=>s.normalize('NFKC').replace(/[\s\p{P}\p{Z}]/gu,'');
 const repeated=nextHeart.items.filter(row=>taskHeart.items.some(top=>normalized(top.text)===normalized(row.text))).length;
 return {taskHeart,nextHeart,audit,rounds,...repeated?{heartDiagnostic:`原回复有 ${repeated} 条收篇心声与开篇重复；当前按原文显示。`}:{}};
}
export function mountHeartBlock(document,container,value,{label}={}){
 const host=document.createElement('div');host.className='heart-host';host.setAttribute('aria-label',label??'缇斯亚心声');host.dataset.status=value.status;
 if(!value.items.length)return null;
 const line=document.createElement('div'),bubble=document.createElement('button'),text=document.createElement('span'),dots=document.createElement('span'),mood=document.createElement('span');
 line.className='heart-line';bubble.className='heart-bubble';bubble.type='button';dots.className='heart-dots';mood.className='emotion heart-mood';let index=0,revision=0,alive=true;
 function bindMood(name){const current=++revision;mood.replaceChildren();mood.hidden=name===null;if(name===null)return;mood.textContent='表情加载中…';emotionCatalog(document).resolve(name).then(row=>{if(!alive||current!==revision||!host.isConnected)return;const img=document.createElement('img');img.src=row.url;img.alt=row.name;img.className='heart-emotion';mood.replaceChildren(img);},()=>{if(!alive||current!==revision||!host.isConnected)return;mood.textContent='表情不可用：'+name;mood.setAttribute('role','status');});}
 function render(){const item=value.items[index];text.textContent=item.text;host.dataset.direction=item.type;host.dataset.mood=item.mood??'';mood.textContent=item.mood&&item.mood!=='无'?item.mood:'';mood.hidden=!mood.textContent;bubble.setAttribute('aria-label',item.text+(value.items.length>1?'；第'+(index+1)+'条，共'+value.items.length+'条，点击下一条':''));bubble.dataset.index=String(index);dots.replaceChildren();dots.hidden=value.items.length<2;for(let i=0;i<value.items.length;i++){const dot=document.createElement('i');if(i===index)dot.className='active';dots.append(dot);}}
 const renderText=render;function update(){renderText();bindMood(value.items[index].mood);}
 bubble.onclick=()=>{if(!alive||!host.isConnected)return;index=(index+1)%value.items.length;update();};bubble.append(text,dots);line.append(bubble,mood);host.append(line);container.append(host);host.captureHeart=()=>index;host.restoreHeart=saved=>{if(alive&&Number.isInteger(saved)&&saved>=0&&saved<value.items.length){index=saved;update();}};host.disposeHeart=()=>{alive=false;revision++;bubble.onclick=null;};update();return host;
}
export function mountAuditBlock(document,container,rows){
 if(!rows.length)return null;const wrapper=document.createElement('div');wrapper.className='fold-content reply-checks';const fold=document.createElement('details'),title=document.createElement('summary'),body=document.createElement('div');fold.className='ledger-section audit-ledger';title.textContent='核验 · '+rows.length;body.className='ledger-body';
 for(const row of rows){const item=document.createElement('details'),head=document.createElement('summary'),orb=document.createElement('span'),label=document.createElement('span'),text=document.createElement('p');item.className='audit-bead';orb.className='status-orb';orb.textContent=row.status==='符合'?'✓':'·';orb.setAttribute('aria-hidden','true');label.textContent=row.kind;head.append(orb,label);head.setAttribute('aria-label',row.kind+'：'+row.status);text.textContent=row.status+' · '+row.evidence;item.append(head,text);body.append(item);}
 fold.append(title,body);wrapper.append(fold);container.append(wrapper);return wrapper;
}
export const replyControlsCSS=`
.round-empty{box-sizing:border-box;align-self:start;margin:0;padding:14px 18px;border:1px solid #a8c7ad80;border-radius:30px 25px 32px 24px;background:linear-gradient(145deg,#456b5660,#0b342c9c);box-shadow:inset 0 2px 3px #e5e8be25,0 5px 12px #001c1830;color:#cbdac7;font:14px/1.8 var(--tisya-global-font,TisyaReading),TisyaReading,serif;overflow-wrap:anywhere;min-width:0}

.action-mode-control{position:relative;display:flex;justify-content:flex-end;margin:-44px 0 12px;min-height:44px}
.action-mode-toggle{display:flex;align-items:center;gap:5px;border:0;background:transparent;color:var(--gold,#ffedbf);font:13px/1.6 var(--tisya-global-font,TisyaReading),TisyaReading,serif;padding:3px 6px;min-height:44px}
.action-mode-toggle img{width:27px;height:35px;object-fit:contain}
.action-mode-menu{position:absolute;right:0;top:100%;z-index:10;width:175px;padding:7px;background:#092b26;border:1px solid #c9bb87;border-radius:12px;box-shadow:0 12px 28px #001818b0}
.action-mode-menu[hidden]{display:none!important}.action-mode-menu button{display:block;width:100%;text-align:left;border:0;background:none;color:inherit;font:15px/1.6 var(--tisya-global-font,TisyaReading),TisyaReading,serif;min-height:46px;padding:8px}
.action-mode-menu [aria-checked=true]{color:#f5dca0;background:#a5b18822;border-radius:8px}
.action-feedback{margin:8px 2px 0;font:12px/1.65 var(--tisya-global-font,TisyaReading),TisyaReading,serif;min-height:18px;color:var(--muted,#e8f0ea)}
.action-heading{padding-right:80px}.action.selected{outline:1px solid #dfc88d}
.tisya-reader-actions{display:grid;gap:12px;min-width:0}
.tisya-reader-actions .action{display:grid;grid-template-columns:26px minmax(0,1fr);align-items:start;gap:12px;width:100%;min-width:0;min-height:64px;margin:0;padding:16px 15px;text-align:left;white-space:normal;border:1px solid #b8c6a45c;border-radius:20px;background:radial-gradient(ellipse at 0 0,#63957824,transparent 70%),linear-gradient(135deg,#153c30ed,#06251fe8);box-shadow:inset 0 1px 1px #e1e6c22e,inset 0 -1px 2px #001e1970,0 5px 14px #001a1826;color:var(--ink,var(--tisya-ink,#fff9ed));transition:border-color 160ms ease,background-color 160ms ease,box-shadow 160ms ease}
.tisya-reader-actions .action .number{padding-top:2px;color:var(--gold,var(--tisya-gold,#dfc88d));font:italic 21px/1.4 var(--tisya-global-font,TisyaReading),TisyaReading,serif;font-variant-numeric:tabular-nums}
.action-content{display:flex;flex-direction:column;align-items:stretch;gap:9px;min-width:0;overflow-wrap:anywhere}
.tisya-reader-actions .action-type{align-self:flex-start;padding:2px 9px;border:1px solid #d6c99c52;border-radius:6px;background:#b9c3920c;color:var(--gold,var(--tisya-gold,#dfc88d));font:12px/1.6 var(--tisya-global-font,TisyaReading),TisyaReading,serif;letter-spacing:.12em}
.tisya-reader-actions .action .text{display:block;min-width:0;color:inherit;font:16px/1.8 var(--tisya-global-font,TisyaReading),TisyaReading,serif}
.action-possibility{display:block;margin:1px 0 0;padding-top:9px;border-top:1px solid #b4c5ad26;color:var(--muted,var(--tisya-muted,#b0c4b8));font:12px/1.75 var(--tisya-global-font,TisyaReading),TisyaReading,serif;letter-spacing:.015em;overflow-wrap:anywhere}
.action-possibility-label{color:var(--gold,var(--tisya-gold,#dfc88d))}
.tisya-reader-actions .action.selected{border-color:#dfc88da8;outline:none;box-shadow:inset 3px 0 0 #dfc88d9e,inset 0 1px 1px #e1e6c233,0 5px 14px #001a1826}
.tisya-reader-actions .action.selected .action-type{background:#dfc88d16;border-color:#dfc88d80}
.tisya-reader-actions .action:focus-visible{outline:2px solid var(--gold,var(--tisya-gold,#dfc88d));outline-offset:3px}
@media(hover:hover){.tisya-reader-actions .action:hover:not(:disabled){filter:none;border-color:#dfc88d99;box-shadow:inset 0 1px 2px #e1e6c240,0 6px 18px #001a1840}}
@media(max-width:360px){.tisya-reader-actions .action{grid-template-columns:22px minmax(0,1fr);gap:9px;padding:13px 11px}.tisya-reader-actions .action .text{font-size:15px}}
@media(prefers-reduced-motion:reduce){.tisya-reader-actions .action{transition:none}}
/* Approved water-fissure action layout; shared by message and reader. */
.tisya-reader-actions{gap:24px;padding:12px 0;isolation:isolate}
.tisya-reader-actions .action{position:relative;isolation:isolate;display:block;box-sizing:border-box;width:calc(100% - 12px);margin:0 12px 0 0;padding:35px 20px 25px 42px;border:0;border-radius:0;outline:none;background:linear-gradient(105deg,#021510e8,#031914eb 65%,#051b1499);box-shadow:none;overflow:visible;transition:filter .18s ease}
.tisya-reader-actions .action:nth-child(even){margin:0 0 0 12px;padding:35px 42px 25px 20px;background:linear-gradient(255deg,#021510e8,#031914eb 65%,#051b1499)}
.tisya-reader-actions .action::before,.tisya-reader-actions .action::after{content:"";position:absolute;z-index:-1;pointer-events:none;left:0;right:0;height:36px;background-image:url("${fissureEdge}");background-size:100% 100%;background-repeat:no-repeat;opacity:.8}
.tisya-reader-actions .action::before{top:-10px;transform:rotate(2deg)}
.tisya-reader-actions .action::after{bottom:-10px;transform:rotate(182deg);opacity:.38}
.tisya-reader-actions .action:nth-child(even)::before{transform:scaleX(-1) rotate(2deg)}
.tisya-reader-actions .action .number{position:absolute;left:2px;top:8px;font:italic 40px/1 Georgia,serif;color:#b7c5ad5c;padding:0;letter-spacing:-.08em}
.tisya-reader-actions .action:nth-child(even) .number{left:auto;right:4px}
.tisya-reader-actions .action-content{gap:10px;position:relative;z-index:1}
.tisya-reader-actions .action-type{position:absolute;left:-31px;top:38px;writing-mode:vertical-rl;border:0;border-radius:0;border-left:1px solid #cbb77d66;background:none;padding:0 0 0 5px;letter-spacing:.18em;font-size:11px}
.tisya-reader-actions .action:nth-child(even) .action-type{left:auto;right:-31px;border-left:0;border-right:1px solid #cbb77d66;padding:0 5px 0 0}
.tisya-reader-actions .action .text{font-size:16px;line-height:1.85}
.tisya-reader-actions .action-possibility{position:relative;align-self:flex-end;max-width:95%;margin:4px 0 0 14px;padding:4px 0 0 17px;border:0;color:#c6ba94;font-size:11px;line-height:1.7;text-align:left}
.tisya-reader-actions .action-possibility::before{content:"";position:absolute;left:-14px;top:2px;width:24px;height:12px;border-bottom:1px solid #beaa71;border-left:1px solid #beaa71;border-radius:0 0 0 14px}
.tisya-reader-actions .action-possibility-label{font-size:10px;opacity:.8}
.tisya-reader-actions .action.selected{outline:0;border:0;box-shadow:none;background-color:#122e23}
.tisya-reader-actions .action.selected::before{opacity:1;filter:brightness(1.35)}
.tisya-reader-actions .action.selected .action-type{background:none;border-color:#d9c78e}
.tisya-reader-actions .action:focus-visible{outline:1px dashed #d9c78e;outline-offset:5px}
@media(hover:hover){.tisya-reader-actions .action:hover:not(:disabled){border:0;box-shadow:none;filter:brightness(1.12)}}
.tisya-reader-actions .action:active:not(:disabled){filter:brightness(1.2)}
@media(max-width:360px){.tisya-reader-actions .action{padding:32px 14px 22px 35px}.tisya-reader-actions .action:nth-child(even){padding:32px 35px 22px 14px}.tisya-reader-actions .action .text{font-size:15px}.tisya-reader-actions .action .number{font-size:34px}.tisya-reader-actions .action-type{left:-27px}.tisya-reader-actions .action:nth-child(even) .action-type{right:-27px}}
.heart-bubble{white-space:normal;overflow-wrap:anywhere;text-align:left}.heart-mood[hidden]{display:none!important}.heart-mood[role=status]{height:auto;max-width:5em;font-size:11px;overflow-wrap:anywhere}.heart-emotion{display:block;width:100%;height:100%;object-fit:contain}.reply-checks{margin:12px 0;min-width:0}.reply-checks>.ledger-section>summary{font-size:14px;min-height:44px;padding:10px 8px}.reply-checks .audit-bead summary{white-space:normal!important}.reply-checks p{overflow-wrap:anywhere}
`;
