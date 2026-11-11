import {splitExtraDocuments,mountDisplayDocument} from './world-extra.js';
import {bodyDisplayParts,canonicalNativeSource as canonical,requiresNativePanel} from './native-body.js';
import {formatProse,proseStyles} from './prose.js';
export {requiresNativePanel} from './native-body.js';
// Source identity is local to the actual content node and message revision.
const sourceRecords=new WeakMap();
export const resetNativePanelSources=native=>sourceRecords.delete(native);
export function captureNativePanelSources(native,revision){
 let record=sourceRecords.get(native);
 if(!record||(revision!==undefined&&record.revision!==revision)){record={revision,roots:new Map()};sourceRecords.set(native,record);}
 for(const root of record.roots.keys())if(!native.contains(root))record.roots.delete(root);
 for(const pre of native.querySelectorAll('pre')){
  const root=pre.parentElement;
  if(root&&root!==native){if(root.querySelectorAll('pre').length===1)record.roots.set(root,{pre,source:canonical((pre.querySelector('code')??pre).textContent)});else record.roots.delete(root);}
 }
 return record.roots;
}
const CSS='.tisya-native-panel-root>pre{display:none!important}body.tisya-active .tisya-source-concealed.tisya-native-panels{display:block!important}.tisya-native-pruned{display:none!important}.mes_block.tisya-native-layout{display:flex!important;flex-direction:column!important}.tisya-native-layout>.tisya-message-visual{order:10}.tisya-native-layout>.tisya-native-panels{order:20}.tisya-native-layout>.tisya-message-actions-tail{order:30}.tisya-native-layout>.tisya-actions{order:40}.tisya-native-layout>:is(.mes_buttons,.edit_block,.edit_buttons){order:50}body.tisya-active .tisya-source-concealed.tisya-native-panels.tisya-native-collapsed:not(.tisya-native-body-flow){display:none!important}.tisya-native-extra-collapsed{display:none!important}.tisya-native-body-wait{font:13px/1.7 system-ui;color:#b7c9ba;padding:12px 4px}';
const toggle=(node,name,value)=>{if(node&&node.classList.contains(name)!==value)node.classList.toggle(name,value);};
// A claimed source wrapper may contain helper controls, its source and one frame.
// Never reveal an arbitrary parent containing other raw/private message content.
const safeRoot=root=>[...root.childNodes].every(n=>n.nodeType===8||n.nodeType===3&&!n.textContent.trim()||n.nodeType===1&&(n.matches('pre,iframe[id^="TH-message--"],div.TH-collapse-code-block-button,button.tt-runtime-placeholder,div.tt-runtime-ghost')))&&root.querySelectorAll('iframe[id^="TH-message--"]').length<=1;
export function preserveNativePanels(document,native,display,{formatBody=text=>text,getAppearance=()=>({}),onError=()=>{}}={}){
 const parts=bodyDisplayParts(document,display),bodyParts=parts?.some(part=>part.nativeHosted)?parts:null,wanted=[];
 const bodyCards=bodyParts?.filter(part=>part.nativeHosted).map((part,index)=>({...part,id:'body:'+index,owner:'body'}))??[];wanted.push(...bodyCards);
 const projected={...display,...(bodyParts?{body:'',nativeBody:true}:{}),extraPanels:(display?.extraPanels??[]).flatMap(row=>{
  const parts=splitExtraDocuments(row.html);if(!row.ruleName||!parts.some(html=>requiresNativePanel(document,html)))return [row];
  return parts.map((html,index)=>{const nativeHosted=requiresNativePanel(document,html),id=parts.length>1?row.id+':document:'+index:row.id;if(nativeHosted)wanted.push({source:canonical(html),owner:'extra',id});return {...row,id,html,nativeHosted};});
 })};
 if(!wanted.length)return {display,refresh(){},dispose(){}};
 let style=document.getElementById('tisya-native-panels-style');if(!style){style=document.createElement('style');style.id='tisya-native-panels-style';style.textContent=CSS;document.head.append(style);}
 const marked=new Set(),wrappers=new Set(),ownedRoots=new Set(),layout=native.parentElement,bodyNodes=[];let expanded=true,alive=true,assigned=new Map(),appearanceStamp=null,presentation=null;
 let cardIndex=0;
 for(const part of bodyParts??[]){
  const node=document.createElement('div');
  if(part.nativeHosted){node.className='tisya-native-body-wait';node.setAttribute('role','status');node.textContent='等待酒馆助手挂载正文卡片。';bodyNodes.push({node,card:bodyCards[cardIndex++]});}
  else if(part.html){node.className='tisya-native-body-document';const row={node};bodyNodes.push(row);try{row.view=mountDisplayDocument(document,node,part.html,'正文卡片',{formatBody,onError});for(const frame of node.querySelectorAll('iframe'))frame.dataset.tisyaBodyDocument='';}catch(error){const note=document.createElement('p'),pre=document.createElement('pre');note.textContent='这一处正文卡片暂时无法显示，原始文本保留。';note.setAttribute('role','status');pre.textContent=part.html;node.append(note,pre);onError(error);}}
  else{node.className='tisya-native-body-prose';const shadow=node.attachShadow({mode:'open'}),style=document.createElement('style'),text=document.createElement('div');text.className='story';shadow.append(style,text);bodyNodes.push({node,text,style,source:part.text});}
 }
 const mark=(n,hide)=>{toggle(n,'tisya-native-pruned',hide);if(hide)marked.add(n);else marked.delete(n);};
 function formatBodyNodes(){const appearance=getAppearance('body'),options=presentation?{...appearance,presentation:{...presentation,onError}}:appearance,stamp=JSON.stringify(options);for(const row of bodyNodes)row.view?.refresh(document.hidden||appearance.动画效果===false);if(stamp===appearanceStamp)return;for(const row of bodyNodes)if(row.text){const folds=[...row.text.querySelectorAll('details')].map(n=>n.open);row.style.textContent=':host{display:block;font:17px/1.85 var(--tisya-body-font,var(--tisya-global-font,TisyaReading)),serif;color:var(--tisya-ink,#fff9ed);overflow-wrap:anywhere}'+proseStyles(options);try{row.text.innerHTML=formatProse(document,row.source,formatBody,options);}catch(error){row.text.textContent=row.source;onError(error);}row.text.querySelectorAll('details').forEach((n,i)=>{if(folds[i]!==undefined)n.open=folds[i];});}appearanceStamp=stamp;}
 // Move only our own prose/wait nodes. Every live helper root remains in place.
 function placeBody(){
  let before=[];const beforeRoot=(root,nodes)=>{let cursor=root;for(const node of [...nodes].reverse()){if(node.nextSibling!==cursor)cursor.before(node);cursor=node;}};const after=(anchor,nodes)=>{let cursor=anchor;for(const node of nodes){if(cursor.nextSibling!==node)cursor.after(node);cursor=node;}};
  let previous=null;
  for(const row of bodyNodes){const root=row.card&&assigned.get(row.card);if(root){row.node.hidden=!!root.querySelector('iframe[id^="TH-message--"]');beforeRoot(root,[...before,row.node]);before=[];previous=root;}else{row.node.hidden=false;before.push(row.node);}}
  if(previous)after(previous,before);else{let cursor=null;for(const node of [...before].reverse()){if(node.parentElement!==native||node.nextSibling!==cursor)native.insertBefore(node,cursor);cursor=node;}}
 }
 function refresh(){
  if(!alive)return;formatBodyNodes();
  const sources=new Map();for(const [root,{source}]of captureNativePanelSources(native))if((root.matches('.TH-render')||root.querySelector('iframe[id^="TH-message--"]'))&&safeRoot(root)){const rows=sources.get(source)??[];rows.push(root);sources.set(source,rows);}
  assigned=new Map();for(const item of wanted){const roots=sources.get(item.source)??[];if(roots.length===1&&wanted.filter(p=>p.source===item.source).length===1)assigned.set(item,roots[0]);}
  const bodyRoots=bodyCards.map(card=>assigned.get(card)).filter(Boolean);
  if(bodyRoots.some((root,i)=>i>0&&!(bodyRoots[i-1].compareDocumentPosition(root)&4)))for(const card of bodyCards)assigned.delete(card);
  const roots=new Set(assigned.values());
  // The host can expand macros before creating its live frame. A sole safe
  // helper surface is still host-owned when its source no longer matches our
  // projection. Preserve that existing surface, without claiming panel identity
  // or revealing the surrounding raw reply. Ambiguous/body layouts stay strict.
  if(!bodyParts&&wanted.length===1&&!roots.size){const frames=[...native.querySelectorAll('iframe[id^="TH-message--"]')].filter(frame=>frame.isConnected);if(frames.length===1){const root=frames[0].closest('.TH-render');if(root&&native.contains(root)&&safeRoot(root)){roots.add(root);ownedRoots.add(root);toggle(root,'tisya-native-panel-root',true);toggle(root,'tisya-native-extra-collapsed',false);}}}
  for(const root of ownedRoots)if(!roots.has(root)){root.classList.remove('tisya-native-panel-root','tisya-native-extra-collapsed');ownedRoots.delete(root);}
  for(const [item,root]of assigned){ownedRoots.add(root);toggle(root,'tisya-native-panel-root',true);toggle(root,'tisya-native-extra-collapsed',item.owner==='extra'&&!expanded);}
  placeBody();
  const visible=roots.size>0||bodyNodes.length>0;toggle(native,'tisya-native-panels',visible);toggle(native,'tisya-native-body-flow',!!bodyParts);toggle(native,'tisya-native-collapsed',!expanded);toggle(layout,'tisya-native-layout',visible);
  if(!visible)return;
  const keepRoots=new Set([...roots,...bodyNodes.map(row=>row.node)]),paths=new Set();for(const root of keepRoots)for(let n=root;n&&n!==native;n=n.parentElement)paths.add(n);
  const walk=parent=>{for(const n of [...parent.childNodes]){if(n.nodeType===3&&n.textContent.trim()){const span=document.createElement('span');n.replaceWith(span);span.append(n);wrappers.add(span);mark(span,true);}else if(n.nodeType===1){const keep=paths.has(n);mark(n,!keep);if(keep&&!keepRoots.has(n))walk(n);}}};walk(native);
 }
 refresh();
 const status=(owner='extra')=>({expected:wanted.filter(p=>p.owner===owner).length,mounted:[...assigned].filter(([item,root])=>item.owner===owner&&native.contains(root)&&root.querySelector('iframe[id^="TH-message--"]')).length});
 return {display:projected,refresh,status,bodyStatus:()=>status('body'),setPresentation(value){if(!alive||presentation===value)return;presentation=value;formatBodyNodes();},setExpanded(value){expanded=value;refresh();},hasMounted:()=>[...assigned.values()].some(root=>native.contains(root)&&root.querySelector('iframe[id^="TH-message--"]')),dispose(){alive=false;for(const root of ownedRoots)root.classList.remove('tisya-native-panel-root','tisya-native-extra-collapsed');for(const n of marked)n.classList.remove('tisya-native-pruned');for(const row of bodyNodes){row.view?.dispose();row.node.remove();}for(const n of wrappers)if(n.parentNode)n.replaceWith(...n.childNodes);native.classList.remove('tisya-native-panels','tisya-native-collapsed','tisya-native-body-flow');layout?.classList.remove('tisya-native-layout');}};
}
