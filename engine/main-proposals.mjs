import {clone,fail,stableId} from './common.mjs';
import {prepareMatrixSheets,acceptMatrixSheets,applyMatrixChanges} from '../tables/foundation/engine.js';
import {assertReplyFormOwnership,replyFormDecoding,PROPOSAL_TABLE_IDS} from './reply-form-ownership.mjs';
import {createTagRegistry,preferenceExtensionPacks} from './tag-system.mjs';
import {envelope} from './reply.mjs';

export const MAIN_PROPOSAL_VERSION='tisya.main-proposals/1';
export const THREE_SYSTEM_MAPPING=Object.freeze({
 event_chain:Object.freeze({entry:'cells／archive',includes:Object.freeze(['当前局面','动态状态','事件成长','任务','倒计时','伏笔','事件与事实历史'])}),
 global_knowledge:Object.freeze({entry:'proposals',includes:Object.freeze(['标签','坐标组','语料','技法','执行链','用户阅读偏好'])}),
 object_archive:Object.freeze({entry:'cells',includes:Object.freeze(['人物','地点','物品','组织','世界规则实体','稳定定义'])})
});
export const MAIN_PROPOSAL_PACK_OWNER='tisya.main-proposals/1';
const common=[
 {key:'proposal_status',label:'提案状态',type:'TEXT',read_only:true},
 {key:'source_key',label:'来源回复',type:'TEXT',read_only:true},
 {key:'source_hash',label:'来源校验',type:'TEXT',read_only:true},
 {key:'review_instruction',label:'用户修正指令',type:'LONG_TEXT',read_only:true},
 {key:'revision_count',label:'重绘次数',type:'NUMBER',read_only:true},
 {key:'original_values_json',label:'原提案快照',type:'LONG_TEXT',read_only:true},
 {key:'adopted_target',label:'采用目标',type:'TEXT',read_only:true}
];
export const MAIN_PROPOSAL_INTERNAL_FIELDS=Object.freeze(common.map(field=>field.key));
const operation={key:'operation',label:'操作',type:'ENUM',enum:['新增','修订','停用'],required:true};
const target={key:'target_ref',label:'修订目标',type:'TEXT',description:'新增留空；修订或停用填写已有资源ID或唯一名称'};
const name={key:'name',label:'名称',type:'TEXT'};
const tables=[
 {id:'T_PROP_PREFERENCES',label:'偏好提案',sheet:'规则与执行',fields:[operation,target,name,
  {key:'preference_kind',label:'偏好类型',type:'ENUM',enum:['文字偏好','标签偏好','禁用词']},
  {key:'directive',label:'完整创作指令',type:'LONG_TEXT',description:'文字偏好或禁用词填写；标签偏好留空'},
  {key:'tag_ref',label:'标签引用',type:'TEXT',description:'标签偏好填写已有标签ID或唯一名称'},
  {key:'owner_type',label:'归属',type:'ENUM',enum:['user','character','relation']},
  {key:'scope_type',label:'作用域',type:'ENUM',enum:['global','story','character','pair','scene']},
  {key:'subject_ref',label:'对象或组合',type:'TEXT'}, {key:'strength',label:'强度',type:'ENUM',enum:['禁止','偏好','喜爱','必须']},
  {key:'applicable_context',label:'适用情境',type:'LONG_TEXT'}, {key:'exceptions',label:'例外',type:'LONG_TEXT'},
  {key:'evidence_quote',label:'用户反馈原话',type:'LONG_TEXT'}]},
 {id:'T_PROP_TAGS',label:'标签提案',sheet:'规则与执行',fields:[operation,target,name,
  {key:'aliases',label:'别名',type:'TEXT_LIST'}, {key:'category',label:'分类',type:'TEXT'},
  {key:'owner_types',label:'可归属对象',type:'TEXT_LIST',description:'world、character、relation、user，多项分号分隔'},
  {key:'scope_types',label:'可用作用域',type:'TEXT_LIST',description:'global、story、character、pair、scene'},
  {key:'slot',label:'提示词槽',type:'TEXT'}, {key:'trigger_types',label:'触发方式',type:'TEXT_LIST',description:'world、tag、coordinate'},
  {key:'scene_tags',label:'场景Tags',type:'TEXT_LIST'}, {key:'axis_ref',label:'坐标组引用',type:'TEXT'},
  {key:'axis_centers',label:'坐标中心',type:'TEXT',description:'轴名=0到100，多项分号分隔'},
  {key:'axis_radiuses',label:'坐标半径',type:'TEXT',description:'轴名=正数，多项分号分隔'},
  {key:'min_known_axes',label:'最少已知轴数',type:'NUMBER'},
  {key:'corpora_refs',label:'语料引用',type:'TEXT_LIST'}, {key:'technique_refs',label:'技法引用',type:'TEXT_LIST'},
  {key:'chain_refs',label:'执行链引用',type:'TEXT_LIST'}, {key:'summary',label:'标签摘要',type:'LONG_TEXT'}]},
 {id:'T_PROP_COORDINATES',label:'坐标组提案',sheet:'规则与执行',fields:[operation,target,name,
  {key:'x_negative',label:'横轴负极',type:'TEXT'}, {key:'x_positive',label:'横轴正极',type:'TEXT'},
  {key:'y_negative',label:'纵轴负极',type:'TEXT'}, {key:'y_positive',label:'纵轴正极',type:'TEXT'},
  {key:'pole_semantics',label:'极点语义',type:'LONG_TEXT',description:'极点名=语义，多项分号分隔'},
  {key:'quadrants',label:'象限语义',type:'LONG_TEXT',description:'横轴正极×纵轴正极=语义，多项分号分隔'}]},
 {id:'T_PROP_CORPORA',label:'语料提案',sheet:'规则与执行',fields:[operation,target,name,
  {key:'slot',label:'提示词槽',type:'TEXT'}, {key:'domain',label:'语料领域',type:'TEXT'},
  {key:'brief',label:'简略语料',type:'LONG_TEXT'}, {key:'full',label:'完整语料',type:'LONG_TEXT'}]},
 {id:'T_PROP_TECHNIQUES',label:'技法提案',sheet:'规则与执行',fields:[operation,target,name,
  {key:'slot',label:'提示词槽',type:'TEXT'}, {key:'purpose',label:'技法的',type:'TEXT'},
  {key:'steps',label:'执行步骤',type:'LONG_TEXT',description:'步骤名=具体写法，多项分号分隔'},
  {key:'brief',label:'简略技法',type:'LONG_TEXT'}, {key:'full',label:'完整技法',type:'LONG_TEXT'}]},
 {id:'T_PROP_CHAINS',label:'执行链提案',sheet:'规则与执行',fields:[operation,target,name,
  {key:'slot',label:'提示词槽',type:'TEXT'},
  {key:'stages',label:'阶段',type:'LONG_TEXT',description:'每阶段一行：阶段名｜目标｜行动｜完成条件｜回退阶段｜简略写法'}]}
].map(t=>({...t,partition:'EXT',purpose:'主回复待确认提案；不是正式偏好或知识投影',fields:[...common,...t.fields]}));
export const MAIN_PROPOSAL_TABLE_IDS=PROPOSAL_TABLE_IDS;
const knowledgeTables=new Set(MAIN_PROPOSAL_TABLE_IDS.filter(id=>id!=='T_PROP_PREFERENCES'));
const resourceKinds={T_PROP_TAGS:'tags',T_PROP_COORDINATES:'coordinates',T_PROP_CORPORA:'corpora',T_PROP_TECHNIQUES:'techniques',T_PROP_CHAINS:'chains'};
const resourceIds={corpora:'corpus',techniques:'tech',chains:'chain',tags:'tag',coordinates:'axis'};
const own=(o,k)=>Object.hasOwn(o??{},k);
const values=(state,tableId,recordId)=>state.tables?.[tableId]?.[recordId]?.values??null;
const list=value=>Array.isArray(value)?value.map(String).map(x=>x.trim()).filter(Boolean):String(value??'').split(/[；;\n]/).map(x=>x.trim()).filter(x=>x&&!['无','[]'].includes(x));
const map=text=>Object.fromEntries(list(text).map(part=>{const at=part.indexOf('=');if(at<1)fail('PROPOSAL_VALUE','请用 名称=值 填写；多项用分号分隔',{value:part});return [part.slice(0,at).trim(),part.slice(at+1).trim()];}));
const numberMap=text=>Object.fromEntries(Object.entries(map(text)).map(([key,value])=>{const n=Number(value);if(!Number.isFinite(n))fail('PROPOSAL_VALUE','坐标与半径必须是数值',{key,value});return [key,n];}));
const resourceId=(kind,recordId,target='')=>target.trim()||`custom.main.${resourceIds[kind]}.${recordId.replace(/[^A-Za-z0-9_-]/g,'_')}`;
function existingResource(state,kind,target){
 const id=target.trim();if(!id)return null;const registry=createTagRegistry(preferenceExtensionPacks(state)),table=kind==='coordinates'?registry.axes:registry[kind];
 if(table?.has(id))return table.get(id);
 const matches=[...(table?.values()??[])].filter(x=>x.label===id);return matches.length===1?matches[0]:null;
}
export function extendMainProposalCatalog(catalog){
 const missing=tables.filter(t=>!catalog.tables.some(x=>x.id===t.id));if(!missing.length)return catalog;
 const out=structuredClone(catalog);out.tables.push(...structuredClone(missing));return out;
}
export function stageMainProposals(runtime,sourceKey){
 const source=runtime.data.runtime.sources[sourceKey],raw=source.proposals_raw??'';
 if(!source.proposals_present||!raw.trim())return {changes:0,warnings:[]};
 if(source.proposals_format!=='form')return {changes:0,warnings:[{code:'PROPOSAL_FORMAT',message:'偏好／知识提案仅接受 format="form" 极简表单；原文保留',source_key:sourceKey}]};
 try{
  const snapshot={state:runtime.data},context=prepareMatrixSheets(snapshot,{...replyFormDecoding(source.reply_form_ownership_version),kind:'rows',mode:'revise',task:'main',operationId:'proposals:'+sourceKey,tableIds:MAIN_PROPOSAL_TABLE_IDS});
  const accepted=acceptMatrixSheets(context,snapshot,{blocks:{cells:raw,body:source.body_raw,title:source.title},parsed:source,collectErrors:true}),changes=accepted.proposal.matrix.changes;
  assertReplyFormOwnership(runtime.data,changes,'proposals',{version:source.reply_form_ownership_version,generatedIdentities:accepted.generatedIdentities});
  const byRecord=new Map();for(const change of changes){const key=change.tableId+'#'+change.recordId,old=byRecord.get(key);byRecord.set(key,{...change,values:{...(old?.values??{}),...change.values},states:{...(old?.states??{}),...change.states}});}
  const programValues=[];
  for(const change of byRecord.values()){
   const old=values(runtime.data,change.tableId,change.recordId);
   if(old&&!['pending','redraw_pending'].includes(old.proposal_status))fail('PROPOSAL_REVIEWED','已处理提案不能由后续主回复改写',{table:change.tableId,record:change.recordId});
   programValues.push({tableId:change.tableId,recordId:change.recordId,values:{proposal_status:'pending',source_key:old?.source_key??sourceKey,source_hash:old?.source_hash??source.reply_sha256,review_instruction:old?.review_instruction??'',revision_count:(old?.revision_count??0)+(old?.proposal_status==='redraw_pending'?1:0),original_values_json:old?.original_values_json??JSON.stringify(change.values),adopted_target:old?.adopted_target??''}});
  }
  applyMatrixChanges(runtime,[...byRecord.values()],{mode:'revise'});
  for(const change of programValues)for(const [key,value]of Object.entries(change.values))runtime.set([change.tableId,change.recordId,key,[]],value);
  return {changes:byRecord.size,warnings:[]};
 }catch(error){return {changes:0,warnings:[{code:'PROPOSAL_VALIDATION',message:'偏好／知识提案未写入；正文、cells 与 archive 保持原流程',source_key:sourceKey,error:{code:error.code??'PROPOSAL_VALIDATION',message:error.message,details:error.details??null},raw}]}};
}
function preferenceChanges(state,tableId,recordId,v){
 if(v.scope_type==='global')fail('PROPOSAL_GLOBAL_SCOPE','主回复全局偏好提案暂未开放一键采用；请保留提案并在现有全局偏好编辑器确认，避免跨工作区半提交');
 if(!['新增','修订','停用'].includes(v.operation))fail('PROPOSAL_OPERATION','偏好提案缺少新增、修订或停用操作');
 const targets=Object.entries(state.tables?.T_PREF_SCOPES??{}).filter(([id,row])=>!['extension_pack','projection_setting'].includes(row.values.owner_type)&&(id===v.target_ref||row.values.name===v.target_ref));
 if(v.operation!=='新增'&&targets.length!==1)fail('PROPOSAL_TARGET','修订或停用偏好需要唯一目标',{target:v.target_ref});
 const id=v.operation==='新增'?stableId('main-preference:'+recordId):targets[0][0],old=v.operation==='新增'?{}:targets[0][1].values;
 if(v.operation==='停用')return {changes:[{tableId:'T_PREF_SCOPES',recordId:id,values:{enabled:false}}],target:'T_PREF_SCOPES#'+id};
 if(!String(v.name??'').trim()||!v.preference_kind||!v.owner_type||!v.scope_type)fail('PROPOSAL_REQUIRED','新增或修订偏好需要名称、偏好类型、归属和作用域');
 if(v.preference_kind==='标签偏好'&&!String(v.tag_ref??'').trim())fail('PROPOSAL_REQUIRED','标签偏好需要标签引用');
 if(v.preference_kind!=='标签偏好'&&!String(v.directive??'').trim())fail('PROPOSAL_REQUIRED','文字偏好与禁用词需要完整创作指令');
 const tag=v.preference_kind==='标签偏好'?existingResource(state,'tags',v.tag_ref):null;
 if(v.preference_kind==='标签偏好'&&!tag)fail('PROPOSAL_TARGET','标签偏好需要唯一已登记标签',{target:v.tag_ref});
 return {changes:[{tableId:'T_PREF_SCOPES',recordId:id,values:{...old,name:v.name||old.name,compiled_directive:v.preference_kind==='标签偏好'?'':v.directive,enabled:true,contrib_id:'tisya.preference-editor/1',evidence_quote:v.evidence_quote??old.evidence_quote??'',confirmation_state:'用户明确',tag_id:tag?.id??'',owner_type:v.owner_type??'user',scope_type:v.scope_type??'story',subject_ref:v.subject_ref??'',strength:v.strength??'喜爱',desired_frequency_weight:1,applicable_context:v.applicable_context?{narrative:v.applicable_context}:'',exceptions:v.exceptions?{narrative:v.exceptions}:'',tag_config_json:old.tag_config_json??''}}],target:'T_PREF_SCOPES#'+id};
}
function coordinateResources(v,id){
 const axis={id,label:v.name,independent:true,x:{negative:id+'.xn',positive:id+'.xp'},y:{negative:id+'.yn',positive:id+'.yp'},quadrants:map(v.quadrants)},semantics=map(v.pole_semantics);
 const poles=[['xn',v.x_negative,'x'],['xp',v.x_positive,'x'],['yn',v.y_negative,'y'],['yp',v.y_positive,'y']].filter(([,label])=>String(label??'').trim()).map(([suffix,label])=>({id:id+'.'+suffix,label,axis:id,semantics:semantics[label]??label}));
 if(v.operation!=='停用'&&(poles.length!==4||!v.name))fail('PROPOSAL_REQUIRED','坐标组需要名称与四个极点');
 return {axes:[axis],poles};
}
function chainStages(raw){
 return String(raw??'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean).map((line,index)=>{const [name,goal,action,complete,rollback='',brief='']=line.split('｜').map(x=>x.trim());if(!name||!goal||!action||!complete)fail('PROPOSAL_VALUE','执行链每阶段依次填写：阶段名｜目标｜行动｜完成条件｜回退阶段｜简略写法',{line});return {id:'stage-'+(index+1),name,goal,action,complete,rollback_to:rollback||null,brief:brief||action};});
}
function knowledgePack(state){
 const pack={manifest:{package:'custom.main.'+String(state.runtime?.scope?.session_ref??'story').replace(/[^A-Za-z0-9_-]/g,'_'),name:'主回复已确认知识',version:'1.0.0',schema_version:1,namespace:'custom.main',merge_mode:'overlay',depends:[]},poles:[],axes:[],corpora:[],techniques:[],chains:[],tags:[]},byId=new Map();
 for(const tableId of knowledgeTables)for(const [recordId,row]of Object.entries(state?.tables?.[tableId]??{})){
  const v=row.values;if(v.proposal_status!=='accepted')continue;const kind=resourceKinds[tableId];
  if(kind==='coordinates'){
   const base=v.operation==='新增'?null:existingResource(state,kind,v.target_ref);
   if(v.operation!=='新增'&&!base)fail('PROPOSAL_TARGET','修订或停用知识资源需要唯一已登记目标',{table:tableId,record:recordId,target:v.target_ref});
   if(v.operation==='停用'){const id=base.id;byId.set('axes#'+id,{...base,id,status:'disabled'});continue;}
   const made=coordinateResources(v,base?.id??resourceId(kind,recordId,v.target_ref));for(const [type,items]of Object.entries(made))for(const item of items)byId.set(type+'#'+item.id,item);continue;
  }
  const base=v.operation==='新增'?{}:existingResource(state,kind,v.target_ref)??{},id=base.id??resourceId(kind,recordId,v.target_ref);
  if(v.operation!=='新增'&&!Object.keys(base).length)fail('PROPOSAL_TARGET','修订或停用知识资源需要唯一已登记目标',{table:tableId,record:recordId,target:v.target_ref});
  if(v.operation==='停用'){byId.set(kind+'#'+id,{...base,id,status:'disabled'});continue;}
  if(!String(v.name??base.label??'').trim())fail('PROPOSAL_REQUIRED','知识资源需要名称',{table:tableId,record:recordId});
  let item;
  if(kind==='corpora'){if(!String(v.brief??'').trim()||!String(v.full??'').trim())fail('PROPOSAL_REQUIRED','语料需要简略与完整内容');item={...base,id,label:v.name,slot:v.slot??base.slot??'',domain:v.domain??base.domain??'custom',brief:v.brief,full:v.full};}
  if(kind==='techniques'){if(!String(v.purpose??'').trim()||!String(v.brief??'').trim()||!String(v.full??'').trim())fail('PROPOSAL_REQUIRED','技法需要目的、简略与完整写法');item={...base,id,label:v.name,slot:v.slot??base.slot??'',purpose:v.purpose,steps:map(v.steps),variants:{brief:v.brief,full:v.full}};}
  if(kind==='chains'){if(!String(v.stages??'').trim())fail('PROPOSAL_REQUIRED','执行链至少需要一个完整阶段');item={...base,id,label:v.name,slot:v.slot??base.slot??'',stages:chainStages(v.stages)};}
  if(kind==='tags'){
   const trigger={mode:'any',types:list(v.trigger_types),axes:v.axis_ref??'',center:numberMap(v.axis_centers),radius:numberMap(v.axis_radiuses),min_known_axes:v.min_known_axes??1,scenes:list(v.scene_tags)};
   item={...base,id,label:v.name,aliases:list(v.aliases),category:v.category??'custom',owners:list(v.owner_types),scopes:list(v.scope_types),slot:v.slot??'',trigger,resources:{corpora:list(v.corpora_refs),techniques:list(v.technique_refs),chains:list(v.chain_refs)},summary:v.summary??'',preference:2,status:'enabled',version:(base.version??0)+1};
   if(!item.owners.length||!item.scopes.length)fail('PROPOSAL_REQUIRED','标签需要可归属对象和可用作用域');
  }
  byId.set(kind+'#'+id,item);
 }
 for(const [key,item]of byId){const type=key.slice(0,key.indexOf('#'));pack[type].push(item);}return pack;
}
export function proposalPackId(state){return stableId('main-proposal-pack:'+(state.runtime?.scope?.session_ref??'story'));}
export function mainProposalReviewChanges(state,{tableId,recordId,action,instruction=''}){
 if(!MAIN_PROPOSAL_TABLE_IDS.includes(tableId))fail('PROPOSAL_TABLE','不是主回复提案表',{table:tableId});
 const row=state.tables?.[tableId]?.[recordId];if(!row)fail('PROPOSAL_MISSING','提案不存在');
 const v=row.values;if(!['pending','redraw_pending'].includes(v.proposal_status))fail('PROPOSAL_REVIEWED','提案已处理，不能重复审核');
 if(!['accept','reject','redraw','revise'].includes(action))fail('PROPOSAL_ACTION','未知提案审核动作');
 if(action==='revise'){
  if(v.proposal_status!=='redraw_pending')fail('PROPOSAL_REDRAW_STATE','只有已打回的提案可以接受专项重绘');
  const candidate=arguments[1]?.values;
  if(!candidate||typeof candidate!=='object'||Array.isArray(candidate))fail('PROPOSAL_REDRAW_VALUES','专项重绘缺少已校验的提案内容');
  const commonKeys=new Set(common.map(f=>f.key));
  for(const key of Object.keys(candidate))if(commonKeys.has(key))fail('PROPOSAL_REWRITE_INTERNAL','专项重绘不能改写审核状态或原始快照',{field:key});
  return [{tableId,recordId,values:{...clone(candidate),proposal_status:'pending',review_instruction:'',revision_count:(v.revision_count??0)+1}}];
 }
 if(action==='redraw'){
  if(!String(instruction).trim())fail('PROPOSAL_INSTRUCTION','打回重绘需要用户修正指令');
  return [{tableId,recordId,values:{proposal_status:'redraw_pending',review_instruction:String(instruction).trim(),original_values_json:v.original_values_json||JSON.stringify(Object.fromEntries(Object.entries(v).filter(([key])=>!common.some(f=>f.key===key))))}}];
 }
 if(action==='reject')return [{tableId,recordId,values:{proposal_status:'rejected',adopted_target:''}}];
 let target='',changes=[];
 if(tableId==='T_PROP_PREFERENCES'){const made=preferenceChanges(state,tableId,recordId,v);changes=made.changes;target=made.target;}
 const next=structuredClone(state);next.tables[tableId][recordId].values.proposal_status='accepted';
 if(knowledgeTables.has(tableId)){
  const pack=knowledgePack(next),id=proposalPackId(state);target='T_PREF_SCOPES#'+id;
  createTagRegistry([...preferenceExtensionPacks(state),{...pack,enabled:true}]);
  changes.push({tableId:'T_PREF_SCOPES',recordId:id,values:{name:pack.manifest.name,compiled_directive:'',enabled:true,owner_type:'extension_pack',scope_type:'story',confirmation_state:'用户明确',contrib_id:MAIN_PROPOSAL_PACK_OWNER,tag_config_json:JSON.stringify(pack)}});
 }
 changes.push({tableId,recordId,values:{proposal_status:'accepted',adopted_target:target}});return changes;
}
export function pendingMainProposalText(state){
 const rows=MAIN_PROPOSAL_TABLE_IDS.flatMap(tableId=>Object.entries(state?.tables?.[tableId]??{}).filter(([,row])=>row.values.proposal_status==='redraw_pending').map(([recordId,row])=>({tableId,recordId,v:row.values})));
 if(!rows.length)return '';
 return '待打回重绘提案（沿用下列已有提案分组，只按用户指令修正；不得直接生效）：\n'+rows.map(({v})=>`${v.name??v.target_ref??'未命名'}｜用户修正指令：${v.review_instruction}`).join('\n');
}
export function mainProposalRows(state,{pendingOnly=false}={}){return MAIN_PROPOSAL_TABLE_IDS.flatMap(tableId=>Object.entries(state?.tables?.[tableId]??{}).map(([recordId,row])=>({tableId,recordId,...clone(row.values)}))).filter(row=>!pendingOnly||['pending','redraw_pending'].includes(row.proposal_status));}

// P4 uses the one existing auxiliary request registry. The specialist only
// redraws a pending row; adoption remains the host's single review transaction.
export function prepareMainProposalRedraw(snapshot,{tableId,recordId}){
 if(!MAIN_PROPOSAL_TABLE_IDS.includes(tableId))fail('PROPOSAL_TABLE','不是主回复提案表');
 const row=snapshot.state.tables?.[tableId]?.[recordId];if(!row)fail('PROPOSAL_MISSING','提案不存在或已离开当前分支');
 if(row.values.proposal_status!=='redraw_pending')fail('PROPOSAL_REDRAW_STATE','请先用修正指令打回提案');
 const operationId='proposal-redraw:'+tableId+':'+recordId+':'+(row.values.revision_count??0),task=tableId==='T_PROP_PREFERENCES'?'preferenceAnalysis':'objectArchive';
 const forms=prepareMatrixSheets(snapshot,{kind:'rows',mode:'revise',task,operationId,tableIds:[tableId]});
 return {task,operationId,input:{formContract:'tisya.simple-form/1',task,operationId,goal:'根据用户修正指令重绘同一条已有提案。只填写指定提案分组；保留原提案语义中未被修正的部分。完整reply的body简述修正，cells填写提案，vars/archive/proposals保持空。不得直接生效或修改其他记录。',userInput:row.values.review_instruction,source:{tableId,recordId,original:JSON.parse(row.values.original_values_json??'{}'),current:Object.fromEntries(Object.entries(row.values).filter(([key])=>!common.some(f=>f.key===key))),instruction:row.values.review_instruction},forms:forms.form,references:forms.referenceText,output:{kind:'main-proposal-redraw',tableId,recordId}}};
}
export function acceptMainProposalRedraw(snapshot,prepared,raw){
 const parsed=envelope(raw);if(parsed.blocks.vars?.trim()||parsed.blocks.archive?.trim()||parsed.blocks.proposals?.trim())fail('PROPOSAL_REDRAW_OUTPUT','专项重绘不能写入故事、归档或其他提案');
 const forms=prepareMatrixSheets(snapshot,{kind:'rows',mode:'revise',task:prepared.task,operationId:prepared.operationId,tableIds:[prepared.input.source.tableId]});
 const accepted=acceptMatrixSheets(forms,snapshot,{blocks:parsed.blocks,parsed}),{tableId,recordId}=prepared.input.source;
 const changes=accepted.proposal.matrix.changes.filter(c=>c.tableId===tableId&&c.recordId===recordId);
 if(changes.length!==1||accepted.proposal.matrix.changes.length!==1)fail('PROPOSAL_REDRAW_TARGET','专项重绘只能修改被打回的这一条提案',{tableId,recordId,changes:clone(accepted.proposal.matrix.changes)});
 const internal=new Set(common.map(f=>f.key));for(const key of Object.keys(changes[0].values))if(internal.has(key))fail('PROPOSAL_REWRITE_INTERNAL','专项重绘不能修改审核内部字段');
 return {values:clone(changes[0].values),rawResponse:raw,answer:parsed.blocks.body??''};
}
