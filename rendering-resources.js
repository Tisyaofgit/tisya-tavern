import {EMOTIONS} from './emotion-catalog.js';

export const RESOURCE_SLOTS=Object.freeze({anchor:'心声',body:'正文',extra:'附加面板'});
export const BUILTIN_RESOURCES=Object.freeze(EMOTIONS.map(e=>Object.freeze({id:'emotion.'+e.name,name:e.name,kind:'emotion',slot:'anchor',url:e.url,assetId:e.id})));
let current=[...BUILTIN_RESOURCES];
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function renderingResources(additional=[]){
 const result=[...BUILTIN_RESOURCES],seen=new Set(result.map(r=>r.id));
 for(const item of additional){
  const r={...item};
  if(typeof r.id!=='string'||!r.id||/[\s{},，|<>]/u.test(r.id)||seen.has(r.id))throw Error('资源参数重复或格式无效：'+r.id);
  if(!['emotion','image','audio','video'].includes(r.kind)||!Object.hasOwn(RESOURCE_SLOTS,r.slot)||!r.name?.trim())throw Error('资源类型、槽位或含义未填写：'+r.id);
  if((r.kind==='emotion')!==(r.slot==='anchor'))throw Error('心声槽对应表情资源：'+r.id);
  if(typeof r.url!=='string'||!r.url.trim())throw Error('资源地址未填写：'+r.id);
  const url=new URL(r.url,import.meta.url);if(!['https:','http:','file:','tauri:','asset:'].includes(url.protocol))throw Error('资源地址不可用：'+r.id);
  r.url=url.href;seen.add(r.id);result.push(r);
 }
 return result;
}
export const configureRenderingResources=additional=>{current=renderingResources(additional);return current;};
export const getRenderingResources=()=>current.map(r=>({...r}));
export function renderingIds(value){
 const match=/^@rendering\{([^{}]*)\}$/u.exec(String(value).trim());
 if(!match)return null;
 const ids=match[1].split(/[,，]/u).map(s=>s.trim());
 if(!ids.length||ids.some(id=>!id))throw Error('资源参数为空');
 return ids;
}
export function resolveRendering(value,slot,resources=current){
 const ids=renderingIds(value);if(!ids)throw Error('资源格式应为 @rendering{参数ID}');
 return ids.map(id=>{const row=resources.find(r=>r.id===id&&r.slot===slot);if(!row)throw Error('资源参数未登记于'+RESOURCE_SLOTS[slot]+'：'+id);return row;});
}
export function resourcePromptSlots(additional=[]){
 const resources=renderingResources(additional);
 return {tisya_selected_resources:[RENDERING_CONTRACT,'@rendering.resources := '+JSON.stringify(resources.map(({id,name,kind,slot})=>({id,meaning:name,type:kind,slot}))), '[/MULTIMEDIA]'].join('\n')};
}
export const RENDERING_CONTRACT='[MULTIMEDIA]\n@rendering{ID[,ID…]} := 前端多媒体资源调用。所有位置共用下列唯一资源表；参数逐字重复可选ID，不得原创、翻译或改写。type 表示资源类型，meaning 表示含义，slot 表示对应位置：anchor=心声表情（单选），body=正文，extra=附加面板。前端按ID映射资源；资源登记变化自动更新此表。';
export function projectRendering(text,slot,resources=current){
 return String(text??'').replace(/@rendering\{[^{}]*\}/gu,raw=>{
  try{return resolveRendering(raw,slot,resources).map(r=>{
   const location=new URL(r.url),moduleLocation=new URL(import.meta.url);
   const local=['tauri:','asset:'].includes(location.protocol)&&location.protocol===moduleLocation.protocol&&location.host===moduleLocation.host;
   const url=escape(local?location.pathname+location.search+location.hash:r.url),name=escape(r.name);
   if(r.kind==='image')return '<img src="'+url+'" alt="'+name+'" />';
   if(r.kind==='audio'||r.kind==='video')return '<'+r.kind+' controls="controls" src="'+url+'" aria-label="'+name+'"></'+r.kind+'>';
   throw Error('此槽位不支持该资源');
  }).join('');}catch(e){return '<span class="tisya-resource-error" role="status">'+escape(e.message)+'</span>';}
 });
}
