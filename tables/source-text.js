// Exact string leaves, without JSON escaping. No defaults, inference or execution.
function stringLeaves(value){
 const leaves=[],active=new WeakSet();
 function visit(item){
  if(typeof item==='string'){leaves.push(item);return;}
  if(!item||typeof item!=='object')return;
  if(active.has(item))throw Error('基点来源包含循环引用');
  active.add(item);for(const child of Array.isArray(item)?item:Object.values(item))visit(child);active.delete(item);
 }
 visit(value);return leaves;
}
export function coreSourceText(value){return stringLeaves(value).join('\n');}
// Pass business values (and any explicit supplement), not row metadata.
// Evidence must occur inside one original leaf, never across joined fields.
export function coreSourceContains(value,evidence){return typeof evidence==='string'&&!!evidence.trim()&&stringLeaves(value).some(leaf=>leaf.includes(evidence));}

// Definition evidence is kept as separate leaves; joining is presentation only.
export function definitionEvidenceSources(input,{goal}={}){
 const sources=[],add=value=>{if(typeof value==='string'&&value.length)sources.push(value);};
 add(goal);
 if(input.sourceCardRaw){
  for(const key of ['name','description','personality','scenario','system_prompt','post_history_instructions'])add(input.sourceCardRaw.fields?.[key]);
  for(const entry of input.sourceCardRaw.entries??[])if(entry.enabled!==false&&!entry.runtimeSource)add(entry.content);
 }else add(input.sourceCard);
 for(const entry of input.sourceBooks??[])if(entry.enabled!==false&&!entry.runtimeSource)add(entry.content);
 add(input.sourceUser?.description);
 for(const record of Array.isArray(input.sourceHistory)?input.sourceHistory:[])if(record.role==='user')add(record.text);
 add(input.archiveSource?.text);add(input.historyText);
 if(input.userSource?.sources?.length){for(const record of input.userSource.sources)add(record.text);}else add(input.userSource?.text);
 return [...new Set(sources)];
}
export function archiveEvidenceSources(task,input){
 if(task==='templateInit')return definitionEvidenceSources(input);
 // An archive's old card and history are context, never fresh event evidence.
 const users=input.userSource?.sources?.length?input.userSource.sources.map(x=>x.text):[input.userSource?.text];
 return [...new Set([input.archiveSource?.text,input.historyText,...users].filter(x=>typeof x==='string'&&x.length))];
}
