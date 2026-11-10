import {clone,digest,fail} from './common.mjs';
import {parseReply,envelope} from './reply.mjs';
import {prepareMatrixSheets as prepareCreationSheets,acceptMatrixSheets,validateMatrixProposal as validateCreationProposal} from '../tables/foundation/engine.js';
import {readCreationTemplates,creationTemplateText} from './template-book.mjs';
import {cardAIMaterials,bookAIMaterials} from '../tables/card-source.js';
import {characterWorldbookScope} from '../tables/character-scope.js';
import {personaSnapshot} from '../tables/persona.js';

export const CREATION_CONTRACT='tisya.matrix-creation/1';
export const CREATION_REPLY_CONTRACT='tisya.creation-sheets/1';
const plain=v=>v&&typeof v==='object'&&!Array.isArray(v);
function check(ok,message){if(!ok)fail('MATRIX_CREATION',message);}
export {prepareMatrixSheets as prepareCreationSheets,validateMatrixProposal as validateCreationProposal} from '../tables/foundation/engine.js';
export function acceptCreationSheets(context,snapshot,raw){
 const parsed=parseReply(raw,context.operationId),blocks=envelope(raw).blocks;
 check(!blocks.vars?.trim()&&!blocks.archive?.trim(),'创作草稿不能提交原生变量或剧情归档');
 return {...acceptMatrixSheets(context,snapshot,{blocks,parsed}),parsed};
}

