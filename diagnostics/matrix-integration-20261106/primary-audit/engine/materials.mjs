import {clone} from './common.mjs';
import {activePreferences} from './business.mjs';
import {recall} from './reply.mjs';
const routes={'世界与规则':'world_context','类型与物品':'asset_context','地点与交通':'location_context','组织与制度':'faction_context','场景与环境':'current_state','状态与成长':'current_state','持有与交易':'current_state','关系与约定':'current_state','人物原点':'focus_entities','人物细节':'focus_entities','认知与情报':'knowledge_material','历史与记忆':'memory_archive','任务与调度':'pending_tasks','生产与设施':'current_state','冲突与检定':'current_state','创世与跨世界':'cardflow','规则与执行':'cell_prompts','宿主与投影':'display_material','运行与归档':'offstage_state'};
const text=v=>v==null?'~':typeof v==='boolean'?(v?'是':'否'):Array.isArray(v)?v.map(text).join('、')||'[]':typeof v==='object'?Object.entries(v).map(([k,x])=>k+'='+text(x)).join('；')||'{}':String(v).replace(/\r?\n/g,' ⏎ ');
export function initializeState(catalog,scope={}){
 const schema=Object.fromEntries(catalog.tables.map(t=>[t.id,clone(t)]));
 return {format:'tisya.matrix-state.v1',schema,tables:Object.fromEntries(Object.keys(schema).map(id=>[id,{}])),definition_meta:{derivations:clone(catalog.derivations??[]),relations:clone(catalog.relations??[]),parameter_definitions:clone(catalog.parameter_definitions??[]),parameter_bindings:clone(catalog.parameter_bindings??[])},runtime:{scope:clone(scope)}};
}
export function materials(e,context=e.data.runtime.scope??{},query=''){
 e.recalculate();const slots={},dict=[],meta=new Map(Object.values(e.rows('X_RECORD_META')).map(r=>[r.values.table_id+'#'+r.values.record_id,r.values]));
 const add=(k,v)=>{if(v)(slots[k]??=[]).push(v);};
 for(const [tid,rows]of Object.entries(e.data.tables)){
  if(/^(M_|register_|R_)/.test(tid)||['X_RECORD_META','T_SYS_SOURCE_FRAGMENTS','X_PREFERENCE_POLICIES'].includes(tid))continue;
  const schema=e.data.schema[tid],used=new Set();if(!schema)throw Error('表缺少定义：'+tid);
  for(const [rid,r]of Object.entries(rows)){
   if(context.audience!=='author'&&(tid==='T_CHAR_SECRETS'||['D','E','Access D','Access E'].includes(r.values.lock_level)))continue;
   const m=meta.get(tid+'#'+rid)??{};
   if([['world_ref','scope_world_id'],['session_ref','scope_session_id'],['branch_ref','scope_branch_id']].some(([k,mk])=>context[k]&&m[mk]&&!['GLOBAL',context[k]].includes(m[mk])))continue;
   const fields=Object.fromEntries(schema.fields.map(f=>[f.key,f])),values={};
   for(const [key,v]of Object.entries(r.values)){
    const f=fields[key]??{},state=r.states[key];if(key==='row_uuid'||f.alias_of||context.audience!=='author'&&f.lock_level)continue;
    if(!['known','derived','unknown','cleared','none','not_applicable'].includes(state))continue;
    if(context.audience!=='author'&&key==='true_name'&&['D','E','Access D','Access E'].includes(r.values.true_name_lock))continue;
    values[key]=['known','derived'].includes(state)?v:({unknown:'?',cleared:'!',none:'∅',not_applicable:'—'})[state];
    if(r.metadata?.[key]?.gauge_max!=null&&['known','derived'].includes(state))values[key]+='/'+r.metadata[key].gauge_max;
    if(!f.read_only&&!f.lock_level)used.add(key);
   }
   if(!Object.keys(values).length)continue;
   let line='['+tid+'#'+rid+'/'+text(values.name??values.title??schema.label)+'] '+Object.entries(values).filter(([k])=>!['name','title'].includes(k)).map(([k,v])=>(fields[k]?.label??k)+'='+text(v)).join('；');
   if(tid==='T_DYN_EVENTS')line=text(values.short_code??rid)+'['+text(values.time_original_text??values.story_time)+']：'+text(values.spine_digest??values.full_process??values.title)+'；'+line;
   if(tid==='T_CHAR_ANCHORS')line='<十维行为锚点> '+line+' </十维行为锚点>';
   if(tid==='T_PREF_CHAR_FILTER')line='<演出时角色滤镜> '+line+' </演出时角色滤镜>';
   add('tisya_material_'+(routes[schema.sheet]??'task_material'),line);
  }
  if(used.size)dict.push(tid+' 字段：'+[...used].map(k=>{const f=schema.fields.find(f=>f.key===k);return k+'('+f.label+'/'+f.type+')';}).join('；'));
 }
 for(const batch of e.data.runtime.archive??[])for(const r of batch.rows??[])add('tisya_material_memory_archive',r.raw);
 for(const p of activePreferences(e,context))add('tisya_contractor_wish',p.directive);
 if(query){let hits=recall(e,query,{branch:context.branch_ref});if(context.subject_ref){const known=new Set(Object.values(e.rows('T_DYN_COGNITION')).filter(r=>r.values.subject_ref===context.subject_ref).map(r=>r.values.event_ref));const entries=new Set(Object.entries(e.rows('T_DYN_EVENTS')).filter(([id])=>known.has(id)).map(([,r])=>r.values.source_entry_id));hits=hits.filter(h=>entries.has(h.entry_id));}for(const h of hits)add('tisya_material_memory_excerpt','原文 '+h.source_key+' sha256='+h.body_sha256+'\n'+h.fragments.map(f=>f.paragraph_id+'：'+f.raw_block).join('\n'));}
 if(e.data.runtime.calendar||Object.keys(e.rows('X_WORLD_CLOCKS')).length)add('tisya_material_event_context','世界历法：'+e.clock().text());
 add('tisya_material_cell_prompts','<cells format="delta">每行只写本轮改变并附 | Pn。稳定目标为表ID#记录ID.字段，容器路径用/键。未提供映射不得使用示例C17/D17坐标。@ACT: JSON {action,arguments}；@TIME: tick(+1h)；@ROW+: JSON {table_id,record_id,values}；@FIELD+: JSON {table_id,key,type,label}。@EVENTS+: e01[世界时间]：前因->过程->结果(原文:P1..P2)。@ANCHORS+: ID|角色|源事件|动作|触发|防御|执念|软化条件|权重|演化。@PACTS+: ID|双方|内容|期限或代价|状态。@PREF: 维度 +0.15|本轮/会话/世界/全局/角色:ID|提示词。只用已登记字段，不猜价格、引用和规则。\n可用动作：'+Object.keys(e.operators).sort().join('、')+'\n'+dict.join('\n'));
 return Object.fromEntries(Object.entries(slots).map(([k,v])=>[k,[...new Set(v)].join('\n')]));
}
