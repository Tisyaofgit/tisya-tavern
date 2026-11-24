import {clone,fail,stableId} from './common.mjs';
import {matrixRecordVisible} from './prompt-boundary.mjs';
import {characterDossierId,characterEntityForDossier} from './character-identity.mjs';
import {PERSONA_GROUPS,PERSONA_TASK_LABELS,applyPersonaEvent} from './persona.mjs';
import {COGNITION_PHASE,cognitionPhase} from './character-knowledge.mjs';

export const OFFSTAGE_RULES='T_SYS_OFFSTAGE_RULES';
const EVENT_LIFECYCLE_FIELDS=[
 {key:'lifecycle_status',label:'事件生命周期',type:'ENUM',enum:['进行中','已结束'],description:'事件仍在发生时填写进行中；事件实际落定后填写已结束。结束时由统一运行时结算参与人的认知阶段。'}
];
const COGNITION_LIFECYCLE_FIELDS=[
 {key:'lifecycle_phase',label:'认知生命周期',type:'ENUM',enum:Object.values(COGNITION_PHASE),read_only:true,description:'事件中认知在事件结束或本人离场后转为离场确信；后续明确修正只淘汰被修正记录，不改写客观事实。'},
 {key:'closure_event_ref',label:'阶段结算事件',type:'REF',ref:'T_DYN_EVENTS',read_only:true,description:'导致本次认知阶段结算的事件；角色离场时引用实际离场事件。'},
 {key:'closure_reason',label:'阶段结算原因',type:'ENUM',enum:['事件结束','角色离场','后续修正'],read_only:true},
 {key:'supersedes_ref',label:'修正的认知',type:'REF',ref:'T_DYN_COGNITION',description:'本记录明确修正的同一人物旧认知；只建立主体内的修正链，不按相同名称或客观真相同并。'},
 {key:'subject_sequence',label:'人物认知序号',type:'INTEGER',read_only:true,classification:'automatic_identity',description:'统一生命周期服务按人物分配且不复用的展示序号；不是记录身份键。'},
 {key:'recall_label',label:'认知召回编号',type:'TEXT',read_only:true,classification:'derived_projection',description:'由人物认知序号派生为角色认知n；不保存第二份标签或信念正文。'}
];
const RULE_FIELDS=[
 {key:'rule_id',label:'规则ID',type:'ID',read_only:true,alias_of:'common.row_uuid'},
 {key:'name',label:'规则名称',type:'TEXT',required:true,description:'该对象或世界默认槽位规则的显示名称。'},
 {key:'world_ref',label:'适用世界',type:'TEXT',required:true,description:'填写当前世界稳定ID；GLOBAL 表示由明确登记的全局规则适用。'},
 {key:'subject_ref',label:'专属对象',type:'REF',ref:'T_SYS_ENTITIES',description:'人物或势力专属规则填写规范实体；世界默认规则留空。'},
 {key:'subject_kind',label:'默认对象类型',type:'ENUM',enum:['all','character','organization'],description:'仅世界默认规则使用；专属对象规则不据此扩散。'},
 {key:'dimension_group',label:'维度组',type:'ENUM',enum:['instincts','emotions','axes','desires','custom'],description:'五能、七情、心性轴、六欲或世界自定义维度。'},
 {key:'dimension_key',label:'维度键',type:'TEXT',description:'五能七情六欲使用已注册维度名；自定义维度填写稳定键。'},
 {key:'side',label:'欲望端',type:'ENUM',enum:['light','shadow','none'],description:'六欲选择光端或影端，其他维度使用 none。'},
 {key:'slot_key',label:'槽位键',type:'TEXT',description:'自定义槽的完整稳定键；五能七情六欲由维度组和端别生成。'},
 {key:'enabled',label:'启用推进',type:'BOOLEAN'},
 {key:'minimum',label:'槽位下限',type:'NUMBER'},
 {key:'maximum',label:'槽位容量',type:'NUMBER'},
 {key:'initial_value',label:'初始值',type:'NUMBER',description:'未知时留空，不以零代替；世界默认填写则明确适用于全部匹配对象。'},
 {key:'rate_per_hour',label:'每叙事小时变化',type:'NUMBER'},
 {key:'push_mode',label:'推送规则',type:'ENUM',enum:['threshold','maximum'],description:'达到自定义阈值或仅在实际满槽时推送。'},
 {key:'threshold',label:'推送阈值',type:'NUMBER'},
 {key:'release',label:'重新武装阈值',type:'NUMBER',description:'回落到该值后才允许下一轮推送，避免高位重复待办。'},
 {key:'transaction_name',label:'场外事务名称',type:'TEXT'},
 {key:'task_name',label:'前台待办名称',type:'TEXT'},
 {key:'task_category',label:'待办类别',type:'ENUM',enum:['主线','支线','日常','个人','阵营','订单','紧急']},
 {key:'goal',label:'自主目标',type:'LONG_TEXT'},
 {key:'candidate_action',label:'候选行动',type:'LONG_TEXT',description:'只描述有待前台确认的候选，不写成已经发生的事实。'},
 {key:'next_step',label:'下一步',type:'LONG_TEXT'}
];
const own=(object,key)=>Object.hasOwn(object??{},key);
const finite=(value,label)=>{if(typeof value!=='number'||!Number.isFinite(value))fail('OFFSTAGE_RULE_NUMBER',label+'必须是有限数值');return value;};
const known=(row,key)=>['known','derived'].includes(row?.states?.[key]);
const read=(row,key)=>known(row,key)?row.values[key]:undefined;

