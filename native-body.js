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

// Only complete HTML fences whose entire document came from this display pass's
// public regex runs are eligible. Literal examples and incomplete fences stay text.
function bodyParts(document,display,{includeStatic=false}={}){
 const body=display?.body,runs=display?.bodyRuns;
 if(typeof body!=='string'||!Array.isArray(runs)||runs.map(r=>r.text).join('')!==body)return null;
 const lines=[...body.matchAll(/[^\n]*\n|[^\n]+$/g)],cards=[];let fence=null;
 const authored=(start,end)=>{let at=0,seen=false;for(const run of runs){const stop=at+run.text.length;if(stop>start&&at<end&&run.text.slice(Math.max(0,start-at),end-at).trim()){if(!run.ruleName)return false;seen=true;}at=stop;if(at>=end)break;}return seen;};
 for(const line of lines){const marker=/^ {0,3}(`{3,}|~{3,})([^\r\n]*)\r?\n?$/.exec(line[0]);
  if(!fence){if(marker)fence={start:line.index,bodyStart:line.index+line[0].length,mark:marker[1][0],length:marker[1].length,info:marker[2].trim().toLowerCase()};continue;}
  if(!marker||marker[1][0]!==fence.mark||marker[1].length<fence.length||marker[2].trim())continue;
  const html=body.slice(fence.bodyStart,line.index),end=line.index+line[0].length;
  if(['','html','htm'].includes(fence.info)&&/^\s*(?:<!doctype\s+html\b[^>]*>\s*)?<html\b/i.test(html)&&/<\/html\s*>\s*$/i.test(html)&&authored(fence.start,end)){
   const nativeHosted=requiresNativePanel(document,html);
   if(includeStatic||nativeHosted)cards.push({start:fence.start,end,html,source:canonicalNativeSource(html),nativeHosted});
  }
  fence=null;
 }
 if(!cards.length)return null;
 const parts=[];let cursor=0;for(const card of cards){if(card.start>cursor)parts.push({text:body.slice(cursor,card.start)});parts.push({html:card.html,source:card.source,nativeHosted:card.nativeHosted});cursor=card.end;}if(cursor<body.length)parts.push({text:body.slice(cursor)});return parts;
}
export const nativeBodyParts=(document,display)=>bodyParts(document,display);
// Static documents share the same provenance boundary as helper-owned cards.
// Literal examples and partially authored fences remain ordinary prose/code.
export const bodyDisplayParts=(document,display)=>bodyParts(document,display,{includeStatic:true});
