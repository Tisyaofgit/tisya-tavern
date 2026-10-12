// Explicit adapter transforms; hashes still verify every untouched vendor file.
// No guessed data, schema disabling, or changes to generation/state writers.
function replaceOnce(source,from,to){if(source.split(from).length!==2)throw Error('Reader adapter anchor mismatch');return source.replace(from,to);}
export function adaptReaderSource(id,source){
 if(id==='pipes-wire.cjs')source=replaceOnce(source,"if(t==='p')return ACL.validate(wireValue(s));","if(t==='p')return ACL.validate(s==='~'?'~':wireValue(s));");
 if(id==='pipes-wire.cjs')source=replaceOnce(source,
  "const a=split(s,'、').map(text);if(new Set(a).size!==a.length)bad('LIST_DUPLICATE');return a;",
  "const a=s.startsWith('[')?wireValue(s):split(s,'、').map(text);if(!Array.isArray(a)||a.some(x=>typeof x!=='string'||!x.trim()))bad('LIST');if(new Set(a).size!==a.length)bad('LIST_DUPLICATE');return a;");
 if(id==='journey-reader.cjs'){
  source=replaceOnce(source,
   "function projectJourney(source,{showPsychology=false,playerName=null}={}){\n  const envelope=parseDisplayEnvelope(source);",
   "function projectJourney(source,options){return projectJourneyEnvelope(parseDisplayEnvelope(source),options);}\nfunction projectJourneyEnvelope(envelope,{showPsychology=false,playerName=null}={}){");
  source=replaceOnce(source,'module.exports={projectJourney};','module.exports={projectJourney,projectJourneyEnvelope};');
 }
 if(id==='display-regex.cjs'){
  source=replaceOnce(source,'function applyRule(runs,entry){\n const re=compile(entry),input=', 'function applyRule(runs,entry,prepareRule){\n const native=prepareRule?.(entry),re=native?.regex??compile(entry),input=');
  source=replaceOnce(source,'text:expand(entry.replaceString,m,input)','text:native?native.expand(m,input):expand(entry.replaceString,m,input)');
  source=replaceOnce(source,'function runDisplay({source,groups,depth=null,opening=false}){','function runDisplay({source,groups,depth=null,opening=false,prepareRule=null}){');
  source=replaceOnce(source,'applyRule(runs,entry);','applyRule(runs,entry,prepareRule);');
 }
 return source;
}
