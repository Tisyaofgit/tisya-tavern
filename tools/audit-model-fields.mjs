import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {initializeState} from '../engine/materials.mjs';
import {extendPreferenceCatalog} from '../engine/preference-editor.mjs';
import {programOwnedTable,creationFieldAllowed,modelFieldAllowed,modelTableAllowed,modelWriteFieldAllowed,MODEL_CONFIGURATION_TABLES,EXECUTOR_FIELDS,EXECUTOR_TABLES} from '../engine/prompt-boundary.mjs';
import {prepareMatrixSheets} from '../tables/foundation/engine.js';
const catalog=extendPreferenceCatalog(JSON.parse(readFileSync(new URL('../engine/catalog.json',import.meta.url)))),state=initializeState(catalog);
const registryNamespaces=new Set(['enum_sets','field_bindings','parameter_definitions','enum_options']);
const rows=[],errors=[],references=[],duplicates=[];
for(const [id,schema]of Object.entries(state.schema)){
 const keys=new Set();
 for(const field of schema.fields){
  if(keys.has(field.key))errors.push({table:id,field:field.key,reason:'duplicate-key'});keys.add(field.key);
  const internal=programOwnedTable(id,schema),registration=schema.record_kind?.startsWith('registration_');
  const read=modelTableAllowed(id,schema)&&modelFieldAllowed(field,schema),write=read&&creationFieldAllowed(field)&&modelWriteFieldAllowed(field,schema);
  rows.push({table:id,tableLabel:schema.label,key:field.key,label:field.label,type:field.type,classification:field.classification??'',modelRead:read,modelWrite:write,owner:internal?'program':registration?'registration':MODEL_CONFIGURATION_TABLES.includes(id)?'configuration':!modelFieldAllowed(field,schema)?'internal-or-projection':(EXECUTOR_TABLES.includes(id)||(EXECUTOR_FIELDS[id]??[]).includes(field.key))?'executor':field.classification==='derived_projection'?'projection':field.read_only||field.formula?'derived':'business',reference:field.ref??'',derivation:field.derivation_ref??''});
  if(field.ref){const target=field.ref;references.push({table:id,field:field.key,target,kind:state.schema[target]?'table':target.startsWith('@')?'dynamic':registryNamespaces.has(target)?'registry-namespace':'unresolved'});if(!state.schema[target]&&!target.startsWith('@')&&!registryNamespaces.has(target))errors.push({table:id,field:field.key,target,reason:'unresolved-reference'});}
 }
}
for(const derivation of catalog.derivations??[]){
 const field=state.schema[derivation.table_id]?.fields.find(f=>f.key===derivation.field_key);
 if(derivation.table_id&&!['__COMMON__','@COMMON'].includes(derivation.table_id)&&!field)errors.push({derivation:derivation.id,reason:'missing-derivation-target'});
 if(field?.classification==='derived_projection')duplicates.push({table:derivation.table_id,field:derivation.field_key,definition:derivation.id,sources:derivation.sources,disposition:'omit proven derived copy; retain unproven legacy values and canonical source'});
}
for(const binding of catalog.parameter_bindings??[]){
 const fields=binding.table_id==='__COMMON__'?catalog.common_fields:state.schema[binding.table_id]?.fields;
 if(!fields?.some(f=>(f.key??f.field_key)===binding.field_key))errors.push({binding:binding.binding_id,reason:'missing-parameter-target'});
}
const sheets=prepareMatrixSheets({state},{operationId:'whole-catalog-audit',task:'main'});
for(const section of sheets.formSections){
 if(!modelTableAllowed(section.tableId,state.schema[section.tableId]))errors.push({table:section.tableId,reason:'configuration-in-model-form'});
 const lines=section.text.split('\n').slice(1);
 for(const line of lines){const row=Number(line.match(/^\d+/)?.[0]),field=state.schema[section.tableId].fields[row-1];if(!field||!modelWriteFieldAllowed(field,state.schema[section.tableId]))errors.push({table:section.tableId,row,reason:'internal-field-in-model-form'});}
}
const count=key=>Object.fromEntries([...new Set(rows.map(r=>r[key]))].map(k=>[k,rows.filter(r=>r[key]===k).length]));
const summary={version:'model-field-audit-20261115',catalogTables:catalog.tables.length,runtimeTables:Object.keys(state.schema).length,fields:rows.length,ownership:count('owner'),modelReadable:rows.filter(r=>r.modelRead).length,modelWritable:rows.filter(r=>r.modelWrite).length,referenceCount:references.length,registryNamespaceReferences:references.filter(r=>r.kind==='registry-namespace').length,parameterBindings:(catalog.parameter_bindings??[]).length,derivations:(catalog.derivations??[]).length,duplicateProjectionDefinitions:duplicates.length,errors};
const destination=new URL('../docs/validation/form-audit-20261115/',import.meta.url);mkdirSync(destination,{recursive:true});writeFileSync(new URL('all-fields.json',destination),JSON.stringify({summary,fields:rows,references,duplicateProjections:duplicates},null,2)+'\n');writeFileSync(new URL('summary.json',destination),JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify(summary,null,2));if(errors.length)process.exitCode=1;
