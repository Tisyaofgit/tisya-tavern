import {xmlSection} from './prompt-sections.mjs';
import {matrixRecordVisible} from './prompt-boundary.mjs';
import {inKnowledgeScope} from './character-knowledge.mjs';

const tagNames={
 rule_material:'RuleMaterial', world_context:'WorldContext', faction_context:'FactionContext',
 asset_context:'AssetContext', location_context:'SceneAndSpace', current_state:'CurrentState',
 offstage_state:'OffstageState', pending_tasks:'PendingTasks', player_archive:'PlayerArchive',
 persona_extensions:'HoldingsAndInventory', card_extensions:'CardExtensions', cardflow:'Cardflow',
 display_material:'OutputMarkupProtocol', cast_registry:'CastRegistry', focus_entities:'FocusCast',
 present_entities:'PresentCast', character_archives:'CharacterDossier', habit_anchors:'HabitAnchors',
 knowledge_material:'KnowledgeLedger', secret_material:'DisclosedMaterial', memory_archive:'TimelineSpine',
 memory_summary:'StageSummary', memory_excerpt:'RecalledOriginal', event_context:'EventContext',
 calculation_result:'CalculationResult', task_material:'TaskMaterial'
};

export function narrativeSection(slot,text){
 const tag=tagNames[slot.replace(/^tisya_material_/,'')];
 return tag&&text?xmlSection(tag,text,{escaped:true}):text;
}

export const materialKnown=(row,key)=>['known','derived'].includes(row?.states?.[key]);
const known=(row,key)=>materialKnown(row,key)?row.values[key]:undefined;
const nameOf=row=>['name','title','label','instance_name'].map(key=>known(row,key)).find(value=>typeof value==='string'&&value.trim());
const D='T_CHAR_DOSSIER', E='T_SYS_ENTITIES', H='T_DYN_HOLDINGS_INVENTORY', S='T_DYN_ENTITY_STATE';

const directSlots={
 T_STATIC_WORLD_RULES:'rule_material', T_STATIC_CONSTANTS:'rule_material',
 T_TYPE_ARCHETYPES:'world_context', T_TYPE_ATTRIBUTES:'world_context', T_TYPE_SHARED_POOLS:'world_context',
 T_DYN_SCENE_SPACE:'location_context', T_DYN_SCENE_PARTICIPANTS:'current_state', T_DYN_COMMUNICATIONS:'current_state',
 T_DYN_ACTIVITIES_LIFELINES:'offstage_state', T_DYN_ACTIVITY_RESOURCES:'offstage_state',
 T_DYN_LIFELINE_NODES:'offstage_state', T_SYS_OFFSTAGE_ADVANCES:'offstage_state',
 T_DYN_PACTS:'pending_tasks', T_DYN_CLUES:'pending_tasks', T_DYN_TIMERS:'pending_tasks', X_QUEST_RULES:'pending_tasks',
 T_DYN_EVENT_LINKS:'event_context', T_DYN_EVENT_PARTICIPANTS:'event_context',
 T_SYS_TIME_ANCHORS:'event_context', T_DYN_STAGE_SUMMARIES:'memory_summary',
 T_CHAR_SECRETS:'secret_material', T_PREF_CHAR_FILTER:'focus_entities',
 T_DYN_MESSAGE_CONTENT:'current_state', T_DYN_EXTENSION_BLOCKS:'current_state',
 T_DYN_EXTENSION_ITEMS:'current_state', T_SYS_HOST_AND_MEDIA:'card_extensions'
};

const minorFields=new Set(['name','public_identity','social_identity_duty','overall_physique','habitual_bearing','sensory_impression']);
const visibleClueFields=new Set(['name','shown_content','revealed_content','stage','visibility','advance_cond','appearance_anchor','object_ref']);
const knownSecretFields=new Set(['name','char_ref','fact_proposition','observable_clues']);
const visibleOffstageFields=new Set(['name','subject_ref','status','location_ref','actual_progress','confirmed_results','continuation_candidates','blocked_dependencies','visible_timing','contact_channel','progress_value','next_step','obstacles','goal','action','advanced_to']);

