'use strict';
const LEGACY_NAMES=Object.freeze(['task','title','body','status','extra','vars','archive','memory','next']);
const XML_NAMES=Object.freeze(['task','title','body','next','status','extra','vars','archive','memory','actions']);
const bad=code=>{throw Object.assign(new Error('TISHA_OUTPUT_'+code),{code:'TISHA_OUTPUT_'+code});};
function escapeBareAmpersands(s){
 return s.replace(/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[\da-fA-F]+;)/g,(m,p)=>{
  if(/^&(?:[A-Za-z_][\w.:-]*|#[^\s&<>;]*);/.test(s.slice(p)))bad('XML_ENTITY');
  return '&amp;';
 });
}
function unxml(s){
 if(/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[\da-fA-F]+;)/.test(s))bad('XML_ENTITY');
 return s.replace(/&([^;]+);/g,(_,x)=>{const v={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"}[x];if(v)return v;const n=x[1]==='x'?parseInt(x.slice(2),16):Number(x.slice(1));if(!(n===9||n===10||n===13||n>=32&&n<=0x10ffff&&!(n>=0xd800&&n<=0xdfff)))bad('XML_ENTITY');return String.fromCodePoint(n);});
}
// A complete JSON payload is text inside these envelope blocks. In particular,
// tag names mentioned inside JSON strings do not open XML elements. Recognize
// only a syntactically complete prefix; damaged JSON still reaches the normal
// boundary/strict-JSON checks, including actual nested-reply diagnostics.
const JSON_BLOCKS=new Set(['task','title','status','vars','memory','next','actions']);
function jsonTextEnd(s,start,literalAmpersands){
 let p=start;while(/[\t\n\r ]/.test(s[p]||'')&&p<s.length)p++;
 if(s[p]!=='{'&&s[p]!=='[')return null;
 const stack=[];let quoted=false,escaped=false;
 for(let i=p;i<s.length;){
  let c=s[i++];
  if(c==='&'){
   const entity=/^&(?:amp|lt|gt|quot|apos|#\d+|#x[\da-fA-F]+);/.exec(s.slice(i-1));
   if(entity){c=unxml(entity[0]);i+=entity[0].length-1;}
  }
  if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;continue;}
  if(c==='"'){quoted=true;continue;}
  if(c==='<')return null;
  if(c==='{'||c==='[')stack.push(c);
  else if(c==='}'||c===']'){
   if(stack.pop()!==(c==='}'?'{':'['))return null;
   if(!stack.length){
    const raw=s.slice(start,i),value=unxml(literalAmpersands?escapeBareAmpersands(raw):raw);
    try{JSON.parse(value);}catch(_){return null;}
    return i;
   }
  }
 }
 return null;
}
function* xmlTokens(s,{tolerateTail=false,literalAmpersands=false}={}){
 if(typeof s!=='string'||s.length>2000000)bad('SIZE');
 if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(s))bad('XML_CHARACTER');
 let p=0;const path=[];
 while(p<s.length){
  if(path.length===2&&path[0]==='reply'&&JSON_BLOCKS.has(path[1])){
   const end=jsonTextEnd(s,p,literalAmpersands);
   if(end!==null){const raw=s.slice(p,end);yield {kind:'text',value:unxml(literalAmpersands?escapeBareAmpersands(raw):raw),raw,json:true,start:p,end};p=end;continue;}
  }
  if(s[p]!=='<'){let q=s.indexOf('<',p);if(q<0)q=s.length;const raw=s.slice(p,q);yield {kind:'text',value:unxml(literalAmpersands?escapeBareAmpersands(raw):raw),raw,start:p,end:q};p=q;continue;}
  if(s.startsWith('<![CDATA[',p)){const q=s.indexOf(']]>',p+9);if(q<0){if(tolerateTail)return;bad('XML_CDATA');}yield {kind:'text',value:s.slice(p+9,q),cdata:true,start:p,end:q+3};p=q+3;continue;}
  if(s.startsWith('<!--',p)){const q=s.indexOf('-->',p+4);if(q<0){if(tolerateTail)return;bad('XML_COMMENT');}if(s.slice(p+4,q).includes('--'))bad('XML_COMMENT');yield {kind:'comment',value:s.slice(p+4,q),start:p,end:q+3};p=q+3;continue;}
  let m=/^<(\/)?([A-Za-z_][\w.:-]*)((?:\s+[A-Za-z_][\w.:-]*\s*=\s*(?:"[^"<]*"|'[^'<]*'))*\s*)(\/?)>/.exec(s.slice(p));
  // Native card marker names may be Unicode, exclusively inside extra.
  if(!m&&path[0]==='reply'&&path[1]==='extra'&&path.length>=2)m=/^<(\/)?([\p{L}_][\p{L}\p{N}\p{M}_.:-]*)((?:\s+[A-Za-z_][\w.:-]*\s*=\s*(?:"[^"<]*"|'[^'<]*'))*\s*)(\/?)>/u.exec(s.slice(p));
  if(!m){if(tolerateTail&&s.indexOf('>',p)<0)return;bad('XML_TAG');}
  if(m[1]&&(m[3].trim()||m[4]))bad('XML_CLOSE');
  const attrs={};for(const a of m[3].matchAll(/([A-Za-z_][\w.:-]*)\s*=\s*(["'])(.*?)\2/g)){if(Object.hasOwn(attrs,a[1]))bad('XML_ATTRIBUTE_DUPLICATE');attrs[a[1]]=unxml(a[3]);}
  if(m[1])path.pop();else if(!m[4])path.push(m[2]);
  yield {kind:m[1]?'close':'open',name:m[2],attrs,selfClose:!!m[4],start:p,end:p+m[0].length};p+=m[0].length;
 }
}
const escape=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const tag=t=>'<'+t.name+Object.entries(t.attrs).map(([k,v])=>' '+k+'="'+escape(v)+'"').join('')+(t.selfClose?'/':'')+'>';
const DISPLAY_BLOCKS=new Set(['body','extra']);
const DISPLAY_FORBIDDEN=new Set(['script','style','template','head','iframe','object','embed','link','meta','form','input','button','select','textarea']);
function displayTag(t){if(DISPLAY_FORBIDDEN.has(t.name.toLowerCase()))bad('DISPLAY_UNSAFE_TAG');return tag(t);}
// Only documented, closed protocol wrappers may precede the reply. Never
// search arbitrary prose for <reply>, and never interpret thought text as XML.
const LEADING_THOUGHTS=new Set(['think','thinking','world_thinking','character_mode','character_thinking']);
function replyRegion(source,{partial=false}={}){
 if(typeof source!=='string'||source.length>2000000)bad('SIZE');
 let p=0;const thoughts=[];
 function trivia(){while(p<source.length){const ws=/^\s+/.exec(source.slice(p));if(ws){p+=ws[0].length;continue;}if(source.startsWith('<!--',p)){const end=source.indexOf('-->',p+4);if(end<0||source.slice(p+4,end).includes('--'))bad('XML_COMMENT');p=end+3;continue;}break;}}
 function opening(){return /^<([A-Za-z_][\w.:-]*)(?:\s+[A-Za-z_][\w.:-]*\s*=\s*(?:"[^"<]*"|'[^'<]*'))*\s*>/.exec(source.slice(p));}
 function opaque(m){
  const name=m[1],begin=p,content=p+m[0].length;let depth=1,q=content;
  const tokens=new RegExp('<!--[\\s\\S]*?-->|<!\\[CDATA\\[[\\s\\S]*?\\]\\]>|<(/?)'+name+'(?=[\\s/>])(?:[^>"\\\']|"[^"]*"|\\\'[^\\\']*\\\')*>','g');tokens.lastIndex=q;
  for(let t;(t=tokens.exec(source));){if(t[0].startsWith('<!--')||t[0].startsWith('<!['))continue;if(t[1]){if(!new RegExp('^</'+name+'\\s*>$').test(t[0]))bad('WRAPPER_BOUNDARY');depth--;}else if(!t[0].endsWith('/>'))depth++;
   if(depth>64)bad('XML_DEPTH');if(!depth){p=tokens.lastIndex;return {name,text:source.slice(content,t.index),start:begin,end:p};}
  }bad('WRAPPER_INCOMPLETE');
 }
 trivia();
 for(let count=0;;count++){
  const m=opening();if(!m||!LEADING_THOUGHTS.has(m[1]))break;
  if(count>=64)bad('XML_DEPTH');thoughts.push(opaque(m));trivia();
 }
 let output=false;if(/^<output\s*>/.test(source.slice(p))){p+=/^<output\s*>/.exec(source.slice(p))[0].length;output=true;trivia();}
 if(!/^<reply\b/.test(source.slice(p)))bad('REPLY');
 const start=p;
 if(partial)return {source:source.slice(start),thoughts,wrapped:output};
 let depth=0,end=null;
 for(const t of xmlTokens(source.slice(start))){
  if(t.kind==='open'&&!t.selfClose)depth++;
  else if(t.kind==='close'){depth--;if(depth===0){if(t.name!=='reply')bad('XML_CLOSE');end=start+t.end;break;}}
 }
 if(end===null)bad('INCOMPLETE');p=end;trivia();
 if(output){const close=/^<\/output\s*>/.exec(source.slice(p));if(!close)bad('WRAPPER_BOUNDARY');p+=close[0].length;trivia();}
 const tail=opening();if(tail?.[1]==='narrative_close'){opaque(tail);trivia();}
 if(p!==source.length)bad('OUTSIDE');
 return {source:source.slice(start,end),thoughts,wrapped:output};
}
function isReplyMessage(source){try{return !!replyRegion(source,{partial:true});}catch(_){return false;}}
function readEnvelope(source,acceptId){
 source=replyRegion(source).source;
 const blocks=Object.create(null),attrs=Object.create(null),stack=[];let id=null,root=false,closed=false,current=null,index=0,names=null;
 const structured=new Set(['task','title','next','vars','actions']);
 // Structured data plus body/extra display markup retain child tags. Other
 // payload blocks stay text-only and must use CDATA for embedded source.
 for(const t of xmlTokens(source)){
  if(t.kind==='comment'){if(/填写|占位/.test(t.value))bad('PLACEHOLDER');if(current==='body')blocks.body+='<!--'+t.value+'-->';continue;}
  if(t.kind==='text'){
   if(current)blocks[current]+=current==='body'?(t.cdata?t.value:t.raw):structured.has(current)&&current!=='vars'&&stack.length>2?escape(t.value):t.value;
   else if(t.value.trim())bad('OUTSIDE');continue;
  }
  if(t.kind==='open'){
   if(!stack.length){if(root||closed||t.name!=='reply'||t.selfClose||Object.keys(t.attrs).length&&(Object.keys(t.attrs).join()!=='id'||!acceptId(t.attrs.id)))bad('REPLY');root=true;id=t.attrs.id??null;}
   else if(stack.length===1){if(index===3)names=t.name==='next'?XML_NAMES:LEGACY_NAMES;if(t.name!==(names||XML_NAMES)[index++])bad('BLOCK_ORDER');current=t.name;blocks[current]='';attrs[current]=t.attrs;}
   else {if(DISPLAY_BLOCKS.has(current))blocks[current]+=displayTag(t);else{if(!structured.has(current))bad('NESTED_BLOCK_'+current.toUpperCase());blocks[current]+=tag(t);}}
   stack.push(t.name);if(stack.length>64)bad('XML_DEPTH');if(t.selfClose){stack.pop();if(stack.length===1)current=null;}
  }else{if(stack.length>2)blocks[current]+='</'+t.name+'>';if(stack.pop()!==t.name)bad('XML_CLOSE');if(t.name==='reply')closed=true;if(stack.length<2)current=null;}
 }
 if(!closed||stack.length||index!==(names||XML_NAMES).length)bad('INCOMPLETE');
 const e={id,blocks,attrs};return names===XML_NAMES?require('./pipes-wire.cjs').projectEnvelope(e):require('./rows-wire.cjs').projectEnvelope(e);
}
// Generation IDs correlate a saved reply with one prepared request. Display
// reads an already stored message by its host message ID and full source, so
// its XML ID is opaque metadata, never a generation receipt or a DOM selector.
// Both paths retain the same envelope, block-order and markup validation.
function parseEnvelope(source){return readEnvelope(source,id=>/^[0-9a-f]{32}$/.test(id));}
function parseDisplayEnvelope(source){return readEnvelope(source,id=>typeof id==='string'&&id.trim().length>0);}
function extractXMLBody(source){
 source=replyRegion(source,{partial:true}).source;
 const bodyStack=[];let depth=0,inside=false,found=0,done=false,value='',root=false;
 for(const t of xmlTokens(source,{tolerateTail:true})){
  if(t.kind==='open'){
   if(depth===0&&t.name==='reply')root=true;
   if(root&&depth===1&&t.name==='body'){if(++found>1)bad('BODY_BOUNDARY');inside=true;if(t.selfClose){inside=false;done=true;}else bodyStack.push('body');}
   else if(inside){value+=displayTag(t);if(!t.selfClose)bodyStack.push(t.name);}
   if(!t.selfClose)depth++;
  }else if(t.kind==='close'){
   if(inside){if(bodyStack.at(-1)!==t.name)bad('XML_CLOSE');if(bodyStack.length===1){inside=false;done=true;}else value+='</'+t.name+'>';bodyStack.pop();}
   depth--;if(root&&depth===0&&t.name==='reply')break;
  }else if(t.kind==='text'&&inside)value+=t.cdata?t.value:t.raw;
  else if(t.kind==='comment'&&inside)value+='<!--'+t.value+'-->';
 }
 if(found!==1||!done||inside)bad('BODY_BOUNDARY');return value;
}
function replyGenerationId(source){try{source=replyRegion(source,{partial:true}).source;return /^\s*<reply\s+id\s*=\s*(["'])([0-9a-f]{32})\1\s*>/.exec(source)?.[2]||null;}catch(_){return null;}}
module.exports={replyRegion,isReplyMessage,xmlTokens,escapeBareAmpersands,XML_NAMES,LEGACY_NAMES,parseEnvelope,parseDisplayEnvelope,extractXMLBody,replyGenerationId};
