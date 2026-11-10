export function requiresNativePanel(document,html){const t=document.createElement('template');t.innerHTML=html;return !!t.content.querySelector('script')||[...t.content.querySelectorAll('*')].some(n=>[...n.attributes].some(a=>/^on/i.test(a.name)));}
export const canonicalNativeSource=value=>value.replace(/\r\n?/g,'\n').trim();

// Only complete HTML fences whose entire document came from this display pass's
// public regex runs are eligible. Literal examples and incomplete fences stay text.
export function nativeBodyParts(document,display){
 const body=display?.body,runs=display?.bodyRuns;
 if(typeof body!=='string'||!Array.isArray(runs)||runs.map(r=>r.text).join('')!==body)return null;
 const lines=[...body.matchAll(/[^\n]*\n|[^\n]+$/g)],cards=[];let fence=null;
 const authored=(start,end)=>{let at=0,seen=false;for(const run of runs){const stop=at+run.text.length;if(stop>start&&at<end&&run.text.slice(Math.max(0,start-at),end-at).trim()){if(!run.ruleName)return false;seen=true;}at=stop;if(at>=end)break;}return seen;};
 for(const line of lines){const marker=/^ {0,3}(`{3,}|~{3,})([^\r\n]*)\r?\n?$/.exec(line[0]);
  if(!fence){if(marker)fence={start:line.index,bodyStart:line.index+line[0].length,mark:marker[1][0],length:marker[1].length,info:marker[2].trim().toLowerCase()};continue;}
  if(!marker||marker[1][0]!==fence.mark||marker[1].length<fence.length||marker[2].trim())continue;
  const html=body.slice(fence.bodyStart,line.index),end=line.index+line[0].length;
  if(['','html','htm'].includes(fence.info)&&/^\s*(?:<!doctype\s+html\b[^>]*>\s*)?<html\b/i.test(html)&&/<\/html\s*>\s*$/i.test(html)&&authored(fence.start,end)&&requiresNativePanel(document,html))cards.push({start:fence.start,end,html,source:canonicalNativeSource(html)});
  fence=null;
 }
 if(!cards.length)return null;
 const parts=[];let cursor=0;for(const card of cards){if(card.start>cursor)parts.push({text:body.slice(cursor,card.start)});parts.push({html:card.html,source:card.source});cursor=card.end;}if(cursor<body.length)parts.push({text:body.slice(cursor)});return parts;
}
