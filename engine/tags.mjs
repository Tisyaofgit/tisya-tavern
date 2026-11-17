import {clone,fail} from './common.mjs';
import {xmlTokens} from '../reader-core.js';
import {opaqueBlockEnd,groupedExtraSlots} from '../native-mvu-wire.js';
import {protectCode} from '../markdown-code.js';
export const DEFAULT_TAGS=Object.freeze(Object.fromEntries(['reply','task','anchor','title','body','extra','cells','vars','archive','actions'].map(k=>[k,k])));
const blocked=new Set(['script','style','iframe','html','head','meta','link','svg','math','template','object','embed','img','input','button','a','div','span','p']);
let active={...DEFAULT_TAGS},history=[],revision=0;
const regexLiteral=text=>text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export const tagRevision=()=>revision;
export function validateTags(tags={}){
 const out={...DEFAULT_TAGS,...tags},seen=new Set();for(const [key,value]of Object.entries(out)){if(!(key in DEFAULT_TAGS)||typeof value!=='string'||!/^[_A-Za-z][_A-Za-z0-9.-]{0,63}$/.test(value)||blocked.has(value.toLowerCase()))fail('OUTPUT_TAG','标签须使用1—64位字母、数字、下划线、点或横线，且不能占用HTML展示标签',{key,value});if(seen.has(value.toLowerCase()))fail('OUTPUT_TAG_DUPLICATE','输出标签不能重复',{value});seen.add(value.toLowerCase());}return out;
}
export function configureTags(tags={},aliases=[]){active=validateTags(tags);history=aliases.map(validateTags);revision++;}
export const currentTags=()=>clone(active);
// Historical prose may contain arbitrary HTML. Only our own protocol markers
// select the envelope reader; markup, attributes and quoted code do not.
// This classification grants no permission to accept or execute a reply.
export function hasEnvelopeMarkers(source){
 const raw=String(source);
 const names=new Set([...Object.values(DEFAULT_TAGS),...Object.values(active),...history.flatMap(Object.values),'boby','think','thinking','world_thinking','character_mode','character_thinking','output','narrative_close','next','status','memory','before','after'].map(n=>n.toLowerCase()));
 // Whitespace before an actual root has always been legal. Do not let the
 // Markdown indentation rules reclassify that root as a historical code block.
 const first=/^\s*(?:<!--[\s\S]*?-->\s*)*<\/?([A-Za-z_][\w:.-]*)(?=[\s/>]|$)/.exec(raw);
 if(first&&names.has(first[1].toLowerCase()))return true;
 const text=protectCode(raw).prepared;
 const leading=text.replace(/^\s*(?:<!--[\s\S]*?-->\s*)*/,'').replace(/^<!doctype\s+html[^>]*>\s*/i,'');
 // body/title also belong to ordinary complete HTML documents. The remaining
 // protocol blocks still identify a malformed machine envelope inside one.
 if(/^<html(?=[\s>])/i.test(leading)){names.delete('body');names.delete('title');}
 const tags=/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\/?([A-Za-z_][\w:.-]*)(?=[\s/>]|$)/g;
 for(let match;(match=tags.exec(text));){
  if(!match[1])continue;
  const name=match[1].toLowerCase();if(names.has(name))return true;
  // Advance over the whole tag so a protocol example in an HTML attribute is
  // not mistaken for an actual boundary. Script/style source is opaque data.
  const tail=/^(?:[^<>"']|"[^"]*"|'[^']*')*>/.exec(text.slice(tags.lastIndex));
  if(!tail)continue;tags.lastIndex+=tail[0].length;
  if(!match[0].startsWith('</')&&['script','style'].includes(name)){
   const close=new RegExp('</'+name+'\\s*>','ig');close.lastIndex=tags.lastIndex;
   const end=close.exec(text);if(!end)break;tags.lastIndex=close.lastIndex;
  }
 }
 return false;
}
// Prompt references are token replacements, not a destructive source-code edit.
// Word boundaries include identifiers to avoid changing "bodyguard" or storage keys.
export function rewriteTagReferences(text,from=DEFAULT_TAGS,to=active){
 const map=new Map(Object.keys(DEFAULT_TAGS).map(k=>[from[k],to[k]]).filter(([a,b])=>a!==b));if(!map.size)return String(text);
 const re=new RegExp('(?<![\\w.-])('+[...map.keys()].map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).sort((a,b)=>b.length-a.length).join('|')+')(?![\\w.-])','g');return String(text).replace(re,m=>map.get(m));
}
// Only envelope-level protocol tokens are normalized; HTML, code and quoted
// machine payloads inside a block remain byte-for-byte source data.
export function envelopeTags(source,tags=active){
 const candidates=[tags,...history,DEFAULT_TAGS];let selected;
 let score=-1;for(const map of candidates){const name=map.reply.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');if(new RegExp('^\\s*<'+name+'(?=[\\s>])','i').test(source)){const found=Object.values(map).reduce((n,t)=>n+(new RegExp('<'+t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?=[\\s/>])','i').test(source)?1:0),0);if(found>score){selected=map;score=found;}}}
 return selected??null;
}
export function normalizeEnvelope(source,tags=active){
 const selected=envelopeTags(source,tags);if(!selected)return source;
 const inverse=Object.fromEntries(Object.entries(selected).map(([k,v])=>[v.toLowerCase(),k]));
 const root=regexLiteral(selected.reply),rootEnd=new RegExp('</'+root+'\\s*>\\s*(?:<StatusPlaceHolderImpl\\s*/>\\s*)?$','i').exec(source);if(!rootEnd)return source;
 const first=source.indexOf('>')+1;let at=first,out=source.slice(0,first).replace(new RegExp('(<)'+root,'i'),'$1reply');
 while(at<rootEnd.index){const m=/^\s*<([_A-Za-z][\w.-]*)(?=[\s/>])([^>]*?)(\/?)>/.exec(source.slice(at));if(!m)break;const name=m[1],canon=inverse[name.toLowerCase()];if(!canon||canon==='reply')break;
  const open=m[0].replace('<'+name,'<'+canon);out+=open;at+=m[0].length;if(m[3])continue;
  const close=new RegExp('</'+regexLiteral(name)+'\\s*>','ig');close.lastIndex=at;const end=['extra','vars','task','anchor','title','body','actions'].includes(canon)?opaqueBlockEnd(source,at-m[0].length,xmlTokens,canon,selected):close.exec(source);if(!end)break;out+=source.slice(at,end.index)+'</'+canon+'>';at=end.end??close.lastIndex;
 }
 return out+source.slice(at,rootEnd.index)+source.slice(rootEnd.index).replace(new RegExp('</'+root,'i'),'</reply');
}
export function isMatrixReply(source){
 const raw=String(source??''),s=normalizeEnvelope(raw);if(!/^\s*<reply\b/i.test(s))return false;
 if(/<anchor\b/i.test(s)||/<cells(?:\s|\/|>)/i.test(s))return true;
 // A sparse reply can omit anchors. Its grouped cells alias still identifies
 // Matrix; quoted alias text inside vars must not change protocol routing.
 const names=envelopeTags(raw);return !!names&&names.cells!=='cells'&&/<cells(?:\s|\/|>)/i.test(groupedExtraSlots(s,xmlTokens,names));
}
