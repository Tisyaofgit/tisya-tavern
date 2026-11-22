import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createParameterRegistry,registerCatalogParameters} from '../engine/parameter-registry.mjs';
import {extendMatrixCatalog,initializeState} from '../engine/materials.mjs';

const catalog=()=>JSON.parse(fs.readFileSync(new URL('../engine/catalog.json',import.meta.url),'utf8'));

test('parameter registry validates every canonical definition and projects the owning form field',()=>{
 const extended=extendMatrixCatalog(catalog()),registry=createParameterRegistry(extended),keys=registry.keys();
 assert.equal(keys.length,extended.parameter_definitions.length);assert.equal(new Set(keys).size,keys.length);
 const width=registry.get('param.t_sys_media_assets.width');assert.equal(width.binding.table_id,'T_SYS_MEDIA_ASSETS');assert.equal(width.value_type,'INTEGER');assert.equal(width.read_only,false);
 const stage=registry.forField('T_SYS_MEDIA_ASSETS','life_stage');assert.equal(stage.label,'生命线阶段');assert.equal(stage.parameter_key,'param.t_sys_media_assets.life_stage');
 const enabled=registry.formFields('T_PREF_EXTENSION_PRESENTATION').find(field=>field.key==='media_enabled');assert.equal(enabled.value_type,'BOOLEAN');assert.equal(enabled.binding.field_key,'media_enabled');
 const state=initializeState(catalog());assert.equal(state.definition_meta.parameter_definitions.length,keys.length);assert.equal(state.schema.T_SYS_MEDIA_ASSETS.fields.some(field=>field.key==='scene_description'),true);
});

test('parameter registry fails closed on duplicate keys, bindings, coordinates and broken schema references',()=>{
 const base=extendMatrixCatalog(catalog());
 for(const [name,mutate,pattern]of [
  ['key',value=>value.parameter_definitions.push(structuredClone(value.parameter_definitions[0])),/参数键重复/],
  ['binding',value=>{const copy=structuredClone(value.parameter_bindings[0]);copy.binding_id='binding.other';copy.parameter_key=value.parameter_definitions[1].parameter_key;copy.field_binding_ref=undefined;value.parameter_bindings.push(copy);},/同一字段绑定了多个参数|参数定义与绑定互引不一致/],
  ['coordinate',value=>{const definition=structuredClone(value.parameter_definitions[0]),binding=structuredClone(value.parameter_bindings[0]);definition.parameter_key='param.test.other';definition.field_binding_ref='binding.test.other';binding.parameter_key=definition.parameter_key;binding.binding_id=definition.field_binding_ref;value.parameter_definitions.push(definition);value.parameter_bindings.push(binding);},/同一字段绑定了多个参数/],
  ['schema',value=>{value.parameter_bindings[0].field_key='not_a_field';},/参数绑定字段不存在/]
 ]){const changed=structuredClone(base);mutate(changed);assert.throws(()=>createParameterRegistry(changed),pattern,name);}
});

test('field registration is atomic in the catalog projection and never creates a second binding',()=>{
 const original=catalog(),field={key:'test_parameter',label:'测试参数',type:'TEXT',required:false};
 const once=registerCatalogParameters(original,[{table_id:'T_SYS_MEDIA_ASSETS',field}]),twice=registerCatalogParameters(once,[{table_id:'T_SYS_MEDIA_ASSETS',field}]);
 assert.deepEqual(twice,once);assert.equal(twice.parameter_bindings.filter(binding=>binding.table_id==='T_SYS_MEDIA_ASSETS'&&binding.field_key==='test_parameter').length,1);
 assert.equal(original.tables.find(table=>table.id==='T_SYS_MEDIA_ASSETS').fields.some(item=>item.key==='test_parameter'),false);
});
