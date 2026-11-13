import {programOwnedTable,matrixFieldVisible,matrixRecordVisible,hasBuiltinPartition} from './prompt-boundary.mjs';
import {renderBlocks} from './material-render.mjs';
import {clone} from './common.mjs';
import {activePreferences} from './business.mjs';
import {recall} from './reply.mjs';
import {prepareMatrixSheets} from '../tables/foundation/engine.js';
import {stagedArchiveReferences} from './archive.mjs';
import {ARCHIVE_TABLE_IDS,CELLS_BOOTSTRAP_TABLE_IDS,REPLY_FORM_PROTOCOL,replyFormOwner,replyFormTableIds} from './reply-form-ownership.mjs';
import {characterSubject,recallCharacterFragments} from './character-knowledge.mjs';
import {extendPhoneFormCatalog} from './phone-form-contract.mjs';
import {PHONE_FORM_TEMPLATES,PHONE_APP_NAMES} from './form-template-routing.mjs';
const routes={'世界与规则':'world_context','类型与物品':'asset_context','地点与交通':'location_context','组织与制度':'faction_context','场景与环境':'current_state','状态与成长':'current_state','持有与交易':'current_state','关系与约定':'current_state','人物原点':'focus_entities','人物细节':'focus_entities','认知与情报':'knowledge_material','历史与记忆':'memory_archive','任务与调度':'pending_tasks','生产与设施':'current_state','冲突与检定':'current_state','创世与跨世界':'cardflow','规则与执行':'cell_prompts','宿主与投影':'display_material','运行与归档':'offstage_state'};
const text=v=>v==null?'~':typeof v==='boolean'?(v?'是':'否'):Array.isArray(v)?v.map(text).join('、')||'[]':typeof v==='object'?Object.entries(v).map(([k,x])=>k+'='+text(x)).join('；')||'{}':String(v).replace(/\r?\n/g,' ⏎ ');
const replyTables=['T_DYN_SCENE_SPACE','T_DYN_SCENE_PARTICIPANTS','T_DYN_CONDITIONS','T_DYN_HOLDINGS_INVENTORY','T_DYN_CURRENCY_BALANCES','T_DYN_RELATIONS_PACTS','T_DYN_RELATION_AXES','T_DYN_PACTS'];
const runtimeOnlyForms=new Set(['X_MEDIA_PLAYBACK','X_FIN_TRANSACTIONS','X_FIN_CREDIT_STATEMENTS','X_SOCIAL_NOTIFICATIONS','X_SOCIAL_OUTBOX','X_SHOP_CART_ITEMS']);
function mainFormTable(id,schema){
 if(programOwnedTable(id,schema)||runtimeOnlyForms.has(id))return false;
 if(schema.phone_internal&&/^X_PHONE_(?:LIFE(?:_|$)|SUITE(?:_|$))/.test(id))return false;
 if(schema.record_kind?.startsWith('registration_')||hasBuiltinPartition(schema)&&(/^(?:T_PREF_)/.test(id)||schema.sheet==='规则与执行'))return false;
 return true;
}
export function materialFormTables(e,blocks,context={}){
 const selected=new Set([...ARCHIVE_TABLE_IDS,...CELLS_BOOTSTRAP_TABLE_IDS,...replyTables]);
 for(const row of Object.values(blocks).flat())selected.add(row.table_id);
 // An empty custom business table remains a valid creation surface. Built-in
 // schemas carry partition/phone metadata; a prefix alone is not ownership.
 for(const [id,schema]of Object.entries(e.data.schema))if(!hasBuiltinPartition(schema)&&!schema.phone_internal&&!schema.record_kind?.startsWith('registration_'))selected.add(id);
 for(const row of Object.values(e.rows('X_PHONE_WORLD_CONFIG'))){if(context.world_ref&&row.values.world_ref&&!['GLOBAL',context.world_ref].includes(row.values.world_ref))continue;const apps=row.values.apps;if(!Array.isArray(apps))continue;const enabled=new Set(apps.map(app=>PHONE_APP_NAMES[app]??app));for(const template of PHONE_FORM_TEMPLATES)if(template.tasks.some(task=>enabled.has(task)))for(const id of template.tables)selected.add(id);}
 for(const row of Object.values(e.rows('X_ACTIONS'))){if(row.values.enabled===false)continue;for(const key of ['actor_table','definition_table','target_table'])if(typeof row.values[key]==='string')selected.add(row.values[key]);}
 return [...selected].filter(id=>e.data.schema[id]&&mainFormTable(id,e.data.schema[id]));
}
export function initializeState(catalog,scope={}){
 catalog=extendPhoneFormCatalog(catalog);
 const schema=Object.fromEntries(catalog.tables.map(t=>[t.id,clone(t)]));
 return {format:'tisya.matrix-state.v1',schema,tables:Object.fromEntries(Object.keys(schema).map(id=>[id,{}])),definition_meta:{derivations:clone(catalog.derivations??[]),relations:clone(catalog.relations??[]),parameter_definitions:clone(catalog.parameter_definitions??[]),parameter_bindings:clone(catalog.parameter_bindings??[])},runtime:{scope:clone(scope)}};
}
export function materials(e,context=e.data.runtime.scope??{},query=''){
 e.recalculate();let slots={};const blocks={},meta=new Map(Object.values(e.rows('X_RECORD_META')).map(r=>[r.values.table_id+'#'+r.values.record_id,r.values]));
 const add=(k,v)=>{if(v)(slots[k]??=[]).push(v);};
 for(const [tid,rows]of Object.entries(e.data.tables)){
  const schema=e.data.schema[tid];if(!schema)throw Error('表缺少定义：'+tid);if(programOwnedTable(tid,schema))continue;
  if(schema.partition==='M'||schema.record_kind?.startsWith('registration_')||['X_RECORD_META','T_SYS_SOURCE_FRAGMENTS','X_PREFERENCE_POLICIES'].includes(tid))continue;
  const entries=Object.entries(rows);
  for(const [rid,r]of entries){
   if(!matrixRecordVisible(e.data,tid,rid,context,meta))continue;
   if(tid==='T_PREF_OUTPUT_CONFIG')continue; // Compiled once through the selected output contract.
   const fields=Object.fromEntries(schema.fields.map(f=>[f.key,f])),values={};
   for(const [key,v]of Object.entries(r.values)){
    const f=fields[key]??{},state=r.states[key];if(!fields[key]||!matrixFieldVisible(f,r,context,tid,e.data,rid))continue;
    if(!['known','derived','unknown','cleared','none','not_applicable'].includes(state))continue;
    values[key]=['known','derived'].includes(state)?v:({unknown:'?',cleared:'!',none:'∅',not_applicable:'—'})[state];
    if(r.metadata?.[key]?.gauge_max!=null&&['known','derived'].includes(state))values[key]+='/'+r.metadata[key].gauge_max;
   }
   if(!Object.keys(values).length)continue;
   (blocks['tisya_material_'+(tid==='T_PREF_CHAR_FILTER'?'focus_entities':tid==='T_DYN_STAGE_SUMMARIES'?'memory_summary':routes[schema.sheet]??'task_material')]??=[]).push({table_id:tid,record_id:rid,values});
  }
 }
 slots=renderBlocks(e,blocks);
 const sourceLabel=key=>{const index=e.data.runtime.turn_order?.indexOf(key)??-1,source=e.data.runtime.sources?.[key];return (index>=0?'第'+(index+1)+'条已接纳回复':'历史回复')+(source?.revision?'（修订'+source.revision+'）':'');};
 const pendingArchives=(e.data.runtime.archive_queue??[]).filter(b=>b.status==='blocked'||b.plan?.pending?.length);
 if(!characterSubject(context)&&pendingArchives.length)add('tisya_material_offstage_state','记忆待核（尚未确认）：'+pendingArchives.map(b=>sourceLabel(b.source_key)+((b.plan?.pending??[]).length?'，待补 '+b.plan.pending.map(p=>p.target+'：'+p.missing).join('；'):'')).join('；'));
 for(const p of activePreferences(e,context))add('tisya_contractor_wish',p.directive);
 if(query){const hits=characterSubject(context)?recallCharacterFragments(e,query,context):recall(e,query,{branch:context.branch_ref});for(const h of hits)add('tisya_material_memory_excerpt','原文：'+sourceLabel(h.source_key)+'\n'+h.fragments.map(f=>f.paragraph_id+'：'+f.raw_block).join('\n'));}
 if(e.data.runtime.calendar||Object.keys(e.rows('X_WORLD_CLOCKS')).length)add('tisya_material_event_context','世界历法：'+e.clock().text());
 const selectedTables=materialFormTables(e,blocks,context),groups=['cells','archive'].map(block=>({block,sheets:prepareMatrixSheets({state:e.data},{operationId:'material-preview-'+block,kind:'rows',mode:'revise',task:'main',scope:context,tableIds:replyFormTableIds(e.data,block,selectedTables),expandReferences:'children'})}));
 const sheets={references:[...new Map(groups.flatMap(g=>g.sheets.references).map(r=>[r.tableId+'#'+r.recordId,r])).values()]};
 const visible=new Set(Object.values(blocks).flat().map(row=>row.table_id+'#'+row.record_id)),references=sheets.references.filter(r=>{if(visible.has(r.tableId+'#'+r.recordId))return true;const values=e.data.tables[r.tableId]?.[r.recordId]?.values;return e.data.schema[r.tableId]?.partition==='M'&&(r.tableId==='M_UNITS'||values?.owner_table&&visible.has(values.owner_table+'#'+values.owner_row_uuid));});
 add('tisya_material_cell_prompts',REPLY_FORM_PROTOCOL);
 add('tisya_material_cell_prompts',groups[0].sheets.instructions.replace('<cells format="form"> 使用下列分组简表：','两组共用填写方法：'));
 const details=new Map();for(const {block,sheets:group}of groups){const roots=[];for(const section of group.formSections)if(replyFormOwner(e.data,section.tableId)==='owned')details.set(section.tableId,section.text);else roots.push(section.text);if(roots.length)add('tisya_material_cell_prompts',block+' 可填写的表单：\n'+roots.join('\n\n'));}
 if(details.size)add('tisya_material_cell_prompts','所属明细表（随业务父记录进入同一块，共用字段只列一次）：\n'+[...details.values()].join('\n\n'));
 if(references.length)add('tisya_material_cell_prompts','可修订或引用的已有记录：\n'+references.map(r=>r.display).join('\n'));
 const stagedReferences=characterSubject(context)?[]:stagedArchiveReferences(e);if(stagedReferences.length)add('tisya_material_cell_prompts','近期回复中的关联名称（仅供关联，事实依据仍须见原文）：'+stagedReferences.map(r=>r.table+'／'+r.name).join('；'));
 return Object.fromEntries(Object.entries(slots).map(([k,v])=>[k,[...new Set(v)].join('\n')]));
}
