import {PHONE_FORM_INTERNAL_FIELDS} from './phone-form-contract.mjs';
// One boundary for ordinary materials and model-authored database proposals.
// Historical snapshots and program execution records never become story facts,
// including when the caller is the author. The same boundary protects every task.
export const PROGRAM_TABLE_IDS=Object.freeze([
 'X_PHONE_BINDINGS','X_PHONE_LIFE_BINDING_WORLD','X_PHONE_LIFE_BINDING_CHARACTER','X_PHONE_LIFE_INITIALIZATION','X_PHONE_FRAMES','X_PHONE_REQUESTS','X_PHONE_LIFE_EVENTS','X_PHONE_INITIAL_SNAPSHOTS','X_PHONE_ACTIONS','X_PHONE_SESSION','X_PHONE_REJECTEDSOURCES','X_PHONE_DRAFTS','X_PHONE_LIFE_STATE_RECEIPTS','X_PHONE_SUITE_RECEIPTS','X_PHONE_LIFE_STATE_AUDIT',
 'X_NETWORK_SEEDS','X_NETWORK_ENVELOPES','X_RECORD_META',
 'T_SYS_SNAPSHOTS','T_SYS_CHANGE_LOG','T_SYS_ARCHIVE_BATCHES','T_SYS_CELL_REQUESTS','T_SYS_CELL_METADATA','T_SYS_SETTLEMENTS','T_SYS_SETTLEMENT_VALUES','T_SYS_ACTIVE_MATERIAL_VIEW','T_SYS_SOURCE_FRAGMENTS'
]);
const programTables=new Set(PROGRAM_TABLE_IDS),programFields=new Set(['layout','migration_source','archive_digest','raw_response','rawResponse','request_payload','response_payload']);
export function programOwnedTable(id,schema={}){return schema.program_owned===true||schema.prompt_omit===true||programTables.has(id)||/^X_PHONE_(?:ACTIONS(?:_|$)|LIFE_BINDING(?:_|$)|LIFE_INITIALIZATION(?:_|$)|SUITE(?:_|$)|SESSION(?:_|$)|DRAFTS(?:_|$)|REJECTEDSOURCES(?:_|$)|LIFE_STATE_(?:RECEIPTS|AUDIT|SOCIAL_DRAFTS)(?:_|$))/.test(id)||/(?:^|_)(?:RECEIPTS?|JOURNAL)(?:_|$)/.test(id);}
export function promptFieldAllowed(field={}){return !field.program_owned&&!field.prompt_omit&&!programFields.has(field.key);}
export function creationFieldAllowed(field={}){return promptFieldAllowed(field)&&field.key!=='row_uuid'&&!field.alias_of&&!field.read_only&&!field.formula&&!(typeof field.ref==='string'&&programTables.has(field.ref));}
export function compactCreationSchema(state){return Object.fromEntries(Object.entries(state.schema??{}).filter(([id,s])=>!programOwnedTable(id,s)).map(([id,s])=>[id,{id,label:s.label??id,fields:(s.fields??[]).filter(f=>creationFieldAllowed(f)&&!(s.phone_internal&&PHONE_FORM_INTERNAL_FIELDS.has(f.key))).map(f=>Object.fromEntries(['key','label','type','required','ref','enum','options','minimum','maximum','unit','unit_ref','child_schema'].filter(k=>f[k]!==undefined).map(k=>[k,structuredClone(f[k])]))) }]).filter(([,s])=>s.fields.length));}
