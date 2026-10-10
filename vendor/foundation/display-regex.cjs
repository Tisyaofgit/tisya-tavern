'use strict';
const {xmlTokens,parseDisplayEnvelope,replyRegion}=require('./xml-envelope.cjs');
const fail=(code,details={})=>{throw Object.assign(new Error(code),{code,details});};
const LIMIT=2000000;
function partition(source){
 source=replyRegion(source).source;
 const envelope=parseDisplayEnvelope(source),hideExtra=envelope.wire&&!require('./reader-projection.cjs').extraAllowed(JSON.parse(envelope.blocks.memory)); // Stored-message structure, not generation identity; never parse rendered HTML as XML.
 const runs=[];let depth=0,owner='outside',panel=null,panelCount=0;
 for(const t of xmlTokens(source)){
  let boundary=false;
  if(t.kind==='open'){
   if(depth===1){owner=['body','extra'].includes(t.name)?t.name:'machine';boundary=true;}
   if(owner==='extra'&&depth===2)panel={id:'extra-'+(++panelCount),tag:t.name,label:t.attrs.title??t.attrs.name??null};
   if(!t.selfClose)depth++;
  }else if(t.kind==='close'){depth--;boundary=depth===1;}
  runs.push({text:hideExtra&&owner==='extra'&&!boundary?'':source.slice(t.start,t.end),owner,boundary,panel});
  if(owner==='extra'&&depth===2&&(t.kind==='close'||t.selfClose))panel=null;
  if(boundary&&(t.kind==='close'||t.selfClose))owner='outside';
 }
 return runs;
}
function sliceRuns(runs,start,end){
 const result=[];let at=0;
 for(const r of runs){const stop=at+r.text.length;if(stop>start&&at<end)result.push({...r,text:r.text.slice(Math.max(0,start-at),end-at)});at=stop;if(at>=end)break;}
 return result;
}
function coalesce(runs){
 const result=[];
 for(const r of runs){if(!r.text)continue;const last=result.at(-1);if(last&&last.owner===r.owner&&last.boundary===r.boundary&&last.panel?.id===r.panel?.id&&last.ruleName===r.ruleName)last.text+=r.text;else result.push({...r});}
 return result;
}
function compile(entry){
 if(typeof entry.findRegex!=='string'||typeof entry.replaceString!=='string')fail('RULE_TEXT_INVALID');
 if(/<%|\{\{(?!match\}\})/.test(entry.findRegex+'\n'+entry.replaceString))fail('TEMPLATE_RUNTIME_REQUIRED');
 if(entry.findRegex.includes('{{match}}'))fail('PATTERN_MACRO_UNSUPPORTED');
 if(/\$(?:`|')/.test(entry.replaceString))fail('CROSS_REGION_CONTEXT_SUBSTITUTION');
 if(!Array.isArray(entry.trimStrings))fail('RULE_TRIM_INVALID');
 if(entry.trimStrings.length)fail('TRIM_SEMANTICS_UNVERIFIED');
 if(!['none','raw','escaped'].includes(entry.substitution))fail('RULE_SUBSTITUTION_INVALID');
 // Imported ST patterns default to case-sensitive, first-match replacement.
 // Explicit flags keep their own semantics. This is the ST compatibility
 // contract, not a claim that every native Tavo regex option was replicated.
 const end=entry.findRegex.lastIndexOf('/');
 try{return entry.findRegex.startsWith('/')&&end>0?new RegExp(entry.findRegex.slice(1,end),entry.findRegex.slice(end+1)):new RegExp(entry.findRegex);}
 catch(_){fail('REGEX_SYNTAX_INVALID');}
}
function expand(template,match,input){
 return template.replace(/\{\{match\}\}|\$(\$|&|`|'|\d{1,2}|<[^>]*>)/g,(token,key)=>{
  if(token==='{{match}}'||key==='&')return match[0];
  if(key==='$')return '$';
  if(key==='`')return input.slice(0,match.index);
  if(key==="'")return input.slice(match.index+match[0].length);
  if(key.startsWith('<'))return match.groups===undefined?token:match.groups[key.slice(1,-1)]??'';
  const n=Number(key);if(n>0&&n<match.length)return match[n]??'';
  if(key.length===2&&Number(key[0])>0&&Number(key[0])<match.length)return (match[Number(key[0])]??'')+key[1];
  return token;
 });
}
function applyRule(runs,entry){
 const re=compile(entry),input=runs.map(r=>r.text).join(''),out=[];
 let cursor=0,count=0,size=0;
 function append(items){for(const r of items){size+=r.text.length;if(size>LIMIT)fail('DISPLAY_SIZE_LIMIT');out.push(r);}}
 for(let m;(m=re.exec(input));){
  if(++count>10000)fail('MATCH_COUNT_LIMIT');
  const start=m.index,end=start+m[0].length;
  const touched=sliceRuns(runs,start,end||start);
  // Zero-width inserts are attributed to the adjacent source run. Ambiguous
  // boundaries are refused rather than assigned to an arbitrary block.
  const context=m[0].length?touched:sliceRuns(runs,Math.max(0,start-1),Math.min(input.length,start+1));
  const owners=new Set(context.map(r=>r.owner));
  if(owners.size!==1)fail('CROSS_REGION_MATCH',{start,end});
  const owner=[...owners][0];
  const panels=[...new Map(context.filter(r=>r.panel).map(r=>[r.panel.id,r.panel])).values()];
  let panel=panels[0]??null;
  // A rule that spans panels owns their combined output. Merge provenance
  // everywhere instead of re-running the rule on isolated fragments.
  if(panels.length>1){const ids=new Set(panels.map(p=>p.id));panel={...panel,tag:null,label:'组合扩展'};for(const r of [...runs,...out])if(ids.has(r.panel?.id))r.panel=panel;}
  append(sliceRuns(runs,cursor,start));
  append([{text:expand(entry.replaceString,m,input),owner,boundary:false,panel,ruleName:entry.name??entry.scriptName??null}]);
  cursor=end;
  if(!re.global)break;
  if(m[0]===''){
   const point=input.codePointAt(re.lastIndex);
   re.lastIndex+=(re.unicode||re.unicodeSets)&&point>0xffff?2:1;
  }
 }
 append(sliceRuns(runs,cursor,input.length));
 return {runs:coalesce(out),count};
}
function applicable(e,depth){
 if(typeof e.enabled!=='boolean')fail('RULE_ENABLED_INVALID');
 if(!e.enabled)return 'disabled';
 if(!Array.isArray(e.placements)||e.placements.some(x=>!['char','user','reasoning','lorebook'].includes(x)))fail('RULE_PLACEMENT_INVALID');
 if(!e.placements.includes('char'))return 'other-role';
 if(!['display','sendAndDisplay','send','receive','editAndReceive'].includes(e.timing))fail('RULE_TIMING_INVALID');
 if(!['display','sendAndDisplay'].includes(e.timing))return 'non-display';
 for(const k of ['minDepth','maxDepth'])if(e[k]!=null&&(!Number.isSafeInteger(e[k])||e[k]<0))fail('RULE_DEPTH_INVALID');
 if(e.minDepth!=null||e.maxDepth!=null){
  const d=Number.isSafeInteger(depth)?{min:depth,max:depth}:depth;
  if(!d||!Number.isSafeInteger(d.min)||d.min<0||(d.max!==null&&(!Number.isSafeInteger(d.max)||d.max<d.min)))fail('MESSAGE_DEPTH_REQUIRED');
  if(e.minDepth!=null&&d.max!==null&&d.max<e.minDepth||e.maxDepth!=null&&d.min>e.maxDepth)return 'depth';
  if(e.minDepth!=null&&d.min<e.minDepth||e.maxDepth!=null&&(d.max===null||d.max>e.maxDepth))fail('MESSAGE_DEPTH_INDETERMINATE');
 }
 return null;
}
// HTML does not recognize Unicode tag names. Project only the final display
// copy, after all raw card regex rules, while keeping code and opaque HTML intact.
function projectDisplayMarkers(html){
 return html.replace(/<!--[\s\S]*?-->|<(script|style|textarea|pre|code)\b[^>]*>[\s\S]*?<\/\1\s*>|<(\/)?([\p{L}_][\p{L}\p{N}\p{M}_.:-]*)((?:\s+[A-Za-z_][\w.:-]*\s*=\s*(?:"[^"]*"|'[^']*'))*\s*)(\/?)>/giu,(raw,opaque,close,name,attrs,empty)=>{
  if(!name||! /[^\x00-\x7f]/.test(name))return raw;
  return close?'</div>':'<div data-tisya-marker="'+name+'"'+attrs+'>'+(empty?'</div>':'');
 });
}
function runDisplay({source,groups,depth=null,opening=false}){
 if(!Array.isArray(groups)||groups.length>100)fail('GROUP_LIMIT');
 let runs=opening?[{text:source,owner:'body',boundary:false,panel:null}]:partition(source),total=0;const rules=[];
 for(let g=0;g<groups.length;g++){
  const group=groups[g];if(!Array.isArray(group.entries))fail('GROUP_ENTRIES_INVALID');
  for(let i=0;i<group.entries.length;i++){
   if(++total>1000)fail('RULE_COUNT_LIMIT');
   const entry=group.entries[i],label={groupId:group.id,groupIndex:g,entryIndex:i};
   try{const reason=applicable(entry,depth);if(reason){rules.push({...label,status:'skipped',reason});continue;}
    const result=applyRule(runs,entry);runs=result.runs;rules.push({...label,status:'applied',matches:result.count});
   }catch(error){error.details={...label,...error.details};error.rules=rules;throw error;}
  }
 }
 // Existing envelope semantics treat display CDATA as its contained markup.
 // Unwrap after regex matching, retaining raw CDATA syntax as input to rules.
 const display=owner=>runs.filter(r=>r.owner===owner&&!r.boundary).map(r=>r.text).join('').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,(_,text)=>text);
 const extraPanels=[];let untagged=0;
 for(const r of runs.filter(r=>r.owner==='extra'&&!r.boundary)){const text=r.text,last=extraPanels.at(-1);if(!r.panel&&!text.trim()){if(last)last.html+=text;continue;}const id=r.panel?.id??(last?.untagged?last.id:'extra-text-'+(++untagged));if(last?.id===id){last.html+=text;if(r.ruleName)last.ruleName=r.ruleName;}else extraPanels.push({id,tag:r.panel?.tag??null,label:r.panel?.label??null,ruleName:r.ruleName??null,untagged:!r.panel,html:text});}
 for(const p of extraPanels)p.html=projectDisplayMarkers(p.html.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,(_,v)=>v));
 const byId=new Map();for(const p of extraPanels){if(byId.has(p.id)){const first=byId.get(p.id);first.html+=p.html;}else byId.set(p.id,p);}
 return {body:require('./numbered-paragraphs.cjs').text(display('body')),extra:projectDisplayMarkers(display('extra')),extraPanels:[...byId.values()].filter(p=>p.html.trim()),rules,
  depth,assumptions:['API group order then entry order; native order comparison pending','ST compatibility: depth 0 is last stored floor; bare patterns are case-sensitive first match'],nativeEquivalent:false};
}
module.exports={partition,applyRule,runDisplay,expand,displayRuleApplicable:applicable};
