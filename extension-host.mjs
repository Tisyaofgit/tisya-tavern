import {chatKey} from './engine/controller.mjs';
import {sha256} from './engine/common.mjs';
import {phoneSource} from './phone-turn-host.js';
import {phoneDatabaseReference,decodePhoneDatabase} from './engine/phone-database.mjs';
import {getDoc} from './social-suite-core.mjs';
import {canReadPost} from './phone-life/social.mjs';
import {formatMarks} from './typography-core.js';
import {inspectMessage} from './reader.js';
import {parsePresentationReference,PRESENTATION_RECORD_SCHEMA,EXTENSION_BLOCK_SCHEMA,EXTENSION_ITEM_SCHEMA} from './extension-presentation.mjs';
import {EXTENSION_PREFERENCE_TABLE,normalizeExtensionPreferences,compileExtensionPreferences} from './extension-preferences.mjs';

const clone=v=>structuredClone(v),plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const fail=(code,message)=>{throw Object.assign(new Error(message),{code:'TISYA_PRESENTATION_'+code});};
const refKey=r=>JSON.stringify([r.tableId,r.recordId]);
const knownValues=row=>Object.fromEntries(Object.entries(row?.values??{}).filter(([key])=>!row.states||['known','derived'].includes(row.states[key])));
const nameOf=(state,id)=>knownValues(state?.tables?.T_SYS_ENTITIES?.[id]).name??id??'';
const string=v=>typeof v==='string'?v:'';
const atText=(value,state)=>{
 if(typeof value==='string')return value;
 if(plain(value)&&Number.isInteger(value.year)&&Number.isInteger(value.month)&&Number.isInteger(value.day)){const m=value.minute;return value.year+'-'+String(value.month).padStart(2,'0')+'-'+String(value.day).padStart(2,'0')+(Number.isInteger(m)?' '+String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0'):'');}
 if(Number.isFinite(value)&&Number.isFinite(state?.config?.epoch))return new Date(state.config.epoch+value*60000).toISOString();return '';
};
export function publicPresentationRequests(document,source){
 if(!document?.createElement)fail('DOCUMENT','读取排版标记需要DOM解析接口');
 const inspection=inspectMessage(source);if(inspection.body?.error)fail('BODY','正文尚未通过结构读取');
 const template=document.createElement('template');template.innerHTML=inspection.body?.value??'';
 const root=document.createElement('div');root.append(template.content);const authored=new Set(root.querySelectorAll('*'));formatMarks(root);
 const requests=[];
 for(const node of root.querySelectorAll('[data-tisya-reference],[data-tisya-mark]')){
  if(authored.has(node))continue;const parameter=node.hasAttribute('data-tisya-reference')?node.getAttribute('data-tisya-reference'):['消息','播报','档案','事件'].includes(node.getAttribute('data-tisya-mark'))?[...node.children].find(n=>n.tagName==='HEADER')?.textContent:null;
  if(!parameter?.startsWith('@record'))continue;
  const request=parsePresentationReference(parameter);if(request&&!requests.some(r=>JSON.stringify(r)===JSON.stringify(request)))requests.push(request);
 }
 return requests;
}

// This mapper sees only the immutable phone frame selected by this message.
// Table identities are produced by the same codec used for live normalization.
export function phonePresentationProjections(snapshot,{sourceId,contextKey,requests=[]}={}){
 if(!snapshot||snapshot.frame?.sourceId!==sourceId)return [];
 const root={suite:snapshot.suite,...(snapshot.life?{life:snapshot.life}:{})},life=snapshot.life?.state,wanted=new Set(requests.map(r=>refKey(r.reference))),tables=new Set(requests.map(r=>r.reference.tableId)),rows=[],result=[];
 const add=(path,value)=>{const reference=phoneDatabaseReference(path,{root});if(wanted.has(refKey(reference)))rows.push({reference,path,value});};
 // Visit only requested entity families. Never scan branch envelopes, seeds or
 // per-item receipt history just to display one referenced historical card.
 for(const [table,path] of [['X_FIN_TRANSACTIONS',['life','state','wallet','ledger']],['X_SOCIAL_POSTS',['life','state','social','posts']],['X_SOCIAL_COMMENTS',['life','state','social','comments']],['X_MEDIA_PHOTOS',['life','state','media','photos']],['X_MEDIA_SONGS',['life','state','media','songs']]])if(tables.has(table)){const items=path.reduce((v,k)=>v?.[k],root)??[];items.forEach((v,i)=>add([...path,String(i)],v));}
 if(tables.has('X_NETWORK_DOCUMENTS')||tables.has('X_NETWORK_ITEMS'))for(const [id,doc] of Object.entries(snapshot.suite?.documents??{})){const path=['suite','documents',id];if(tables.has('X_NETWORK_DOCUMENTS'))add(path,doc);if(tables.has('X_NETWORK_ITEMS'))(doc.items??[]).forEach((v,i)=>add([...path,'items',String(i)],v));}
 const account=id=>snapshot.suite?.accounts?.[id]?.name??life?.social?.accounts?.find(a=>a.id===id)?.name??id??'';
 const push=(row,kind,value)=>{if(!requests.some(r=>r.kind===kind&&refKey(r.reference)===refKey(row.reference)))return;result.push({reference:{...row.reference,snapshotId:sourceId},kind,value,contextKey,allowed:true});};
 for(const row of rows){
  if(!wanted.has(refKey(row.reference)))continue;const v=row.value,t=row.reference.tableId;
  if(t==='X_FIN_TRANSACTIONS'&&life&&v.type==='transfer')push(row,'transfer',{title:'转账记录',amount:typeof v.amount==='number'?Math.abs(v.amount)/100:null,currencyLabel:life.config?.currency?.name??'',sender:life.identity?.name??'',recipient:life.contacts?.find(x=>x.id===v.to)?.name??v.to??'',status:'已记录',text:v.description??'',at:atText(v.at,life)});
  else if(t==='X_SOCIAL_POSTS'&&life&&canReadPost(life,v))push(row,'text',{title:account(v.authorId),text:v.text,at:atText(v.createdAt,life)});
  else if(t==='X_SOCIAL_COMMENTS'&&life){const p=life.social.posts.find(p=>p.id===v.postId);if(canReadPost(life,p))push(row,'text',{title:account(v.authorId),text:v.text,at:atText(v.createdAt,life)});}
  else if(t==='X_MEDIA_PHOTOS'&&life){const owner=life.social.activeAccountId??life.media.ownerId,allowed=v.visibility==='public'||v.ownerId===owner||v.ownerId===life.media.ownerId||v.ownerId===life.config?.subjectId;if(allowed)push(row,'image',{title:v.name,alt:v.name,resourceId:v.id,at:atText(v.createdAt,life)});}
  else if(t==='X_MEDIA_SONGS'&&life)push(row,'voice',{title:v.title,resourceId:v.audioId??null,transcript:v.description??''});
  else if(t==='X_NETWORK_DOCUMENTS'){
   const doc=getDoc(snapshot.suite,v.id,'me');if(!doc)continue;const meta=doc.meta??{},title=(meta.demo===true?'演示素材 · ':'')+doc.title;
   if(doc.kind==='forum')push(row,'forum',{title,text:doc.summary??'',items:doc.items.map(i=>({id:i.id,floor:i.floor,author:account(i.by),text:i.text??'',deleted:i.deleted===true,at:i.at,quote:i.quote==null?null:{floor:typeof i.quote==='number'?i.quote:i.quote.floor,label:i.quote.label}}))});
   else if(doc.kind==='news')push(row,'news',{title,publisher:account(doc.author),at:doc.at??doc.publishedAt??doc.createdAt??'',summary:meta.summary??doc.summary??'',paragraphs:meta.paragraphs??[doc.text??''],sourceLabel:meta.sourceLabel??'',sourceUrl:meta.sourceUrl??null,corrections:meta.corrections??[]});
   else if(doc.kind==='live')push(row,'danmaku',{title,items:(doc.items??[]).map(i=>({id:i.id,author:account(i.author??i.by),text:i.text??'',atSeconds:i.seconds??i.atSeconds,deleted:i.deleted===true}))});
   else if(['notice','group','bubble','dm','inbox'].includes(doc.kind))push(row,'text',{title,text:doc.items?doc.items.filter(i=>!i.deleted).map(i=>account(i.author??i.by)+'：'+(i.text??'')).join('\n'):doc.text??'',at:doc.at??''});
  }else if(t==='X_NETWORK_ITEMS'){
   const docId=row.path[2],doc=getDoc(snapshot.suite,docId,'me');if(!doc)continue;const item=doc.items.find(x=>x.id===v.id);if(item&&!item.deleted)push(row,'text',{title:account(item.by),text:item.text??'',at:item.at??''});
  }
 }
 return result;
}
function scopeOf(state,extra={}){const bound=knownValues(state?.tables?.X_PHONE_BINDINGS?.['phone-current']);return {ownerId:extra.ownerId??bound.owner_ref??null,worldId:extra.worldId??bound.world_ref??state?.runtime?.scope?.world_ref??null,outputConfigId:extra.outputConfigId??null};}
function recordVisible(state,tableId,recordId,scope,contextKey,authorizeRecord){
 const row=state?.tables?.[tableId]?.[recordId];if(!row)return false;const v=knownValues(row),meta=Object.values(state.tables?.X_RECORD_META??{}).map(knownValues).find(m=>m.table_id===tableId&&m.record_id===recordId);
 if(row.metadata?.phone_scope&&row.metadata.phone_scope!==contextKey)return false;
 const runtime=state.runtime?.scope??{};if(meta&&[['scope_world_id',scope.worldId],['scope_session_id',runtime.session_ref],['scope_branch_id',runtime.branch_ref]].some(([key,current])=>meta[key]&&meta[key]!=='GLOBAL'&&meta[key]!==current))return false;
 if(authorizeRecord)return authorizeRecord({state,tableId,recordId,row:clone(row),scope:clone(scope),contextKey})===true;
 if(['D','E','Access D','Access E'].includes(v.lock_level))return false;
 if(v.visibility==='public')return true;
 if(scope.ownerId&&[v.owner_ref,v.entity_ref,v.from_owner_ref,v.to_owner_ref].includes(scope.ownerId))return true;
 if(scope.ownerId&&Array.isArray(v.audience_refs)&&v.audience_refs.includes(scope.ownerId))return true;
 if(tableId==='X_FIN_TRANSACTIONS'&&row.metadata?.phone_scope===contextKey&&scope.ownerId&&knownValues(state.tables?.X_PHONE_BINDINGS?.['phone-current']).owner_ref===scope.ownerId)return true;
 return false;
}
export function matrixPresentationProjections(snapshot,{sourceId,contextKey,requests=[],scope={},authorizeRecord}={}){
 if(!snapshot?.state||snapshot.contextKey!==contextKey||snapshot.snapshotId!==sourceId)return {projections:[],media:[]};
 const state=snapshot.state,owner=scopeOf(state,scope),projections=[],media=[];
 let phoneLife=null;if(state.tables?.X_PHONE_BINDINGS?.['phone-current'])phoneLife=decodePhoneDatabase(state,{contextKey,revision:snapshot.revision})?.life?.state??null;
 const read=(table,id)=>recordVisible(state,table,id,owner,contextKey,authorizeRecord)?knownValues(state.tables[table][id]):null;
 const asset=(id,kind)=>{const row=read('T_SYS_MEDIA_ASSETS',id);if(!row)return null;const accepted=kind==='audio'?['audio','voice','音频','语音','音效','音乐']:['image','图片','图像','立绘'];if(!accepted.includes(row.kind))return null;const locator=row.asset_locator;if(typeof locator==='string'&&/^(?:https?|blob|file|asset|tauri):/u.test(locator))media.push({id,kind,url:locator,contextKey,allowed:true,name:row.purpose??''});return row;};
 function transfer(id){const v=read('X_FIN_TRANSACTIONS',id);if(!v||v.type!=='transfer')return null;return {amount:Number.isSafeInteger(v.amount)?Math.abs(v.amount)/100:null,currencyLabel:phoneLife?.config?.currency?.name??'',sender:phoneLife?.identity?.name??nameOf(state,owner.ownerId),recipient:phoneLife?.contacts?.find(c=>c.id===v.to)?.name??nameOf(state,v.to),text:v.description??'',status:'已存资金流水',at:phoneLife?atText(v.at,phoneLife):''};}
 for(const request of requests){const {tableId,recordId}=request.reference;let value=null;
  if(request.reference.revision!==undefined&&snapshot.revision!==request.reference.revision)continue;
  if(tableId===PRESENTATION_RECORD_SCHEMA.id){const row=read(tableId,recordId);if(!row||row.kind!==request.kind)continue;
   const common={title:row.title??'',text:row.text??'',at:row.story_time??''};
   if(row.kind==='transfer'){const receipt=transfer(row.transfer_ref);if(receipt)value={...receipt,...common,text:receipt.text+(common.text?'\n'+common.text:'')};}
   else if(row.kind==='voice'||row.kind==='image'){const kind=row.kind==='voice'?'audio':'image',registered=row.media_ref?asset(row.media_ref,kind):null;if(row.media_ref&&!registered)continue;value={...common,...(row.kind==='voice'?{transcript:row.text??''}:{alt:row.title??''}),resourceId:row.media_ref??null};}
   else if(row.kind==='news')value={...common,publisher:nameOf(state,row.sender_ref),sourceLabel:row.source_label??'',sourceUrl:row.source_url??null};
   else value=common;
  }else if(tableId==='X_FIN_TRANSACTIONS'&&request.kind==='transfer')value=transfer(recordId);
  else if(tableId==='T_SYS_MEDIA_ASSETS'&&['voice','image'].includes(request.kind)){const row=asset(recordId,request.kind==='voice'?'audio':'image');if(row)value={title:row.purpose??'',resourceId:recordId};}
  else if(tableId===EXTENSION_BLOCK_SCHEMA.id){const block=read(tableId,recordId);if(!block||block.kind!==request.kind)continue;const items=[];
   for(const [id,record] of Object.entries(state.tables?.[EXTENSION_ITEM_SCHEMA.id]??{})){const item=knownValues(record);if(item.block_ref!==recordId||!recordVisible(state,EXTENSION_ITEM_SCHEMA.id,id,owner,contextKey,authorizeRecord))continue;
    items.push({id,floor:item.floor,author:nameOf(state,item.author_ref),speaker:nameOf(state,item.author_ref),text:item.deleted===true?'':item.text??'',at:item.story_time??'',atSeconds:item.at_seconds,deleted:item.deleted===true,quote:item.quote_floor==null?null:{floor:item.quote_floor}});
   }
   if(request.kind==='forum')items.sort((a,b)=>(a.floor??Infinity)-(b.floor??Infinity));else if(request.kind==='danmaku')items.sort((a,b)=>(a.atSeconds??Infinity)-(b.atSeconds??Infinity));
   value={title:block.title??'',text:block.text??'',at:block.story_time??'',items};
  }
  if(value)projections.push({reference:{tableId,recordId,snapshotId:sourceId,...(request.reference.revision!==undefined?{revision:snapshot.revision}:{})},kind:request.kind,value,contextKey,allowed:true});
 }
 return {projections,media};
}

export const PRESENTATION_PROMPT_CONTRACT='[RECORD.PRESENTATION]\n扩展呈现只读取最新版表单。消息子类型记录在 T_DYN_MESSAGE_CONTENT：kind=text|transfer|voice|image|news，正文text，title标题；transfer_ref引用X_FIN_TRANSACTIONS，media_ref引用T_SYS_MEDIA_ASSETS，不复制金额、不创建假音源。小剧场/论坛/弹幕使用 T_DYN_EXTENSION_BLOCKS(kind=theater|forum|danmaku,title,text) 及关联 T_DYN_EXTENSION_ITEMS(block_ref,author_ref,text,floor,quote_floor,at_seconds,deleted)，仅填适用字段。区块与条目的visibility、owner_ref、audience_refs须逐条有真实依据；引用不扩大角色知情。新内容只通过当前授权表单事务@ROW+写入，不根据风格偏好冒充事件发生。正文使用〔消息:@record{"kind":"transfer","tableId":"T_DYN_MESSAGE_CONTENT","recordId":"已登记记录ID","snapshotId":"@message"}〕转账记录〔/消息〕；语音/图片可用〔媒体:@record{同样字段}〕标签〔/媒体〕；论坛/弹幕/小剧场可用〔引用:@record{同样字段，tableId为T_DYN_EXTENSION_BLOCKS，kind为forum/danmaku/theater}〕标签〔/引用〕；实际参数仍须标准JSON。@message仅绑定本条已接纳回复的不可变快照，不是最新行。记录须在当前授权的表单事务中实际存在；未知记录不补造；渲染不付款、不发声、不上传或推进时间。原有25类内容标记与引用/媒体语法继续有效。\n[/RECORD.PRESENTATION]';

export function createExtensionPresentationService({document=globalThis.document,getContext,phone,database,books,readMedia=async()=>[],releaseMedia=()=>{},getScope=()=>({}),authorizeRecord,onError=()=>{}}={}){
 if(typeof getContext!=='function')fail('HOST','缺少当前会话读取接口');
 const currentKey=()=>chatKey(getContext());
 const assertKey=key=>{if(currentKey()!==key)fail('CONTEXT_CHANGED','读取历史记录期间会话已切换');};
 async function forMessage(message){
  const raw=String(message?.mes??'');if(!raw.includes('@record'))return null;
  const requests=publicPresentationRequests(document,raw);if(!requests.length)return null;
  const key=currentKey(),scopeSignature=JSON.stringify(getScope()),source=(phone?.source??phoneSource)(message);const own=requests.filter(r=>r.reference.snapshotId==='@message'||r.reference.snapshotId===source.sourceId);
  // A marker may only bind this message's snapshot. Other historical messages
  // must be opened in their own reader; arbitrary cross-history access is denied.
  const frame=phone?.snapshot?await phone.snapshot(source.sourceId):null;assertKey(key);if(message.mes!==raw)fail('MESSAGE_CHANGED','读取历史记录期间消息已改变');
  let projections=phonePresentationProjections(frame,{sourceId:source.sourceId,contextKey:key,requests:own}),media=[],matrixSnapshotId=null;
  if(requests.some(r=>!projections.some(p=>refKey(p.reference)===refKey(r.reference)&&p.kind===r.kind))&&database?.snapshot){
   const historical=await database.snapshot({...source,raw});assertKey(key);
   if(historical){if(historical.uid!==source.uid||historical.hostMessageSha256!==sha256(raw)||historical.sourceId!==source.sourceId)fail('SNAPSHOT_SOURCE','表单快照与本条消息的稳定身份或原文摘要不同');
    matrixSnapshotId=historical.snapshotId;const selected=requests.filter(r=>r.reference.snapshotId==='@message'||r.reference.snapshotId===matrixSnapshotId||r.reference.snapshotId===undefined);
    const mapped=matrixPresentationProjections(historical,{sourceId:matrixSnapshotId,contextKey:key,requests:selected,scope:getScope(),authorizeRecord});
    projections.push(...mapped.projections.filter(p=>!projections.some(old=>refKey(old.reference)===refKey(p.reference)&&old.kind===p.kind)));media.push(...mapped.media);
   }
  }
  let configs={};if(database?.peek){const preferences=await database.peek();assertKey(key);if(preferences){const compiled=await compilePreferences({snapshot:preferences,displayOnly:true});configs=Object.fromEntries(compiled.compiled.map(p=>[p.view,p]));}}
  const ids=[...new Set(projections.flatMap(p=>p.value.resourceId?[p.value.resourceId]:[]))];
  const mediaRequest={ids,snapshot:frame,contextKey:key,messageSource:source};let mediaRead=false,released=false;
  const dispose=()=>{if(released||!mediaRead)return;released=true;return releaseMedia(mediaRequest);};
  try{
   if(ids.length){const actual=await readMedia(mediaRequest);mediaRead=true;assertKey(key);if(!Array.isArray(actual))fail('MEDIA','真实媒体读取接口没有返回列表');for(const r of actual)if(ids.includes(r.id)&&r.allowed===true&&r.contextKey===key&&!media.some(m=>m.id===r.id))media.push(clone(r));}
   for(const p of projections)if(['voice','image'].includes(p.kind)&&p.value.resourceId&&!media.some(m=>m.id===p.value.resourceId))p.value={...p.value,resourceId:null,resourceUnavailable:true};
   if(message.mes!==raw)fail('MESSAGE_CHANGED','读取历史记录期间消息已改变');if(JSON.stringify(getScope())!==scopeSignature)fail('CONTEXT_CHANGED','读取历史记录期间当前主体或世界已变化');
   return {contextKey:key,messageSnapshotId:frame?source.sourceId:matrixSnapshotId,messageReferences:projections.map(p=>({kind:p.kind,...p.reference})),projections,media,configs,dispose};
  }catch(error){try{await dispose();}catch(releaseError){onError(releaseError);}throw error;}
 }
 async function compilePreferences({snapshot,displayOnly=false}={}){
  const key=currentKey(),db=snapshot??await(database?.peek??database?.read)?.();assertKey(key);if(!db)return {compiled:[],prompt:'',contextKey:key,revision:null};if(db.contextKey!==key)fail('CONTEXT','扩展偏好不属于当前聊天');
  const scope=scopeOf(db.state,getScope()),rows=Object.values(db.state.tables?.[EXTENSION_PREFERENCE_TABLE]??{}),selected=rows.filter(row=>{const p=normalizeExtensionPreferences(row);return (p.owner_ref===null||p.owner_ref===scope.ownerId)&&(p.world_ref===null||p.world_ref===scope.worldId)&&(p.output_config_ref===null||p.output_config_ref===scope.outputConfigId);});
  const views=selected.map(row=>normalizeExtensionPreferences(row).view_id);if(new Set(views).size!==views.length)fail('PREFERENCE_AMBIGUOUS','当前区域有多条启用的扩展配置，请明确保留一条');
  if(!selected.length)return {compiled:[],prompt:'',contextKey:key,revision:db.revision};
  const needsBooks=selected.some(row=>{const p=normalizeExtensionPreferences(row);return p.enabled&&(p.style_book!==null||p.extension_book!==null);});if(needsBooks&&!books?.definitions)fail('BOOKS','内置书定义读取接口尚未连接');
  const definitions=needsBooks?[...await books.definitions('beauty'),...await books.definitions('extensions')]:[];assertKey(key);const sourceMaterials=[],seen=new Set();
  for(const row of displayOnly?[]:selected){const p=normalizeExtensionPreferences(row);if(!p.enabled)continue;for(const [role,refs]of [['world',p.world_sources],['audience',p.audience_kind==='none'?[]:p.audience_sources]])for(const source of refs){const id=role+':'+JSON.stringify(source);if(seen.has(id))continue;seen.add(id);
   if(source.kind==='record'){if(source.snapshotId!==undefined||source.revision!==undefined&&source.revision!==db.revision)continue;if(recordVisible(db.state,source.tableId,source.recordId,scope,key,authorizeRecord))sourceMaterials.push({source,role,allowed:true,content:knownValues(db.state.tables[source.tableId][source.recordId])});}
   else if(typeof getContext().loadWorldInfo==='function'){const book=await getContext().loadWorldInfo(source.book);assertKey(key);const entry=Object.values(book?.entries??{}).find(e=>String(e.uid)===source.uid);if(entry&&typeof entry.content==='string'&&sha256(entry.content)===source.digest)sourceMaterials.push({source,role,allowed:true,content:{definition:entry.content,instance:false}});}
  }}
  const compiled=selected.map(row=>{let p=normalizeExtensionPreferences(row);if(displayOnly||!p.enabled)p={...p,world_sources:[],audience_sources:[],generate_count:0};if(!p.enabled)for(const k of ['style_book','style_uid','style_digest','extension_book','extension_uid','extension_digest'])p[k]=null;return compileExtensionPreferences(p,{definitions,context:scope,sourceMaterials});});
  const prompt=compiled.map(c=>c.prompt).filter(Boolean).join('\n');return {compiled,prompt:prompt?[prompt,PRESENTATION_PROMPT_CONTRACT].join('\n'):'',contextKey:key,revision:db.revision};
 }
 return Object.freeze({forMessage,compilePreferences,contract:PRESENTATION_PROMPT_CONTRACT});
}
