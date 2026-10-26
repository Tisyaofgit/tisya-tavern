import {canRestoreInto} from './startup.js';
import {archiveTrace} from './archive-book.js';
import {validateBundle} from './core-assets.js';
import {check,copy,sameDefinition,validateRow,validateReferences} from './schema.js';
import {digest} from './books.js';
import {project} from './ledger.js';
import {snapshotAnchor,branchSeed} from './branches.js';
import {createAtlas,ATLAS_LAYOUT,validateAtlasLayout} from './atlas.js';
const FORMAT='tisya.archive-package/1';
export function originView(origin,pins=null){
 const chosen=pins===null?[...new Map([...origin.bases].sort((a,b)=>a.rev-b.rev).map(r=>[r.id,r])).values()]:pins.map(pin=>{const row=origin.bases.find(r=>r.id+'@'+r.rev===pin);check(row,'原点版本不存在：'+pin);return row;});
 check(new Set(chosen.map(r=>r.id)).size===chosen.length,'原点同一对象不能选多个版本');for(const r of chosen)validateRow(origin.registry,r);validateReferences(chosen,origin.registry);
 return {registry:copy(origin.registry),rows:copy(chosen),commits:[],anchors:[],last:null,revision:origin.revision};
}
export function archiveOverview(loaded){const {origin,session,view}=loaded;return {
 origin:{id:origin.data.id,name:origin.name,revision:origin.data.revision,objects:new Set(origin.data.bases.filter(r=>r.table==='objects').map(r=>r.id)).size,versions:origin.data.bases.map(r=>({id:r.id,revision:r.rev,name:r.values.名称,table:r.table,core:r.values.核心引用??null}))},
 cores:copy((origin.data.coreAssets??[]).map(c=>({id:c.id,version:c.version,name:c.name,kind:c.kind??'bundle',members:c.members?.length??1,sourceSession:c.sourceSession}))),
 saves:copy((origin.data.timelineAnchors??[]).map(a=>({id:a.id,name:a.name,version:a.version,createdAt:a.createdAt,sourceSession:a.sourceSession,sourceCommit:a.sourceCommit,worldTime:a.worldTime,objects:a.rows.filter(r=>r.table==='objects').length,canon:!!a.canon}))),
 current:{id:session.data.id,name:session.name,revision:session.data.revision,originId:origin.data.id,anchor:copy(session.data.branchSeed?.anchor??null),commit:view.last,objects:view.rows.filter(r=>r.table==='objects').length,commits:view.commits.length}
};}
export async function exportArchivePackage(loaded,{name}={}){
 check(typeof name==='string'&&name.trim(),'请给存档命名');const payload={name:name.trim(),createdAt:new Date().toISOString(),origin:copy(loaded.origin.data),session:copy(loaded.session.data),sources:loaded.chain.map(({key,role,floor})=>({key,role,floor})),anchor:snapshotAnchor(loaded,{name, nodes:[]})};
 return {format:FORMAT,sha256:await digest(payload),payload};
}
export async function validateArchivePackage(input){
 const pack=copy(input);check(pack?.format===FORMAT&&pack.payload&&typeof pack.sha256==='string','存档包格式无效');check(await digest(pack.payload)===pack.sha256,'存档包校验失败，未读取损坏内容');const {origin,session,sources,anchor}=pack.payload;const sourceKeys=Array.isArray(sources)?sources.map(s=>s.key):null;
 check(origin?.kind==='origin'&&session?.kind==='session'&&Array.isArray(sources)&&sources.every(s=>typeof s.key==='string'&&['assistant','user'].includes(s.role)&&Number.isSafeInteger(s.floor)&&s.floor>=1)&&new Set(sourceKeys).size===sourceKeys.length,'存档包层级无效');check(anchor.sourceSession===session.id,'存档锚所属会话不符');
 const view=project(origin,session,sourceKeys);check(sameDefinition(view.rows.filter(r=>!['preferences','native_cells'].includes(r.table)),anchor.rows),'存档锚与账本投影不一致');check(sameDefinition(view.registry,anchor.registry),'存档模板与账本不一致');
 const reconstructed=snapshotAnchor({origin:{data:origin},session:{data:session},view,chain:sources},{name:pack.payload.name,nodes:[]});
 for(const key of ['history','sourceSession','sourceCommit','worldTime','referenceRows','nodes','archivedSources','conditionTurns','conditionRuleHistory','conditionRules','conditionReceipts','stateEventReceipts'])check(sameDefinition(anchor[key],reconstructed[key]),'存档继承字段与账本不一致：'+key);
 return {pack,view,seed:branchSeed(anchor)};
}
export function createArchiveSystem({run,capture,load,books,onCommitted=()=>{},readerPolicy=null}){
 const previews=new Map();
 async function current(){const c=capture();check(c.settings.originBook&&c.settings.sessionBook,'请先明确建立基点/原点对应的会话存档');return {c,loaded:await load(c)};}
 async function fresh(c,l){c.guard();const [a,b]=await Promise.all([books.read(l.origin.name),books.read(l.session.name)]);c.guard();check(a.stamp===l.origin.stamp&&b.stamp===l.session.stamp,'档案版本已变化，请重新载入');}
 async function reviseCoreBundle(input,expectedRevision){const draft=copy(input);return run(async()=>{
  const {c,loaded}=await current();check(loaded.origin.data.revision===expectedRevision,'基点修订依据已变化');const versions=(loaded.origin.data.coreAssets??[]).filter(x=>x.id===draft.id),old=versions.find(x=>x.version===draft.version);check(old?.format==='tisya.core-bundle/1','请选择有完整来源的基点组');check(Math.max(...versions.map(x=>x.version))===draft.version,'请从最新基点版本继续修订');check(typeof draft.reason==='string'&&draft.reason.trim(),'请说明这次核心修订的依据');
  const proposed=validateBundle({name:draft.name,members:draft.members,links:draft.links},old.source),asset={...copy(old),name:proposed.name,members:proposed.members.map(m=>({...copy(old.members.find(x=>x.sourceObject===m.sourceObject)),name:m.name,traits:copy(m.traits),growth:copy(m.growth)})),links:proposed.links,version:old.version+1,previousVersion:old.version,revisionReason:draft.reason.trim(),createdAt:new Date().toISOString()};
  const next=copy(loaded.origin.data);next.revision++;next.coreAssets.push(asset);await fresh(c,loaded);await books.write(loaded.origin,next,c.guard);return copy(asset);
 });}
 async function readCoreAsset(id,version){const {c,loaded}=await current();check(Number.isSafeInteger(version)&&version>0,'请明确选择基点版本');const asset=loaded.origin.data.coreAssets?.find(x=>x.id===id&&x.version===version);check(asset,'基点版本不存在');await fresh(c,loaded);return {originId:loaded.origin.data.id,asset:copy(asset),adaptations:copy((loaded.origin.data.coreAdaptations??[]).filter(a=>a.core.id===id&&a.core.version===version))};}
 async function archiveLibrary(){const {c,loaded}=await current();await fresh(c,loaded);return archiveOverview(loaded);}
 async function openAtlas({layer='session',anchorId=null,pins=null,audience='author'}={}){
  const {c,loaded}=await current();check(['session','origin','save'].includes(layer)&&['author','reader'].includes(audience),'图鉴层或读取身份无效');let view=loaded.view;
  if(layer==='origin')view=originView(loaded.origin.data,pins);
  if(layer==='save'){const a=loaded.origin.data.timelineAnchors?.find(a=>a.id===anchorId);check(a,'指定存档不存在');const seed=branchSeed(a);view={registry:a.registry,rows:seed.rows};}
  check(audience==='author'||layer==='session','读者图鉴仅展示当前已授权线路');const context={world:c.key,origin:loaded.origin.data.id,session:loaded.session.data.id,layer,anchorId,originRevision:loaded.origin.data.revision,sessionRevision:loaded.session.data.revision,audience};
  let policy={authorizeRow:()=>true,authorizeField:()=>true,guard:()=>{}};
  if(audience==='reader'){check(typeof readerPolicy==='function','尚未绑定读者图鉴权限');policy=await readerPolicy({world:c.key,session:copy(loaded.session.data),view:copy(view)});check(typeof policy?.guard==='function','读取授权缺少版本检查');}
  c.guard();const atlas=createAtlas({view,context,layout:loaded.origin.data.atlasLayout??ATLAS_LAYOUT,authorizeRow:policy.authorizeRow,authorizeField:policy.authorizeField,guard:c.guard});
  const guarded=fn=>async(...args)=>{await fresh(c,loaded);await policy.guard();const result=fn(...args);await fresh(c,loaded);await policy.guard();c.guard();return result;};return {scope:context,list:guarded(atlas.list),detail:guarded(atlas.detail)};
 }
 async function readAtlasSnapshot(){
  const {c,loaded}=await current();await fresh(c,loaded);
  // Author UI only; AI/reader APIs keep their independently bound ACL. Never
  // expose this raw snapshot through the model tool dispatcher.
  const initial=originView(loaded.origin.data),overview=archiveOverview(loaded);
  return {data:{live:true,originBook:loaded.origin.name,world:loaded.origin.name,branch:loaded.session.name,registry:copy(loaded.view.registry),originRegistry:initial.registry,rows:copy(loaded.view.rows),originRows:initial.rows,savedRows:[],cores:[],saves:[],trace:archiveTrace(loaded.view,loaded.session.data.id,loaded.chain),revision:loaded.session.data.revision,overview},verify:()=>fresh(c,loaded)};
 }
 async function saveAtlasLayout(input,expectedRevision){const layout=copy(input);return run(async()=>{const {c,loaded}=await current();check(loaded.origin.data.revision===expectedRevision,'分类依据已改变');const next=copy(loaded.origin.data);next.atlasLayout=validateAtlasLayout(layout,loaded.origin.data.registry);next.revision++;await fresh(c,loaded);await books.write(loaded.origin,next,c.guard);return copy(next.atlasLayout);});}
 async function exportArchive(options){const {c,loaded}=await current();const pack=await exportArchivePackage(loaded,copy(options));await fresh(c,loaded);return pack;}
 async function previewArchiveRestore(input){const captured=copy(input);return run(async()=>{const {c,loaded}=await current(),checked=await validateArchivePackage(captured);check(checked.pack.payload.origin.id===loaded.origin.data.id,'存档属于另一原点；请先在对应世界建立空会话');check(canRestoreInto(loaded.session.data),'恢复需要空会话或未推进的自动开局，不覆盖已有进度');check(sameDefinition(checked.pack.payload.origin.状态目录??null,loaded.origin.data.状态目录??null),'世界数值目录已改变，请先核对原点版本再恢复');
  await fresh(c,loaded);check(previews.size<32,'恢复预览过多');const token='restore:'+crypto.randomUUID();previews.set(token,{checked,world:c.key,chat:c.chat,originStamp:loaded.origin.stamp,sessionStamp:loaded.session.stamp});return {token,name:checked.pack.payload.name,objects:checked.view.rows.filter(r=>r.table==='objects').length,sourceSession:checked.pack.payload.session.id,targetSession:loaded.session.data.id,replacesOpening:loaded.session.data.templateInitialization?.mode==='reuse',written:false};});}
 async function restoreArchive(token){return run(async()=>{const {c,loaded}=await current();if(loaded.session.data.restoreReceipt?.token===token)return copy(loaded.session.data.restoreReceipt);const p=previews.get(token);check(p&&p.world===c.key&&p.chat===c.chat,'恢复预览不存在或已失效');check(p.originStamp===loaded.origin.stamp&&p.sessionStamp===loaded.session.stamp,'恢复依据已变化，请重新预览');check(canRestoreInto(loaded.session.data),'目标存档已有进度');const {pack,seed,view}=p.checked,next=copy(loaded.session.data);next.revision++;next.registry=copy(view.registry);next.schemaPinned=true;next.pins=[];next.commits=[];delete next.openingBinding;delete next.templateInitialization;delete next.personaBinding;if(pack.payload.session.personaBinding)next.personaBinding=copy(pack.payload.session.personaBinding);next.branchSeed=copy(seed);next.restoreReceipt={token,sha256:pack.sha256,sourceSession:pack.payload.session.id,targetSession:next.id,originId:loaded.origin.data.id,at:new Date().toISOString()};project(loaded.origin.data,next,loaded.chain.map(s=>s.key));await fresh(c,loaded);await books.write(loaded.session,next,c.guard);previews.delete(token);onCommitted();return copy(next.restoreReceipt);});}
 return {readAtlasSnapshot,reviseCoreBundle,readCoreAsset,archiveLibrary,openAtlas,saveAtlasLayout,exportArchive,previewArchiveRestore,restoreArchive};
}
