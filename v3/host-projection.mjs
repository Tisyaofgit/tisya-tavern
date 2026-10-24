const clone=structuredClone;
const publicReaders=new Set(['reader','读者','public','公开']);
export function definitionMaterial(binding){return {selectedDefinitionRows:clone(binding.selectedDefinitionRows??binding.initialRows??[]),selectedDefinitionSources:clone(binding.selectedDefinitionSources??[]),definitionConflicts:clone(binding.definitionConflicts??[])};}
export function currentNarrativeInput(snapshot,input={}){const scene=(snapshot.rows??[]).find(row=>row.table==='scene');return {...input,onstageObjects:Array.isArray(scene?.values?.参与者)?clone(scene.values.参与者):clone(input.onstageObjects??[])};}
/** One narrative authorization projection for committed records and selected definitions. */
export function projectNarrativeMaterial(snapshot,input={}){
 input=currentNarrativeInput(snapshot,input);
 const actors=new Set([...(input.playerObjects??[]),...(input.onstageObjects??[]),...(input.focusObjects??[])]);
 const permitted=row=>row?.access&&((row.access.readers??[]).some(id=>publicReaders.has(id))||(row.access.knowers??[]).some(id=>actors.has(id)));
 const rows=(snapshot.rows??[]).filter(permitted),definitions=(snapshot.selectedDefinitionRows??[]).filter(permitted);
 const ids=new Set(rows.map(r=>r.id)),definitionIds=new Set(definitions.map(r=>r.id));
 const conflicts=(snapshot.definitionConflicts??[]).filter(c=>ids.has(c.rowId)&&definitionIds.has(c.rowId));
 return {...clone(snapshot),rows:clone(rows),activePool:(snapshot.activePool??[]).filter(r=>ids.has(r.id)),history:(snapshot.history??[]).filter(r=>ids.has(r.id)),selectedDefinitionRows:clone(definitions),selectedDefinitionSources:(snapshot.selectedDefinitionSources??[]).map(source=>({...clone(source),rowIds:source.rowIds.filter(id=>definitionIds.has(id))})).filter(source=>source.rowIds.length),definitionConflicts:clone(conflicts)};
}
