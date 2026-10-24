/** Assemble one task request. Raw retained prose occurs only in SOURCE. */
const clone = value => structuredClone(value);
const FIELD_KEYS = new Set(['type','required','values','fields','items','idKey','formula','description','min','max','additionalProperties']);
export function modelRegistry(registry) {
  const field = def => Object.fromEntries(Object.entries(def).filter(([k]) => FIELD_KEYS.has(k)).map(([k,v]) => [k,k==='fields'?Object.fromEntries(Object.entries(v).map(([n,d])=>[n,field(d)])):k==='items'?field(v):clone(v)]));
  return Object.fromEntries(['tables','types'].map(key=>[key,registry[key].map(row=>({id:row.id,name:row.name,...(row.owner?{owner:row.owner}:{}),...(row.parent?{parent:row.parent}:{}),...(row.aliases?.length?{aliases:clone(row.aliases)}:{}),fields:Object.fromEntries(Object.entries(row.fields).map(([k,d])=>[k,field(d)]))}))]));
}
export function compileTask({preset,input}) {
  if (typeof preset!=='string'||!preset.includes('===== 07 | tisya_materials_v3 | user =====')) throw Error('V3 preset required');
  const system=preset.slice(0,preset.indexOf('===== 07 | tisya_materials_v3 | user =====')).trimEnd();
  const source={currentUser:input.currentUser??'',archiveSources:clone(input.archiveSources),preferenceSources:clone(input.preferenceSources??[])};
  const state={requestKey:input.requestKey,generationType:input.generationType,registry:modelRegistry(input.view.registry),rows:clone(input.view.rows)};
  for(const k of ['nativeRules','rulePolicy','preferenceContext','preferencesEnabled','worldWindow','queryCatalog','playerObjects','onstageObjects','focusObjects','dueChecks','additionalInput','advancedReroll','knownArchiveIds'])if(input[k]!==undefined)state[k]=clone(input[k]);
  if(input.preferenceProjection?.groups?.length||input.preferenceProjection?.hardConstraints?.length)state.preferenceProjection=clone(input.preferenceProjection);
  if(input.generationType==='advanced-reroll')state.additionalInput={...(state.additionalInput??{}),directives:input.advancedReroll.instruction};
  const text='[SOURCE]\n'+JSON.stringify(source,null,2)+'\n[/SOURCE]\n[STATE]\n'+JSON.stringify(state,null,2)+'\n[/STATE]\nReturn the complete task sheet beginning with 【结果】.';
  return [{role:'system',content:system},{role:'user',content:text}];
}