function originDossier(state,id,row,scope){
 const link=known(row,'origin_record_ref');
 if(!link&&!Object.hasOwn(row.states??{},'origin_record_ref'))return matrixRecordVisible(state,D,id,scope)?id:null;
 const ref=state.tables.M_FIELD_REFERENCES?.[link];
 if(known(ref,'owner_table')!==E||known(ref,'owner_row_uuid')!==id||known(ref,'owner_field')!=='origin_record_ref'||known(ref,'target_table')!==D)return null;
 const target=known(ref,'target_row_uuid');
 return matrixRecordVisible(state,'M_FIELD_REFERENCES',link,scope)&&matrixRecordVisible(state,D,target,scope)?target:null;
}

export function narrativeRoster(state,scope,meta){
 const visible=(table,id)=>matrixRecordVisible(state,table,id,scope,meta);
 const list=table=>Object.entries(state.tables[table]??{}).filter(([id])=>visible(table,id));
 const people=new Map(), allScenes=list('T_DYN_SCENE_SPACE'), dossiers=list(D);
 const scene=scope.scene_ref??allScenes.at(-1)?.[0];
 const presence=new Map(),place=known(state.tables.T_DYN_SCENE_SPACE?.[scene],'place_ref');
 const isHere=id=>{const seen=new Set();while(id&&!seen.has(id)&&visible('T_STATIC_PLACES',id)){
  if(id===place)return true;
  seen.add(id);id=known(state.tables.T_STATIC_PLACES[id],'parent_place_ref');
 }return false;};
 if(place)for(const [,row] of list(S)){
  const id=known(row,'entity_id');
  if(id&&isHere(known(row,'location_ref')))presence.set(id,'在场次要');
 }
 for(const [,row] of list('T_DYN_SCENE_PARTICIPANTS')){
  const entity=known(row,'entity_ref'),level=known(row,'focus_level');
  if(entity&&(!known(row,'scene_ref')||known(row,'scene_ref')===scene))presence.set(entity,level??'在场次要');
 }
 const player=scope.playerBinding?.database?scope.playerBinding:null;
 for(const [id,row] of list(E)){
  const dossier=originDossier(state,id,row,scope),kind=known(row,'kind');
  if(dossier||/^(?:character|person|npc|player|角色|人物|主控)$/iu.test(kind??'')){
   const name=nameOf(state.tables[D]?.[dossier])??nameOf(row);
   if(name)people.set(id,{id,dossier,name,level:id===player?.entityId?'主控':presence.get(id)??'离场索引'});
  }
 }
 const linked=new Set([...people.values()].map(person=>person.dossier));
 for(const [id,row] of dossiers){
  const name=nameOf(row);
  if(name&&!linked.has(id))people.set(id,{id,dossier:id,name,level:id===player?.dossierId?'主控':presence.get(id)??(!scene&&people.size===0&&dossiers.length===1?'在场焦点':'离场索引')});
 }
 return {scene,people,player};
}

function subset(values,allowed){
 return Object.fromEntries(Object.entries(values).filter(([key])=>allowed.has(key)));
}

