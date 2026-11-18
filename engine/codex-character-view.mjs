// Read-only projection: the dossier, measures, abilities and phone remain canonical.
import {matrixRecordVisible,matrixFieldVisible} from './prompt-boundary.mjs';
export const PERSONA_GROUPS=Object.freeze({instincts:['食','眠','色','御','执'],emotions:['喜','怒','哀','惧','爱','恶','欲'],axes:['外放','内敛','共生','独占','通透','戒备','直觉','迂回'],desires:['求安','求享','求亲','求认','求胜','求知']});
export const PERSONA_PATHS=Object.entries(PERSONA_GROUPS).flatMap(([group,names])=>names.flatMap(name=>group==='desires'?['light','shadow'].map(side=>`${group}.${name}.${side}`):[`${group}.${name}`]));
export const BASIC_AXES={WIL:'意志',INT:'智力',CHA:'魅力',AGI:'敏捷',STR:'力量',CON:'体质'};
export function characterCodexView(state,dossierId,{entityId=dossierId,scope={audience:'author'}}={}){
 const rows=table=>Object.entries(state.tables[table]??{}).filter(([id])=>matrixRecordVisible(state,table,id,scope));
 const visibleValue=(table,id,key)=>{const r=state.tables[table]?.[id],f=state.schema[table]?.fields.find(x=>x.key===key);return r&&f&&['known','derived'].includes(r.states?.[key])&&matrixFieldVisible(f,r,scope,table,state,id)?r.values[key]:null;};
 const values=Object.fromEntries(PERSONA_PATHS.map(p=>[p,null])),attributes={},resources={},sources={},rules={},seen=new Set();
 for(const [id,row]of rows('T_CHAR_MEASURES')){
  if(visibleValue('T_CHAR_MEASURES',id,'char_ref')!==dossierId)continue;
  const axis=visibleValue('T_CHAR_MEASURES',id,'axis_ref'),definition=state.tables.T_TYPE_ATTRIBUTES?.[axis];
  if(!definition||!matrixRecordVisible(state,'T_TYPE_ATTRIBUTES',axis,scope))continue;
  const key=visibleValue('T_TYPE_ATTRIBUTES',axis,'axis_key');if(!key)continue;
  if(seen.has(key))throw new Error('同一人物量表重复：'+key);seen.add(key);
  const v=visibleValue('T_CHAR_MEASURES',id,'value'),minimum=visibleValue('T_TYPE_ATTRIBUTES',axis,'minimum'),maximum=visibleValue('T_TYPE_ATTRIBUTES',axis,'maximum');
  if(v!==null&&(!Number.isFinite(v)||(minimum!==null&&v<minimum)||(maximum!==null&&v>maximum)))throw new Error('量值超出公共量表：'+key);
  const threshold=visibleValue('T_CHAR_MEASURES',id,'threshold'),release=visibleValue('T_CHAR_MEASURES',id,'release_threshold');
  if(threshold!==null&&release!==null&&release>=threshold)throw new Error('解除阈值须小于触发阈值');
  sources[key]={table:'T_CHAR_MEASURES',id};
  rules[key]=Object.fromEntries(['change_per_hour','importance','threshold','release_threshold'].map(k=>[k,visibleValue('T_CHAR_MEASURES',id,k)]));
  if(key.startsWith('persona.')&&Object.hasOwn(values,key.slice(8)))values[key.slice(8)]=v;
  else if(key.startsWith('attribute.'))attributes[key.slice(10)]={name:BASIC_AXES[key.slice(10)]??key.slice(10),value:v,minimum,maximum};
  else if(key.startsWith('resource.'))resources[key.slice(9)]={current:v,maximum:visibleValue('T_CHAR_MEASURES',id,'upper_limit')};
 }
 const owned=(table,key,owner)=>rows(table).filter(([id])=>visibleValue(table,id,key)===owner).map(([id])=>({table,id}));
 return {dossierId,entityId,persona:{dynamics:{values},rules},attributes,resources,sources,
  fate:{state:owned('T_DYN_ENTITY_STATE','entity_id',entityId),tasks:owned('T_DYN_TASKS','responsible_ref',entityId),branches:owned('T_DYN_LIFELINE_NODES','subject_ref',entityId),pacts:rows('T_DYN_PACTS').filter(([id])=>['party_a_ref','party_b_ref'].some(key=>visibleValue('T_DYN_PACTS',id,key)===entityId)).map(([id])=>({table:'T_DYN_PACTS',id}))},
  skills:owned('T_CHAR_SKILLS','char_ref',dossierId),memories:owned('T_CHAR_ANCHORS','char_ref',dossierId),habits:owned('T_CHAR_HABITS','char_ref',dossierId)};
}
export function sharedPhoneThreads(state,entityId,{worldId}={}){
 const rows=t=>Object.entries(state.tables[t]??{}).map(([id,r])=>[id,{values:Object.fromEntries(Object.entries(r.values).filter(([key])=>!r.states?.[key]||['known','derived'].includes(r.states[key])))}]).filter(([,r])=>!worldId||!r.values.world_ref||r.values.world_ref===worldId);
 const accounts=new Set(rows('X_SOCIAL_ACCOUNTS').filter(([,r])=>r.values.personId===entityId).flatMap(([id,r])=>[id,r.values.id].filter(Boolean)));
 const threads=rows('X_NETWORK_DOCUMENTS').filter(([,r])=>(r.values.participant_accounts??[]).some(id=>accounts.has(id)));
 return threads.map(([id,r])=>({id,...structuredClone(r.values),items:rows('X_NETWORK_ITEMS').filter(([,x])=>x.values.thread_ref===id||x.values.thread_ref===r.values.id||x.values.parent_ref===id&&x.values.collection_field==='items').sort((a,b)=>(a[1].values.ordinal??0)-(b[1].values.ordinal??0)).map(([key,x])=>({id:key,...structuredClone(x.values)}))}));
}
