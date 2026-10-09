'use strict';
const {bodyOptions}=require('./body-typography-options.cjs');
const INLINE=new Set(['EM','STRONG','B','I','U','S','SPAN']);
const SIMPLE=new Set(['P','DIV','SECTION']);
const OWN='data-tisya-prose';
const punctuation=/[，。！？；：、…—,.!?;:]/u;
// Only unadorned prose and our own nodes are eligible. Card-authored classes,
// IDs, styles, handlers and data attributes retain their entire subtree.
function plain(node){return node.nodeType===1&&[...node.attributes].every(a=>a.name===OWN||a.name==='data-tisya-leading-space');}
function formatBody(root,display={}){
 const options=bodyOptions(display),doc=root.ownerDocument;
 const report={generatedParagraphs:0,existingParagraphs:0,protectedElements:0,dialogueSpans:0,punctuationSpans:0},created=new Set();
 function inline(node){return node.nodeType===3||node.nodeType===8||node.nodeType===1&&((INLINE.has(node.tagName)&&plain(node))||node.tagName==='BR'&&plain(node));}
 function paragraphs(parent){
  let group=[];
  function flush(){
   if(!group.length)return;
   const nodes=group;group=[];
   if(!nodes.some(n=>n.nodeType===1||n.nodeType===3&&n.data.trim()))return;
   const anchor=nodes[0];let p=null;
   // Insert before a stable placeholder while moving source nodes.
   const marker=doc.createComment('tisya-paragraph-position');parent.insertBefore(marker,anchor);
   const create=()=>{if(!p){p=doc.createElement('p');p.setAttribute(OWN,'paragraph');parent.insertBefore(p,marker);created.add(p);report.generatedParagraphs++;}return p;};
   for(const n of nodes){
    if(n.nodeType!==3){create().append(n);continue;}
    const parts=n.data.replace(/\r\n?/g,'\n').split(/(\n[\t \u3000]*\n(?:[\t \u3000]*\n)*)/);
    for(let i=0;i<parts.length;i++){if(i%2){p=null;continue;}if(parts[i]&&(parts[i].trim()||p))create().append(doc.createTextNode(parts[i]));}
    n.remove();
   }
   marker.remove();
  }
  for(const node of [...parent.childNodes]){
   if(inline(node)){group.push(node);continue;}flush();
   if(node.nodeType!==1)continue;
   if(node.tagName==='P'&&plain(node)){node.setAttribute(OWN,'paragraph');report.existingParagraphs++;}
   else if(SIMPLE.has(node.tagName)&&plain(node))paragraphs(node);
   else report.protectedElements++;
  }
  flush();
 }
 function markExisting(parent){for(const node of parent.children){if(node.tagName==='P'&&plain(node)){node.setAttribute(OWN,'paragraph');report.existingParagraphs++;}else if(SIMPLE.has(node.tagName)&&plain(node))markExisting(node);else report.protectedElements++;}}
 if(options.自动分段)paragraphs(root);else {markExisting(root);for(const n of [...root.childNodes])if(n.nodeType===3){const span=doc.createElement('span');span.setAttribute(OWN,'literal');span.textContent=n.data;n.replaceWith(span);}}
 function decorate(nodes){
  const text=nodes.map(n=>n.data).join('');if(!text)return;
  const codeMask=new Uint8Array(text.length);for(const m of text.matchAll(/(`+)([\s\S]*?)\1/g))codeMask.fill(1,m.index,m.index+m[0].length);
  const pairs={'“':'”','「':'」','『':'』','‘':'’','"':'"'},stack=[],ranges=[];
  if(options.对白高亮)for(let i=0;i<text.length;i++){
   if(codeMask[i])continue;const ch=text[i],top=stack.at(-1);
   if(top&&ch===top.close){stack.pop();ranges.push([top.start,i+1]);}
   else if(pairs[ch])stack.push({start:i,close:pairs[ch]});
  }
  const flags=new Uint8Array(text.length);for(const [a,b]of ranges)flags.fill(1,a,b);
  let offset=0;
  for(const node of nodes){
   const value=node.data,fragment=doc.createDocumentFragment();let start=0,kind=null;
   function emit(end){if(end===start)return;const s=value.slice(start,end);if(kind){const span=doc.createElement('span');span.setAttribute(OWN,kind);span.textContent=s;fragment.append(span);report[kind==='dialogue'?'dialogueSpans':'punctuationSpans']++;}else fragment.append(doc.createTextNode(s));start=end;}
   for(let i=0;i<value.length;i++){const next=codeMask[offset+i]?null:flags[offset+i]?'dialogue':options.标点高亮&&punctuation.test(value[i])?'punctuation':null;if(i&&next!==kind)emit(i);kind=next;}
   emit(value.length);offset+=value.length;node.replaceWith(fragment);
  }
 }
 function highlights(parent){
  let nodes=[];const flush=()=>{decorate(nodes);nodes=[];};
  function visit(node){
   if(node.nodeType===3){nodes.push(node);return;}
   if(node.nodeType===8)return;
   if(node.nodeType!==1)return;
   if(node.hasAttribute(OWN)&&!['paragraph','literal'].includes(node.getAttribute(OWN))){flush();return;}
   if(INLINE.has(node.tagName)&&plain(node)){for(const n of [...node.childNodes])visit(n);}
   else{flush();}
  }
  for(const n of [...parent.childNodes])visit(n);flush();
 }
 for(const p of root.querySelectorAll('p['+OWN+'="paragraph"]')){
  if(created.has(p)){if(p.firstChild?.nodeType===3)p.firstChild.data=p.firstChild.data.replace(/^\n+/,'');if(p.lastChild?.nodeType===3)p.lastChild.data=p.lastChild.data.replace(/\n+$/,'');}
  if(/^[\t \u3000]+/.test(p.textContent))p.setAttribute('data-tisya-leading-space','');
  highlights(p);
 }
 if(!options.自动分段)highlights(root);
 return {options,report,css:bodyCSS(options)};
}
function bodyCSS(display={}){const o=bodyOptions(display);return `[data-tisya-prose-root] [data-tisya-prose="literal"]{white-space:pre-wrap}[data-tisya-prose-root] p[data-tisya-prose="paragraph"]{white-space:pre-wrap;text-indent:${o.首行缩进}em;line-height:${o.正文行距};margin:0 0 ${o.段落间距}em}[data-tisya-prose-root] p[data-tisya-leading-space]{text-indent:0}[data-tisya-prose-root] [data-tisya-prose="dialogue"]{color:var(--tisya-dialogue-color,#dfc98e)}[data-tisya-prose-root] [data-tisya-prose="punctuation"]{color:var(--tisya-punctuation-color,#a9c8bf)}`;}
function formatBodyHTML(document,html,options){
 const template=document.createElement('template');template.innerHTML=html;
 const root=document.createElement('div');root.setAttribute('data-tisya-prose-root','');root.append(template.content);
 const marks=require('./prose-marks.cjs').formatMarks(root,options),result=formatBody(root,options);return {...result,marks,css:result.css+require('./prose-marks.cjs').MARK_CSS,html:root.outerHTML};
}
module.exports={formatBody,formatBodyHTML,bodyCSS};
