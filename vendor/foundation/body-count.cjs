'use strict';
const fail=code=>{throw Object.assign(new Error('TISHA_OUTPUT_'+code),{code:'TISHA_OUTPUT_'+code});};
// Deterministic text projection. Does not render HTML, run CSS/JS, or count URLs,
// tag names and attributes. Custom CSS visibility is outside this definition.
const entities={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',ensp:' ',emsp:' ',thinsp:' ',ndash:'–',mdash:'—',hellip:'…',lsquo:'‘',rsquo:'’',ldquo:'“',rdquo:'”',copy:'©',reg:'®',trade:'™',times:'×',divide:'÷',middot:'·'};
function visibleText(text){
 if(typeof text!=='string')fail('BODY_TYPE');
 const code=[];let t=text.replace(/(^|\n)[ \t]*(`{3,}|~{3,})[^\n]*\n([\s\S]*?)\n[ \t]*\2[ \t]*(?=\n|$)/g,(_,lead,fence,body)=>{code.push(body);return lead+'\uE000'+(code.length-1)+'\uE001';})
 .replace(/(`+)([^\n]*?)\1/g,(_,ticks,body)=>{code.push(body);return '\uE000'+(code.length-1)+'\uE001';})
 .replace(/<!--[^]*?-->/g,'').replace(/<(script|style|template|head)\b[^>]*>[^]*?<\/\1\s*>/gi,'')
 .replace(/<([a-z][\w:-]*)\b(?=[^>]*\bhidden(?:\s|=|>))[^>]*>[^]*?<\/\1\s*>/gi,'')
 .replace(/<([a-z][\w:-]*)\b(?=[^>]*\bstyle\s*=\s*["'][^"']*(?:display\s*:\s*none|visibility\s*:\s*hidden))[^>]*>[^]*?<\/\1\s*>/gi,'')
 .replace(/<https?:\/\/([^>]+)>/gi,(_,tail)=>'https://'+tail)
 .replace(/<\/?[a-z][^>]*>/gi,' ').replace(/<![^>]*>/g,'')
 .replace(/^\s{0,3}\[[^\]]+\]:[^\n]*$/gm,'')
 .replace(/!\[(?:\\.|[^\]\\])*\]\([^\n]*?\)/g,'')
 .replace(/!\[[^\]]*\]\[[^\]]*\]/g,'')
 .replace(/\[((?:\\.|[^\]\\])*)\]\((?:\\.|[^()\\]|\([^()]*\))*\)/g,'$1')
 .replace(/\[([^\]]+)\]\[[^\]]*\]/g,'$1')
 .replace(/&(#x[\da-f]+|#\d+|[a-z][\da-z]+);/gi,(match,name)=>{
  if(name[0]==='#'){const n=name[1].toLowerCase()==='x'?parseInt(name.slice(2),16):Number(name.slice(1));return n>0&&n<=0x10ffff&&!(n>=0xd800&&n<=0xdfff)?String.fromCodePoint(n):'�';}
  if(Object.hasOwn(entities,name))return entities[name];fail('ENTITY_UNSUPPORTED');
 }).replace(/\uE000(\d+)\uE001/g,(_,i)=>code[Number(i)]);
 return t.normalize('NFC').replace(/[0-9#*]\ufe0f?\u20e3/g,'');
}
function countBody(text,unit='字'){
 const t=visibleText(require('./numbered-paragraphs.cjs').text(text));
 if(unit==='字')return [...t].filter(c=>/[\p{L}\p{N}]/u.test(c)).length;
 if(unit!=='词')fail('COUNT_UNIT');
 if(typeof Intl?.Segmenter!=='function')fail('WORD_SEGMENTER_UNAVAILABLE');
 return [...new Intl.Segmenter('und',{granularity:'word'}).segment(t)].filter(s=>s.isWordLike).length;
}
const {extractXMLBody:extractBody}=require('./xml-envelope.cjs');
module.exports={visibleText,countBody,extractBody};
