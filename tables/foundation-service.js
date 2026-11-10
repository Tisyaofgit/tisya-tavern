import {check,copy} from './schema.js';
import {digest} from './books.js';
import {prepareCommit} from './ledger.js';
import {createFoundationInput,assertFoundationInput,inspectFoundationInput,foundationInputProposal} from './foundation-intake.js';
import {digest as matrixDigest,stableId,decode} from '../engine/common.mjs';
import {prepareCreationSheets,acceptCreationSheets,validateCreationProposal} from '../engine/creation.mjs';
import {programOwnedTable} from '../engine/prompt-boundary.mjs';
import {envelope} from '../engine/reply.mjs';
import {cardAIMaterials,bookAIMaterials} from './card-source.js';
import {personaSnapshot} from './persona.js';

export function createFoundationService({run,capture,load,books,onCommitted=()=>{},database=null,request,getContext,ensureDatabase=async()=>{}}){
 if(database)return {matrixFoundation:createMatrixFoundation({run,books,onCommitted,database,request,getContext,ensureDatabase})};
 const previews=new Map();
 async function current(){const c=capture();check(c.settings.originBook&&c.settings.sessionBook,'请先建立当前会话的表单存档');return {c,loaded:await load(c)};}
 const records=loaded=>loaded.session.data.foundationDrafts??[];
 const get=(loaded,id)=>{const d=records(loaded).find(d=>d.id===id);check(d,'提炼草稿不存在于当前会话');return d;};
 const raw=d=>d.responses.at(-1)?.text??'';
 function expose(d){const out=copy(d);out.diagnosis=raw(d)?inspectFoundationInput(d.input,raw(d)):{status:'awaiting-response',cells:[],issues:[],parsed:null,canonicalWrites:0};delete out.diagnosis.parsed;return out;}
 async function readFoundationDrafts(){const {loaded}=await current();return records(loaded).map(d=>({id:d.id,name:d.input.context.ownerName,revision:d.revision,status:d.published?'published':raw(d)?'draft':'awaiting-response'}));}
 async function readFoundationDraft(id){const {loaded}=await current();return expose(get(loaded,id));}
 async function createFoundationDraft(input){const args=copy(input);return run(async()=>{
  const {c,loaded}=await current(),requestHash=await digest(args);
  const published=records(loaded).find(d=>d.requestHash===requestHash&&d.published);if(published)return expose(published);
  const prepared=createFoundationInput(loaded.view,args),hash=await digest({args,bindings:prepared.bindings,catalog:prepared.catalog}),prior=records(loaded).find(d=>d.inputHash===hash);
  if(prior)return expose(prior);
  check(records(loaded).length<50,'提炼草稿已达50份，请先整理已完成材料');
  const d={id:'foundation:'+crypto.randomUUID(),revision:0,requestHash,inputHash:hash,input:prepared,responses:[],createdAt:new Date().toISOString()};
  const next=copy(loaded.session.data);next.revision++;next.foundationDrafts??=[];next.foundationDrafts.push(d);await books.write(loaded.session,next,c.guard);return expose(d);
 });}
 async function saveFoundationResponse(id,text,expected){return run(async()=>{
  const {c,loaded}=await current(),d=get(loaded,id);check(!d.published,'此草稿已经入档，后续修改请编辑当前档案');
  check(typeof text==='string'&&text.trim()&&text.length<=300000,'请粘贴不超过300000字符的完整回答');
  if(raw(d)===text)return expose(d);
  check(d.revision===expected,'草稿已被另一页面修改，请重新读取');check(d.responses.length<20,'修订已达20版，请导出核对后另建任务');
  const next=copy(loaded.session.data),target=next.foundationDrafts.find(x=>x.id===id);next.revision++;target.revision++;target.responses.push({revision:target.revision,text,at:new Date().toISOString()});
  await books.write(loaded.session,next,c.guard);return expose(target);
 });}
 async function previewFoundationDraft(id){return run(async()=>{
  const {c,loaded}=await current(),d=get(loaded,id);check(!d.published,'此草稿已经入档');check(raw(d),'草稿尚无回答');
  const result=foundationInputProposal(d.input,raw(d),loaded.view);
  const options={source:loaded.chain.at(-1)?.key??null,kind:'manual',evidence:result.evidence,allowedTables:['objects','facts'],allowSchemaExtensions:true,inferSchemaFields:false};
  const prepared=prepareCommit(loaded.view,result.proposal,options),token='foundation-preview:'+crypto.randomUUID();
  for(const [key,p]of previews)if(p.id===id&&p.world===c.key&&p.chat===c.chat)previews.delete(key);
  check(previews.size<100,'待确认提炼过多，请先保存或关闭页面');
  previews.set(token,{id,revision:d.revision,world:c.key,chat:c.chat,originStamp:loaded.origin.stamp,sessionStamp:loaded.session.stamp,prepared});
  return {token,id,revision:d.revision,changes:copy(prepared.commit.changes.map(x=>x.after)),counts:result.counts,semantic:'pending-author-review',runtime:'conditions-not-bound',written:false};
 });}
 async function commitFoundationDraft(token,{reviewed=false}={}){return run(async()=>{
  check(reviewed===true,'请先核对语义、漏项与隐情归属，再确认入档');const {c,loaded}=await current();
  const previous=loaded.session.data.commits.filter(x=>x.foundationImport?.previewId===token);check(previous.length<=1,'提炼保存回执重复');
  if(previous.length){check(loaded.view.commits.some(x=>x.id===previous[0].id),'此回执不在当前分支，未重新入档');previews.delete(token);return {recorded:true,repeated:true,changes:previous[0].changes.length};}
  const p=previews.get(token);check(p&&p.world===c.key&&p.chat===c.chat,'预览不存在或会话已变化，请重新预览');
  check(p.originStamp===loaded.origin.stamp&&p.sessionStamp===loaded.session.stamp,'档案或草稿已改变，请重新预览');
  const d=get(loaded,p.id);check(!d.published&&d.revision===p.revision,'提炼稿已变化或已入档');assertFoundationInput(d.input,loaded.view);
  const next=copy(loaded.session.data),target=next.foundationDrafts.find(x=>x.id===p.id),commit=copy(p.prepared.commit);next.revision++;
  commit.foundationImport={draftId:d.id,draftRevision:d.revision,previewId:token,sourceHash:await digest(d.input.context.source),responseHash:await digest(raw(d)),semantic:'author-confirmed',runtime:'conditions-not-bound'};
  next.commits.push(commit);target.published={commitId:commit.id,previewId:token,revision:d.revision,at:commit.at};
  // Schema and records become visible in this one session commit, never a partial origin write.
  const saved=await books.write(loaded.session,next,c.guard);c.guard();previews.delete(token);onCommitted();
  return {recorded:true,repeated:false,changes:commit.changes.length,sessionRevision:saved.data.revision};
 });}
 const discardFoundationPreview=token=>previews.delete(token);
 return {readFoundationDrafts,readFoundationDraft,createFoundationDraft,saveFoundationResponse,previewFoundationDraft,commitFoundationDraft,discardFoundationPreview};
}

