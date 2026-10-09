'use strict';
const MARK_NAMES=Object.freeze(['代码','标题','事件','消息','内心','信笺','密档','终端','播报','旁白','引文','回忆','梦境','系统','档案','诗歌','鉴定','时间轴','场景','收获','失去','便签','警告','注脚','骰子']);
const known=new Set([...MARK_NAMES,'引用','媒体']);
const protectedTags='pre,code,script,style,textarea,input,button,select,a,audio,video,dialog,[data-tisya-mark],[data-no-terms]';
const fail=code=>{throw Object.assign(new Error('TISYA_MARK_'+code),{code:'TISYA_MARK_'+code});};
function parseMarks(text){
 const roots=[],stack=[{name:null,children:roots}],re=/(`+)([\s\S]*?)\1|〔(\/)?([^:：\]〔〕]+)(?:[:：]([^〔〕]*))?〕/gu;let end=0;
 const push=s=>{if(s)stack.at(-1).children.push({text:s});};
 let match;while((match=re.exec(text))){push(text.slice(end,match.index));end=match.index+match[0].length;if(match[1]){stack.at(-1).children.push({literal:match[0]});continue;}const [, , ,close,name,param]=match;if(!known.has(name)){push(match[0]);continue;}
  if(close){if(param!==undefined||stack.length===1||stack.at(-1).name!==name)fail('BOUNDARY');const node=stack.pop();node.raw=text.slice(node.start,end);if(name==='代码'||name==='终端')node.literalBody=text.slice(node.bodyStart,match.index);}
  else{if(stack.length>12)fail('DEPTH');const node={name,param:param??'',children:[],start:match.index,bodyStart:end};stack.at(-1).children.push(node);stack.push(node);if(name==='代码'||name==='终端'){const ending='〔/'+name+'〕',position=text.indexOf(ending,end);if(position<0)fail('UNCLOSED');node.literalBody=text.slice(end,position);node.raw=text.slice(node.start,position+ending.length);stack.pop();end=position+ending.length;re.lastIndex=end;}}
 }
 push(text.slice(end));if(stack.length!==1)fail('UNCLOSED');return roots;
}
// Text nodes only. Source HTML attributes, control payloads and authored cards
// are never fed back through a string replacement over generated markup.
function formatMarks(root,options={}){
 if(options.标记美化===false)return {count:0};const doc=root.ownerDocument,leaves=[];let count=0;
 const walker=doc.createTreeWalker(root,4);let leaf;
 function safeParent(n){for(let p=n.parentElement;p&&p!==root;p=p.parentElement){if(p.matches(protectedTags)||[...p.attributes].some(a=>a.name!=='data-tisya-prose'&&a.name!=='data-tisya-leading-space'))return false;}return true;}
 while(leaf=walker.nextNode())if(safeParent(leaf)){const group=leaves.at(-1);if(group&&group.at(-1).nextSibling===leaf)group.push(leaf);else leaves.push([leaf]);}
 function render(nodes,parent){for(const n of nodes){if(n.text!==undefined){parent.append(doc.createTextNode(n.text));continue;}if(n.literal!==undefined){const code=doc.createElement('code');code.textContent=n.literal;parent.append(code);continue;}if(options['标记'+n.name]===false){parent.append(doc.createTextNode(n.raw));continue;}count++;let node;
  if(['引用','媒体'].includes(n.name)){node=doc.createElement('button');node.type='button';node.className='term';node.dataset.tisyaReference=n.param;node.dataset.tisyaReferenceKind=n.name;node.setAttribute('aria-haspopup','dialog');node.textContent=n.children.map(x=>x.text??x.literal??x.raw).join('')||n.param;parent.append(node);continue;}
  if(n.name==='代码'||n.name==='终端'){node=doc.createElement('pre');const code=doc.createElement('code');code.textContent=n.literalBody??'';node.append(code);}
  else{node=doc.createElement(n.name==='密档'?'details':n.name==='标题'?'h3':n.name==='引文'?'blockquote':n.name==='注脚'?'small':'section');
   if(n.name==='密档'){const s=doc.createElement('summary');s.textContent=n.param||'密档 · 点击查看';node.append(s);}else if(n.param||!['标题','旁白','内心','诗歌','注脚'].includes(n.name)){const title=doc.createElement('header');title.textContent=n.param||n.name;node.append(title);}
   const content=doc.createElement('div');content.dataset.tisyaMarkContent='';
   if(['档案','鉴定'].includes(n.name)&&n.children.every(c=>c.text!==undefined)){const dl=doc.createElement('dl');for(const line of n.children.map(c=>c.text).join('').split('\n').filter(l=>l.trim())){const match=/^([^:：]{1,80})[:：]\s*(.*)$/.exec(line),dt=doc.createElement('dt'),dd=doc.createElement('dd');dt.textContent=match?match[1]:'记录';dd.textContent=match?match[2]:line;dd.dataset.tisyaProse='literal';dl.append(dt,dd);}content.append(dl);}
   else if(n.name==='时间轴'&&n.children.every(c=>c.text!==undefined)){const ol=doc.createElement('ol');for(const line of n.children.map(c=>c.text).join('').split('\n').filter(l=>l.trim())){const li=doc.createElement('li');li.textContent=line;li.dataset.tisyaProse='literal';ol.append(li);}content.append(ol);}
   else{render(n.children,content);for(const child of [...content.childNodes])if(child.nodeType===3){const p=doc.createElement('span');p.dataset.tisyaProse='literal';p.textContent=child.data;child.replaceWith(p);}}
   node.append(content);
  }
  node.dataset.tisyaMark=n.name;parent.append(node);
 }}
 for(const group of leaves){const source=group.map(n=>n.data).join('');if(!source.includes('〔'))continue;const nodes=parseMarks(source);if(!nodes.some(x=>x.name))continue;const fragment=doc.createDocumentFragment();render(nodes,fragment);group[0].replaceWith(fragment);for(const n of group.slice(1))n.remove();}return {count};
}
const MARK_CSS=`[data-tisya-mark]{box-sizing:border-box;margin:1em 0;padding:.7em .9em;border:1px solid #bfb48466;border-radius:.25em;background:#b4c49c0b;overflow-wrap:anywhere;line-height:1.8}[data-tisya-mark]>header{font-size:.8em;letter-spacing:.16em;color:#dfc98e;border-bottom:1px solid #bfb48444;margin-bottom:.5em;padding-bottom:.3em}[data-tisya-mark-content]{white-space:pre-wrap}[data-tisya-mark] dl{display:grid;grid-template-columns:minmax(60px,1fr) minmax(0,3fr);gap:.35em .75em}[data-tisya-mark] dt{color:#c4c6a2}[data-tisya-mark] dd{margin:0}[data-tisya-mark=标题]{text-align:center;letter-spacing:.16em;border:0;border-bottom:3px double #bfb48499;font-size:1.25em}[data-tisya-mark=事件],[data-tisya-mark=系统],[data-tisya-mark=场景]{text-align:center;border-width:3px 0 1px;border-style:double}[data-tisya-mark=内心],[data-tisya-mark=梦境]{font-style:italic;border:0;border-left:1px solid #c1b8d080;color:#c8c1d3}[data-tisya-mark=信笺],[data-tisya-mark=便签]{background:#d9ceac12;border-radius:0;border-width:1px 1px 3px}[data-tisya-mark=密档] summary{cursor:pointer;color:#dbb2a0}[data-tisya-mark=终端],[data-tisya-mark=代码]{font-family:monospace;white-space:pre-wrap;background:#001a1b55}[data-tisya-mark=播报]{border-left:3px solid #cab16c}[data-tisya-mark=旁白]{border:0;background:transparent;padding:.25em 0}[data-tisya-mark=引文],[data-tisya-mark=回忆]{border-width:0 0 0 3px;border-radius:0;color:#bdd0c0}[data-tisya-mark=诗歌]{text-align:center;border:0;line-height:2.2}[data-tisya-mark=时间轴] li{margin:.5em 0}[data-tisya-mark=收获]{border-color:#94b99c88}[data-tisya-mark=失去],[data-tisya-mark=警告]{border-color:#c88a7988}[data-tisya-mark=注脚]{display:block;border:0;border-top:1px solid #c2c0a644;opacity:.8;font-size:.8em}[data-tisya-mark=骰子]{border:1px dashed #c6b68788;text-align:center}[data-tisya-mark=消息]{border-radius:1em 1em 1em .2em;margin-left:.5em;background:#789d871a}[data-tisya-mark=档案]{border-left:4px double #c2bc9c88}[data-tisya-mark=鉴定]{box-shadow:inset 0 0 0 3px #c2bc9c0a}`;
module.exports={MARK_NAMES,formatMarks,parseMarks,MARK_CSS};
