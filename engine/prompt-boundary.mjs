import {PHONE_FORM_INTERNAL_FIELDS} from './phone-form-contract.mjs';
import {characterRecordVisible,characterFieldVisible} from './character-knowledge.mjs';
// One boundary for ordinary materials and model-authored database proposals.
// Historical snapshots and program execution records never become story facts,
// including when the caller is the author. The same boundary protects every task.
export const PROGRAM_TABLE_IDS=Object.freeze([
 'X_PHONE_BINDINGS','X_PHONE_LIFE_BINDING_WORLD','X_PHONE_LIFE_BINDING_CHARACTER','X_PHONE_LIFE_INITIALIZATION','X_PHONE_FRAMES','X_PHONE_REQUESTS','X_PHONE_LIFE_EVENTS','X_PHONE_INITIAL_SNAPSHOTS','X_PHONE_ACTIONS','X_PHONE_SESSION','X_PHONE_REJECTEDSOURCES','X_PHONE_DRAFTS','X_PHONE_LIFE_STATE_RECEIPTS','X_PHONE_SUITE_RECEIPTS','X_PHONE_LIFE_STATE_AUDIT',
 'X_NETWORK_SEEDS','X_NETWORK_ENVELOPES','X_RECORD_META',
 'T_SYS_SNAPSHOTS','T_SYS_CHANGE_LOG','T_SYS_ARCHIVE_BATCHES','T_SYS_CELL_REQUESTS','T_SYS_CELL_METADATA','T_SYS_SETTLEMENTS','T_SYS_SETTLEMENT_VALUES','T_SYS_ACTIVE_MATERIAL_VIEW','T_SYS_SOURCE_FRAGMENTS'
]);
const builtinPartitions=new Set(['I','II','III','IV','M','REG','EXT']);
export const hasBuiltinPartition=schema=>builtinPartitions.has(schema?.partition);
export const MODEL_CONFIGURATION_TABLES=Object.freeze(['T_SYS_SCHEMA_REGISTRY','T_SYS_FORMULA_AND_SM','T_SYS_FORMULA_PARAMETERS','T_SYS_STATE_MACHINE_EDGES','T_SYS_HOST_AND_MEDIA','T_SYS_PROJECTIONS','T_SYS_SOURCE_ROUTES','T_SYS_RUNTIME_TASKS','T_SYS_DISTRIBUTION_MAPS','T_SYS_MODULE_INTERFACES','T_SYS_NATIVE_BINDINGS','X_OBJECT_BINDINGS','X_ACTIONS','X_ACTION_STEPS','X_UI_BINDINGS','X_SCHEDULES','X_PROCESS_EDGES','X_WORLD_CLOCKS','M_FORMULA_BINDINGS','M_EXPRESSION_NODES','M_MACRO_STEPS','M_D100_INTERVALS']);
const configurationTables=new Set(MODEL_CONFIGURATION_TABLES);
export function modelTableAllowed(id,schema={},task='main'){return !programOwnedTable(id,schema)&&(!schema.record_kind?.startsWith('registration_')||task==='registration')&&(!configurationTables.has(id)||task==='registration');}
// Calculated by the existing action/phone executors. They remain readable
// business results; an ordinary model form must not recalculate or overwrite them.
export const EXECUTOR_FIELDS=Object.freeze({
 X_EFFECT_INSTANCES:['started_at','expires_at','next_tick_at','stacks','status'],
 X_RESOURCE_CYCLES:['next_at'],X_QUEST_RULES:['times_completed'],
 X_FIN_CREDIT_CARDS:['used','refundBalance'],
 X_FIN_LOANS:['apr','totalInterest','totalPayable','monthlyPayment','quoteId','paid','createdAt','status'],
 X_FIN_LOAN_INSTALLMENTS:['number','principal','interest','amount','paid','dueAt'],
 X_FIN_INVESTMENTS:['accrued','settledAt','redeemedAt','status'],
 X_SHOP_ORDERS:['subtotal','deliveryFee','total','payment','accountId','status','createdAt','updatedAt','refunded'],
 X_SHOP_ORDER_ITEMS:['qty','price'],X_CALENDAR_EVENTS:['notified'],X_MEDIA_PLAYBACK:['position','queue','history']
});
export const EXECUTOR_TABLES=Object.freeze(['X_EFFECT_INSTANCES','X_FIN_LOANS','X_FIN_LOAN_INSTALLMENTS','X_FIN_INVESTMENTS','X_FIN_TRANSACTIONS','X_FIN_CREDIT_CHARGES','X_FIN_CREDIT_STATEMENTS','X_SHOP_ORDERS','X_SHOP_ORDER_ITEMS','X_SHOP_CART_ITEMS','X_MEDIA_PLAYBACK','X_SOCIAL_NOTIFICATIONS','X_SOCIAL_OUTBOX']);
export function modelWriteFieldAllowed(field={},schema={},task='main'){return modelFieldAllowed(field,schema,task)&&(task==='registration'||!EXECUTOR_TABLES.includes(schema.id)&&!(EXECUTOR_FIELDS[schema.id]??[]).includes(field.key));}
const programTables=new Set(PROGRAM_TABLE_IDS),programFields=new Set(['layout','migration_source','archive_digest','raw_response','rawResponse','request_payload','response_payload']);
export function programOwnedTable(id,schema={}){return schema.program_owned===true||schema.prompt_omit===true||programTables.has(id)||/^X_PHONE_(?:ACTIONS(?:_|$)|LIFE(?:_|$)|SUITE(?:_|$)|SESSION(?:_|$)|DRAFTS(?:_|$)|REJECTEDSOURCES(?:_|$)|LIFE_STATE_(?:RECEIPTS|AUDIT|SOCIAL_DRAFTS)(?:_|$))/.test(id)||(hasBuiltinPartition(schema)||!!schema.phone_internal)&&/(?:^|_)(?:RECEIPTS?|JOURNAL)(?:_|$)/.test(id);}
export function promptFieldAllowed(field={}){return !field.program_owned&&!field.prompt_omit&&!programFields.has(field.key);}
export function creationFieldAllowed(field={}){return promptFieldAllowed(field)&&field.key!=='row_uuid'&&!field.alias_of&&!field.read_only&&!field.formula&&!(typeof field.ref==='string'&&programTables.has(field.ref));}
// Storage coordinates stay in the parser's contract. They are not instructions
// to a narrative model. Registration is the sole model-facing exception.
const machineFields=new Set(['native_ref','native_path','axis_key','field_key','row_key','column_key','dictionary_key','cache_key','dedupe_id','unique_fact_key','source_entry_id','source_revision','source_hash','source_paragraphs','source_message_revision','source_origin_revision','source_sequence','generation_id','state_revision_used','source_coordinate','source_field_path','source_object_key','expected_revision','source_response_ref','contrib_id','turn_id','target_message_hash','active_pref_revision','active_control_revision','active_source_revision','contribution_id','predecessor_revision','target_table','target_field','target_record','target_path','property_key','actor_table','definition_table','table_id','record_id','parent_path','module_id','project_id','target_row_uuid','target_revision','external_id','group_key','task_key','script_key','parameter_key','result_path','operator_key','quoteId','shopId','audioId','preference_group','selection_key','editor_kind','editor_enabled','injection_position']);
export function modelFieldAllowed(field={},schema={},task='main'){
 if(!promptFieldAllowed(field)||field.key==='row_uuid'||field.alias_of)return false;
 if(task==='registration'&&schema.record_kind?.startsWith('registration_'))return true;
 const codeField=['handler','on_apply','on_tick','on_expire','on_complete','on_interrupt','on_enter','on_exit','use_effects','arrival_effects'].includes(field.key);
 return !['ID','TABLE_KEY','FIELD_KEY','KEY','EXPR'].includes(field.type)&&!codeField&&!['machine_identifier','automatic_identity','derived_digest','registered_field_key','registered_table_key','derived_parameter_signature'].includes(field.classification)&&!machineFields.has(field.key)&&!(schema.phone_internal&&PHONE_FORM_INTERNAL_FIELDS.has(field.key));
}
export function matrixFieldVisible(field={},record={},scope={},tableId='',state=null,recordId=''){return promptFieldAllowed(field)&&field.key!=='row_uuid'&&!field.alias_of&&(scope.audience==='author'||!field.lock_level)&&!(scope.audience!=='author'&&field.key==='true_name'&&['D','E','Access D','Access E'].includes(record?.values?.true_name_lock))&&(!state||characterFieldVisible(state,tableId,recordId,field.key,scope));}
export function matrixRecordVisible(state,tableId,recordId,scope={},meta=null,seen=new Set()){
 const schema=state.schema?.[tableId],record=state.tables?.[tableId]?.[recordId],key=tableId+'#'+recordId;if(!schema||!record||programOwnedTable(tableId,schema)||seen.has(key))return false;
 if(record.metadata?.phone_projection||scope.phone_context_key&&record.metadata?.phone_scope&&scope.phone_context_key!==record.metadata.phone_scope)return false;
 if(scope.audience!=='author'&&(tableId==='T_CHAR_SECRETS'||['D','E','Access D','Access E'].includes(record.values.lock_level)))return false;
 meta??=new Map(Object.values(state.tables?.X_RECORD_META??{}).map(r=>[r.values.table_id+'#'+r.values.record_id,r.values]));
 const values=record.values,m=meta.get(key)??{};
 if([['world_ref','scope_world_id'],['session_ref','scope_session_id'],['branch_ref','scope_branch_id']].some(([k,mk])=>scope[k]&&[m[mk],values[mk]].some(value=>value&&!['GLOBAL',scope[k]].includes(value))))return false;
 if(schema.phone_internal&&scope.world_ref&&values.world_ref&&!['GLOBAL',scope.world_ref].includes(values.world_ref))return false;
 if(!characterRecordVisible(state,tableId,recordId,scope))return false;
 const owner=values.owner_table??values.owner_form;if(owner&&values.owner_row_uuid){const field=state.schema?.[owner]?.fields.find(f=>f.key===values.owner_field);if(field&&!matrixFieldVisible(field,state.tables?.[owner]?.[values.owner_row_uuid],scope,owner,state,values.owner_row_uuid))return false;const trail=new Set(seen);trail.add(key);return matrixRecordVisible(state,owner,values.owner_row_uuid,scope,meta,trail);}
 return true;
}
export function compactCreationSchema(state){return Object.fromEntries(Object.entries(state.schema??{}).filter(([id,s])=>!programOwnedTable(id,s)).map(([id,s])=>[id,{id,label:s.label??id,fields:(s.fields??[]).map((f,index)=>({field:f,row:index+1})).filter(({field:f})=>creationFieldAllowed(f)&&!(s.phone_internal&&PHONE_FORM_INTERNAL_FIELDS.has(f.key))).map(({field:f,row})=>({row,...Object.fromEntries(['key','label','type','required','ref','enum','options','minimum','maximum','unit','unit_ref','child_schema'].filter(k=>f[k]!==undefined).map(k=>[k,structuredClone(f[k])]))})) }]).filter(([,s])=>s.fields.length));}
