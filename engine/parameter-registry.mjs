import {clone,fail} from './common.mjs';

const COMMON_PARAMETER_FIELDS=Object.freeze({record_revision:'INTEGER',record_status:'ENUM',default_source_status:'ENUM',record_identity_only_reference:'BOOLEAN'});
const text=(value,label)=>{if(typeof value!=='string'||!value.trim())fail('PARAMETER_REGISTRY_INVALID',label+'须为非空文本');return value;};

// The catalog remains the durable source. This service only validates and
// projects it; it has no second store, write path, or parameter runtime.
export function createParameterRegistry(source={}){
 const catalog=source.catalog??source,definitions=catalog.parameter_definitions??source.definition_meta?.parameter_definitions??[],bindings=catalog.parameter_bindings??source.definition_meta?.parameter_bindings??[],tables=catalog.tables??[];
 if(!Array.isArray(definitions)||!Array.isArray(bindings)||!Array.isArray(tables))fail('PARAMETER_REGISTRY_INVALID','参数目录缺少定义、绑定或表结构');
 const schema=new Map(tables.map(table=>[table.id,table])),byKey=new Map(),byBinding=new Map(),byCoordinate=new Map();
 for(const definition of definitions){
  const key=text(definition?.parameter_key,'参数键'),bindingId=text(definition?.field_binding_ref,'参数绑定引用');
  if(byKey.has(key))fail('DUPLICATE_PARAMETER_DEFINITION','参数键重复：'+key,{parameter_key:key});
  byKey.set(key,{definition,binding:null});
 }
 for(const binding of bindings){
  const id=text(binding?.binding_id,'绑定ID'),key=text(binding?.parameter_key,'绑定参数键'),tableId=text(binding?.table_id,'绑定表'),fieldKey=text(binding?.field_key,'绑定字段'),coordinate=tableId+'#'+fieldKey,entry=byKey.get(key);
  if(byBinding.has(id))fail('DUPLICATE_PARAMETER_BINDING','参数绑定ID重复：'+id,{binding_id:id});
  if(byCoordinate.has(coordinate))fail('DUPLICATE_PARAMETER_COORDINATE','同一字段绑定了多个参数：'+coordinate,{table_id:tableId,field_key:fieldKey});
  if(!entry)fail('MISSING_PARAMETER_DEFINITION','绑定没有参数定义：'+key,{parameter_key:key,binding_id:id});
  if(entry.binding)fail('DUPLICATE_PARAMETER_DEFINITION','参数键存在多个绑定：'+key,{parameter_key:key});
  if(entry.definition.field_binding_ref!==id)fail('PARAMETER_BINDING_MISMATCH','参数定义与绑定互引不一致：'+key,{parameter_key:key,binding_id:id});
  const table=schema.get(tableId),commonType=tableId==='__COMMON__'?COMMON_PARAMETER_FIELDS[fieldKey]:null,field=tableId==='__COMMON__'
   ?commonType?{key:fieldKey,label:entry.definition.label??fieldKey,type:commonType,required:false}:null
   :table?.fields?.find(item=>item.key===fieldKey);
  if(!field)fail('MISSING_PARAMETER_FIELD','参数绑定字段不存在：'+coordinate,{table_id:tableId,field_key:fieldKey});
  const current=entry.definition.current_field_ref;
  if(current&&(current.table_id!==tableId||current.field_key!==fieldKey))fail('PARAMETER_BINDING_MISMATCH','参数当前字段与绑定坐标不一致：'+key,{parameter_key:key,binding_id:id});
  entry.binding=binding;byBinding.set(id,entry);byCoordinate.set(coordinate,entry);
 }
 for(const [key,entry]of byKey)if(!entry.binding)fail('MISSING_PARAMETER_BINDING','参数定义没有绑定：'+key,{parameter_key:key});
 const project=entry=>{
  const {definition,binding}=entry,field=binding.table_id==='__COMMON__'
   ?{key:binding.field_key,label:definition.label??binding.field_key,type:COMMON_PARAMETER_FIELDS[binding.field_key],required:false}
   :schema.get(binding.table_id).fields.find(item=>item.key===binding.field_key);
  return Object.freeze({...clone(field),parameter_key:definition.parameter_key,binding_id:binding.binding_id,label:definition.label??field.label,value_type:definition.effective_value_type??definition.value_type??field.type,read_only:definition.effective_read_only===true||definition.read_only===true||field.read_only===true||field.editable===false,required:definition.required===true||field.required===true,required_when:definition.required_when??null,enum:clone(definition.effective_enum??field.enum??null),ref:field.ref??null,description:definition.description??field.description??'',binding:clone(binding)});
 };
 return Object.freeze({
  get(parameterKey){const entry=byKey.get(parameterKey);return entry?project(entry):null;},
  forField(tableId,fieldKey){const entry=byCoordinate.get(tableId+'#'+fieldKey);return entry?project(entry):null;},
  formFields(tableId,{includeUnbound=true}={}){
   const table=schema.get(tableId);if(!table)return [];
   return table.fields.map(field=>{const entry=byCoordinate.get(tableId+'#'+field.key);return entry?project(entry):includeUnbound?Object.freeze(clone(field)):null;}).filter(Boolean);
  },
  keys:()=>Object.freeze([...byKey.keys()]),
  snapshot:()=>Object.freeze({parameter_definitions:clone(definitions),parameter_bindings:clone(bindings)})
 });
}

