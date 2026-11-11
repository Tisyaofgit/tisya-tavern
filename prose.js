import {decorateBody,bodyCSS,formatMarks,MARK_CSS} from './typography-core.js';
import {projectPresentationMarks,PRESENTATION_CSS} from './extension-presentation.mjs';

export const proseStyles=(options={})=>bodyCSS(options).replace('#dfc98e','#ffedbf').replace('#a9c8bf','#e8f0ea')+MARK_CSS+PRESENTATION_CSS;
export const proseCSS=proseStyles();

// Preserve Markdown literals before the temporary HTML tree sees their tags.
// Tokens belong to this call only and are restored before the host formatter.
function protectCode(source){
 const literals=[];let prefix='TISYAPROSELITERAL';while(source.includes(prefix))prefix+='X';
 const protect=text=>{const token=prefix+literals.length+'END';literals.push({token,text});return token;};
 const inline=text=>{
  let output='',cursor=0,index=0;
  while(index<text.length){
   if(text[index]!=='`'){index++;continue;}
   let escape=index;while(escape>0&&text[escape-1]==='\\')escape--;if((index-escape)%2){index++;continue;}
   let stop=index+1;while(text[stop]==='`')stop++;const mark=text.slice(index,stop);let close=text.indexOf(mark,stop);
   while(close>=0&&(text[close-1]==='`'||text[close+mark.length]==='`'))close=text.indexOf(mark,close+mark.length);
   if(close<0){index=stop;continue;}const end=close+mark.length;output+=text.slice(cursor,index)+protect(text.slice(index,end));cursor=end;index=end;
  }
  return output+text.slice(cursor);
 };
 const whitespace=(text,start=0)=>{const raw=/^[ \t]*/.exec(text)[0];let column=start;for(const c of raw)column+=c==='\t'?4-column%4:1;return {length:raw.length,width:column-start};};
 const blockEnd=(text,paragraph)=>/^#{1,6}(?:[ \t]|$)/.test(text)||/^(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/.test(text)||paragraph&&/^(?:=+|-+)[ \t]*$/.test(text);
 let prepared='',plain='',fence=null,code='',indented=false,codeIndent=0,paragraph=false;const listIndents=[];
 for(const line of source.match(/[^\n]*\n|[^\n]+$/g)??[]){
  const marker=/^ {0,3}(`{3,}|~{3,})([^\r\n]*)\r?\n?$/.exec(line);
  if(fence){code+=line;if(marker&&marker[1][0]===fence.mark&&marker[1].length>=fence.length&&!marker[2].trim()){prepared+=protect(code);code='';fence=null;}continue;}
  const text=line.replace(/\r?\n$/,''),space=whitespace(text),blank=!text.trim();
  if(indented){if(blank||space.width>=codeIndent+4){code+=line;continue;}prepared+=protect(code);code='';indented=false;paragraph=false;}
  if(blank){plain+=line;paragraph=false;continue;}
  let content=text.slice(space.length),indent=space.width;
  const item=/^(?:([-+*])|(\d{1,9})[.)])([ \t]+|$)/.exec(content);
  while(listIndents.length&&indent<listIndents.at(-1)&&(!paragraph||item))listIndents.pop();
  let base=listIndents.at(-1)??0,ends=indent-base<4&&blockEnd(content,paragraph);
  // List ownership consumes its indentation first. Four more columns are
  // required for code, and indentation never interrupts a live paragraph.
  if(item&&!ends&&indent-base<4&&(!paragraph||content.slice(item[0].length).trim()&&(!item[2]||item[2]==='1'))){
   const width=item[0].length-item[3].length,gap=whitespace(item[3],indent+width).width;
   base=indent+width+(gap>4?1:gap||1);listIndents.push(base);indent+=width+gap;content=content.slice(item[0].length);paragraph=false;ends=indent-base<4&&blockEnd(content,false);
  }
  if(!paragraph&&indent-base>=4){prepared+=inline(plain);plain='';indented=true;codeIndent=base;code=line;continue;}
  if(marker){prepared+=inline(plain);plain='';fence={mark:marker[1][0],length:marker[1].length};code=line;paragraph=false;continue;}
  plain+=line;paragraph=!ends;
 }
 prepared+=fence||indented?protect(code):inline(plain);
 return {prepared,restore:value=>{for(const {token,text}of literals)value=value.split(token).join(text);return value;}};
}

// Only receives the public body selected by inspectMessage. Host sanitization
// remains mandatory. Build marks before Markdown splits their text boundaries.
export function formatProse(document,source,hostFormat,options={}){
 const template=document.createElement('template');
 let prepared=source;
 if(source.includes('〔')){
  const literals=protectCode(source);template.innerHTML=literals.prepared;
  const draft=document.createElement('div');draft.append(template.content);
  const authoredNodes=new Set(draft.querySelectorAll('*'));
  formatMarks(draft,options);
  if(options.presentation)projectPresentationMarks(draft,{...options.presentation,authoredNodes});
  // An unregistered reference retains its literal label. Only explicitly bound
  // historical projections above may become a card or a native media control.
  for(const button of draft.querySelectorAll('[data-tisya-reference]'))button.replaceWith(document.createTextNode(button.textContent));
  prepared=literals.restore(draft.innerHTML);
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
 decorateBody(root,options);
 return root.outerHTML;
}
