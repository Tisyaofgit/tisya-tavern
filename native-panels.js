import {splitExtraDocuments} from './world-extra.js';
const canonical=s=>s.replace(/\r\n?/g,'\n').trim();
export function requiresNativePanel(document,html){const t=document.createElement('template');t.innerHTML=html;return !!t.content.querySelector('script[src]')||[...t.content.querySelectorAll('script')].some(s=>s.type==='module'||/\b(?:parent|top|TavernHelper|SillyTavern|Mvu|eventOn|getVariables|getAllVariables|triggerSlash|waitGlobalInitialized)\b/.test(s.textContent));}
const CSS='body.tisya-active .tisya-source-concealed.tisya-native-panels{display:block!important}.tisya-native-pruned{display:none!important}.mes_block.tisya-native-layout{display:flex!important;flex-direction:column!important}.tisya-native-layout>.tisya-message-visual{order:10}.tisya-native-layout>.tisya-native-panels{order:20}.tisya-native-layout>.tisya-message-actions-tail{order:30}.tisya-native-layout>.tisya-actions{order:40}.tisya-native-layout>:is(.mes_buttons,.edit_block,.edit_buttons){order:50}body.tisya-active .tisya-source-concealed.tisya-native-panels.tisya-native-collapsed{display:none!important}';
// Original helper frames stay in their original DOM parent. Never clone, move, reload or execute them.
export function preserveNativePanels(document,native,display){
 const wanted=[];const projected={...display,extraPanels:(display?.extraPanels??[]).map(row=>{const parts=splitExtraDocuments(row.html);if(!row.ruleName||!parts.some(html=>requiresNativePanel(document,html)))return row;wanted.push(...parts.map(canonical));return {...row,nativeHosted:true};})};
 if(!wanted.length)return {display,refresh(){},dispose(){}};
 let style=document.getElementById('tisya-native-panels-style');if(!style){style=document.createElement('style');style.id='tisya-native-panels-style';style.textContent=CSS;document.head.append(style);}
 const marked=new Set(),wrappers=new Set(),knownRoots=new Set(),layout=native.parentElement;let expanded=true;
 const mark=(n,hide)=>{if(hide){if(!n.classList.contains('tisya-native-pruned'))n.classList.add('tisya-native-pruned');marked.add(n);}else{n.classList.remove('tisya-native-pruned');marked.delete(n);}};
 function refresh(){
  const roots=new Set([...knownRoots].filter(n=>native.contains(n)&&n.querySelector('iframe[id^="TH-message--"]')));
  for(const code of native.querySelectorAll('pre code'))if(wanted.includes(canonical(code.textContent))){const pre=code.closest('pre'),root=pre.parentElement;if(root!==native&&root.querySelector('iframe[id^="TH-message--"]'))roots.add(root);}
  if(!roots.size){native.classList.remove('tisya-native-panels');layout?.classList.remove('tisya-native-layout');return;}
  for(const root of roots)knownRoots.add(root);native.classList.add('tisya-native-panels');native.classList.toggle('tisya-native-collapsed',!expanded);layout?.classList.add('tisya-native-layout');
  const paths=new Set();for(const root of roots)for(let n=root;n&&n!==native;n=n.parentElement)paths.add(n);
  const walk=parent=>{for(const n of [...parent.childNodes]){if(n.nodeType===3&&n.textContent.trim()){const span=document.createElement('span');n.replaceWith(span);span.append(n);wrappers.add(span);mark(span,true);}else if(n.nodeType===1){const keep=paths.has(n);mark(n,!keep);if(keep&&!roots.has(n))walk(n);}}};
  walk(native);
 }
 refresh();
 return {display:projected,refresh,setExpanded(value){expanded=value;native.classList.toggle('tisya-native-collapsed',!expanded);refresh();},hasMounted:()=>[...knownRoots].some(n=>native.contains(n)&&n.querySelector('iframe')),dispose(){for(const n of marked)n.classList.remove('tisya-native-pruned');for(const n of wrappers)if(n.parentNode)n.replaceWith(...n.childNodes);native.classList.remove('tisya-native-panels','tisya-native-collapsed');layout?.classList.remove('tisya-native-layout');}};
}

