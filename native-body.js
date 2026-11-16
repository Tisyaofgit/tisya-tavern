import {protectCode} from './markdown-code.js';
export function requiresNativePanel(document,html){const t=document.createElement('template');t.innerHTML=html;return !!t.content.querySelector('script')||[...t.content.querySelectorAll('*')].some(n=>[...n.attributes].some(a=>/^on/i.test(a.name)));}
export const canonicalNativeSource=value=>value.replace(/\r\n?/g,'\n').trim();

// Keep exact source identity across the two observed host paths: a public
// document inserted as inert code, and a fenced document passed through
// Showdown plus finishMessageFormatting. The latter removes whitespace-only
// lines and decodes code entities once. This is not fuzzy HTML equivalence and
// never changes the real source, iframe, or authored script. See the pinned
// host comparison in docs/validation/native-panel-source-20261111.md.
export function nativePanelSourceIdentities(document,value){
 const source=canonicalNativeSource(value),code=document.createElement('code');
 code.innerHTML=source.replace(/^[ \t]+$/gm,'').replaceAll('<','&lt;').replaceAll('>','&gt;');
 return new Set([source,canonicalNativeSource(code.textContent)]);
}

// Only complete HTML fences from this display pass's public regex runs are
// eligible. A single literal tick pair may surround one complete replacement;
// it never permits literal HTML, mixed provenance, or an incomplete inner fence.
function bodyParts(document,display,{includeStatic=false,inlineRuns=true}={}){
 const body=display?.body,runs=display?.bodyRuns;
 if(typeof body!=='string'||!Array.isArray(runs)||runs.map(r=>r.text).join('')!==body)return null;
 let prefix='TISYACARDRUN';while(body.includes(prefix))prefix+='X';
 const tokens=runs.map((run,index)=>prefix+index+'END');
 // The display projection can prefix a literal fence with a paragraph number.
 // Ignore that prefix only for the literal-context check, never in the output.
 const surrounding=runs.map((run,index)=>run.ruleName?tokens[index]:run.text).join('').replace(/(^|\n)\d+[ \t]+(?=`{3,}|~{3,})/g,'$1');
 const context=protectCode(surrounding).prepared;
 const inProse=(start,end)=>{let at=0;for(const [index,run]of runs.entries()){const stop=at+run.text.length;if(stop>start&&at<end&&run.ruleName&&!context.includes(tokens[index]))return false;at=stop;if(at>=end)break;}return true;};
 const lines=[...body.matchAll(/[^\n]*\n|[^\n]+$/g)],cards=[];let fence=null;
 const authored=(start,end)=>{let at=0,seen=false;for(const run of runs){const stop=at+run.text.length;if(stop>start&&at<end&&run.text.slice(Math.max(0,start-at),end-at).trim()){if(!run.ruleName)return false;seen=true;}at=stop;if(at>=end)break;}return seen;};
 const singleTickWrapped=(opening,closing,marker)=>{
  if(opening.mark!=='`'||opening.length!==4||marker[1]!=='````'||body[opening.start]!=='`'||!/^````(?:\r?\n)?$/.test(closing[0]))return false;
  const left=opening.start,right=closing.index+3;let at=0,inner=false,leftLiteral=false,rightLiteral=false;
  for(const run of runs){
   const stop=at+run.text.length;
   if(at<=left&&stop>left)leftLiteral=!run.ruleName;
   // Both inner fences and every HTML byte must belong to this one run.
   // Checking only the HTML, or merely matching rule names, would admit examples.
   if(at===left+1&&stop===right&&run.ruleName)inner=true;
   if(at<=right&&stop>right)rightLiteral=!run.ruleName;
   at=stop;if(at>right)break;
  }
  return inner&&leftLiteral&&rightLiteral;
 };
 for(const line of lines){const marker=/^ {0,3}(`{3,}|~{3,})([^\r\n]*)\r?\n?$/.exec(line[0]);
  if(!fence){if(marker)fence={start:line.index,bodyStart:line.index+line[0].length,mark:marker[1][0],length:marker[1].length,info:marker[2].trim().toLowerCase()};continue;}
  if(!marker||marker[1][0]!==fence.mark||marker[1].length<fence.length||marker[2].trim())continue;
  const html=body.slice(fence.bodyStart,line.index),end=line.index+line[0].length;
  if(['','html','htm'].includes(fence.info)&&/^\s*(?:<!doctype\s+html\b[^>]*>\s*)?<html\b/i.test(html)&&/<\/html\s*>\s*$/i.test(html)&&(authored(fence.start,end)&&inProse(fence.start,end)||singleTickWrapped(fence,line,marker))){
   const nativeHosted=requiresNativePanel(document,html);
   if(includeStatic||nativeHosted)cards.push({start:fence.start,end,html,source:canonicalNativeSource(html),nativeHosted});
  }
  fence=null;
 }
 // A whole document produced by one public rule still owns its boundary when
 // the marker touched adjacent prose. Check the surrounding Markdown with each
 // generated run made opaque: literal code examples must remain literal. The
 // same code lexer is used by prose decoration, including inline and indented
 // code. Do not edit the projection, join separate runs or invent an iframe.
 if(inlineRuns){
  let start=0;
  for(const [index,run]of runs.entries()){
   const end=start+run.text.length;
   const literalEdge=/[`~][ \t]*$/.test(runs[index-1]?.ruleName?'':runs[index-1]?.text??'')||/^[ \t]*[`~]/.test(runs[index+1]?.ruleName?'':runs[index+1]?.text??'');
   if(run.ruleName&&!literalEdge&&context.includes(tokens[index])&&!cards.some(card=>card.start<end&&card.end>start)){
    const inner=bodyParts(document,{body:run.text,bodyRuns:[run]},{includeStatic,inlineRuns:false});
    const documents=inner?.filter(part=>part.html)??[];
    if(documents.length===1&&inner.every(part=>part.html||!part.text.trim()))cards.push({...documents[0],start,end});
   }
   start=end;
  }
  cards.sort((a,b)=>a.start-b.start);
 }
 if(!cards.length)return null;
 const parts=[];let cursor=0;for(const card of cards){if(card.start>cursor)parts.push({text:body.slice(cursor,card.start)});parts.push({html:card.html,source:card.source,nativeHosted:card.nativeHosted});cursor=card.end;}if(cursor<body.length)parts.push({text:body.slice(cursor)});return parts;
}
export const nativeBodyParts=(document,display)=>bodyParts(document,display);
// Repair only the host's display copy, before Markdown sees a glued fence.
// The complete generated run must be unique in the actual host output and
// already eligible in the body's provenance-aware Markdown context. HTML and
// script bytes stay intact; the host/helper still creates the runtime.
export function prepareNativeBodyMarkdown(document,text,display){
 const eligible=new Set((nativeBodyParts(document,display)??[]).filter(part=>part.html).map(part=>part.source));
 if(!eligible.size||typeof text!=='string')return text;
 const edits=[];
 for(const run of display.bodyRuns){
  if(!run.ruleName||!run.text)continue;
  const parts=bodyParts(document,{body:run.text,bodyRuns:[run]},{inlineRuns:false});
  const cards=parts?.filter(part=>part.html)??[];
  if(cards.length!==1||!eligible.has(cards[0].source)||parts.some(part=>!part.html&&part.text.trim()))continue;
  const start=text.indexOf(run.text),end=start+run.text.length;
  if(start<0||text.indexOf(run.text,start+1)>=0||edits.some(edit=>edit.start===start))continue;
  edits.push({start,end});
 }
 for(const {start,end}of edits.sort((a,b)=>b.start-a.start)){
  const before=text.slice(0,start),after=text.slice(end);
  text=before+(before.endsWith('\n\n')?'':'\n\n')+text.slice(start,end)+(after.startsWith('\n\n')?'':'\n\n')+after;
 }
 return text;
}
// Static documents share the same provenance boundary as helper-owned cards.
// Literal examples and partially authored fences remain ordinary prose/code.
export const bodyDisplayParts=(document,display)=>bodyParts(document,display,{includeStatic:true});
