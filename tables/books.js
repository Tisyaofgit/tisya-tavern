import {FORMAT, check, copy, object, defaultRegistry} from './schema.js';
const ENTRY = '缇斯亚 · 表单数据';
export async function digest(value){const bytes=new TextEncoder().encode(typeof value==='string'?value:JSON.stringify(value));const hash=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,'0')).join('');}
export const uuid = prefix => prefix+':'+crypto.randomUUID();
export function createBookGateway(getHelper=()=>globalThis.TavernHelper){
 const locks=new Map();
 function helper(){const h=getHelper();check(h&&['getWorldbook','getWorldbookNames','createWorldbook','updateWorldbookWith'].every(k=>typeof h[k]==='function'),'表单存档需要新版酒馆助手的世界书 API；未启用表单时不影响聊天');return h;}
 function find(entries){check(Array.isArray(entries),'世界书未返回条目列表');const matches=entries.filter(e=>e.name===ENTRY);check(matches.length<=1,'表单数据条目重复，请保留原书并检查冲突');return matches[0];}
 function decode(entry){check(entry&&entry.enabled===false,'表单存档条目不存在或被改为自动注入，请在世界书中关闭该条目的自动激活');let data;try{data=JSON.parse(entry.content);}catch{throw Error('表单世界书 JSON 损坏，原文已保留');}check(data.format===FORMAT&&['origin','session'].includes(data.kind)&&Number.isSafeInteger(data.revision)&&data.revision>=0,'表单存档版本无效');return data;}
 async function read(name){check(name,'尚未绑定表单世界书');const entries=await helper().getWorldbook(name),entry=find(entries),data=decode(entry);return {name,data,stamp:await digest(entry.content),raw:entry.content,uid:entry.uid};}
 async function create(kind,owner,name){const h=helper();check(!(await h.getWorldbookNames()).includes(name),'世界书已经存在，请选择读取或换名');const data={format:FORMAT,kind,id:uuid(kind),owner,revision:0,registry:defaultRegistry(),bases:[],commits:[]};
  const entry={name:ENTRY,enabled:false,content:JSON.stringify(data),strategy:{type:'selective',keys:[],keys_secondary:{logic:'and_any',keys:[]},scan_depth:0},position:{type:'after_character_definition',role:'system',depth:0,order:100},probability:100,recursion:{prevent_incoming:true,prevent_outgoing:true,delay_until:null},effect:{sticky:null,cooldown:null,delay:null}};
  check(await h.createWorldbook(name,[entry])===true,'世界书创建未确认；请检查是否已存在同名书');return read(name);
 }
 async function write(snapshot,next,guard=()=>{}){
  check(!locks.has(snapshot.name),'这本表单世界书正在保存');locks.set(snapshot.name,true);
  try{
   guard();check(next.id===snapshot.data.id&&next.kind===snapshot.data.kind&&next.revision===snapshot.data.revision+1,'表单更新版本不连续');
   const current=await read(snapshot.name);guard();check(current.stamp===snapshot.stamp,'表单已在其他页面修改，未覆盖新版本');
   const encoded=JSON.stringify(next),expected=await digest(encoded);let invoked=false;
   await helper().updateWorldbookWith(snapshot.name,entries=>{guard();const entry=find(entries);check(entry&&entry.uid===snapshot.uid&&entry.content===snapshot.raw,'表单写入前版本已变化');entry.content=encoded;entry.enabled=false;invoked=true;return entries;},{render:'debounced'});
   check(invoked,'宿主未执行表单更新');const verified=await read(snapshot.name);check(verified.stamp===expected,'表单保存结果不一致；写入状态未知，请重新载入核对');return verified;
  }catch(e){throw Error('表单保存未完成：'+e.message);}finally{locks.delete(snapshot.name);}
 }
 async function bindOrigin(card,name,guard=()=>{}){const h=helper();check(typeof h.getCharWorldbookNames==='function'&&typeof h.rebindCharWorldbooks==='function','宿主缺少角色卡世界书绑定接口');guard();const prior=await h.getCharWorldbookNames(card);guard();check(object(prior)&&Array.isArray(prior.additional),'角色卡世界书绑定格式无效');if(prior.primary===name||prior.additional.includes(name))return;await h.rebindCharWorldbooks(card,{primary:prior.primary,additional:[...prior.additional,name]});const after=await h.getCharWorldbookNames(card);check(after.primary===prior.primary&&after.additional.includes(name)&&prior.additional.every(n=>after.additional.includes(n)),'原点书绑定未确认，原有角色书请核对');}
 async function cardBooks(card){const h=helper();check(typeof h.getCharWorldbookNames==='function','宿主缺少角色书绑定读取接口');const refs=await h.getCharWorldbookNames(card);return [...new Set([refs.primary,...refs.additional].filter(Boolean))];}
 return {read,write,create,bindOrigin,cardBooks,names:()=>helper().getWorldbookNames(),available:()=>{try{helper();return true;}catch{return false;}}};
}
