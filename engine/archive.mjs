import {clone,digest,stableId,fail,asError} from './common.mjs';
import {Runtime} from './runtime.mjs';
import {prepareMatrixSheets,acceptMatrixSheets,applyMatrixChanges,sheetSections} from '../tables/foundation/engine.js';

// One archive consumer: semantic rows become the same reviewable workbook used
// by main cells and creation. The enclosing reply journal owns persistence.
export const ARCHIVE_ROUTES=Object.freeze({
 '引用':['T_SYS_ENTITIES'],
 '事件':['T_DYN_EVENTS'],
 '状态与流转':['T_DYN_ENTITY_STATE','T_DYN_ENTITY_GAUGES','T_DYN_TRANSFERS'],
 '认知':['T_DYN_COGNITION'],
 '新建档案':['T_CHAR_DOSSIER','T_STATIC_ITEMS_SKILLS','T_STATIC_PLACES','T_STATIC_ORGANIZATIONS','T_STATIC_WORLD_RULES','T_SYS_ENTITIES'],
 '事实与底稿':['T_STATIC_FACTS','T_STATIC_WORLD_RULES','T_DYN_EVENTS','T_CHAR_RELATION_ORIGINS'],
 '隐情':['T_CHAR_SECRETS'],
 '习惯锚点':['T_CHAR_ANCHORS'],
 '伏笔':['T_DYN_CLUES'],
 '场外与日程':['T_DYN_ACTIVITIES_LIFELINES','T_DYN_TASKS','T_DYN_TIMERS'],
 '待定':['T_SYS_CELL_REQUESTS','T_SYS_ARCHIVE_BATCHES']
});
const allowed=new Set([...Object.values(ARCHIVE_ROUTES).flat(),'T_DYN_EVENT_LINKS','T_DYN_EVENT_PARTICIPANTS','T_DYN_STAGE_SUMMARIES']);
export const ARCHIVE_PROTOCOL=`记忆归档与 cells 共用本轮已登记的极简表单、字段行号与关联名称。优先在 <archive format="form"> 中使用【表名／序号】及“行号 字段名：值 | Pn”；更新已有记录使用给定的完整已有标题。只填本轮正文支持的事实、认知、档案、关系、线索、已成立事务与日程；不用 JSON，不写程序回执。未知字段省略，受阻事项可另写“待定|对象或字段|缺失依据|解除条件”；不把愿望变成玩家义务。每条业务记录须有真实 Pn 依据，程序核范围并绑定原消息、修订与原文校验。来源原文即时保存，最近两条已接纳回复保持临时层，较早归档经同一事务校验后入表；停止、未选重骰与其他分支不进入当前正史。
兼容 <archive format="pipes"> 的 11 类：引用、事件、状态与流转、认知、新建档案、事实与底稿、隐情、习惯锚点、伏笔、场外与日程、待定。复合列用已登记中文字段名标注“字段：值；字段：值”，引用须唯一；语义含混、缺字段、缺依据或权限的行保留原文并列出待补，不能猜值。没有新增语义记忆时明确输出 <archive/>；缺块或坏格式会显示归档待处理，不静默算成功。状态数值与已由 cells 精确落位的事实不在 archive 重复写。`;

