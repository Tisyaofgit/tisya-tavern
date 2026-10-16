import {archivePrefixRole} from './archive-prefix.js';
import {archiveBookEntries} from './archive-book-entries.js';
import {characterWorldbookScope} from './character-scope.js';
import {FORMAT, check, copy, object, defaultRegistry} from './schema.js';
const MANAGED=['【图鉴／静态】存档最新版','【图鉴／数据】存档最新版','【图鉴／动态快照】存档最新版','【图鉴／记忆】存档最新版','【原点】初始档案','【基点】核心版本','【存档】时间锚与变更路径'];
const ENTRY = '缇斯亚 · 表单数据';
export async function digest(value){const bytes=new TextEncoder().encode(typeof value==='string'?value:JSON.stringify(value));const hash=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,'0')).join('');}
export const uuid = prefix => prefix+':'+crypto.randomUUID();
export function createBookGateway(getHelper=()=>globalThis.TavernHelper,getContext){
 const locks=new Map();
 function helper(){const h=getHelper();check(h&&['getWorldbook','getWorldbookNames','createWorldbook','updateWorldbookWith'].every(k=>typeof h[k]==='function'),'表单存档需要新版酒馆助手的世界书 API；未启用表单时不影响聊天');return h;}
 function find(entries){check(Array.isArray(entries),'世界书未返回条目列表');const matches=entries.filter(e=>e.name===ENTRY);check(matches.length<=1,'表单数据条目重复，请保留原书并检查冲突');return matches[0];}
 function decode(entry){check(entry&&entry.enabled===false,'表单存档条目不存在或被改为自动注入，请在世界书中关闭该条目的自动激活');let data;try{data=JSON.parse(entry.content);}catch{throw Error('表单世界书 JSON 损坏，原文已保留');}check(data.format===FORMAT&&['origin','session'].includes(data.kind)&&Number.isSafeInteger(data.revision)&&data.revision>=0,'表单存档版本无效');return data;}
 async function read(name){check(name,'尚未绑定表单世界书');const entries=await helper().getWorldbook(name),entry=find(entries),data=decode(entry);if(data.archiveView){const expected=archiveBookEntries(data);for(const item of expected){const found=entries.filter(e=>e.name===item.name);check(found.length===1&&found[0].content===item.content&&found[0].enabled===false,'自动分层条目已被外部改动：'+item.name+'；请保留原书并核对');}}return {name,data,stamp:await digest(entry.content),raw:entry.content,uid:entry.uid};}
 async function create(kind,owner,name){const h=helper();check(!(await h.getWorldbookNames()).includes(name),'世界书已经存在，请选择读取或换名');const data={format:FORMAT,kind,id:uuid(kind),owner,revision:0,registry:defaultRegistry(),bases:[],commits:[]};
  const entry={name:ENTRY,enabled:false,content:JSON.stringify(data),strategy:{type:'selective',keys:[],keys_secondary:{logic:'and_any',keys:[]},scan_depth:0},position:{type:'after_character_definition',role:'system',depth:0,order:100},probability:100,recursion:{prevent_incoming:true,prevent_outgoing:true,delay_until:null},effect:{sticky:null,cooldown:null,delay:null}};
  check(await h.createWorldbook(name,[entry])===true,'世界书创建未确认；请检查是否已存在同名书');return read(name);
 }
 async function write(snapshot,next,guard=()=>{}){
  check(!locks.has(snapshot.name),'这本表单世界书正在保存');locks.set(snapshot.name,true);
  try{
   guard();check(next.id===snapshot.data.id&&next.kind===snapshot.data.kind&&next.revision===snapshot.data.revision+1,'表单更新版本不连续');
   const current=await read(snapshot.name);guard();check(current.stamp===snapshot.stamp,'表单已在其他页面修改，未覆盖新版本');
   const projections=archiveBookEntries(next),encoded=JSON.stringify(next),expected=await digest(encoded);let invoked=false;
   await helper().updateWorldbookWith(snapshot.name,entries=>{guard();const entry=find(entries);check(entry&&entry.uid===snapshot.uid&&entry.content===snapshot.raw,'表单写入前版本已变化');for(const projection of projections){const found=entries.filter(e=>e.name===projection.name);check(found.length<=1,'分层条目重复');if(!snapshot.data.archiveView)check(!found.length,'同名世界书条目已存在，未覆盖：'+projection.name);else{const prior=archiveBookEntries(snapshot.data).find(x=>x.name===projection.name);check(found.length===1&&found[0].content===prior.content&&found[0].enabled===false,'分层条目写入前已改变');}if(found.length){found[0].content=projection.content;}else entries.push({...copy(entry),uid:Math.max(-1,...entries.map(e=>Number(e.uid)).filter(Number.isFinite))+1,name:projection.name,content:projection.content,enabled:false});}entry.content=encoded;entry.enabled=false;invoked=true;return entries;},{render:'debounced'});
   check(invoked,'宿主未执行表单更新');const verified=await read(snapshot.name);check(verified.stamp===expected,'表单保存结果不一致；写入状态未知，请重新载入核对');return verified;
  }catch(e){throw Error('表单保存未完成：'+e.message);}finally{locks.delete(snapshot.name);}
 }
 async function bindOrigin(card,name,outerGuard=()=>{}){const h=helper();check(typeof h.getCharWorldbookNames==='function'&&typeof h.rebindCharWorldbooks==='function','宿主缺少角色卡世界书绑定接口');const {target,guard}=characterWorldbookScope(card,getContext,outerGuard);guard();const prior=await h.getCharWorldbookNames(target);guard();check(object(prior)&&Array.isArray(prior.additional),'角色卡世界书绑定格式无效');if(prior.primary===name||prior.additional.includes(name))return;await h.rebindCharWorldbooks(target,{primary:prior.primary,additional:[...prior.additional,name]});guard();const after=await h.getCharWorldbookNames(target);guard();check(after.primary===prior.primary&&Array.isArray(after.additional)&&after.additional.includes(name)&&prior.additional.every(n=>after.additional.includes(n)),'原点书绑定未确认，原有角色书请核对');}
 async function cardBooks(card){const h=helper();check(typeof h.getCharWorldbookNames==='function','宿主缺少角色书绑定读取接口');const {target,guard}=characterWorldbookScope(card,getContext);const refs=await h.getCharWorldbookNames(target);guard();check(object(refs)&&Array.isArray(refs.additional),'角色卡世界书绑定格式无效');return [...new Set([refs.primary,...refs.additional].filter(Boolean))];}
 async function materials(card,{includeDisabled=false}={}){const out=[];for(const name of await cardBooks(card)){const entries=await helper().getWorldbook(name),journal=find(entries),generated=journal?!!decode(journal).archiveView:false;for(const e of entries)if(e.name!==ENTRY&&!(generated&&MANAGED.includes(e.name))&&(includeDisabled||e.enabled!==false)&&typeof e.content==='string')out.push({book:name,entry:e.name,content:e.content,...(archivePrefixRole(name,e.name)?{archiveRole:archivePrefixRole(name,e.name),sourcePath:[name,e.uid??e.name]}:{}),...(e.enabled===false?{enabled:false}:{})});}return out;}
 return {read,write,create,bindOrigin,cardBooks,materials,names:()=>helper().getWorldbookNames(),available:()=>{try{helper();return true;}catch{return false;}}};
}
