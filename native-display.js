import {displayReplySource} from './display-repair.js';
import {runReplyDisplay as runDisplay} from './reply-protocol.js';
import {createDisplayCache} from './display-cache.js';
// TauriTavern engine.js: GLOBAL → PRESET → SCOPED, Markdown placement,
// capture trimming then macro expansion. Ownership stays in the original reader.
const escapeMacro=x=>typeof x==='string'?x.replace(/[\n\r\t\v\f\0.^$*+?{}[\]\\/|()]/gs,s=>({'\n':'\\n','\r':'\\r','\t':'\\t','\v':'\\v','\f':'\\f','\0':'\\0'}[s]??'\\'+s)):x;
export function createNativeDisplayPipeline({scripts,enabled,regexProvider,substitute=s=>s,substituteExtended=s=>s,contextKey=()=>'',depth=()=>0}){
 const cache=createDisplayCache({entries:64,units:6000000});let stamp=null,revision=0,entries=[],bounded=false,active=false,currentScripts=[];
 function refresh(){
  active=enabled();currentScripts=active?scripts():[];const rows=currentScripts.filter(r=>r&&!r.disabled&&r.markdownOnly&&r.placement?.includes(2));
  const prepared=rows.map(row=>{
   const mode=Number(row.substituteRegex),find=mode===1?substituteExtended(row.findRegex):mode===2?substituteExtended(row.findRegex,{},escapeMacro):row.findRegex;
   return {row,find,replace:substitute(row.replaceString.replace(/{{match}}/gi,'$0')),trim:(row.trimStrings??[]).map(s=>substitute(s))};
  });
  const next=JSON.stringify([active,contextKey(),prepared]);if(next===stamp)return false;stamp=next;revision++;
  entries=prepared.map(({row,find,replace,trim},i)=>({id:i,name:row.scriptName,enabled:true,placements:['char'],timing:'display',minDepth:row.minDepth!=null&&Number(row.minDepth)>=0?Number(row.minDepth):null,maxDepth:row.maxDepth!=null&&Number(row.maxDepth)>=0?Number(row.maxDepth):null,findRegex:find,replaceString:row.replaceString.replace(/{{match}}/gi,'$0'),trimStrings:row.trimStrings??[],substitution:'none'}));
  bounded=entries.some(r=>r.minDepth!==null||r.maxDepth!==null);return true;
 }
 const key=(message,node)=>revision+':'+(bounded?depth(message,node):'any');
 function project(source,message,node){
  const d=depth(message,node),k=JSON.stringify([source,message?.name,key(message,node)]);
  return cache.read(k,()=>runDisplay({source,groups:[{id:'host-display',entries}],depth:d,prepareRule:entry=>{
   const compiled=regexProvider.get(entry.findRegex)??/(?!)/;const regex=compiled.hasIndices?compiled:new RegExp(compiled.source,compiled.flags+'d');regex.lastIndex=0;
   return {regex,expand:(match,input)=>substitute(entry.replaceString.replace(/\$(\d+)|\$<([^>]+)>/g,(_,n,name)=>{if(n&&Number(n)>=match.length)throw Error('TISYA_DISPLAY_CAPTURE_RANGE');const range=n?match.indices[Number(n)]:match.indices.groups?.[name];if(range&&(range[0]<match.index||range[1]>match.index+match[0].length))throw Error('TISYA_DISPLAY_CAPTURE_BOUNDARY');let text=n?match[Number(n)]:match.groups?.[name];if(!text)return '';for(const trim of entry.trimStrings)text=text.replaceAll(substitute(trim,{name2Override:message?.name}),'');return text;}))};
  }}));
 }
 refresh();return {refresh,key,project,state:()=>({enabled:active,scripts:currentScripts}),report:()=>({...cache.report(),revision,rules:entries.length}),clear:()=>cache.clear()};
}
