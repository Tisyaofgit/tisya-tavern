import {decorateBody,bodyCSS,formatMarks,MARK_CSS} from './typography-core.js';

export const proseCSS=bodyCSS()+MARK_CSS;

// Only receives the public body selected by inspectMessage. Host sanitization
// remains mandatory. Build marks before Markdown splits their text boundaries.
export function formatProse(document,source,hostFormat){
 const template=document.createElement('template');
 let prepared=source;
 if(source.includes('〔')){
  template.innerHTML=source;
  const draft=document.createElement('div');draft.append(template.content);
  formatMarks(draft);
  // Reference services are not migrated yet: retain their literal label without
  // presenting a dead interactive control or inferring access to another record.
  for(const button of draft.querySelectorAll('[data-tisya-reference]'))button.replaceWith(document.createTextNode(button.textContent));
  prepared=draft.innerHTML;
 }
 template.innerHTML=hostFormat(prepared);
 const root=document.createElement('div');root.setAttribute('data-tisya-prose-root','');root.append(template.content);
 // The host wraps ordinary quoted dialogue in bare <q> elements. Unwrap only
 // those safe wrappers so original dialogue/punctuation rules can reach text.
 for(const q of root.querySelectorAll('q')){
  let safe=q.attributes.length===0;
  for(let n=q.parentElement;safe&&n&&n!==root;n=n.parentElement)if(n.attributes.length||!['P','DIV','SECTION','EM','STRONG','B','I','U','S','Q','SPAN'].includes(n.tagName))safe=false;
  if(safe)q.replaceWith(...q.childNodes);
 }
 decorateBody(root);
 return root.outerHTML;
}