const check=(ok,code,message,details)=>{if(!ok)fail(code,message,details);};
const VERSION='tisya.semantic-archive/1';
const own=(o,k)=>Object.hasOwn(o??{},k);
const fieldState=(row,key)=>({present:own(row?.values,key),value:clone(row?.values?.[key]??null),state:row?.states?.[key]??'unset'});
function evidence(text,source,{required=true}={}){
 const refs=[...String(text).matchAll(/\bP(\d+)(?:\.\.P?(\d+))?\b/gi)],ids=new Set();
 check(!required||refs.length,'ARCHIVE_EVIDENCE','归档业务记录缺少本条正文段号依据');
 for(const m of refs){const from=Number(m[1]),to=Number(m[2]??m[1]);check(from>=1&&to>=from&&to<=source.fragments.length,'ARCHIVE_EVIDENCE','归档引用的正文段号越界或倒序',{reference:m[0],paragraphs:source.fragments.length});for(let n=from;n<=to;n++)ids.add('P'+n);}
 return [...ids];
}
function splitPipes(raw){const parts=[];let part='';for(let i=0;i<raw.length;i++){const c=raw[i];if(c==='\\'&&['|','\\'].includes(raw[i+1]))part+=raw[++i];else if(c==='|'||c==='｜'){parts.push(part.trim());part='';}else part+=c;}parts.push(part.trim());return parts;}
const cleanEvidence=value=>String(value).replace(/(?:[（(]?\s*(?:原文|依据)?\s*[:：]?\s*)?\bP\d+(?:\.\.P?\d+)?\b[）)]?\s*$/i,'').trim();
function pipeWorkbook(runtime,source,context){
 const records=[],references=[],pending=[],descriptions=[],counts=new Map(),byTable=new Map(context.catalog.templates.map(t=>[t.id,t]));
 const table=id=>byTable.get(id)??fail('ARCHIVE_TABLE','归档所需表尚未登记',{table:id});
 const field=(id,key)=>table(id).fields.find(f=>f.key===key)??fail('ARCHIVE_FIELD','归档字段尚未登记',{table:id,field:key});
 function add(id,values,{existing=null}={}){
  const t=table(id),number=(counts.get(id)??0)+1;if(!existing)counts.set(id,number);
  const heading=existing?context.references.find(r=>r.tableId===id&&r.recordId===existing)?.display:t.label+'／'+number;
  check(heading,'ARCHIVE_TARGET','归档修订目标未提供给本轮表单',{table:id,record:existing});
  const record={tableId:id,heading,values,existing};records.push(record);return heading;
 }
 function resolve(id,name){
  name=String(name).trim();let existing=context.references.filter(r=>(!id||r.tableId===id)&&[r.name,r.display,r.recordId,runtime.rows(r.tableId)[r.recordId]?.values.short_code].includes(name));
  if(!id){const origins=new Set(existing.filter(r=>r.tableId==='T_SYS_ENTITIES').map(r=>runtime.rows('M_FIELD_REFERENCES')[runtime.rows('T_SYS_ENTITIES')[r.recordId]?.values.origin_record_ref]?.values).filter(Boolean).map(r=>r.target_table+'#'+r.target_row_uuid));existing=existing.filter(r=>!origins.has(r.tableId+'#'+r.recordId));}
  const planned=records.filter(r=>(!id||r.tableId===id)&&[r.values.name,r.values.title,r.values.short_code,r.values.instance_name,r.heading].includes(name));
  if(id==='T_SYS_ENTITIES')planned.push(...records.filter(r=>r.tableId==='T_CHAR_DOSSIER'&&[r.values.name,r.heading].includes(name)).map(r=>({...r,heading:r.values.name})));
  const hits=[...new Map([...existing.map(r=>({tableId:r.tableId,recordId:r.recordId,display:r.display})),...planned.map(r=>({tableId:id??r.tableId,recordId:r.heading,display:r.heading}))].map(r=>[r.tableId+'#'+r.recordId,r])).values()];
  check(hits.length===1,'ARCHIVE_REFERENCE','归档关联名称不存在、重名或目标表不匹配',{table:id,name,matches:hits.length});return hits[0];
 }
 function named(id,name){const hits=context.references.filter(r=>r.tableId===id&&r.name===name);check(hits.length<=1,'ARCHIVE_REFERENCE','归档修订名称不唯一',{table:id,name});return hits[0]?.recordId??null;}
 function labeled(id,text,{plainField=null}={}){
  const out={},spec=table(id),parts=String(text).split(/[；;]/).map(s=>s.trim()).filter(Boolean);
  if(plainField&&parts.every(p=>!/^([^：:]+)[：:]/.test(p)))return {[plainField]:text};
  for(const p of parts){const m=/^([^：:]+)[：:]\s*([\s\S]*)$/.exec(p);check(m,'ARCHIVE_AMBIGUOUS','复合归档列须明确字段名；请使用极简分组表单',{table:id,text:p});const matches=spec.fields.filter(f=>[f.key,f.label].includes(m[1].trim()));check(matches.length===1,'ARCHIVE_FIELD','归档字段名未登记或不唯一',{table:id,field:m[1]});check(!own(out,matches[0].key),'ARCHIVE_FIELD','同一归档字段重复',{field:m[1]});out[matches[0].key]=cleanEvidence(m[2]);}
  return out;
 }
 function descriptor(text){const parts=text.split(/[；;]/),name=parts.shift().trim().replace(/^(?:名称|姓名)[：:]\s*/,''),extra={};for(const part of parts){const m=/^\s*([^：:]+)[：:]\s*(.+)$/.exec(part);check(m,'ARCHIVE_AMBIGUOUS','名称列的附加信息须注明主体、对象或别名');extra[m[1].trim()]=m[2].trim();}check(name,'ARCHIVE_NAME','归档名称为空');return {name,...extra};}
 function child(id,values){return add(id,values);}
 const lines=source.archive_raw.split(/\r?\n/).map((raw,i)=>({raw:raw.trim(),line:i+1})).filter(r=>r.raw);
 const parsed=lines.map(row=>{const [category,...fields]=splitPipes(row.raw);check(own(ARCHIVE_ROUTES,category)&&fields.length,'ARCHIVE_FORMAT','无法识别归档类别或分隔列',{line:row.line,raw:row.raw});return {...row,category,fields};});
 // Definitions precede references, irrespective of their textual order.
 for(const row of parsed.filter(r=>r.category==='新建档案')){
  const [kind,name,description]=row.fields;check(row.fields.length===3,'ARCHIVE_COLUMNS','新建档案需要类型、名称、概貌三列',{line:row.line});evidence(row.raw,source);
  const id={人物:'T_CHAR_DOSSIER',character:'T_CHAR_DOSSIER',物品:'T_STATIC_ITEMS_SKILLS',item:'T_STATIC_ITEMS_SKILLS',地点:'T_STATIC_PLACES',place:'T_STATIC_PLACES',组织:'T_STATIC_ORGANIZATIONS',organization:'T_STATIC_ORGANIZATIONS',规则:'T_STATIC_WORLD_RULES',rule:'T_STATIC_WORLD_RULES'}[kind];check(id,'ARCHIVE_KIND','新建档案类型未登记',{kind});
  const d=descriptor(name),values={name:d.name,...(d.别名?{aliases:d.别名}:{}),...(id==='T_STATIC_WORLD_RULES'?{proposition:cleanEvidence(description)}:{})},heading=add(id,values);
  if(id==='T_CHAR_DOSSIER')descriptions.push({name:d.name,description:cleanEvidence(description)});
  else{const ref=child('M_FIELD_REFERENCES',{target_table:table(id).label,target_row_uuid:heading,reference_kind:'record',resolution_status:'resolved'});add('T_SYS_ENTITIES',{instance_name:d.name,kind:{T_STATIC_ITEMS_SKILLS:'item',T_STATIC_PLACES:'place',T_STATIC_ORGANIZATIONS:'organization',T_STATIC_WORLD_RULES:'rule'}[id],origin_record_ref:ref,...(id!=='T_STATIC_WORLD_RULES'?{instance_description:cleanEvidence(description)}:{})});}
 }
 for(const row of parsed.filter(r=>r.category!=='新建档案').sort((a,b)=>({事件:0,事实与底稿:1}[a.category]??2)-({事件:0,事实与底稿:1}[b.category]??2))){
  const f=row.fields,requireColumns=n=>check(f.length===n,'ARCHIVE_COLUMNS','归档列数不符',{category:row.category,line:row.line,expected:n,actual:f.length});
  if(row.category==='引用'){requireColumns(1);for(const name of f[0].split(/[、,，；;]/).filter(Boolean)){const r=resolve(null,name);references.push({tableId:r.tableId,recordId:r.recordId,name});}continue;}
  if(row.category==='待定'){requireColumns(3);pending.push({target:f[0],missing:f[1],condition:f[2],raw:row.raw});continue;}
  evidence(row.raw,source);
  if(row.category==='事件'){
   requireColumns(1);const m=/^([^\[：:]+)(?:\[([^\]]*)\])?[：:]\s*([\s\S]+)$/.exec(f[0]);check(m,'ARCHIVE_EVENT','事件需要唯一短码、世界时间和因果经过');
   const existing=Object.entries(runtime.rows('T_DYN_EVENTS')).filter(([,r])=>r.values.short_code===m[1].trim());check(existing.length<=1,'ARCHIVE_REFERENCE','事件短码不唯一');if(existing.length)check(existing[0][1].values.source_entry_id===source.entry_id,'ARCHIVE_EVENT_CONFLICT','事件短码已属于另一来源；修订请用明确已有表单标题');
   add('T_DYN_EVENTS',{short_code:m[1].trim(),title:m[1].trim(),...(m[2]&&m[2]!=='~'?{time_original_text:m[2]}:{}),spine_digest:m[3]},{existing:existing[0]?.[0]});
  }else if(row.category==='状态与流转'){
   requireColumns(3);const target=resolve('T_SYS_ENTITIES',f[0]),transfer=/^(?:流转|资产流转)[：:]/.test(f[1]),id=transfer?'T_DYN_TRANSFERS':'T_DYN_ENTITY_STATE',values=labeled(id,f[1].replace(/^(?:流转|资产流转)[：:]\s*/,''));
   if(transfer){values.instance_ref??=target.display;add(id,values);}else{values.entity_id=target.display;const hits=Object.entries(runtime.rows(id)).filter(([,r])=>r.values.entity_id===target.recordId);check(hits.length<=1,'ARCHIVE_REFERENCE','同一主体存在多份状态，请使用明确已有表单标题');add(id,values,{existing:hits[0]?.[0]});}
  }else if(row.category==='认知'){
   requireColumns(4);const subject=resolve('T_SYS_ENTITIES',f[0]),target=resolve(null,f[1]),level=/\bK[123]\b|误信/.exec(f[2]);check(level,'ARCHIVE_COGNITION','认知必须明确 K1/K2/K3 或误信及获知途径');
   const key={T_STATIC_FACTS:'target_fact_ref',T_DYN_EVENTS:'event_ref',T_CHAR_SECRETS:'secret_ref',T_STATIC_ITEMS_SKILLS:'asset_ref'}[target.tableId],values={name:f[0]+'对'+f[1]+'的认识',subject_ref:subject.display,epistemic_level:level[0]==='误信'?'K_MIS':level[0],acquisition_channel:cleanEvidence(f[2]),subjective_belief:cleanEvidence(f[3])};if(key)values[key]=target.display;add('T_DYN_COGNITION',values);references.push({tableId:target.tableId,recordId:target.recordId,name:f[1],role:'cognition-target'});
  }else if(row.category==='事实与底稿'){
   requireColumns(4);const d=descriptor(f[1]),text=cleanEvidence(f[2]),proof=cleanEvidence(f[3]);
   if(f[0]==='事实发现'){const values={name:d.name,proposition:text,validation_status:proof,evidence:evidence(row.raw,source).join('、')};if(d.对象)values.object_ref=resolve('T_SYS_ENTITIES',d.对象).display;add('T_STATIC_FACTS',values);}
   else if(f[0]==='世界设定')add('T_STATIC_WORLD_RULES',{name:d.name,proposition:text});
   else if(f[0]==='人物前史')add('T_DYN_EVENTS',{title:d.name,timeline_domain:'人物前史',spine_digest:text});
   else if(f[0]==='关系底稿'){check(d.主体&&d.对象,'ARCHIVE_RELATION','关系底稿须在名称列分别注明主体与对象');add('T_CHAR_RELATION_ORIGINS',{subject_ref:resolve('T_SYS_ENTITIES',d.主体).display,target_ref:resolve('T_SYS_ENTITIES',d.对象).display,formation_process:text});}
   else fail('ARCHIVE_KIND','事实与底稿子类未登记',{kind:f[0]});
  }else if(row.category==='隐情'){
   requireColumns(3);const d=descriptor(f[0]),subject=resolve('T_CHAR_DOSSIER',d.主体??d.name),extra=labeled('T_CHAR_SECRETS',cleanEvidence(f[2]));
   add('T_CHAR_SECRETS',{name:d.name,char_ref:subject.display,fact_proposition:cleanEvidence(f[1]),...extra});
  }else if(row.category==='习惯锚点'){
   requireColumns(10);const weight=Number(f[8]);check(Number.isFinite(weight)&&weight>=0&&weight<=1,'ARCHIVE_ANCHOR_WEIGHT','召回权重须为0—1');const state=cleanEvidence(f[9]),validity={刚形成:'有效',强化:'有效',软化:'已改变',打破:'已改变',有效:'有效',已改变:'已改变',待确认:'待确认'}[state];check(validity,'ARCHIVE_ANCHOR_STATE','锚点演化状态未登记');
   const response=child('M_CONDITIONS',{group_key:'归档条件',combine:'all',predicate_kind:'observed_boolean',observed_result:'?',narrative:f[7]});add('T_CHAR_ANCHORS',{name:f[0],char_ref:resolve('T_CHAR_DOSSIER',f[1]).display,origin_event_ref:resolve('T_DYN_EVENTS',f[2]).display,actions:f[3],trigger_cues:f[4],psychology:f[5],internal_motive:f[6],response_boundary:response,recall_weight:String(weight),validity,past_current_boundary:state});
  }else if(row.category==='伏笔'){
   requireColumns(4);const stage={埋下:'已埋下',推进:'可推进',部分揭示:'部分揭示',回收:'已兑现',失效:'失效'}[f[0]];check(stage,'ARCHIVE_CLUE_STAGE','伏笔阶段未登记');const extra=labeled('T_DYN_CLUES',cleanEvidence(f[3]));add('T_DYN_CLUES',{name:f[1],stage,shown_content:cleanEvidence(f[2]),...extra},{existing:named('T_DYN_CLUES',f[1])});
  }else if(row.category==='场外与日程'){
   requireColumns(4);const id={activities:'T_DYN_ACTIVITIES_LIFELINES',进行中事务:'T_DYN_ACTIVITIES_LIFELINES',tasks:'T_DYN_TASKS',任务待办:'T_DYN_TASKS',timers:'T_DYN_TIMERS',日程倒计时:'T_DYN_TIMERS'}[f[0]];check(id,'ARCHIVE_KIND','场外与日程子类未登记');const d=descriptor(f[1]),values={name:d.name,...labeled(id,cleanEvidence(f[2])),...labeled(id,cleanEvidence(f[3]))};
   if(d.主体)values[id==='T_DYN_TASKS'?'responsible_ref':'subject_ref']=resolve('T_SYS_ENTITIES',d.主体).display;
   if(id==='T_DYN_TASKS'){check(values.status,'ARCHIVE_TASK_ACCEPTANCE','任务必须明确发布/接受/进行等状态，不能将愿望默记为已接受');if(['接受','进行','完成'].includes(values.status))check(values.accept_evidence,'ARCHIVE_TASK_ACCEPTANCE','已接受任务需要明确接受证据');}
   add(id,values,{existing:named(id,d.name)});
  }
 }
 const form=records.map(r=>'【'+r.heading+'】\n'+Object.entries(r.values).map(([key,value])=>{const spec=field(r.tableId,key);return (table(r.tableId).fields.indexOf(spec)+1)+' '+spec.label+'：'+String(value).replaceAll('\n',' ⏎ ');}).join('\n')).join('\n');
 return {form,references,pending,descriptions};
}