const MATRIX_INTAKE='tisya.matrix-intake/1';
const HISTORY_TABLES=new Set(['T_DYN_EVENTS','T_DYN_EVENT_LINKS','T_DYN_EVENT_PARTICIPANTS','T_DYN_COGNITION','T_STATIC_FACTS','T_CHAR_DOSSIER','T_SYS_ENTITIES']);
function createMatrixFoundation({run=fn=>fn(),books,onCommitted,database,request,getContext,ensureDatabase}){
 check(typeof database.read==='function'&&typeof database.commit==='function'&&typeof getContext==='function','规范提炼缺少当前表单接口');const drafts=new Map();
 const contextIdentity=()=>{const c=getContext();return JSON.stringify([c.chatId,c.characterId,c.groupId]);};
 const guardFor=key=>()=>check(contextIdentity()===key,'聊天已切换，原提炼草稿保留，未写入新聊天');
 function messageRows(){return (getContext().chat??[]).map((m,index)=>({floor:index+1,uid:m.extra?.tisya_engine?.uid??'floor:'+index,role:m.is_system?'system':m.is_user?'user':m.extra?.tisya_engine?.pending_sha256?'assistant_pending':'assistant',text:String(m.mes??''),candidate:m.swipe_id??0}));}
 const sourceHistory=snapshot=>Object.values(snapshot?.state?.runtime?.receipts??{}).map(r=>r.result?.source).filter(s=>s?.kind==='matrix-foundation');
 const requestRows=snapshot=>Object.values(snapshot?.state?.tables?.T_SYS_CELL_REQUESTS??{}).map(r=>r.metadata?.foundationDraft).filter(d=>d?.format===MATRIX_INTAKE);
 async function inspect(){
  const key=contextIdentity(),snapshot=await database.read();guardFor(key)();const saved=sourceHistory(snapshot),rows=messageRows(),latest=rows.filter(r=>r.role==='assistant').at(-1)?.uid;
  return {ready:!!snapshot,stateRevision:snapshot?.revision??null,tables:Object.keys(snapshot?.state?.schema??{}).length,history:rows.filter(r=>r.role!=='system').map(row=>{const prior=saved.flatMap(s=>s.source?.messages??[]).filter(m=>m.uid===row.uid),hash=matrixDigest(row);return {...row,preview:row.text.slice(0,160),latest:row.uid===latest,archived:prior.some(m=>m.hash===hash),changed:prior.some(m=>m.hash!==hash)};}),drafts:requestRows(snapshot).map(d=>({id:d.id,label:d.label,kind:d.kind,phase:d.phase,error:d.error??null}))};
 }
 async function sourceFor(args,snapshot){
  const c=getContext(),kind=args.kind??'history',sourceKind=args.sourceKind??'text';check(['initialization','history','narrative'].includes(kind)&&['card','chat','text'].includes(sourceKind),'提炼来源或任务无效');
  if(sourceKind==='card'){
   check(kind==='initialization','角色卡来源用于初始化提炼');const card=c.characters?.[c.characterId];check(card,'当前没有可读取的角色卡');const names=await books.cardBooks(card.avatar),sourceBooks=[];
   for(const book of names){const data=await books.listSources({book,kind:'all'});check(data.exists,'关联世界书已不存在：'+book);sourceBooks.push({book,entries:data.entries.map(e=>({uid:e.uid,name:e.name,content:e.content,enabled:e.entry.enabled!==false&&e.entry.disable!==true,entry:copy(e.entry)}))});}
   const contractor=personaSnapshot(c),raw={card:copy(card),books:sourceBooks,contractor},fingerprint=matrixDigest(raw);return {kind,sourceKind,key:'card:'+String(card.avatar??c.characterId),fingerprint,raw,materials:{sourceCardRaw:raw.card,sourceCard:cardAIMaterials(card),sourceBooks:bookAIMaterials(sourceBooks.flatMap(b=>b.entries.map(e=>({...e,book:b.book})))),contractor}};
  }
  if(sourceKind==='chat'){
   check(kind==='history','会话楼层只用于历史提炼');const rows=messageRows(),from=args.from??1,to=args.to??rows.length;check(Number.isSafeInteger(from)&&Number.isSafeInteger(to)&&from>=1&&to>=from,'楼层范围无效');const latest=rows.filter(r=>r.role==='assistant').at(-1)?.uid,all=rows.filter(r=>r.floor>=from&&r.floor<=to&&r.role==='assistant'&&(args.includeLatest===true||r.uid!==latest));
   const confirmed=sourceHistory(snapshot).flatMap(s=>s.source?.messages??[]),skipped=[];const messages=all.filter(row=>{const prior=confirmed.filter(p=>p.uid===row.uid),hash=matrixDigest(row);check(!prior.some(p=>p.hash!==hash),'已入档楼层原文或候选已改变：'+row.floor+'；请先核对旧来源，未重复添加');if(prior.some(p=>p.hash===hash)){skipped.push(row.floor);return false;}return true;}).map(row=>({...row,hash:matrixDigest(row)}));
   check(messages.length,'所选范围没有尚待提炼的已确认 AI 回复；最新回复须明确选择保留');const selected=new Set(messages.map(m=>m.uid)),context=rows.filter(r=>r.floor>=from&&r.floor<=to&&(selected.has(r.uid)||r.role==='user'));
   const raw={messages,context},fingerprint=matrixDigest(raw);return {kind,sourceKind,key:'chat:'+messages.map(m=>m.uid).join(','),fingerprint,messages,skipped,range:{from,to,includeLatest:args.includeLatest===true},raw,materials:{sourceHistory:context.map(r=>({floor:r.floor,role:r.role,text:r.text})),policy:'只有所选已确认AI回复为待归档事件；用户话语是上下文依据，不把愿望、指令或尚未发生的计划当事件。'}};
  }
  check(typeof args.text==='string'&&args.text.trim()&&args.text.length<=500000,'请提供不超过500000字符的完整原文');const label=typeof args.label==='string'&&args.label.trim()?args.label.trim():kind==='narrative'?'人物资料':'手写历史',raw={text:args.text,worldTime:args.worldTime??null};return {kind,sourceKind,key:'text:'+label,fingerprint:matrixDigest(raw),raw,materials:{sourceHistory:args.text,worldTime:args.worldTime??null}};
 }
 async function prepare(args={}){return run(async()=>{
  check(getContext().chatId,'请先打开当前聊天');const key=contextIdentity(),guard=guardFor(key);await ensureDatabase();guard();const snapshot=await database.read();guard();check(snapshot?.state,'当前聊天尚未接入规范表单');const source=await sourceFor(args,snapshot);guard();
  const prior=sourceHistory(snapshot).find(s=>s.source?.kind===source.kind&&s.source?.key===source.key);if(prior){check(prior.source.fingerprint===source.fingerprint||source.kind==='initialization','这份具名来源已入档且原文改变；请先核对已有记录，不会作为新历史重复导入');if(prior.source.fingerprint===source.fingerprint)return {already:true,id:prior.operationId,label:args.label??source.key,source};}
  const operationId='matrix-intake:'+matrixDigest({contextKey:snapshot.contextKey,kind:source.kind,fingerprint:source.fingerprint}),task=source.kind==='initialization'||source.kind==='narrative'?'templateInit':'historyImport';
  const full=prepareCreationSheets(snapshot,{kind:'world',mode:'revise',operationId,task}),scoped=source.kind==='history'?{...snapshot,state:{...snapshot.state,schema:Object.fromEntries(Object.entries(snapshot.state.schema).filter(([id])=>HISTORY_TABLES.has(id)||id.startsWith('M_')))}}:snapshot;
  const forms=source.kind==='history'?prepareCreationSheets(scoped,{kind:'world',mode:'revise',operationId,task}):full;forms.references=full.references;forms.referenceText=full.referenceText;
  const draft={format:MATRIX_INTAKE,id:operationId,operationId,scope:key,contextKey:snapshot.contextKey,expectedRevision:snapshot.revision,kind:source.kind,task,args:copy(args),label:args.label??(source.kind==='initialization'?'角色卡初始化':source.kind==='narrative'?'人物资料提炼':'历史提炼'),source,forms,phase:'prepared',responses:[],goal:args.goal??'',createdAt:new Date().toISOString()};drafts.set(draft.id,draft);return expose(draft);
 });}
 function expose(draft){const out=copy(draft);delete out.forms;out.form=draft.forms.form;out.references=draft.forms.referenceText;try{out.cells=envelope(draft.rawResponse??'').blocks.cells??'';}catch{out.cells='';}return out;}
 async function currentDraft(id){const snapshot=await database.read();check(snapshot?.state,'当前聊天未接入表单');let draft=drafts.get(id);if(!draft){draft=requestRows(snapshot).find(d=>d.id===id);if(draft)drafts.set(id,copy(draft));}check(draft&&draft.contextKey===snapshot.contextKey&&draft.scope===contextIdentity(),'提炼草稿不存在或属于另一聊天');return {draft,snapshot};}
 async function checkSource(draft,snapshot){
  const guard=guardFor(draft.scope);guard();if(draft.source.sourceKind==='text')return;
  if(draft.source.sourceKind==='card'){const fresh=await sourceFor(draft.args,snapshot);guard();check(fresh.fingerprint===draft.source.fingerprint,'角色卡、人设或绑定资料已变化，请重新提炼');return;}
  const rows=messageRows();for(const original of draft.source.raw.context){const current=rows.find(r=>r.uid===original.uid);check(current&&matrixDigest(current)===matrixDigest(Object.fromEntries(Object.entries(original).filter(([key])=>key!=='hash'))),'历史原文、楼层或候选已变化，旧草稿未入档');}
 }
 function validateCandidate(draft,snapshot,raw){
  const parsed=acceptCreationSheets(draft.forms,snapshot,raw),proposal=validateCreationProposal(parsed.proposal,snapshot,{kind:'world',mode:'revise'});check(!(proposal.unresolved??[]).length,'提炼仍有待补事项，请先核对；原答完整保留');const changes=[],diff=[];
  for(const c of proposal.matrix.changes){check(draft.kind!=='history'||HISTORY_TABLES.has(c.tableId)||c.tableId.startsWith('M_'),'历史提炼不能结算资产、时间或当前状态：'+c.tableId);const existing=snapshot.state.tables[c.tableId]?.[c.recordId];if(!existing&&typeof c.values.name==='string')check(!Object.values(snapshot.state.tables[c.tableId]??{}).some(row=>row.values?.name===c.values.name),'同名记录已存在，请使用给定的已有记录标题：'+c.values.name);
   const values={},states={};for(const [key,value]of Object.entries(c.values)){const spec=snapshot.state.schema[c.tableId].fields.find(f=>f.key===key),before=existing?.values?.[key],oldState=existing?.states?.[key]??'unset',nextState=c.states?.[key]??decode(value,spec)[1];if(existing&&!['unset','unknown'].includes(oldState)){check(matrixDigest({value:before})===matrixDigest({value:decode(value,spec)[0]})&&oldState===nextState,'已有字段受保护，不能用初值或历史重置：'+c.tableId+'.'+key);continue;}if(existing&&value==null&&nextState===oldState)continue;values[key]=value;if(c.states?.[key])states[key]=c.states[key];diff.push({tableId:c.tableId,recordId:c.recordId,field:key,label:spec.label??key,before,beforeState:oldState,after:value,afterState:nextState});}
   if(Object.keys(values).length||!existing)changes.push({...c,values,...(Object.keys(states).length?{states}:{})});
  }
  return {...parsed,proposal:{...proposal,matrix:{...proposal.matrix,changes}},diff};
 }
 async function persistDraft(draft,snapshot){
  guardFor(draft.scope)();check(snapshot.contextKey===draft.contextKey,'草稿归属已变化');check(snapshot.state.schema.T_SYS_CELL_REQUESTS,'规范表单缺少填写请求表，原答仅保留在当前页面');const next=copy(draft);next.expectedRevision=snapshot.revision+1;const input={operationId:'intake-response:'+draft.id+':'+matrixDigest({responses:draft.responses,phase:draft.phase,error:draft.error??null}),expectedRevision:snapshot.revision,contextKey:draft.contextKey,changes:[{tableId:'T_SYS_CELL_REQUESTS',recordId:stableId(draft.id),values:{prompt_template_id:'tisya.simple-form/1',instruction:draft.goal||draft.label,parse_status:draft.phase,validation_status:draft.phase==='ready'?'结构已通过，语义待核对':'未通过',...(draft.error?{failure_reason:draft.error}:{})},metadata:{foundationDraft:next}}],source:{kind:'foundation-draft',draftId:draft.id,sourceFingerprint:draft.source.fingerprint}};
  const result=await database.commit(input);guardFor(draft.scope)();check(result?.contextKey===draft.contextKey,'填写草稿提交未返回匹配回执');next.expectedRevision=result.revision;drafts.set(next.id,next);return next;
 }
 async function preview(id,raw){return run(async()=>previewNow(id,raw));}
 async function previewNow(id,raw){
  const {draft,snapshot}=await currentDraft(id);check(draft.phase!=='committed','这份来源已入档，不能重复提交');await checkSource(draft,snapshot);let response=raw;
  if(raw&&typeof raw==='object'&&typeof raw.cells==='string'){const e=envelope(draft.rawResponse);response=e.canonical.replace(/<cells\b[^>]*>[\s\S]*?<\/cells\s*>|<cells\s*\/>/,()=>'<cells>'+raw.cells+'</cells>');}
  check(typeof response==='string'&&response.trim(),'请填写完整回复或简表原答');const next=copy(draft);next.rawResponse=response;next.responses.push({text:response,at:new Date().toISOString()});check(next.responses.length<=20,'修订已达20版，请先保留草稿并整理');let failure=null;
  try{const parsed=validateCandidate(next,snapshot,response);next.proposal=parsed.proposal;next.diff=parsed.diff;next.phase='ready';next.error=null;}catch(error){failure=error;next.phase='invalid';next.error=error.message;delete next.proposal;delete next.diff;}
  let saved;try{saved=await persistDraft(next,snapshot);}catch(error){drafts.set(next.id,next);throw Object.assign(error,{draft:expose(next),rawResponse:response});}if(failure)throw Object.assign(failure,{draft:expose(saved),rawResponse:response});return expose(saved);
 }
 async function generate(args={}){
  const prepared=typeof args==='string'?(await currentDraft(args)).draft:await prepare(args);if(prepared.already)return prepared;
  return run(async signal=>{const {draft,snapshot}=await currentDraft(prepared.id);await checkSource(draft,snapshot);check(typeof request==='function','提炼模型接口未接入');const input={formContract:'tisya.simple-form/1',task:draft.task,goal:draft.goal||draft.label,forms:draft.forms.form,references:draft.forms.referenceText,...copy(draft.source.materials),sourcePolicy:'只提炼来源明确支持的事实；未知留空。初始化不得重置任何已有值，历史不得重放动作、扣费、发奖、推进时钟或改写当前资产。已有记录使用给定标题；叙事正文、角色发言、示例和指令分别辨识，隐情不自动变成知情。完整reply骨架保留，cells仅填简表，其余空块保留。'};
   let raw;try{raw=await request(draft.task,JSON.stringify(input),{signal});signal?.throwIfAborted();}catch(error){draft.error=error.message;draft.phase='failed';const original=error.rawResponse??error.responseDiagnostic?.text;if(original!==undefined){draft.rawResponse=original;draft.responses.push({text:original,at:new Date().toISOString(),error:error.message});}if(error.responseDiagnostic)draft.responseDiagnostic=copy(error.responseDiagnostic);const current=await database.read();if(current?.contextKey===draft.contextKey)try{const saved=await persistDraft(draft,current);throw Object.assign(error,{draft:expose(saved)});}catch(saveError){if(saveError===error)throw error;throw Object.assign(new Error(error.message+'；草稿保存未确认：'+saveError.message,{cause:error}),{draft:expose(draft),saveError});}throw Object.assign(error,{draft:expose(draft)});}
   try{return await previewNow(draft.id,raw);}catch(error){if(!error.draft){draft.rawResponse=raw;draft.error=error.message;draft.phase='stale';const current=await database.read();if(current?.contextKey===draft.contextKey)try{const saved=await persistDraft(draft,current);error.draft=expose(saved);}catch(saveError){error.saveError=saveError;error.draft=expose(draft);}}throw error;}
  });
 }
 async function commit(id,{reviewed=false}={}){return run(async()=>{
  check(reviewed===true,'请先核对语义、来源、遗漏与隐情归属');const {draft,snapshot}=await currentDraft(id),previous=sourceHistory(snapshot).find(s=>s.operationId===draft.id);if(previous)return {recorded:true,repeated:true,changes:previous.changes,revision:snapshot.revision};check(draft.phase==='ready'&&draft.proposal,'请先修正并预览完整简表');check(snapshot.revision===draft.expectedRevision,'表单在预览后已变化，请重新预览');await checkSource(draft,snapshot);const checked=validateCandidate(draft,snapshot,draft.rawResponse);check(matrixDigest(checked.proposal)===matrixDigest(draft.proposal),'提炼预览已变化，请重新核对');const completed={...copy(draft),phase:'committed'};
  const source={kind:'matrix-foundation',operationId:draft.id,source:copy(draft.source),rawResponse:draft.rawResponse,responseHash:matrixDigest(draft.rawResponse),changes:checked.proposal.matrix.changes.length,semantic:'author-confirmed',execution:'facts-only; no actions or costs replayed'};
  const result=await database.commit({operationId:draft.id,expectedRevision:snapshot.revision,contextKey:draft.contextKey,changes:[...checked.proposal.matrix.changes,{tableId:'T_SYS_CELL_REQUESTS',recordId:stableId(draft.id),values:{parse_status:'committed',validation_status:'已核对入档'},metadata:{foundationDraft:completed}}],source});guardFor(draft.scope)();check(result?.contextKey===draft.contextKey,'提炼提交未返回匹配归属');drafts.set(id,completed);onCommitted();return {recorded:true,repeated:false,changes:source.changes,revision:result.revision};
 });}
 return {inspect,prepare,generate,preview,commit,discard(id){drafts.delete(id);},read:async id=>expose((await currentDraft(id)).draft)};
}