export function routeNarrativeRecord(row,defaultSlot,state,scope,roster){
 const {table_id:table,record_id:id,values}=row;
 const {people,player,scene}=roster;
 const result=(slot,fields=values,group=null)=>({slot:'tisya_material_'+slot,row:{...row,values:fields,group}});
 const byDossier=dossier=>[...people.values()].find(person=>person.dossier===dossier);
 const byIdentity=identity=>people.get(identity)??byDossier(identity);
 if(table===E){
  if(people.has(id)||/^(?:unclassified|unspecified|unknown|未指定|未分类|待明确)$/iu.test(values.kind??'')||!values.kind)return null;
  return result(/^(?:location|place|space|地点|空间)$/iu.test(values.kind)?'location_context':'asset_context');
 }
 if(table===D){
  const actor=byDossier(id)?.level;
  if(actor==='主控')return result('player_archive',values,id);
  if(actor==='在场焦点')return result('character_archives',values,id);
  if(actor==='在场次要')return result('present_entities',subset(values,minorFields),id);
  return null;
 }
 if(table==='T_CHAR_ANCHORS'||table==='T_CHAR_HABITS'||table==='T_PREF_CHAR_FILTER'){
  const dossier=values.char_ref??values.target_char_id,actor=byIdentity(dossier);
  if(table==='T_CHAR_HABITS'&&['主控','在场焦点'].includes(actor?.level))return result('habit_anchors',values,actor.dossier??actor.id);
  if(actor?.level==='主控')return result('player_archive',values,actor.dossier??actor.id);
  if(actor?.level==='在场焦点')return result(table==='T_CHAR_ANCHORS'?'character_archives':'focus_entities',values,actor.dossier??actor.id);
  return null;
 }
 if(table.startsWith('T_CHAR_')&&table!=='T_CHAR_SECRETS'){
  const actor=byIdentity(values.char_ref??values.subject_ref);
  if(actor?.level==='主控'||actor?.level==='在场焦点')return result(actor.level==='主控'?'player_archive':'character_archives',values,actor.dossier??actor.id);
  return null;
 }
 if(table===S){
  const actor=byIdentity(values.entity_id);
  const fields={...values};
  if(!actor||!['主控','在场焦点'].includes(actor.level)||!values.thought_authorization||['?','!','∅','—'].includes(values.thought_authorization)||scope.subject_ref&&![actor.id,actor.dossier].includes(scope.subject_ref))delete fields.inner_thought;
  delete fields.thought_authorization;
  return result('current_state',fields);
 }
 if(table==='T_DYN_SCENE_PARTICIPANTS'){
  if(values.focus_level==='离场索引'||values.scene_ref&&values.scene_ref!==scene)return null;
  const stored=state.tables[table]?.[id],fields={...values};
  const details=Object.keys(fields).filter(key=>!['entity_ref','scene_ref','focus_level'].includes(key)&&known(stored,key));
  // Presence and focus already live in the roster. Inject a participant row
  // only when it contributes actual spatial or sensory detail.
  if(!details.length)return null;
  delete fields.scene_ref;delete fields.focus_level;
  return result('current_state',fields);
 }
 if(table===H){
  if(Object.hasOwn(values,'holding_end')&&!['?','!','∅','—'].includes(values.holding_end)&&values.holding_end!==null&&values.holding_end!=='')return null;
  const matchesPlayer=key=>{
   const record=state.tables[table]?.[id],value=known(record,key);
   const ids=Array.isArray(value)?value:[value];
   return !!player&&ids.some(ref=>{
    if(ref===player.entityId||ref===player.dossierId)return true;
    const child=state.tables.M_LIST_VALUES?.[ref];
    return known(child,'owner_row_uuid')===id&&known(child,'owner_field')===key&&
     [player.entityId,player.dossierId].includes(known(child,'target_row_uuid'))&&
     matrixRecordVisible(state,'M_LIST_VALUES',ref,scope);
   });
  };
  return result(matchesPlayer('owner_ref')||matchesPlayer('holder_ref')?'persona_extensions':'current_state');
 }
 if(table==='T_DYN_CURRENCY_BALANCES'&&player&&[player.entityId,player.dossierId].includes(values.owner_ref))return result('persona_extensions');
 if(table==='T_DYN_SCENE_SPACE'&&scene&&id!==scene)return null;
 if(table==='T_DYN_CLUES')return values.visibility==='全体公开'?result('pending_tasks',subset(values,visibleClueFields)):null;
 if(table==='T_CHAR_SECRETS')return values.lock_level==='L1'?result('secret_material',subset(values,knownSecretFields)):null;
 if(directSlots[table]==='offstage_state')return result('offstage_state',subset(values,visibleOffstageFields));
 if(table==='T_SYS_GENESIS_WORKBENCH'||table==='T_CORE_ADAPTATION'||table==='T_CORE_WORLD_MAPPINGS')return null;
 if(table==='T_DYN_EVENTS')return result('memory_archive');
 return result(directSlots[table]??defaultSlot);
}

export function castIndex(roster){
 const groups=new Map();
 for(const {name,level} of roster.people.values()){
  // Detailed player/focus/minor slots already name these actors. The registry
  // only supplies identities that would otherwise have no injected presence.
  if(level!=='离场索引')continue;
  const names=groups.get(level)??[];names.push(name);groups.set(level,names);
 }
 return [...groups].map(([level,names])=>level+'：'+names.join('、'));
}

export function calculationMaterial(state,scope){
 const rows=Object.entries(state.tables.T_SYS_SETTLEMENTS??{}).filter(([id,row])=>
  inKnowledgeScope(state,'T_SYS_SETTLEMENTS',id,scope)&&['成功','已应用'].includes(known(row,'status'))&&
  (!scope.turn_ref||known(row,'turn_id')===scope.turn_ref));
 return rows.map(([,row])=>[known(row,'name'),known(row,'status'),known(row,'narrative_mandate')]
  .filter(value=>typeof value==='string'&&value.trim()).join('｜'));
}
