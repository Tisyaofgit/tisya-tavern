import {splitExtraDocuments} from './world-extra.js';
import {requiresNativePanel} from './native-panels.js';

const canonical=s=>s.replace(/\r\n?/g,'\n').trim();
// A Markdown fence glued to an XML tag/CDATA is not a code block. Prepare only
// the approved public regex documents before the host's runtime-claim phase.
// The original helper remains the sole script/iframe owner; no state is read or
// written here. Never replace the host's base HTML or an existing runtime source.
export function prepareNativePanelSource(document,html,display){
 const wanted=(display?.extraPanels??[]).filter(row=>row.ruleName).flatMap(row=>splitExtraDocuments(row.html))
  .filter(part=>/^\s*(?:<!doctype\s+html\b|<html\b)/i.test(part)&&requiresNativePanel(document,part));
 if(!wanted.length)return html;
 const root=document.createElement('div');root.innerHTML=html;
 const existing=[...root.querySelectorAll('pre')].map(pre=>canonical((pre.querySelector('code')??pre).textContent));
 // An unidentified native runtime may already own a transformed source. Do not
 // start a second copy merely because its bytes differ from our projection.
 if(root.querySelector('iframe,.TH-render')||existing.some(text=>requiresNativePanel(document,text)))return html;
 let added=false;
 for(const part of wanted){
  if(existing.includes(canonical(part)))continue;
  const pre=document.createElement('pre'),code=document.createElement('code');
  code.className='language-html';code.textContent=part;pre.append(code);root.append(pre);added=true;
 }
 return added?root.innerHTML:html;
}

export function nativePanelContentProcessor({document,project,current=()=>true,onError=()=>{}}){
 return {id:'tisya-ui/native-panel-source',async prepare({message,mesid,signal},renderBase){
  const source=message?.mes,base=await renderBase();
  if(signal?.aborted||message?.mes!==source||!current(message,mesid)||message?.is_user||message?.is_system||typeof source!=='string'||!source.includes('StatusPlaceHolderImpl'))return base;
  try{return prepareNativePanelSource(document,base,project(source,message,mesid));}
  catch(error){onError(error);return base;}
 }};
}