// These are read-only source snapshots, never another editable ledger.
export function createMatrixCreator({database,getContext,request,sourceBooks,readCharacterBindings,getHelper=()=>globalThis.TavernHelper,ensureDatabase=async()=>{},assertIdle=()=>{},onProgress=()=>{}}){
 function scope(signal){
  const c=getContext(),identity=[c.chatId,c.groupId,c.characterId],meta=c.chatMetadata,chat=c.chat;
  return ()=>{const now=getContext();check(!signal?.aborted,'创作已取消');check(identity.every((v,i)=>v===[now.chatId,now.groupId,now.characterId][i])&&(!meta||now.chatMetadata===meta)&&(!chat||now.chat===chat),'当前角色或会话已切换；保留原始草稿，未提交');};
 }
 async function nativeSources(guard){
  guard();const c=getContext(),card=c.characters?.[c.characterId];
  check(c.characterId===undefined||c.characterId===null||!!card,'源角色卡不存在，无法读取创作来源');
  const result={card:card?clone(card):null,bindings:[],books:[],contractor:personaSnapshot(c)};
  if(!card)return result;
  const helper=getHelper(),primary=(card.data??card).extensions?.world??'';
  let refs;
  if(readCharacterBindings){refs=await readCharacterBindings(card.avatar);guard();}
  else if(typeof helper?.getCharWorldbookNames==='function'){
   const scoped=characterWorldbookScope(card.avatar,getContext,guard);refs=await helper.getCharWorldbookNames(scoped.target);scoped.guard();
  }else refs={primary,additional:[]};
  check(plain(refs)&&Array.isArray(refs.additional)&&[refs.primary??'',...refs.additional].every(n=>typeof n==='string'),'角色卡世界书绑定读取格式无效');
  result.bindings=[...new Set([refs.primary,...refs.additional].filter(Boolean))];
  for(const name of result.bindings){
   let entries;
   if(typeof c.loadWorldInfo==='function'){const book=await c.loadWorldInfo(name);guard();check(plain(book?.entries),'关联世界书不存在或损坏：'+name);entries=Object.values(book.entries);}
   else {check(typeof helper?.getWorldbook==='function','宿主缺少关联世界书读取接口：'+name);entries=await helper.getWorldbook(name);guard();check(Array.isArray(entries),'关联世界书不存在或损坏：'+name);}
   const ids=new Set();for(const entry of entries){const id=entry?.uid??entry?.id;check(plain(entry)&&((typeof id==='number'&&Number.isSafeInteger(id)&&id>=0)||(typeof id==='string'&&id))&&!ids.has(String(id))&&typeof entry.content==='string','关联世界书条目标识或正文无效：'+name);ids.add(String(id));}
   result.books.push({name,entries:clone(entries)});
  }
  guard();return result;
 }
 function aiSources(snapshot){
  return {card:snapshot.card?cardAIMaterials(snapshot.card):null,bindings:clone(snapshot.bindings),books:bookAIMaterials(snapshot.books.flatMap(book=>book.entries.filter(e=>(e.name??e.comment)!=='缇斯亚 · 表单数据').map(e=>({book:book.name,uid:e.uid??e.id,name:e.name??e.comment??'',content:e.content,enabled:e.enabled!==false&&e.disable!==true})))),contractor:clone(snapshot.contractor),policy:'原生角色卡是世界来源；原生用户人设是契约者参考，不自动认作新人物或绑定身份。开场白、示例对话和备选开场不是已发生历史；停用条目是停用来源；可执行模板不执行、不猜补。'};
 }
 async function verifySources(draft,guard){
  check(draft.nativeSourceDigest===digest(draft.nativeSources),'草稿原始来源快照已改变，请重新生成');
  const current=await nativeSources(guard),receipt=draft.archiveReceipt;
  if(receipt?.confirmed&&receipt.operationId===draft.operationId&&receipt.bookBefore&&receipt.bookAfter){const old=draft.nativeSources.books.find(b=>b.name===receipt.bookBefore.name),now=current.books.find(b=>b.name===receipt.bookAfter.name);if(old&&now&&digest(old)===digest(receipt.bookBefore)&&digest(now)===digest(receipt.bookAfter))current.books[current.books.indexOf(now)]=clone(old);}
  check(digest(current)===draft.nativeSourceDigest,'原生角色卡、关联世界书或用户人设已经变化；保留原始草稿，请重新核对来源');
  if(draft.creationTemplates){const templates=await readCreationTemplates(getContext,{task:'tableGenesis'});guard();check(digest(templates)===digest(draft.creationTemplates),'模板内容已经变化，请重新核对草稿');}
 }
 async function draft(goal,{kind='world',mode='extend',source=null,destination,signal}={}){
  assertIdle();check(typeof goal==='string'&&goal.trim(),'请填写创作要求');check(['world','character'].includes(kind)&&['extend','revise'].includes(mode),'创作类型无效');
  const guard=scope(signal),explicitSource=clone(source);
  await ensureDatabase();guard();const snapshot=await database.read();guard();check(snapshot,'请先打开聊天并建立表单');
  const sources=await nativeSources(guard),templates=mode==='extend'?await readCreationTemplates(getContext,{task:'tableGenesis'}):null;guard();
  const operationId='creation:'+crypto.randomUUID(),sheets=prepareCreationSheets(snapshot,{kind,mode,operationId});
  const input={formContract:'tisya.simple-form/1',databaseContract:CREATION_CONTRACT,replyContract:CREATION_REPLY_CONTRACT,sourcePolicy:'来源快照、历史和回执由提交服务记录；模板只提供内容要求，本次完整 reply 与简表规则决定输出。旧叙事来源首次结构化时须完整提炼原文；已有同一人物只复用其身份编号，不能把当前聊天运行值当成作者定义或仅存本轮补丁。',kind,mode,goal,source:explicitSource,nativeSources:aiSources(sources),forms:sheets.form,references:sheets.referenceText,template:templates?creationTemplateText(templates):''};
  const raw=await request('tableGenesis',JSON.stringify(input),{signal,onProgress});
  let accepted;try{accepted=acceptCreationSheets(sheets,snapshot,raw);}catch(cause){throw Object.assign(Error('创作回复或简表无法接纳：'+cause.message+'；原始返回已保留',{cause}),{rawResponse:raw,nativeSources:sources,sheetContext:sheets});}
  const proposal=accepted.proposal,result={format:CREATION_CONTRACT,replyContract:CREATION_REPLY_CONTRACT,operationId,kind,mode,goal,source:explicitSource,nativeSources:sources,nativeSourceDigest:digest(sources),proposal,rawResponse:raw,workbook:accepted.workbook,contextKey:snapshot.contextKey,expectedRevision:snapshot.revision,...(destination?{destination:clone(destination)}:{}),...(templates?{creationTemplates:templates}:{})};
  try{
   guard();validateCreationProposal(proposal,snapshot,{kind,mode});
   result.schema=Object.fromEntries([...new Set(proposal.matrix.changes.map(c=>c.tableId))].map(id=>[id,clone(snapshot.state.schema[id])]));
   await verifySources(result,guard);guard();
   const current=await database.read();guard();check(current?.contextKey===snapshot.contextKey&&current.revision===snapshot.revision,'生成期间聊天或表单已经变化；保留草稿后重新核对');
  }catch(e){e.rawResponse=raw;e.draft=clone(result);throw e;}
  return result;
 }
 async function validate(draft){
  assertIdle();check(draft?.format===CREATION_CONTRACT,'此草稿不是当前表单格式');const guard=scope();
  const snapshot=await database.read();guard();check(snapshot?.contextKey===draft.contextKey,'创作草稿属于另一聊天');
  await verifySources(draft,guard);guard();
  const proposal=validateCreationProposal(draft.proposal,snapshot,{...draft,mode:snapshot.revision===draft.expectedRevision?draft.mode:'revise'});
  check(!(proposal.unresolved??[]).length,'草稿仍有待补事项，请填写后再保存');
  return {snapshot,proposal,guard};
 }
 async function save(draft,{destination=draft?.destination}={}){
  const {proposal,snapshot,guard}=await validate(draft);guard();
  if(sourceBooks&&snapshot.revision!==draft.expectedRevision)check(!!snapshot.state.runtime?.receipts?.[draft.operationId],'表单已被另一页面更新；来源书尚未写入，请刷新后重试');
  const source={kind:'creation',name:proposal.name,goal:draft.goal,binding:proposal.matrix.binding??null,explicitSource:clone(draft.source),nativeSources:clone(draft.nativeSources),nativeSourceDigest:draft.nativeSourceDigest,templateDigest:draft.creationTemplates?digest(draft.creationTemplates):null};
  let archivePlan,archiveReceipt,archiveInputDigest;
  try{
   if(sourceBooks){const archiveSource={...(plain(draft.source)?clone(draft.source):{}),creation:clone(source)},archiveInput={operationId:draft.operationId,kind:draft.kind,mode:draft.mode,name:proposal.name,summary:proposal.summary,changes:proposal.matrix.changes,binding:proposal.matrix.binding??null,destination,source:archiveSource,schema:snapshot.state.schema};archiveInputDigest=digest(archiveInput);
    if(draft.archiveInputDigest&&draft.archiveInputDigest!==archiveInputDigest){check(draft.archiveReceipt?.confirmed===false&&draft.archiveReceipt.status==='not-written','已写入或尚未确认写入结果的归档计划不能更换内容，请完成同一次提交');delete draft.archivePlan;delete draft.archiveReceipt;delete draft.archiveInputDigest;}
    archivePlan=draft.archiveInputDigest===archiveInputDigest&&draft.archivePlan?draft.archivePlan:await sourceBooks.prepareDefinitionArchive(archiveInput);guard();draft.archivePlan=clone(archivePlan);draft.archiveInputDigest=archiveInputDigest;
    archiveReceipt=await sourceBooks.commitDefinitionArchive(archivePlan,{guard});check(archiveReceipt?.confirmed===true,'来源书归档尚未获回读确认');source.sourceArchive=clone(archiveReceipt.sourceArchive);draft.archiveReceipt=clone(archiveReceipt);guard();}
   const saved=await database.commit({operationId:draft.operationId,expectedRevision:draft.expectedRevision,contextKey:draft.contextKey,changes:proposal.matrix.changes,source});return {...saved,...(archiveReceipt?{archiveReceipt,sourceArchive:clone(archiveReceipt.sourceArchive)}:{})};
  }catch(error){archivePlan??=error.archivePlan;archiveReceipt??=error.archiveReceipt;if(archivePlan){error.archivePlan=clone(archivePlan);draft.archivePlan=clone(archivePlan);}if(archiveReceipt){error.archiveReceipt=clone(archiveReceipt);draft.archiveReceipt=clone(archiveReceipt);if(archiveReceipt.confirmed&&archiveInputDigest)draft.archiveInputDigest=archiveInputDigest;}throw error;}
 }
 function form(draft){return draft.proposal.matrix.changes.map(change=>{const schema=draft.schema?.[change.tableId];return {tableId:change.tableId,recordId:change.recordId,label:schema?.label??change.tableId,name:change.values.name??change.values.label??'',fields:Object.entries(change.values).map(([key,value])=>({key,label:schema?.fields?.find(f=>f.key===key)?.label??key,type:schema?.fields?.find(f=>f.key===key)?.type??'TEXT',value:clone(value),state:change.states?.[key]??'known'}))};});}
 return {draft,validate,save,form};
}