// One registration creates the schema field and its mechanical definition and
// binding together. Existing fields keep their current contract and binding.
export function registerCatalogParameters(catalog,registrations=[]){
 const next=clone(catalog);next.parameter_definitions??=[];next.parameter_bindings??=[];
 for(const registration of registrations){
  const tableId=text(registration?.table_id,'注册表ID'),source=registration.field,fieldKey=text(source?.key,'注册字段键'),table=next.tables.find(item=>item.id===tableId);
  if(!table)fail('MISSING_PARAMETER_TABLE','参数注册表不存在：'+tableId);
  const parameterKey='param.'+tableId.toLowerCase()+'.'+fieldKey,bindingId='binding.'+tableId.toLowerCase()+'.'+fieldKey,existing=table.fields.find(field=>field.key===fieldKey);
  if(existing&&registration.require_same===true&&JSON.stringify(existing)!==JSON.stringify(source))fail('PARAMETER_FIELD_CONFLICT','参数字段定义冲突：'+tableId+'#'+fieldKey);
  const field=existing??{required:false,...clone(source)};if(!existing)table.fields.push(field);
  if(next.parameter_bindings.some(binding=>binding.table_id===tableId&&binding.field_key===fieldKey))continue;
  const readOnly=field.read_only===true||field.editable===false,valueType=field.type;
  next.parameter_definitions.push({parameter_key:parameterKey,label:field.label??fieldKey,value_type:valueType,enum_set_ref:field.enum_set_id??null,required:field.required===true,required_when:field.required_when??null,read_only:readOnly,default_status:'未指定',default_assignment_ref:null,field_binding_ref:bindingId,key_status:'本轮登记键；非宿主存储键',description:field.description??'',source_read_only:readOnly,source_value_type:valueType,source_required:field.required===true,effective_read_only:readOnly,effective_value_type:valueType,current_field_ref:{table_id:tableId,field_key:fieldKey},access_authority:'current mechanical field schema and target table permissions',source_enum_set_ref:field.enum_set_id??null,effective_enum:field.enum?clone(field.enum):null});
  next.parameter_bindings.push({binding_id:bindingId,parameter_key:parameterKey,table_id:tableId,field_key:fieldKey,common_scope:'指定业务表字段',source_ref:'schema#/tables/'+tableId+'/fields/'+fieldKey,source_origin:'统一字段参数注册',existing_value_owner:tableId+'.'+fieldKey,assignment_policy:'既有业务值唯一真源；赋值记录引用原坐标',record_edit_mode:readOnly?'readonly':'manual',description:'坐标指向字段定义；实际记录值须再给Row_UUID及world/session/branch作用域。',row_resolution:{common_table:'explicit_source_table_or_owner_table',row:'explicit_source_row_uuid_else_matching_owner_else_unique_active_record',multiple_policy:'AMBIGUOUS_PARAMETER_ROW',no_record_policy:'MISSING_PARAMETER_VALUE',source_defaults_are_current_value:false},value_path:['tables',tableId,'records','{source_row_uuid}','values',fieldKey],value_state_path:['tables',tableId,'records','{source_row_uuid}','value_states',fieldKey],source_record_edit_mode:readOnly?'readonly':'manual',source_value_type:valueType,source_read_only:readOnly,effective_read_only:readOnly,effective_value_type:valueType,common_target_readonly_guard:readOnly,access_authority:'current mechanical field schema and target table permissions',effective_enum_set_ref:field.enum_set_id??null});
 }
 createParameterRegistry(next);return next;
}
