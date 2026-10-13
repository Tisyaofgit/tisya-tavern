// Read definitions without changing or executing the card's native extensions.
export function cardScripts(card){const data=card?.data??card??{},out=[],seen=new Set();function visit(value){if(!value||typeof value!=='object'||seen.has(value))return;seen.add(value);if(typeof value.content==='string'&&(value.type==='script'||value.id||value.name)){out.push({id:value.id??null,name:value.name??'',enabled:value.enabled!==false,content:value.content});return;}for(const child of Object.values(value))visit(child);}visit(data.extensions?.tavern_helper);return out;}
// Preserve complete AI-facing text. Executable extensions and display code stay
// in the original card; they are not initialization instructions for the model.
export function cardAIMaterials(card){
 const data=card?.data??card??{},fields=['name','description','personality','scenario','system_prompt','post_history_instructions','mes_example','first_mes','alternate_greetings'];
 const out={fields:Object.fromEntries(fields.filter(k=>data[k]!==undefined||card?.[k]!==undefined).map(k=>[k,structuredClone(data[k]??card[k])])),entries:[],runtimeSources:[],inactiveEntries:[]};
 for(const [index,entry]of (data.character_book?.entries??[]).entries()){
  const source={path:'/data/character_book/entries/'+index,id:entry.id??index,name:entry.comment??entry.name??'',content:entry.content??''};
  if(entry.enabled===false){out.inactiveEntries.push(/<%|^\s*@@preprocessing/m.test(source.content)?{...source,enabled:false,content:'',runtimeSource:'disabled executable template remains in original card'}:{...source,enabled:false});continue;}
  if(/<%|^\s*@@preprocessing/m.test(source.content))out.runtimeSources.push({path:source.path,id:source.id,name:source.name,status:'host-rendered text required; executable template remains in original card'});
  else out.entries.push(source);
 }
 return out;
}
export function cardDefinitionSource(card){const {fields,entries}=cardAIMaterials(card);return [fields.name,fields.description,fields.personality,fields.scenario,fields.system_prompt,fields.post_history_instructions,...entries.map(e=>'CARD.DEFINITION '+(e.name||e.id)+'\n'+e.content)].filter(x=>typeof x==='string'&&x).join('\n\n');}
export function bookAIMaterials(entries){return entries.map(entry=>/<%|^\s*@@preprocessing/m.test(entry.content)?{...entry,content:'',runtimeSource:'host-rendered text required; executable template remains in original book'}:structuredClone(entry));}
export function cardMechanisms(card){const data=card?.data??card??{},scripts=cardScripts(card),regex=data.extensions?.regex_scripts??[];return {scripts:scripts.map(s=>({id:s.id,name:s.name,enabled:s.enabled,chars:s.content.length,apis:[...new Set(s.content.match(/\b(?:getMvuData|replaceMvuData|parseMessage|registerMvuSchema|registerVariableSchema|getVariables|updateVariablesWith|eventOn|waitGlobalInitialized)\b/g)??[])]})),regex:regex.map(r=>({id:r.id??null,name:r.scriptName??r.name??'',disabled:!!r.disabled,placement:r.placement??[],html:/<html|<script|<!DOCTYPE/i.test(r.replaceString??'')})),worldEntries:(data.character_book?.entries??[]).map(e=>({id:e.id,enabled:e.enabled!==false,constant:!!e.constant,keys:e.keys??[],chars:(e.content??'').length})),preservation:'native card and extensions remain unchanged'};}
