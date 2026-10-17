import {createPreviewStore,createBoundArchiveContext} from './preview-store.js';
import {check,copy} from './schema.js';
import {digest} from './books.js';
import {prepareCommit} from './ledger.js';
import {createFoundationInput,assertFoundationInput,inspectFoundationInput,foundationInputProposal} from './foundation-intake.js';

export function createFoundationService({run,capture,load,books,onCommitted=()=>{}}){
 const previews=createPreviewStore({prefix:'foundation-preview',missing:'预览不存在或会话已变化，请重新预览',stale:'档案或草稿已改变，请重新预览',full:'待确认提炼过多，请先保存或关闭页面'});
 const current=createBoundArchiveContext({capture,load});
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
  const prepared=prepareCommit(loaded.view,result.proposal,options);
  const token=previews.create(c,loaded,{id,revision:d.revision,prepared},{replace:previous=>previous.id===id});
  return {token,id,revision:d.revision,changes:copy(prepared.commit.changes.map(x=>x.after)),counts:result.counts,semantic:'pending-author-review',runtime:'conditions-not-bound',written:false};
 });}
 async function commitFoundationDraft(token,{reviewed=false}={}){return run(async()=>{
  check(reviewed===true,'请先核对语义、漏项与隐情归属，再确认入档');const {c,loaded}=await current();
  const previous=loaded.session.data.commits.filter(x=>x.foundationImport?.previewId===token);check(previous.length<=1,'提炼保存回执重复');
  if(previous.length){check(loaded.view.commits.some(x=>x.id===previous[0].id),'此回执不在当前分支，未重新入档');previews.discard(token);return {recorded:true,repeated:true,changes:previous[0].changes.length};}
  const p=previews.read(token,c,loaded);
  const d=get(loaded,p.id);check(!d.published&&d.revision===p.revision,'提炼稿已变化或已入档');assertFoundationInput(d.input,loaded.view);
  const next=copy(loaded.session.data),target=next.foundationDrafts.find(x=>x.id===p.id),commit=copy(p.prepared.commit);next.revision++;
  commit.foundationImport={draftId:d.id,draftRevision:d.revision,previewId:token,sourceHash:await digest(d.input.context.source),responseHash:await digest(raw(d)),semantic:'author-confirmed',runtime:'conditions-not-bound'};
  next.commits.push(commit);target.published={commitId:commit.id,previewId:token,revision:d.revision,at:commit.at};
  // Schema and records become visible in this one session commit, never a partial origin write.
  const saved=await books.write(loaded.session,next,c.guard);c.guard();previews.discard(token);onCommitted();
  return {recorded:true,repeated:false,changes:commit.changes.length,sessionRevision:saved.data.revision};
 });}
 const discardFoundationPreview=token=>previews.discard(token);
 return {readFoundationDrafts,readFoundationDraft,createFoundationDraft,saveFoundationResponse,previewFoundationDraft,commitFoundationDraft,discardFoundationPreview};
}
