// Explicit adapter transforms; hashes still verify every untouched vendor file.
// No guessed data, schema disabling, or changes to generation/state writers.
function replaceOnce(source,from,to){if(source.split(from).length!==2)throw Error('Reader adapter anchor mismatch');return source.replace(from,to);}
export function adaptReaderSource(id,source){
 if(id==='xml-envelope.cjs'){
  source=replaceOnce(source,
   'function* xmlTokens(s,{tolerateTail=false,literalAmpersands=false}={}){',
   'function* xmlTokens(s,{tolerateTail=false,literalAmpersands=false,protocolBlock=null,machineTags=null,rawVarsJSON=false,boundaryHTMLRawText=false}={}){');
  source=replaceOnce(source,' let p=0;const path=[];',` let p=0;const path=[];
 const codeLiterals=createProtocolLiteralReader(s),textSlots=new Set(['task','anchor','think','title','body','actions','next']);
 // Only a declared protocol slot, or its direct grouped vars child, may
 // contain raw JSON. Display components never acquire JSON ownership.
 const machineNames=new Map([['cells','cells'],['vars','vars'],[machineTags?.cells?.toLowerCase()??'cells','cells'],[machineTags?.vars?.toLowerCase()??'vars','vars']]);`);
  source=replaceOnce(source,"if(c==='&'){","if(c==='&'&&literalAmpersands!=='native'){");
  source=replaceOnce(source,"value=unxml(literalAmpersands?escapeBareAmpersands(raw):raw);","value=literalAmpersands==='native'?raw:unxml(literalAmpersands?escapeBareAmpersands(raw):raw);");
  source=replaceOnce(source,
   "if(path.length===2&&path[0]==='reply'&&JSON_BLOCKS.has(path[1])){",
   "const nativeJSON=path.at(-1)==='JSONPatch'&&path.at(-2)==='UpdateVariable';\n  const owner=protocolBlock??path[1],groupedJSON=path.length===3&&path[0]==='reply'&&owner==='extra'&&machineNames.get(path[2].toLowerCase())==='vars';\n  const rawJSON=nativeJSON||rawVarsJSON&&path[0]==='reply'&&(path.length===2&&owner==='vars'||groupedJSON);\n  if(path.length===2&&path[0]==='reply'&&JSON_BLOCKS.has(owner)||groupedJSON||nativeJSON){");
  source=replaceOnce(source,"const end=jsonTextEnd(s,p,literalAmpersands);","const end=jsonTextEnd(s,p,rawJSON?'native':literalAmpersands);");
  source=replaceOnce(source,"value:unxml(literalAmpersands?escapeBareAmpersands(raw):raw),raw,json:true","value:rawJSON?raw:unxml(literalAmpersands?escapeBareAmpersands(raw):raw),raw,json:true");
  source=replaceOnce(source,"if(!m&&path[0]==='reply'&&path[1]==='extra'&&path.length>=2)","if(!m&&path[0]==='reply'&&(protocolBlock??path[1])==='extra'&&path.length>=2)");
  source=replaceOnce(source,"  if(s[p]!=='<'){",`  // Alias boundary location preserves native script/style source. Full
  // envelope validators never enable this option, and machines stay XML.
  if(boundaryHTMLRawText&&path[0]==='reply'&&path.length>2&&/^(?:script|style)$/i.test(path.at(-1))&&textSlots.has((protocolBlock??path[1]).toLowerCase())&&!path.slice(2).some(name=>machineNames.has(name.toLowerCase())||['extra','archive',machineTags?.extra?.toLowerCase(),machineTags?.archive?.toLowerCase()].includes(name.toLowerCase()))){
   const close=new RegExp('</'+path.at(-1)+'\\\\s*>','ig');close.lastIndex=p;const end=close.exec(s);if(!end)bad('XML_CLOSE');
   if(end.index>p){const raw=s.slice(p,end.index);yield {kind:'text',value:raw,raw,htmlRaw:true,start:p,end:end.index};p=end.index;continue;}
  }
  if(path.length===2&&path[0]==='reply'&&textSlots.has((protocolBlock??path[1]).toLowerCase())){
   const tagAt=s.indexOf('<',p),literal=codeLiterals.next(p,tagAt<0?s.length:tagAt);
   if(literal){
    if(literal.start>p){const raw=s.slice(p,literal.start);yield {kind:'text',value:unxml(literalAmpersands?escapeBareAmpersands(raw):raw),raw,start:p,end:literal.start};}
    const raw=s.slice(literal.start,literal.end);yield {kind:'text',value:raw,raw,literalCode:literal.kind,start:literal.start,end:literal.end};p=literal.end;continue;
   }
  }
  if(s[p]!=='<'){`);
 }
 if(id==='pipes-wire.cjs')source=replaceOnce(source,"if(t==='p')return ACL.validate(wireValue(s));","if(t==='p')return ACL.validate(s==='~'?'~':wireValue(s));");
 if(id==='pipes-wire.cjs')source=replaceOnce(source,
  "const a=split(s,'、').map(text);if(new Set(a).size!==a.length)bad('LIST_DUPLICATE');return a;",
  "const a=s.startsWith('[')?wireValue(s):split(s,'、').map(text);if(!Array.isArray(a)||a.some(x=>typeof x!=='string'||!x.trim()))bad('LIST');if(new Set(a).size!==a.length)bad('LIST_DUPLICATE');return a;");
 if(id==='pipes-wire.cjs'){
  source=replaceOnce(source,"else if(n==='解锁')b.unlocks.push(cells(x,'sss'));",`else if(n==='解锁'){if((x.length===1||x.length===3)&&x.every(emptyItem))continue;b.unlocks.push(cells(x,'sss'));}
    else if(n==='引用'){const [names]=cells(x,'l');(b.tableReferences??=[]).push(...names);}
    else if(n==='新发现'){const [kind,type,name,evidence]=cells(x,'ssss');if(!['对象','事实'].includes(kind))bad('DISCOVERY_KIND');(b.tableDiscoveries??=[]).push({kind,type,name,evidence});}`);
  source=replaceOnce(source,"if(name==='task'){r.wire.unlocks=b.unlocks;delete b.unlocks;}","if(name==='task'){r.wire.unlocks=b.unlocks;r.wire.tableReferences=b.tableReferences??[];r.wire.tableDiscoveries=b.tableDiscoveries??[];delete b.unlocks;delete b.tableReferences;delete b.tableDiscoveries;}");
 }
 if(id==='journey-reader.cjs'){
  source=replaceOnce(source,
   "function projectJourney(source,{showPsychology=false,playerName=null}={}){\n  const envelope=parseDisplayEnvelope(source);",
   "function projectJourney(source,options){return projectJourneyEnvelope(parseDisplayEnvelope(source),options);}\nfunction projectJourneyEnvelope(envelope,{showPsychology=false,playerName=null}={}){");
  source=replaceOnce(source,'module.exports={projectJourney};','module.exports={projectJourney,projectJourneyEnvelope};');
 }
 if(id==='display-regex.cjs'){
  source=replaceOnce(source,'xmlTokens,parseDisplayEnvelope,replyRegion','xmlTokens,parseRegexEnvelope,replyRegion');
  source=replaceOnce(source,'const envelope=parseDisplayEnvelope(source),hideExtra=', 'const envelope=parseRegexEnvelope(source),hideExtra=');
  source=replaceOnce(source,'function applyRule(runs,entry){\n const re=compile(entry),input=', 'function applyRule(runs,entry,prepareRule){\n const native=prepareRule?.(entry),re=native?.regex??compile(entry),input=');
  source=replaceOnce(source,'text:expand(entry.replaceString,m,input)','text:native?native.expand(m,input):expand(entry.replaceString,m,input)');
  source=replaceOnce(source,'function runDisplay({source,groups,depth=null,opening=false}){','function runDisplay({source,groups,depth=null,opening=false,prepareRule=null}){');
  source=replaceOnce(source,'applyRule(runs,entry);','applyRule(runs,entry,prepareRule);');
  source=replaceOnce(source," return {body:require('./numbered-paragraphs.cjs').text(display('body')),extra:"," const bodyRuns=projectBodyRuns(runs,require('./numbered-paragraphs.cjs').read);\n return {body:bodyRuns.map(r=>r.text).join(''),bodyRuns,extra:");
 }
 return source;
}
