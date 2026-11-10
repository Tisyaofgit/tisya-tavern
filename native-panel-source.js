import {inspectMessage} from './reader.js';
import {splitExtraDocuments} from './world-extra.js';
import {requiresNativePanel,nativeBodyParts} from './native-body.js';

const canonical=s=>s.replace(/\r\n?/g,'\n').trim();
// A Markdown fence glued to an XML tag/CDATA is not a code block. Prepare only
// the approved public regex documents before the host's runtime-claim phase.
// The original helper remains the sole script/iframe owner; no state is read or
// written here. Never replace the host's base HTML or an existing runtime source.
export function prepareNativePanelSource(document,html,display){
 const body=(nativeBodyParts(document,display)??[]).filter(part=>part.html).map(part=>part.html);
 const wanted=[...body,...(display?.extraPanels??[]).filter(row=>row.ruleName).flatMap(row=>splitExtraDocuments(row.html))
  .filter(part=>/^\s*(?:<!doctype\s+html\b|<html\b)/i.test(part)&&requiresNativePanel(document,part))];
 if(!wanted.length)return html;
 const identities=wanted.map(canonical);
 // Repeated documents have no unique owner. Do not manufacture two runtime
 // candidates for a source that the later ownership check cannot distinguish.
 if(new Set(identities).size!==identities.length)return html;
 const root=document.createElement('div');root.innerHTML=html;
 const existing=[...root.querySelectorAll('pre')].map(pre=>({pre,source:canonical((pre.querySelector('code')??pre).textContent)}));
 // An unidentified native runtime may already own a transformed source. Do not
 // start a second copy merely because its bytes differ from our projection.
 if(root.querySelector('iframe,.TH-render')||existing.some(row=>requiresNativePanel(document,row.source)&&!identities.includes(row.source)))return html;
 const known=existing.filter(row=>identities.includes(row.source));
 if(new Set(known.map(row=>row.source)).size!==known.length||known.some((row,index)=>index>0&&identities.indexOf(known[index-1].source)>identities.indexOf(row.source)))return html;
 const present=new Map(known.map(row=>[row.source,row.pre]));
 let added=false;
 for(const [index,part]of wanted.entries()){
  if(present.has(identities[index]))continue;
  const pre=document.createElement('pre'),code=document.createElement('code');
  code.className='language-html';code.textContent=part;pre.append(code);
  const next=identities.slice(index+1).map(source=>present.get(source)).find(Boolean);
  if(next)next.before(pre);else root.append(pre);
  present.set(identities[index],pre);added=true;
 }
 return added?root.innerHTML:html;
}

export function nativePanelContentProcessor({document,project,current=()=>true,onError=()=>{}}){
 return {id:'tisya-ui/native-panel-source',async prepare({message,mesid,signal},renderBase){
  const source=message?.mes,base=await renderBase();
  if(signal?.aborted||message?.mes!==source||!current(message,mesid)||message?.is_user||message?.is_system||typeof source!=='string'||(!source.includes('StatusPlaceHolderImpl')&&!inspectMessage(source).structured))return base;
  try{return prepareNativePanelSource(document,base,project(source,message,mesid));}
  catch(error){onError(error);return base;}
 }};
}
