import {splitExtraDocuments} from './world-extra.js';
const canonical=s=>s.replace(/\r\n?/g,'\n').trim();
// Capture source identity before an asynchronous cache read or helper mount.
// Identity is local to the actual content node and message revision, never iframe order.
const sourceRecords=new WeakMap();
export const resetNativePanelSources=native=>sourceRecords.delete(native);
export function captureNativePanelSources(native,revision){
 let record=sourceRecords.get(native);
 if(!record||(revision!==undefined&&record.revision!==revision)){record={revision,roots:new Map()};sourceRecords.set(native,record);}
 for(const root of record.roots.keys())if(!native.contains(root))record.roots.delete(root);
 for(const pre of native.querySelectorAll('pre')){
  const root=pre.parentElement;
  if(root&&root!==native){if(root.querySelectorAll('pre').length===1)record.roots.set(root,{pre,source:canonical(pre.textContent)});else record.roots.delete(root);}
 }
 return record.roots;
}
// Regex-authored executable cards remain helper-owned, even when they only use
// local DOM functions. The presentation never starts a second script runtime.
export function requiresNativePanel(document,html){const t=document.createElement('template');t.innerHTML=html;return !!t.content.querySelector('script')||[...t.content.querySelectorAll('*')].some(n=>[...n.attributes].some(a=>/^on/i.test(a.name)));}
const CSS='.tisya-native-panel-root>pre{display:none!important}body.tisya-active .tisya-source-concealed.tisya-native-panels{display:block!important}.tisya-native-pruned{display:none!important}.mes_block.tisya-native-layout{display:flex!important;flex-direction:column!important}.tisya-native-layout>.tisya-message-visual{order:10}.tisya-native-layout>.tisya-native-panels{order:20}.tisya-native-layout>.tisya-message-actions-tail{order:30}.tisya-native-layout>.tisya-actions{order:40}.tisya-native-layout>:is(.mes_buttons,.edit_block,.edit_buttons){order:50}body.tisya-active .tisya-source-concealed.tisya-native-panels.tisya-native-collapsed{display:none!important}';
// Original helper frames stay in their original DOM parent. Never clone, move, reload or execute them.
export function preserveNativePanels(document,native,display){
 const wanted=[];const projected={...display,extraPanels:(display?.extraPanels??[]).flatMap(row=>{const parts=splitExtraDocuments(row.html);if(!row.ruleName||!parts.some(html=>requiresNativePanel(document,html)))return [row];return parts.map((html,index)=>{const nativeHosted=requiresNativePanel(document,html);if(nativeHosted)wanted.push(canonical(html));return {...row,id:parts.length>1?row.id+':document:'+index:row.id,html,nativeHosted};});})};
 if(!wanted.length)return {display,refresh(){},dispose(){}};
 let style=document.getElementById('tisya-native-panels-style');if(!style){style=document.createElement('style');style.id='tisya-native-panels-style';style.textContent=CSS;document.head.append(style);}
 const marked=new Set(),wrappers=new Set(),knownRoots=new Set(),ownedRoots=new Set(),layout=native.parentElement;let expanded=true,alive=true;
 const mark=(n,hide)=>{if(hide){if(!n.classList.contains('tisya-native-pruned'))n.classList.add('tisya-native-pruned');marked.add(n);}else{n.classList.remove('tisya-native-pruned');marked.delete(n);}};
 function refresh(){
  if(!alive)return;
  const roots=new Set();
  for(const [root,{source}] of captureNativePanelSources(native)){
   if(wanted.includes(source)&&(root.matches('.TH-render')||root.querySelector('iframe[id^="TH-message--"]')))roots.add(root);
  }
  for(const root of ownedRoots)if(!roots.has(root)){root.classList.remove('tisya-native-panel-root');ownedRoots.delete(root);}
  knownRoots.clear();
  if(!roots.size){native.classList.remove('tisya-native-panels');layout?.classList.remove('tisya-native-layout');return;}
  for(const root of roots){knownRoots.add(root);ownedRoots.add(root);if(!root.classList.contains('tisya-native-panel-root'))root.classList.add('tisya-native-panel-root');}native.classList.add('tisya-native-panels');native.classList.toggle('tisya-native-collapsed',!expanded);layout?.classList.add('tisya-native-layout');
  const paths=new Set();for(const root of roots)for(let n=root;n&&n!==native;n=n.parentElement)paths.add(n);
  const walk=parent=>{for(const n of [...parent.childNodes]){if(n.nodeType===3&&n.textContent.trim()){const span=document.createElement('span');n.replaceWith(span);span.append(n);wrappers.add(span);mark(span,true);}else if(n.nodeType===1){const keep=paths.has(n);mark(n,!keep);if(keep&&!roots.has(n))walk(n);}}};
  walk(native);
 }
 refresh();
 const status=()=>({expected:wanted.length,mounted:[...knownRoots].filter(n=>native.contains(n)&&n.querySelector('iframe[id^="TH-message--"]')).length});
 return {display:projected,refresh,status,setExpanded(value){expanded=value;native.classList.toggle('tisya-native-collapsed',!expanded);refresh();},hasMounted:()=>status().mounted>0,dispose(){alive=false;for(const root of ownedRoots)root.classList.remove('tisya-native-panel-root');for(const n of marked)n.classList.remove('tisya-native-pruned');for(const n of wrappers)if(n.parentNode)n.replaceWith(...n.childNodes);native.classList.remove('tisya-native-panels','tisya-native-collapsed');layout?.classList.remove('tisya-native-layout');}};
}

