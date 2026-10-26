// Explicit adapter transforms; hashes still verify every untouched vendor file.
// No guessed data, schema disabling, or changes to generation/state writers.
function replaceOnce(source,from,to){if(source.split(from).length!==2)throw Error('Reader adapter anchor mismatch');return source.replace(from,to);}
export function adaptReaderSource(id,source){
 if(id==='xml-envelope.cjs'){
  source=replaceOnce(source,"if(c==='&'){","if(c==='&'&&literalAmpersands!=='native'){");
  source=replaceOnce(source,"value=unxml(literalAmpersands?escapeBareAmpersands(raw):raw);","value=literalAmpersands==='native'?raw:unxml(literalAmpersands?escapeBareAmpersands(raw):raw);");
  source=replaceOnce(source,
   "if(path.length===2&&path[0]==='reply'&&JSON_BLOCKS.has(path[1])){",
   "const nativeJSON=path.at(-1)==='JSONPatch'&&path.at(-2)==='UpdateVariable';\n  if(path.length===2&&path[0]==='reply'&&JSON_BLOCKS.has(path[1])||nativeJSON){");
  source=replaceOnce(source,"const end=jsonTextEnd(s,p,literalAmpersands);","const end=jsonTextEnd(s,p,nativeJSON?'native':literalAmpersands);");
  source=replaceOnce(source,"value:unxml(literalAmpersands?escapeBareAmpersands(raw):raw),raw,json:true","value:nativeJSON?raw:unxml(literalAmpersands?escapeBareAmpersands(raw):raw),raw,json:true");
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
 }
 return source;
}