function matchesGuards(runtime,guards){return guards.every(guard=>{const row=runtime.rows(guard.tableId)[guard.recordId];return !!row===guard.exists&&Object.entries(guard.fields).every(([key,before])=>digest(fieldState(row,key))===digest(before));});}
function stagingView(runtime,sourceKey){
 let temp=new Runtime(runtime.data);const dependencies=new Map(),schema=[],warnings=[];
 for(const batch of runtime.data.runtime.archive_queue){
  if(batch.source_key===sourceKey)break;
  if(batch.format!==VERSION||batch.status!=='staged'||!batch.plan||!matchesGuards(temp,batch.plan.guards))continue;
  const next=new Runtime(temp.data),added=[];try{
   for(const change of batch.plan.schema??[])if(!next.data.schema[change.tableId].fields.some(f=>f.key===change.field.key)){next.declareField(change.tableId,change.field);added.push(clone(change));}
   if(batch.plan.changes.length)applyMatrixChanges(next,batch.plan.changes,{mode:'revise'});
   for(const change of batch.plan.changes)dependencies.set(change.tableId+'#'+change.recordId,batch.source_key);
   schema.push(...added);temp=next;
  }catch(error){warnings.push({code:'ARCHIVE_TEMPORARY_VIEW',source_key:batch.source_key,error:asError(error),message:'临时层关联读取失败，未授予该批关联；原文保留'});}
 }
 return {temp,dependencies,schema,warnings};
}
function preparePlan(runtime,source,sourceKey){
 check(source.archive_present!==false,'ARCHIVE_MISSING','回复缺少 archive 区块；原文已保存，语义记忆待补');
 const raw=source.archive_raw??source.archive_rows?.map(r=>r.raw).join('\n')??'',format=source.archive_format??'pipes';
 check(['pipes','form',''].includes(format),'ARCHIVE_FORMAT','归档格式未支持',{format});
 if(!raw.trim())return {changes:[],guards:[],schema:[],references:[],pending:[],paragraphs:[]};
 const {temp,dependencies,schema,warnings}=stagingView(runtime,sourceKey);
 // This field is already supported by @ANCHORS+; keep its existing declaration.
 if(/(?:^|\n)习惯锚点[|｜]/.test(raw)&&temp.data.schema.T_CHAR_ANCHORS&&!temp.data.schema.T_CHAR_ANCHORS.fields.some(f=>f.key==='recall_weight')){const field={key:'recall_weight',label:'召回权重',type:'NUMBER'};temp.declareField('T_CHAR_ANCHORS',field);schema.push({tableId:'T_CHAR_ANCHORS',field});}
 const snapshot={state:temp.data},context=prepareMatrixSheets(snapshot,{kind:'rows',mode:'revise',task:'main',operationId:'archive:'+sourceKey}),isForm=format==='form'||/^\s*【/.test(raw);
 let input;
 if(isForm){const pending=[],lines=[];for(const line of raw.split(/\r?\n/)){if(/^\s*待定[|｜]/.test(line)){const [category,target,missing,condition,...extra]=splitPipes(line.trim());check(!extra.length&&target&&missing&&condition,'ARCHIVE_COLUMNS','待定需要对象、缺项和解除条件三列');pending.push({target,missing,condition,raw:line});}else lines.push(line);}const form=lines.join('\n');if(form.trim())for(const section of sheetSections(form))if(!section.heading.startsWith('列表原子值／')&&!section.heading.startsWith('条件比较节点／'))evidence(section.lines.join('\n'),source);input={form,references:[],pending,descriptions:[]};}
 else input=pipeWorkbook(temp,{...source,archive_raw:raw},context);
 const accepted=input.form.trim()?acceptMatrixSheets(context,snapshot,{blocks:{cells:input.form,body:source.body_raw,title:source.title},parsed:source}):{proposal:{matrix:{changes:[]}}};
 const changes=accepted.proposal.matrix.changes;
 for(const change of changes)check(allowed.has(change.tableId)||change.tableId.startsWith('M_'),'ARCHIVE_TABLE','该表不属于语义记忆归档写集',{table:change.tableId});
 for(const d of input.descriptions){const dossier=changes.find(c=>c.tableId==='T_CHAR_DOSSIER'&&c.values.name===d.name),link=changes.find(c=>c.tableId==='M_FIELD_REFERENCES'&&c.values.target_table==='T_CHAR_DOSSIER'&&c.values.target_row_uuid===dossier?.recordId),entity=changes.find(c=>c.tableId==='T_SYS_ENTITIES'&&c.values.origin_record_ref===link?.recordId);check(entity,'ARCHIVE_CHARACTER','新人物缺少规范主体注册');entity.values.instance_description=d.description;}
 const guards=changes.map(c=>({tableId:c.tableId,recordId:c.recordId,exists:!!temp.rows(c.tableId)[c.recordId],fields:Object.fromEntries(Object.keys(c.values).map(k=>[k,fieldState(temp.rows(c.tableId)[c.recordId],k)]))}));
 const dependencyKeys=new Set();for(const change of changes){const direct=dependencies.get(change.tableId+'#'+change.recordId);if(direct)dependencyKeys.add(direct);for(const value of Object.values(change.values).flat())if(typeof value==='string')for(const [target,key]of dependencies)if(target.endsWith('#'+value))dependencyKeys.add(key);}
 if(changes.length)applyMatrixChanges(temp,changes,{mode:'revise'});
 const references=input.references.map(ref=>{if(runtime.rows(ref.tableId)[ref.recordId])return ref;const binding=accepted.bindings?.find(b=>b.tableId===ref.tableId&&b.heading===ref.recordId);const matches=Object.entries(temp.rows(ref.tableId)).filter(([,r])=>[r.values.name,r.values.title,r.values.short_code,r.values.instance_name].includes(ref.name));const recordId=binding?.recordId??(matches.length===1?matches[0][0]:null);check(recordId,'ARCHIVE_REFERENCE','未能把临时关联解析为稳定记录',{reference:ref});return {...ref,recordId};});
 for(const ref of references){const dep=dependencies.get(ref.tableId+'#'+ref.recordId);if(dep)dependencyKeys.add(dep);}
 return {changes:clone(changes),guards,schema,dependencies:[...dependencyKeys],references,pending:input.pending,warnings,paragraphs:evidence(raw,source,{required:false})};
}
function batchRow(runtime,batch,source,status,error=null){
 const tid='T_SYS_ARCHIVE_BATCHES';if(!runtime.data.schema[tid])return;
 const id=stableId('archive-batch:'+batch.source_key);if(!runtime.rows(tid)[id])runtime.newRecord(tid,{},id);
 const values={source_sequence:batch.sequence,chat_ref:runtime.data.runtime.scope.session_ref??'',message_ref:source.entry_id,candidate_ref:batch.source_key,revision_ref:String(source.revision),source_hash:source.body_sha256,formal_boundary:'已接纳回复序号 <= 当前序号 - 2',temporary_boundary:'最近两条已接纳回复',review_mode:'自动隔层接纳',commit_status:status,blocked_dependencies:error?error.message:(batch.plan?.pending??[]).map(p=>p.target+'：'+p.missing+'；'+p.condition).join('\n')};
 for(const [key,value]of Object.entries(values))if(runtime.data.schema[tid].fields.some(f=>f.key===key))runtime.set([tid,id,key,[]],value);
}
export function stageArchive(runtime,sourceKey){
 const source=runtime.data.runtime.sources[sourceKey],batch=runtime.data.runtime.archive_queue.find(b=>b.source_key===sourceKey);
 batch.format=VERSION;batch.rows=clone(source.archive_rows??[]);batch.raw=source.archive_raw??'';batch.mapped=true;
 try{batch.plan=preparePlan(runtime,source,sourceKey);batch.status='staged';batchRow(runtime,batch,source,'未写入');return [...(batch.plan.warnings??[]),...(batch.plan.pending.length?[{code:'ARCHIVE_DECLARED_PENDING',message:'归档包含明确待补项；不会把缺失条件当作已成立事实',source_key:sourceKey,pending:clone(batch.plan.pending)}]:[])];}
 catch(error){batch.status='blocked';batch.error=asError(error);batchRow(runtime,batch,source,'未写入',batch.error);return [{code:error.code?.startsWith('ARCHIVE_')?error.code:'ARCHIVE_VALIDATION',message:'语义记忆未入表；原文已保存，需修正归档后重试',source_key:sourceKey,error:asError(error),raw:batch.raw}];}
}
export function formalizeArchives(runtime){
 const sequence=runtime.data.runtime.turn_order.length,formal=[],warnings=[];
 for(const key of runtime.data.runtime.archive_queue.filter(b=>b.sequence<=sequence-2&&b.status==='staged').map(b=>b.source_key)){
  let batch=runtime.data.runtime.archive_queue.find(b=>b.source_key===key),source=runtime.data.runtime.sources[key];
  if(batch.format!==VERSION){batch.status='formal';runtime.data.runtime.archive.push(clone(batch));formal.push(key);continue;}
  const plan=batch.plan,request={source_key:key,source_sha256:source.reply_sha256,plan_digest:digest(plan)},result=runtime.transaction('archive:'+key,request,()=>{
   for(const dependency of plan.dependencies??[])check(runtime.data.runtime.archive_queue.some(b=>b.source_key===dependency&&b.status==='formal')&&runtime.data.runtime.receipts['archive:'+dependency],'ARCHIVE_DEPENDENCY','临时层引用的来源尚未完成正式归档',{source_key:dependency});
   for(const change of plan.schema??[]){const fields=runtime.data.schema[change.tableId].fields,old=fields.find(f=>f.key===change.field.key);if(!old)runtime.declareField(change.tableId,change.field);else check(old.type===change.field.type,'ARCHIVE_SCHEMA_CONFLICT','归档字段类型已变化');}
   for(const guard of plan.guards){const row=runtime.rows(guard.tableId)[guard.recordId];check(!!row===guard.exists,'ARCHIVE_CONFLICT','归档目标记录在临时层之后已变化',{table:guard.tableId,record:guard.recordId});for(const [key,before]of Object.entries(guard.fields))check(digest(fieldState(row,key))===digest(before),'ARCHIVE_CONFLICT','归档字段已有较新修改，保留当前值并等待复核',{table:guard.tableId,record:guard.recordId,field:key});}
   if(plan.changes.length)applyMatrixChanges(runtime,plan.changes,{mode:'revise'});
   for(const change of plan.changes){const row=runtime.record(change.tableId,change.recordId);row.metadata.archive_source={source_key:key,entry_id:source.entry_id,revision:source.revision,body_sha256:source.body_sha256,paragraphs:clone(plan.paragraphs)};for(const field of Object.keys(change.values))row.metadata[field]={...(row.metadata[field]??{}),source_pointer:clone(row.metadata.archive_source)};
    // Source projections are filled by the host from the retained fragments,
    // never accepted as a second model-authored source of identity or hashes.
    if(change.tableId==='T_DYN_EVENTS')for(const [field,value]of Object.entries({source_entry_id:source.entry_id,source_revision:source.revision,source_hash:source.body_sha256,source_paragraphs:plan.paragraphs.join('、')}))if(runtime.data.schema[change.tableId].fields.some(f=>f.key===field))runtime.set([change.tableId,change.recordId,field,[]],value,'derived');
   }
   for(const [i,p]of plan.pending.entries()){const tid='T_SYS_CELL_REQUESTS';if(!runtime.data.schema[tid])continue;const id=stableId('archive-pending:'+key+':'+i);runtime.newRecord(tid,{instruction:p.target,action:'未知',source_entry_ref:source.entry_id,source_revision:String(source.revision),result_status:'待填写',task_purpose:'归档',missing_reason:p.missing+'；解除条件：'+p.condition,commit_status:'未提交'},id);}
   batch=runtime.data.runtime.archive_queue.find(b=>b.source_key===key);batch.status='formal';batchRow(runtime,batch,source,'完成');runtime.data.runtime.archive.push(clone(batch));source.archive_references=clone(plan.references);return {source_key:key,changes:plan.changes.length,pending:clone(plan.pending),references:clone(plan.references)};
  });
  if(result.status==='FAILED'){batch=runtime.data.runtime.archive_queue.find(b=>b.source_key===key);batch.status='blocked';batch.error=result.error;batchRow(runtime,batch,source,'冲突',result.error);warnings.push({code:result.error.code?.startsWith('ARCHIVE_')?result.error.code:'ARCHIVE_COMMIT',message:'本批语义归档未写入，较新数据与原文保留',source_key:key,error:result.error,raw:batch.raw});}
  else formal.push(key);
 }
 return {formalized_sources:formal,warnings};
}
export function stagedArchiveReferences(runtime){
 const {temp,warnings}=stagingView(runtime,null);if(warnings.length)fail('ARCHIVE_TEMPORARY_VIEW','临时层关联读取失败；原文与正式状态保留',{warnings});const current=new Set(Object.entries(runtime.data.tables).flatMap(([tid,rows])=>Object.keys(rows).map(id=>tid+'#'+id)));
 return Object.entries(temp.data.tables).filter(([tid])=>!tid.startsWith('M_')&&!['T_CHAR_SECRETS','T_SYS_ARCHIVE_BATCHES','T_SYS_CELL_REQUESTS'].includes(tid)).flatMap(([tid,rows])=>Object.entries(rows).filter(([id])=>!current.has(tid+'#'+id)).map(([,row])=>({table:temp.data.schema[tid].label,name:row.values.name??row.values.title??row.values.short_code??row.values.instance_name})).filter(r=>r.name));
}
