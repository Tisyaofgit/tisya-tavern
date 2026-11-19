import {indexChatTranscripts, transcriptMessage, renderChatTranscript} from './chat-transcript.mjs';
import {FIELD_MERGES,semanticField} from './form-semantics.mjs';
import {narrativeFieldValue,labeledNarrativeField} from './narrative-values.mjs';
import {phoneFormReference,phoneFormReferenceCandidates,PHONE_FORM_LIST_REFERENCES} from './phone-form-contract.mjs';
import {matrixRecordVisible,matrixFieldVisible,modelFieldAllowed} from './prompt-boundary.mjs';
import {narrativeTimeCode,renderNarrativeRecord} from './narrative-templates.mjs';

export const materialText=v=>v==null?'~':typeof v==='boolean'?(v?'是':'否'):Array.isArray(v)?v.map(materialText).join('、')||'无':typeof v==='object'?Object.entries(v).map(([k,x])=>k+'='+materialText(x)).join('；')||'无':String(v).replace(/\r?\n/g,' ⏎ ');
const ownerKeys=new Set(['owner_table','owner_form','owner_row_uuid','owner_field','sequence','value_state','item_type','target_row_uuid','target_revision','reference_kind','resolution_status','external_id']);

// References keep their canonical coordinates in storage. The model sees a
// visible name; owned details are expanded at their one owning field.
export function renderBlocks(engine,slots,scope=engine.data.runtime?.scope??{},references=[],{narrative=false,roster}={}){
 const state=engine.data,out={},names=new Map(references.map(r=>[r.tableId+'#'+r.recordId,r]));
 const known=(row,key)=>['known','derived'].includes(row.states?.[key]);
 const visible=(tid,rid)=>matrixRecordVisible(state,tid,rid,scope);
 const ref=(tid,rid)=>{
  if(!visible(tid,rid))return '未明确对象';
  const entry=names.get(tid+'#'+rid),row=state.tables[tid][rid],schema=state.schema[tid];
  const key=['name','label','title','instance_name','axis_label'].find(k=>known(row,k)&&matrixFieldVisible(schema.fields.find(f=>f.key===k)??{key:k},row,scope,tid,state,rid));
  let name=row.values[key]??entry?.name;
  if(narrative&&/^第\d+项$/u.test(name??''))name='';
  if(narrative&&tid==='M_CALENDAR_RULES'&&known(row,'narrative')&&matrixFieldVisible(schema.fields.find(f=>f.key==='narrative'),row,scope,tid,state,rid))name=row.values.narrative;
  if(narrative&&!name){
   const usable=key=>known(row,key)&&matrixFieldVisible(schema.fields.find(f=>f.key===key)??{key},row,scope,tid,state,rid);
   if(tid==='T_DYN_CURRENCY_BALANCES')for(const [table,field]of [['X_FIN_ACCOUNTS','balance_ref'],['X_FIN_CREDIT_CARDS','debt_ref']]){
    const owners=Object.entries(state.tables[table]??{}).filter(([id,r])=>r.values[field]===rid&&visible(table,id)&&known(r,'name')&&matrixFieldVisible(state.schema[table].fields.find(f=>f.key==='name'),r,scope,table,state,id));
    if(owners.length===1){name=owners[0][1].values.name+'账目';break;}
   }
   if(['X_SOCIAL_POSTS','X_SOCIAL_COMMENTS'].includes(tid)&&usable('text'))name=row.values.text.slice(0,36)+(row.values.text.length>36?'…':'');
   if(tid==='X_PLACE_MAP_POINTS'&&usable('place_ref'))name=ref('T_STATIC_PLACES',row.values.place_ref);
   if(tid==='X_PHONE_WORLD_CONFIG'&&usable('owner_ref'))name=ref('T_SYS_ENTITIES',row.values.owner_ref)+'的手机';
  }
  const display=entry?.display??(schema.label??'资料')+(name?'／'+name:'');
  if(!narrative)return display;
  if(tid==='T_DYN_EVENTS'&&known(row,'short_code')&&matrixFieldVisible(schema.fields.find(f=>f.key==='short_code'),row,scope,tid,state,rid))return narrativeTimeCode(row.values.short_code);
  const ambiguous=entry&&references.some(other=>other.tableId===tid&&other.recordId!==rid&&other.name===name&&visible(tid,other.recordId));
  if(ambiguous&&tid==='X_SOCIAL_ACCOUNTS'){const platform=known(row,'platform')&&matrixFieldVisible(schema.fields.find(f=>f.key==='platform')??{},row,scope,tid,state,rid)?row.values.platform:'';const handle=known(row,'handle')&&matrixFieldVisible(schema.fields.find(f=>f.key==='handle'),row,scope,tid,state,rid)?row.values.handle:'';if(platform||handle)return name+'（'+[platform,handle].filter(Boolean).join('，')+'）';}
  return ambiguous?display:name||schema.label||'未命名对象';
 };
 const fieldText=(tid,rid,key,value,trail=new Set())=>{
  const row=state.tables[tid]?.[rid],schema=state.schema[tid],field=schema?.fields.find(f=>f.key===key)??{};
  if(!row||!known(row,key))return narrative?({'?':'','!':'已清空','∅':'明确无','—':''})[value]??materialText(value):materialText(value);
  const phoneTarget=phoneFormReference(tid,key)??PHONE_FORM_LIST_REFERENCES[tid]?.[key];
  if(phoneTarget){const targets=Array.isArray(phoneTarget)?phoneTarget:[phoneTarget],one=value=>{
   const found=targets.flatMap(target=>{const candidates=phoneFormReferenceCandidates(state,{tableId:tid,recordId:rid,field:key,target,value})??(state.tables[target]?.[value]?[value]:[]);return candidates.filter(id=>visible(target,id)).map(id=>ref(target,id));});
   return found.length===1?found[0]:'未明确对象';
  };return Array.isArray(value)?value.map(one).join('、'):one(value);}
  if(narrative&&tid==='X_NETWORK_DOCUMENTS'&&['author','audience'].includes(key)){
   const one=token=>{
    const found=['X_SOCIAL_ACCOUNTS','X_NETWORK_ACCOUNTS'].flatMap(table=>Object.entries(state.tables[table]??{}).filter(([id,r])=>(id===token||r.values.id===token)&&visible(table,id)&&(!row.values.world_ref||r.values.world_ref===row.values.world_ref)).map(([id])=>[table,id]));
    return found.length===1?ref(...found[0]):String(token);
   };return Array.isArray(value)?value.map(one).join('、')||'无':one(value);
  }
  const target=field.ref?.startsWith('@')?row.values[field.ref.slice(1)]:field.ref;
  if(field.type==='CHILD_REF'&&target){
   const ids=Array.isArray(value)?value:[value];
   return ids.map(id=>detail(target,id,trail)).filter(Boolean).join('；')||'未明确';
  }
  if(['REF','ROW_REF','REF_LIST'].includes(field.type)){
   const one=id=>target?ref(target,id):(()=>{const hits=[...names.values()].filter(entry=>entry.recordId===id);return hits.length===1?(narrative?ref(hits[0].tableId,id):hits[0].display):'未明确对象';})();
   return Array.isArray(value)?value.map(one).join('、'):one(value);
  }
  if(narrative){
   const configs=Object.entries(state.tables.X_PHONE_WORLD_CONFIG??{}).filter(([id,r])=>visible('X_PHONE_WORLD_CONFIG',id)&&(!row.values.world_ref||r.values.world_ref===row.values.world_ref)&&(!row.values.owner_ref||r.values.owner_ref===row.values.owner_ref));
   const epoch=configs.length===1?configs[0][1].values.phoneEpoch:undefined;
   return narrativeFieldValue(tid,key,value,{epoch});
  }
  return materialText(value);
 };
 const detail=(tid,rid,trail)=>{
  const token=tid+'#'+rid;if(trail.has(token))return ref(tid,rid);if(!visible(tid,rid))return '';
  const row=state.tables[tid][rid],v=row.values,next=new Set(trail).add(token);
  const readable=key=>known(row,key)&&matrixFieldVisible(state.schema[tid].fields.find(f=>f.key===key),row,scope,tid,state,rid);
  if(narrative&&tid==='M_WORLD_TIME'&&readable('original_text')&&v.original_text)return v.original_text;
  if(narrative&&tid==='M_QUANTITIES'){
   const keys=['value','minimum','maximum','unit_ref','formula_ref','narrative'].filter(readable);
   if(keys.length===1&&keys[0]==='narrative')return v.narrative;
   if(keys.includes('value')&&keys.every(k=>['value','unit_ref','narrative'].includes(k)))return String(v.value)+(keys.includes('unit_ref')?' '+ref('M_UNITS',v.unit_ref):'')+(keys.includes('narrative')?'（'+v.narrative+'）':'');
  }
  if(narrative&&['M_CONDITIONS','M_EFFECTS','M_POLICY_RULES','M_ACCESS_RULES','M_TIME_RANGES'].includes(tid)){
   const semantic=fields(tid,rid,v,new Set([...ownerKeys,'value_state','group_key']),next);
   if(semantic.length===1&&semantic[0].key==='narrative')return semantic[0].text;
  }
  if(narrative&&tid==='M_CONDITIONS'&&readable('predicate_kind')&&v.predicate_kind==='observed_boolean'){
   const observation=readable('observed_result')?({true:'已满足',false:'尚未满足',是:'已满足',否:'尚未满足'})[v.observed_result]:'';
   const evidence=readable('narrative')?v.narrative:'';
   if(v.owner_field==='physical_condition'&&observation==='已满足'&&evidence)return evidence;
   if(observation||evidence)return [observation,evidence].filter(Boolean).join('。');
  }
  if(['M_FIELD_REFERENCES','M_LIST_VALUES'].includes(tid)&&v.target_table&&v.target_row_uuid){const field=state.schema[v.target_table]?.fields.find(f=>f.key===v.target_field),target=state.tables[v.target_table]?.[v.target_row_uuid];return ref(v.target_table,v.target_row_uuid)+(field&&target&&matrixFieldVisible(field,target,scope,v.target_table,state,v.target_row_uuid)?' → '+field.label:'')+(v.narrative?'（'+materialText(v.narrative)+'）':'');}
  if(tid==='M_LIST_VALUES')return ['text_value','number_value','boolean_value'].filter(k=>known(row,k)).map(k=>materialText(v[k])).join('；')+(v.narrative?'（'+materialText(v.narrative)+'）':'');
  return fields(tid,rid,v,ownerKeys,next).map(field=>field.label+(narrative?'：':'=')+field.text).join('；');
 };
 const fields=(tid,rid,values,omit,trail=new Set())=>Object.entries(values).flatMap(([key,value])=>{
  const schema=state.schema[tid],field=schema?.fields.find(f=>f.key===key);
  if(!field||omit.has(key)||!modelFieldAllowed(field,schema)||!matrixFieldVisible(field,state.tables[tid][rid],scope,tid,state,rid))return [];
  const text=fieldText(tid,rid,key,value,trail);
  return narrative&&!text?[]:[{key,label:field.label??key,text}];
 });
 const locationIds=new Set(Object.values(slots).flatMap(rows=>rows.flatMap(row=>[row.values.place_ref,row.values.location_ref])).filter(Boolean));
 for(const [slot,rows]of Object.entries(slots)){
  const rendered=[], grouped=new Map();
  const {chats, parents} = indexChatTranscripts(state, narrative || scope.narrativeReading ? rows : []);
  for(const b of rows){
   const {table_id:table,record_id:id}=b;
   const v={...b.values};
   for(const [old,key]of Object.entries(FIELD_MERGES[table]??{}))if(v[old]!==undefined){if(v[key]===undefined)v[key]=v[old];else if(v[key]!==v[old])v[key]=v[key]+'；'+v[old];delete v[old];}
   for(const field of engine.data.schema[table].fields)if(field.classification==='derived_projection'&&typeof v[field.key]==='string'&&Object.entries(v).some(([k,value])=>k!==field.key&&value===v[field.key]))delete v[field.key];
   const titleKey=['name','title','instance_name','label','axis_label'].find(key=>v[key]),omit=new Set(titleKey?[titleKey]:[]);
   if(table==='T_DYN_EVENTS'){
    omit.add('short_code');
    if(narrative&&slot.endsWith('memory_archive')){
     const time=fieldText(table,id,'time_original_text',v.time_original_text??'')||
      (Object.hasOwn(v,'story_time')?fieldText(table,id,'story_time',v.story_time):'');
     const detail=['cause','full_process','result','impact'].filter(key=>Object.hasOwn(v,key)).map(key=>fieldText(table,id,key,v[key])).filter(Boolean);
     const spine=Object.hasOwn(v,'spine_digest')?fieldText(table,id,'spine_digest',v.spine_digest):'';
     const continuation=['impact','unfinished_followup'].filter(key=>Object.hasOwn(v,key)).map(key=>fieldText(table,id,key,v[key]));
     const summary=[spine||detail.join(' → ')||v.title,...continuation].filter(Boolean)
      .filter((text,index,parts)=>parts.findIndex(part=>part.includes(text))===index)
      .map(text=>/[。！？.!?]$/u.test(text)?text:text+'。').join('');
     const shortCode=Object.hasOwn(v,'short_code')?fieldText(table,id,'short_code',v.short_code):'';
     const mark=narrativeTimeCode(shortCode,time);
     if(summary)rendered.push(mark?mark+'：'+summary.replace(/\r?\n/g,' '):summary);
     continue;
    }
    if(v.spine_digest===v.title||typeof v.spine_digest==='string'&&typeof v.full_process==='string'&&v.full_process.includes(v.spine_digest))omit.add('spine_digest');
   }
   if(narrative&&b.group&&['T_CHAR_ANCHORS','T_CHAR_HABITS','T_CHAR_MEASURES','T_PREF_CHAR_FILTER'].includes(table))for(const key of ['char_ref','target_char_id'])omit.add(key);
   if(narrative&&scope.world_ref&&v.world_ref===scope.world_ref)omit.add('world_ref');
   if(narrative&&['X_MEDIA_PHOTOS','X_MEDIA_ALBUMS','X_MEDIA_SONGS'].includes(table)&&v.ownerId&&v.ownerId===v.owner_ref)omit.add('owner_ref');
   let parts=fields(table,id,v,omit).map(field=>({...field,label:semanticField(table,field).label}));
   // The display name is already the record heading. Repeating it verbatim as
   // a public identity adds no reading content; a distinct public role remains.
   if(narrative&&table==='T_CHAR_DOSSIER'&&typeof v.name==='string')parts=parts.filter(part=>part.key!=='public_identity'||part.text!==v.name);
   if(narrative&&table==='T_STATIC_PLACES'&&!parts.length&&locationIds.has(id))continue;
   let title=(titleKey?v[titleKey]:null)??b.name??ref(table,id);
   if(narrative&&['X_SOCIAL_POSTS','X_SOCIAL_COMMENTS'].includes(table)&&!titleKey)title=table==='X_SOCIAL_POSTS'?'社交动态':'社交评论';
   if(narrative&&table==='T_CHAR_MEASURES')title='';
   if (table === 'X_NETWORK_DOCUMENTS' && chats.has(id)) {
    const chat = chats.get(id);
    const docTitle = titleKey ? String(v[titleKey]) : chat.kind;
    const heading = docTitle.includes(chat.kind) ? docTitle : chat.kind + '：' + docTitle;
    chat.header = [heading, ...parts.filter(f => f.key !== 'kind').map(labeledNarrativeField)].join('\n');
    rendered.push(chat);
    continue;
   }
   if (table === 'X_NETWORK_ITEMS' && parents.has(id)) {
    const parentId = parents.get(id);
    const chat = chats.get(parentId);
    const original = state.tables[table][id];
    const ordinal = known(original, 'ordinal') ? original.values.ordinal : Number.MAX_SAFE_INTEGER;
    const messageFields = parts.filter(field => {
     if (field.key !== 'world_ref' && field.key !== 'owner_ref') return true;
     return v[field.key] !== chat.context[field.key];
    });
    chat.messages.push(transcriptMessage(messageFields, ordinal));
    continue;
   }
   let content;
   if(narrative)content=renderNarrativeRecord(table,(table==='T_CHAR_DOSSIER'&&b.group||table==='T_DYN_SCENE_SPACE'&&parts.some(part=>part.key==='place_ref'))?'':title,parts,{recordLabel:table==='X_SOCIAL_POSTS'?'社交动态':table==='X_SOCIAL_COMMENTS'?'社交评论':engine.data.schema[table]?.label});
   else{
    content='【'+ref(table,id)+'】'+(parts.length?' '+parts.map(field=>field.label+'='+field.text).join('；'):'');
    if(table==='T_CHAR_ANCHORS')content='<十维行为锚点>'+content+'</十维行为锚点>';
    if(table==='T_PREF_CHAR_FILTER')content='<演出时角色滤镜>'+content+'</演出时角色滤镜>';
   }
   if(narrative&&b.group){
    const group=grouped.get(b.group)??[];
    group.push(content);grouped.set(b.group,group);
   }else rendered.push(content);
  }
  for(const [id,lines]of grouped){
   const actor=[...(roster?.people?.values()??[])].find(person=>person.dossier===id||person.id===id);
   rendered.push([actor?.name,...lines.filter(line=>line!==actor?.name)].filter(Boolean).join('\n\n'));
  }
  if(rendered.length)out[slot]=rendered.map(block => typeof block === 'string' ? block : renderChatTranscript(block));
 }
 return out;
}