export function extendOffstageSchema(state){
 if(!state?.schema)return state;state.tables??={};
 if(!state.schema[OFFSTAGE_RULES])state.schema[OFFSTAGE_RULES]={id:OFFSTAGE_RULES,label:'对象级场外推进规则',sheet:'运行与归档',partition:'REG',record_kind:'registration_definition',fields:[{key:'row_uuid',label:'稳定记录ID',type:'ID',required:true}]};
 const schema=state.schema[OFFSTAGE_RULES];for(const field of RULE_FIELDS)if(!schema.fields.some(item=>item.key===field.key))schema.fields.push(clone(field));state.tables[OFFSTAGE_RULES]??={};
 for(const [tableId,fields]of [['T_DYN_EVENTS',EVENT_LIFECYCLE_FIELDS],['T_DYN_COGNITION',COGNITION_LIFECYCLE_FIELDS]]){const table=state.schema[tableId];if(table)for(const field of fields)if(!table.fields.some(item=>item.key===field.key))table.fields.push(clone(field));}
 const dossier=state.schema.T_CHAR_DOSSIER;if(dossier&&!dossier.fields.some(field=>field.key==='persona_dynamics'))dossier.fields.push({key:'persona_dynamics',label:'五能七情六欲动态',type:'OBJECT',description:'由统一场外推进与心性事件服务写入的对象级数值、速率、阈值、状态和待办；未知槽保持 null。'});
 return state;
}
export function extendOffstageCatalog(catalog){
 if(!catalog?.tables)return catalog;
 const schema=Object.fromEntries(catalog.tables.map(table=>[table.id,table])),complete=(tableId,fields)=>!schema[tableId]||fields.every(field=>schema[tableId].fields.some(item=>item.key===field.key));
 if(schema[OFFSTAGE_RULES]&&complete(OFFSTAGE_RULES,RULE_FIELDS)&&complete('T_DYN_EVENTS',EVENT_LIFECYCLE_FIELDS)&&complete('T_DYN_COGNITION',COGNITION_LIFECYCLE_FIELDS)&&(!schema.T_CHAR_DOSSIER||schema.T_CHAR_DOSSIER.fields.some(field=>field.key==='persona_dynamics')))return catalog;
 const copy=clone(catalog),state={schema:Object.fromEntries(copy.tables.map(table=>[table.id,table])),tables:{}};extendOffstageSchema(state);copy.tables=Object.values(state.schema);return copy;
}
export function personaRuleTemplates(){
 return Object.entries(PERSONA_GROUPS).flatMap(([group,keys])=>keys.flatMap(key=>group==='desires'?['light','shadow'].map(side=>({dimension_group:group,dimension_key:key,side,name:PERSONA_TASK_LABELS[key]+(side==='shadow'?' · 影向':'')})):[{dimension_group:group,dimension_key:key,side:'none',name:PERSONA_TASK_LABELS[key]??key}]));
}
function dimension(input){
 const group=input.dimension_group??'custom',key=input.dimension_key??'',side=input.side??'none';
 if(group==='custom'){if(typeof input.slot_key!=='string'||!input.slot_key.trim())fail('OFFSTAGE_RULE_SLOT','自定义槽位必须登记稳定槽键');return {dimension_group:group,dimension_key:key,side:'none',slot_key:input.slot_key.trim()};}
 if(!PERSONA_GROUPS[group]?.includes(key))fail('OFFSTAGE_RULE_DIMENSION','心性维度未登记');
 if(group==='desires'&&!['light','shadow'].includes(side))fail('OFFSTAGE_RULE_SIDE','六欲必须选择光端或影端');
 return {dimension_group:group,dimension_key:key,side:group==='desires'?side:'none',slot_key:group+'.'+key+(group==='desires'?'.'+side:'')};
}
function normalizedRule(engine,input){
 if(!input||typeof input!=='object')fail('OFFSTAGE_RULE_INPUT','场外规则需要配置对象');
 const name=String(input.name??'').trim(),world=String(input.world_ref??engine.data.runtime.scope.world_ref??'').trim(),subject=input.subject_ref??null;
 if(!name||!world)fail('OFFSTAGE_RULE_INPUT','规则名称和适用世界不能为空');if(subject&&!engine.rows('T_SYS_ENTITIES')[subject])fail('OFFSTAGE_RULE_SUBJECT','专属对象不存在');
 const values={};for(const field of RULE_FIELDS)if(field.key!=='rule_id'&&own(input,field.key))values[field.key]=clone(input[field.key]);Object.assign(values,dimension(input),{name,world_ref:world,subject_ref:subject,subject_kind:input.subject_kind??'all',enabled:input.enabled!==false,minimum:input.minimum??0,maximum:input.maximum??100,push_mode:input.push_mode??'threshold',transaction_name:String(input.transaction_name??name),task_name:String(input.task_name??input.transaction_name??name),task_category:input.task_category??(subject?'个人':'支线'),goal:String(input.goal??name),candidate_action:String(input.candidate_action??'等待前台确认下一步'),next_step:String(input.next_step??'核对依据并决定是否结算候选事务')});
 finite(values.minimum,'槽位下限');finite(values.maximum,'槽位容量');if(values.minimum>=values.maximum)fail('OFFSTAGE_RULE_RANGE','槽位下限必须低于容量');
 values.threshold=values.push_mode==='maximum'?values.maximum:input.threshold??values.maximum;finite(values.threshold,'推送阈值');values.release=input.release??values.minimum;finite(values.release,'重新武装阈值');finite(input.rate_per_hour,'每叙事小时变化');
 if(values.threshold>values.maximum||values.threshold<=values.minimum||values.release>=values.threshold||values.release<values.minimum)fail('OFFSTAGE_RULE_THRESHOLD','阈值须位于槽位范围内，复位线须低于推送阈值');
 if(values.initial_value!=null){finite(values.initial_value,'初始值');if(values.initial_value<values.minimum||values.initial_value>values.maximum)fail('OFFSTAGE_RULE_INITIAL','初始值超出槽位范围');}
 if(!['all','character','organization'].includes(values.subject_kind)||!['threshold','maximum'].includes(values.push_mode))fail('OFFSTAGE_RULE_ENUM','规则对象类型或推送模式无效');
 return values;
}
export function registerOffstageRule(engine,input){
 const values=normalizedRule(engine,input),identity=[values.world_ref,values.subject_ref??'',values.subject_kind,values.slot_key].join('|'),id=input.rule_id??input.id??stableId('offstage-rule|'+identity),prior=engine.rows(OFFSTAGE_RULES)[id];
 if(prior){for(const key of ['world_ref','subject_ref','subject_kind','slot_key'])if((prior.values[key]??null)!==(values[key]??null))fail('OFFSTAGE_RULE_IDENTITY','规则稳定ID不能改挂世界、对象或槽位');for(const key of RULE_FIELDS.map(field=>field.key).filter(key=>key!=='rule_id'))engine.set([OFFSTAGE_RULES,id,key,[]],values[key]??null);}
 else engine.newRecord(OFFSTAGE_RULES,values,id);return {rule_id:id,slot_key:values.slot_key};
}
function ruleRows(engine){
 const scope={...engine.data.runtime.scope,audience:'author'},world=scope.world_ref,meta=new Map(Object.values(engine.rows('X_RECORD_META')).map(row=>[row.values.table_id+'#'+row.values.record_id,row.values]));
 return Object.entries(engine.rows(OFFSTAGE_RULES)).filter(([id,row])=>row.values.enabled===true&&matrixRecordVisible(engine.data,OFFSTAGE_RULES,id,scope,meta)).filter(([id,row])=>{const owner=row.values.world_ref??meta.get(OFFSTAGE_RULES+'#'+id)?.scope_world_id;return owner&&(owner==='GLOBAL'||!world||owner===world);});
}
function actorKind(kind){if(/^(?:organization|organisation|faction|组织|势力|阵营)$/iu.test(kind??''))return 'organization';if(/^(?:character|person|npc|player|角色|人物|主控)$/iu.test(kind??''))return 'character';return null;}
function rulesFor(engine,actor,rows=ruleRows(engine)){
 const selected=new Map();for(const [id,row]of rows){const v=row.values;if(v.subject_ref&&v.subject_ref!==actor.entityId)continue;if(!v.subject_ref&&v.subject_kind!=='all'&&v.subject_kind!==actor.kind)continue;if(v.subject_ref&&!actor.entityId)continue;const prior=selected.get(v.slot_key);if(prior?.values.subject_ref&&!v.subject_ref)continue;if(prior&&prior.values.subject_ref===v.subject_ref)fail('OFFSTAGE_RULE_DUPLICATE','同一对象与槽位存在重复启用规则');selected.set(v.slot_key,{id,...row});}
 return [...selected.values()];
}
function actors(engine){
 const scope={...engine.data.runtime.scope,audience:'author'},result=[],linked=new Set();
 for(const [id,row]of Object.entries(engine.rows('T_SYS_ENTITIES'))){const dossierId=characterDossierId(engine.data,id),kind=actorKind(row.values.kind)??(dossierId?'character':null);if(!kind||!matrixRecordVisible(engine.data,'T_SYS_ENTITIES',id,scope))continue;if(dossierId)linked.add(dossierId);result.push({key:'entity:'+id,entityId:id,dossierId,kind});}
 for(const [id,row]of Object.entries(engine.rows('T_CHAR_DOSSIER')))if(!linked.has(id)&&row.values.persona_dynamics&&!characterEntityForDossier(engine.data,id))result.push({key:'dossier:'+id,entityId:null,dossierId:id,kind:'character'});
 return result;
}
function currentPresence(engine){
 const scope=engine.data.runtime.scope??{},scenes=Object.keys(engine.rows('T_DYN_SCENE_SPACE')),scene=scope.scene_ref??scenes.at(-1);
 return {scene,rows:Object.entries(engine.rows('T_DYN_SCENE_PARTICIPANTS')).filter(([,row])=>!known(row,'scene_ref')||row.values.scene_ref===scene)};
}
function exclusions(engine){
 const scope=engine.data.runtime.scope??{},configured=engine.offstageContext?.playerBinding??scope.playerBinding??scope.player_binding,binding=configured?.database?configured:null,players=new Set([binding?.entityId,binding?.dossierId].filter(Boolean)),present=new Set();
 for(const [,row]of currentPresence(engine).rows)if(known(row,'focus_level')&&row.values.focus_level!=='离场索引'&&known(row,'entity_ref'))present.add(row.values.entity_ref);
 return {players,present};
}
const writeCognition=(engine,id,field,value)=>{const row=engine.rows('T_DYN_COGNITION')[id];if(!known(row,field)||row.values[field]!==value)engine.set(['T_DYN_COGNITION',id,field,[]],value);};
function sequenceCognitions(engine){
 const groups=new Map();for(const [id,row]of Object.entries(engine.rows('T_DYN_COGNITION'))){if(!known(row,'subject_ref'))continue;const subject=row.values.subject_ref;if(!groups.has(subject))groups.set(subject,[]);groups.get(subject).push([id,row]);}
 let sequenced=0;for(const [subject,records]of groups){
  const used=new Set();let maximum=0;for(const [id,row]of records){if(known(row,'subject_sequence')){const sequence=row.values.subject_sequence;if(!Number.isSafeInteger(sequence)||sequence<1||used.has(sequence))fail('COGNITION_SEQUENCE','人物认知序号冲突或无效',{subject_ref:subject,record:id});used.add(sequence);maximum=Math.max(maximum,sequence);}else if(Object.hasOwn(row.states,'subject_sequence'))fail('COGNITION_SEQUENCE','未知认知序号不能被自动覆盖',{subject_ref:subject,record:id});}
  const order=([id,row])=>{const ref=read(row,'acquisition_time'),time=ref?engine.rows('M_WORLD_TIME')[ref]:null,tick=read(time,'tick')??Number.POSITIVE_INFINITY;return [tick,id];};
  records.filter(([,row])=>!known(row,'subject_sequence')).sort((a,b)=>{const x=order(a),y=order(b);return x[0]-y[0]||x[1].localeCompare(y[1]);}).forEach(([id])=>{writeCognition(engine,id,'subject_sequence',++maximum);sequenced++;});
 }
 return sequenced;
}
export function synchronizeCognitionLifecycle(engine){
 const records=Object.entries(engine.rows('T_DYN_COGNITION')),byId=new Map(records),summary={retained_event:0,retained_departure:0,superseded:0,sequenced:0};
 const close=(id,reason,eventRef)=>{
  writeCognition(engine,id,'lifecycle_phase',reason==='后续修正'?COGNITION_PHASE.SUPERSEDED:COGNITION_PHASE.RETAINED);writeCognition(engine,id,'closure_reason',reason);
  if(eventRef){engine.record('T_DYN_EVENTS',eventRef);writeCognition(engine,id,'closure_event_ref',eventRef);}
 };
 for(const [id,row]of records){
  const targetId=read(row,'supersedes_ref');if(!targetId)continue;
  if(!known(row,'subject_ref')||!known(row,'epistemic_level')||row.values.epistemic_level==='K0')fail('COGNITION_SUPERSESSION','未知或未获知记录不能修正其他认知',{record:id});
  const targetRow=engine.rows('T_DYN_COGNITION')[targetId];
  if(!targetRow)fail('COGNITION_SUPERSESSION','修正目标不存在',{record:id,target:targetId});
  if(targetId===id)fail('COGNITION_SUPERSESSION','认知不能修正自身',{record:id,target:targetId});
  if(!known(targetRow,'subject_ref')||targetRow.values.subject_ref!==row.values.subject_ref)fail('COGNITION_SUPERSESSION','修正链必须指向同一人物的既有认知',{record:id,target:targetId,expected_subject:row.values.subject_ref,actual_subject:targetRow.values.subject_ref,target_state:targetRow.states.subject_ref});
  const seen=new Set([id]);let cursor=targetRow,cursorId=targetId;
  while(cursor){
   if(seen.has(cursorId))fail('COGNITION_SUPERSESSION','认知修正链不能成环',{record:id,target:cursorId});seen.add(cursorId);
   const next=read(cursor,'supersedes_ref');if(!next)break;cursor=byId.get(next)?.[1];cursorId=next;
   if(!cursor)fail('COGNITION_SUPERSESSION','认知修正链包含不存在的记录',{record:id,target:next});
  }
  if(cognitionPhase(targetRow)!==COGNITION_PHASE.SUPERSEDED){close(targetId,'后续修正',read(row,'event_ref'));summary.superseded++;}
 }
 for(const [id,row]of records){
  if(cognitionPhase(row)!==COGNITION_PHASE.EVENT||!known(row,'subject_ref')||!known(row,'epistemic_level')||row.values.epistemic_level==='K0')continue;
  const eventRef=read(row,'event_ref');if(!eventRef)continue;const event=engine.record('T_DYN_EVENTS',eventRef);
  if(known(event,'lifecycle_status')&&event.values.lifecycle_status==='已结束'){close(id,'事件结束',eventRef);summary.retained_event++;}
 }
 const present=new Set(),departed=new Map();
 for(const [id,row]of currentPresence(engine).rows){if(!known(row,'entity_ref')||!known(row,'focus_level'))continue;if(row.values.focus_level==='离场索引')departed.set(row.values.entity_ref,{id,row});else present.add(row.values.entity_ref);}
 for(const [id,row]of records){
  if(cognitionPhase(row)!==COGNITION_PHASE.EVENT||!known(row,'subject_ref')||!known(row,'epistemic_level')||row.values.epistemic_level==='K0')continue;
  const departure=departed.get(row.values.subject_ref);if(!departure||present.has(row.values.subject_ref))continue;close(id,'角色离场',read(departure.row,'departure_event_ref'));summary.retained_departure++;
 }
 summary.sequenced=sequenceCognitions(engine);return summary;
}
export function closeEventCognitions(engine,input){
 const id=engine.find('T_DYN_EVENTS',String(input.event_ref??input.event??''));engine.set(['T_DYN_EVENTS',id,'lifecycle_status',[]],'已结束');return {event_ref:id,...synchronizeCognitionLifecycle(engine)};
}
export function departCharacter(engine,input){
 let id=input.presence_ref;if(!id){const scene=input.scene_ref??currentPresence(engine).scene,subject=input.subject_ref??input.entity_ref??input.actor;const matches=currentPresence(engine).rows.filter(([,row])=>known(row,'entity_ref')&&row.values.entity_ref===subject&&(!scene||!known(row,'scene_ref')||row.values.scene_ref===scene));if(matches.length!==1)fail('COGNITION_DEPARTURE','离场站位必须唯一匹配当前人物与场景',{subject_ref:subject,matches:matches.length});id=matches[0][0];}
 const row=engine.record('T_DYN_SCENE_PARTICIPANTS',id),eventRef=input.departure_event_ref??input.event_ref??null;if(eventRef)engine.record('T_DYN_EVENTS',eventRef);engine.set(['T_DYN_SCENE_PARTICIPANTS',id,'focus_level',[]],'离场索引');if(eventRef)engine.set(['T_DYN_SCENE_PARTICIPANTS',id,'departure_event_ref',[]],eventRef);return {presence_ref:id,subject_ref:known(row,'entity_ref')?row.values.entity_ref:null,...synchronizeCognitionLifecycle(engine)};
}
function windowRecord(engine,actor,start,end){
 const id=stableId('offstage-window|'+actor.key+'|'+start+'|'+end),values={subject_ref:actor.entityId??null,actual_progress:'等待',change_operation_ref:engine.activeOperation??'direct',confirmed_results:'',continuation_candidates:'仅累计已登记槽位；满槽后推送待前台结算的候选事务',reserved_player_choices:'主控和当前场内人物不在后台时窗内推进',blocked_dependencies:'',visible_timing:'前台待办出现后',contact_channel:'任务与委托'};engine.newRecord('T_SYS_OFFSTAGE_ADVANCES',values,id);
 for(const [field,at,text]of [['legal_window_start',start,'故事刻度 '+start],['legal_window_end',end,engine.clock().text()]]){const timeId=stableId(id+'|'+field);engine.newRecord('M_WORLD_TIME',{owner_table:'T_SYS_OFFSTAGE_ADVANCES',owner_row_uuid:id,owner_field:field,precision:'tick',tick:at,original_text:text,value_state:'known'},timeId);engine.set(['T_SYS_OFFSTAGE_ADVANCES',id,field,[]],timeId);}
 return {id,endTime:stableId(id+'|legal_window_end')};
}
function pushCandidate(engine,actor,advance,{key,name,transactionName=name,category='个人',goal,action,next_step,value,target,source}){
 const taskId=stableId('offstage-task|'+actor.key+'|'+key);let created=false;
 if(!engine.rows('T_DYN_TASKS')[taskId]){engine.newRecord('T_DYN_TASKS',{name,source,publisher_ref:actor.entityId??null,responsible_ref:actor.entityId??null,category,goal,next_step,progress_current:value,progress_target:target,status:'发布'},taskId);created=true;}
 const activityId=stableId('offstage-activity|'+actor.key+'|'+key);if(!engine.rows('T_DYN_ACTIVITIES_LIFELINES')[activityId])engine.newRecord('T_DYN_ACTIVITIES_LIFELINES',{name:transactionName,subject_ref:actor.entityId??null,goal,action,next_step,progress:0,status:'等待',task_ref:taskId,advance_evidence:'槽位达到已登记推送规则；这是待确认候选，不是已发生事件'},activityId);
 engine.set(['T_DYN_ACTIVITIES_LIFELINES',activityId,'advanced_to',[]],advance.endTime);engine.set(['T_SYS_OFFSTAGE_ADVANCES',advance.id,'activity_ref',[]],activityId);return created;
}
function advanceGauge(engine,actor,rule,hours,advance,start,end){
 const v=rule.values,gaugeId=stableId('offstage-gauge|'+rule.id+'|'+actor.key);let row=engine.rows('T_DYN_ENTITY_GAUGES')[gaugeId];
 if(!row){if(v.initial_value==null)return 'unknown';engine.newRecord('T_DYN_ENTITY_GAUGES',{name:v.name,entity_id:actor.entityId,field_key:v.slot_key,value:v.initial_value,minimum:v.minimum,maximum:v.maximum,validity:'有效',change_reason:'对象级场外规则登记的初始值',native_ref:'offstage:'+rule.id},gaugeId);row=engine.record('T_DYN_ENTITY_GAUGES',gaugeId);row.metadata.offstage={rule_id:rule.id,armed:v.initial_value<=v.release,cycle:0};}
 if(row.values.entity_id!==actor.entityId||row.metadata?.offstage?.rule_id&&row.metadata.offstage.rule_id!==rule.id)fail('OFFSTAGE_GAUGE_IDENTITY','数值槽稳定坐标与对象规则不一致');if(!known(row,'value')||!Number.isFinite(row.values.value))return 'unknown';
 const before=row.values.value,after=Math.max(v.minimum,Math.min(v.maximum,before+v.rate_per_hour*hours)),meta=row.metadata.offstage??={rule_id:rule.id,armed:before<=v.release,cycle:0};
 if(after!==before){engine.set(['T_DYN_ENTITY_GAUGES',gaugeId,'value',[]],after);engine.set(['T_DYN_ENTITY_GAUGES',gaugeId,'change_reason',[]],'合法场外时窗 '+start+'→'+end+'；'+engine.clock().text());}
 if(before<=v.release||after<=v.release)meta.armed=true;let created=false;
 if(after>=v.threshold&&meta.armed!==false){meta.cycle=(meta.cycle??0)+1;created=pushCandidate(engine,actor,advance,{key:rule.id+'|'+meta.cycle,name:v.task_name,transactionName:v.transaction_name,category:v.task_category,goal:v.goal,action:v.candidate_action,next_step:v.next_step,value:after,target:v.threshold,source:'对象级场外槽位达到推送阈值；仅为待办，不代表事务已完成'});meta.armed=false;}
 return created?'pushed':after===before?'unchanged':'changed';
}
export function applyOffstageDelta(engine,input){
 const actor=engine.rows('T_SYS_ENTITIES')[input.subject_ref];if(!actor)fail('OFFSTAGE_DELTA_SUBJECT','场外槽位主体不存在');if(typeof input.evidence!=='string'||!input.evidence.trim())fail('OFFSTAGE_DELTA_EVIDENCE','槽位变化需要独立正文或事件依据');finite(input.delta,'槽位变化量');
 const rules=ruleRows(engine).filter(([id,row])=>row.values.subject_ref===input.subject_ref&&(!input.rule_id||id===input.rule_id)&&(!input.slot_key||row.values.slot_key===input.slot_key));if(rules.length!==1)fail('OFFSTAGE_DELTA_RULE','需要唯一匹配的对象专属槽位规则');
 const [ruleId]=rules[0],gaugeId=stableId('offstage-gauge|'+ruleId+'|entity:'+input.subject_ref),row=engine.record('T_DYN_ENTITY_GAUGES',gaugeId);if(!known(row,'value'))fail('OFFSTAGE_DELTA_UNKNOWN','未知槽位不能以零代替');
 let event=null;if(input.event_ref)event=engine.record('T_DYN_EVENTS',input.event_ref);const scopeTime=engine.data.runtime.scope.story_time;let storyTime=event?.values.story_time??(scopeTime&&engine.rows('M_WORLD_TIME')[scopeTime]?scopeTime:null),createdTime=null;
 if(!storyTime){createdTime=stableId('offstage-delta-time|'+engine.activeOperation+'|'+gaugeId);storyTime=createdTime;engine.newRecord('M_WORLD_TIME',{owner_table:'T_DYN_ENTITY_GAUGES',owner_row_uuid:gaugeId,owner_field:'effective_from',precision:'tick',tick:engine.clock().ordinal(),original_text:engine.clock().text(),value_state:'known'},createdTime);}
 const rule=rules[0][1].values,before=row.values.value,after=Math.max(rule.minimum,Math.min(rule.maximum,before+input.delta)),prior=engine.historyContext;engine.historyContext={...prior,kind:'offstage-delta',reason:input.evidence,eventRef:input.event_ref,storyTime};
 try{engine.set(['T_DYN_ENTITY_GAUGES',gaugeId,'value',[]],after);engine.set(['T_DYN_ENTITY_GAUGES',gaugeId,'change_reason',[]],input.evidence);if(createdTime)engine.set(['T_DYN_ENTITY_GAUGES',gaugeId,'effective_from',[]],createdTime);if(input.event_ref)engine.set(['T_DYN_ENTITY_GAUGES',gaugeId,'anchor_event_ref',[]],input.event_ref);}finally{engine.historyContext=prior;}return {before,after};
}
export function advanceOffstage(engine,start,end){
 if(end<start)fail('OFFSTAGE_TIME_REVERSE','场外时间回退须恢复对应楼层存档');const summary={actors:0,skipped_player:0,skipped_present:0,windows:0,persona_ticks:0,gauge_changes:0,tasks_created:0,unknown_slots:0,cognition:null};if(end===start)return summary;
 const cognition=synchronizeCognitionLifecycle(engine);summary.cognition=cognition;
 const excluded=exclusions(engine),hours=(end-start)/engine.clock().c.hour_minutes,rules=ruleRows(engine);
 for(const actor of actors(engine)){summary.actors++;if(excluded.players.has(actor.entityId)||excluded.players.has(actor.dossierId)){summary.skipped_player++;continue;}if(actor.entityId&&excluded.present.has(actor.entityId)){summary.skipped_present++;continue;}
  const applicable=rulesFor(engine,actor,rules),dossier=actor.dossierId?engine.rows('T_CHAR_DOSSIER')[actor.dossierId]:null,dynamics=dossier?.values.persona_dynamics;if(!applicable.length&&!dynamics)continue;const advance=windowRecord(engine,actor,start,end),prior=engine.historyContext;engine.historyContext={...prior,kind:'offstage',reason:'合法时窗内后台自推进',storyTime:advance.endTime};summary.windows++;
  try{
   if(dynamics){applyPersonaEvent(engine,actor.dossierId,{id:`world-clock:${start}:${end}`,kind:'tick',hours});summary.persona_ticks++;const current=engine.rows('T_CHAR_DOSSIER')[actor.dossierId].values.persona_dynamics;for(const item of [...current.daily,...current.plans])if(item.status==='pending'){const created=pushCandidate(engine,actor,advance,{key:'persona|'+item.id,name:item.title,category:current.daily.includes(item)?'日常':'个人',goal:item.title,action:'等待前台确认是否处理该项日常或计划',next_step:'结合正文依据结算；完成不自动推断欲望已满足',value:item.triggerValue,target:current.threshold,source:'五能七情六欲槽位高涨；待办不是已发生事实'});if(created)summary.tasks_created++;}}
   for(const rule of applicable){const result=advanceGauge(engine,actor,rule,hours,advance,start,end);if(result==='unknown')summary.unknown_slots++;else if(result==='changed')summary.gauge_changes++;else if(result==='pushed'){summary.gauge_changes++;summary.tasks_created++;}}
  }finally{engine.historyContext=prior;}
 }
 return summary;
}
export function installOffstage(engine){
 extendOffstageSchema(engine.data);engine.operators.OFFSTAGE_RULE_REGISTER=context=>registerOffstageRule(engine,{...context,subject_ref:context.subject_ref??context.actor});engine.operators.OFFSTAGE_DELTA=context=>applyOffstageDelta(engine,{...context,subject_ref:context.subject_ref??context.actor});
 engine.operators.COGNITION_SETTLE=()=>synchronizeCognitionLifecycle(engine);engine.operators.EVENT_CLOSE=context=>closeEventCognitions(engine,context);engine.operators.CHARACTER_DEPART=context=>departCharacter(engine,context);
}
export function offstageDiagnostics(state){
 const count=(table,predicate=()=>true)=>Object.values(state.tables?.[table]??{}).filter(predicate).length;return {rules:count(OFFSTAGE_RULES,row=>row.values.enabled===true),gauges:count('T_DYN_ENTITY_GAUGES',row=>row.values.native_ref?.startsWith('offstage:')),pending_tasks:count('T_DYN_TASKS',row=>row.values.status==='发布'&&String(row.values.source??'').includes('槽位')),candidate_activities:count('T_DYN_ACTIVITIES_LIFELINES',row=>row.values.status==='等待'),windows:count('T_SYS_OFFSTAGE_ADVANCES')};
}
