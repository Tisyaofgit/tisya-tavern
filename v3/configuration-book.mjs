import {validateConfig,emptyConfig,configuredWorld,worldKey,KEY} from '../config/core.js';
import {BookError} from './books.mjs';
import {projectGlobalConfiguration,persistGlobalConfiguration,validateGlobalConfiguration} from './configuration-scope.mjs';
const copy=v=>v===undefined?undefined:structuredClone(v);
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const check=(ok,code,message,details)=>{if(!ok)throw new BookError(code,message,details);};
const errorValue=e=>({code:e.code??'CONFIGURATION_ERROR',message:e.message});
const CACHE_KEY='tisya_configuration_cache';
const credential=/^(?:api[_-]?key|secret(?:key)?|password|authorization|access[_-]?token|refresh[_-]?token|client[_-]?secret|headers|endpoint|api[_-]?url|base[_-]?url|proxy[_-]?url)$/i;
function noCredentials(value,path=[]){if(!value||typeof value!=='object')return;for(const [key,child]of Object.entries(value)){check(!credential.test(key),'CONFIGURATION_CREDENTIAL','API 密钥、地址及凭据由原生连接管理，配置书只保存连接引用',{path:[...path,key]});noCredentials(child,[...path,key]);}}
function jsonValue(value){const ancestors=new Set();const visit=(item,path=[])=>{if(item===null||typeof item==='string'||typeof item==='boolean')return;if(typeof item==='number'){check(Number.isFinite(item),'CONFIGURATION_VALUE','配置数字必须有限',{path});return;}check(item&&typeof item==='object'&&(Array.isArray(item)||Object.getPrototypeOf(item)===Object.prototype||Object.getPrototypeOf(item)===null),'CONFIGURATION_VALUE','配置仅接受完整 JSON 值',{path});check(!ancestors.has(item),'CONFIGURATION_VALUE','配置不能循环引用',{path});ancestors.add(item);if(Array.isArray(item)){for(let i=0;i<item.length;i++)visit(item[i],[...path,i]);}else for(const [key,child]of Object.entries(item))visit(child,[...path,key]);ancestors.delete(item);};visit(value);return value;}
const expectedOf=s=>({bookId:s.bookId,revision:s.revision,binding:copy(s.binding)});
function validateBindings(rows){check(Array.isArray(rows),'CONFIGURATION_BINDINGS','配置会话索引无效');const ids=new Set();for(const row of rows){check(plain(row)&&['archiveId','chatId','branchId','playerId','key'].every(k=>typeof row[k]==='string'&&row[k]),'CONFIGURATION_BINDINGS','配置缺少稳定的书、用户或会话标识');const identity=JSON.stringify([row.archiveId,row.playerId]);check(!ids.has(identity),'CONFIGURATION_BINDINGS','同一存档与主控角色存在重复配置索引');ids.add(identity);}return rows;}

/** Core-book authority; host settings are a published runtime cache only. */
export function createConfigurationBook({books,store,getContext,getPlayerId,readInterface,applyInterface,validateInterface,domainValidators={},domainCaches={},onApplied,uuid=()=>globalThis.crypto.randomUUID()}={}){
 for(const name of ['readConfiguration','saveConfiguration'])check(typeof books?.[name]==='function','CAPABILITY_UNAVAILABLE','配置书缺少 '+name);
 for(const name of ['read','prepare','save','cacheSnapshot','replaceCache','installAuthority'])check(typeof store?.[name]==='function','CAPABILITY_UNAVAILABLE','配置缓存缺少 '+name);
 check(typeof getContext==='function','CAPABILITY_UNAVAILABLE','配置服务缺少当前会话');
 let state={ready:false,domains:{},versions:[],draft:null,error:null},tail=Promise.resolve(),publishing=false,everHydrated=false,activeKey=null,cacheStamp=null;
 for(const [name,cache]of Object.entries(domainCaches)){check(typeof cache.read==='function'&&typeof cache.apply==='function'&&Object.hasOwn(cache,'defaultValue')&&typeof domainValidators[name]==='function','CAPABILITY_UNAVAILABLE','配置域缓存能力未完整接入：'+name);domainValidators[name](cache.defaultValue);}
 const previews=new Map(),queue=fn=>{const pending=tail.then(fn);tail=pending.catch(()=>{});return pending;};
 const read=()=>copy(state);
 function validateDomain(name,value){jsonValue(value);noCredentials(value);if(name==='configuration')validateConfig(value);else if(name==='interface'){check(typeof validateInterface==='function'&&typeof applyInterface==='function','CAPABILITY_UNAVAILABLE','界面配置保存能力未接入');validateInterface(value);}else{check(typeof domainValidators[name]==='function','CONFIGURATION_DOMAIN','未登记配置域：'+name);domainValidators[name](value);}return value;}
 function validateSnapshot(snapshot){check(plain(snapshot.domains),'CONFIGURATION_DOMAINS','配置域损坏');for(const [name,value]of Object.entries(snapshot.domains))validateDomain(name,value);check(snapshot.domains.configuration,'CONFIGURATION_MISSING','配置书未保存世界配置');validateBindings(snapshot.worldBindings);validateGlobalConfiguration(snapshot.domains.configuration);return snapshot;}
 function liveGuard(){check(state.ready,'CONFIGURATION_NOT_READY','请先选择全局基点并载入配置');const ctx=getContext();check(worldKey(ctx)===activeKey,'CONFIGURATION_SCOPE','会话已切换，请载入当前故事引用');const pointer=ctx.extensionSettings.tisya_v3_global;if(pointer)check(pointer.coreId===state.bookId&&pointer.revision===state.binding.revision,'CONFIGURATION_BINDING','全局基点已切换，请重新载入');}
 function guard({raw,key}){if(publishing)return;liveGuard();check(key===activeKey&&JSON.stringify(raw)===cacheStamp,'CONFIGURATION_CACHE','运行配置缓存已变化，请从配置书重新载入；未覆盖书内版本');if(state.domains.interface!==undefined)check(same(interfaceCache(),state.domains.interface),'CONFIGURATION_CACHE','界面缓存与配置书不一致，请重新载入');for(const [name,cache]of Object.entries(domainCaches))check(same(cache.read(),state.domains[name]??cache.defaultValue),'CONFIGURATION_CACHE','配置域缓存与基点书不一致：'+name);}
 function bindWorld(snapshot,key){return projectGlobalConfiguration(snapshot.domains.configuration,key,getContext());}
 function interfaceCache(){try{return typeof readInterface==='function'?copy(readInterface()):undefined;}catch{return undefined;}}
 function publishGuard(snapshot,key){check(worldKey(getContext())===key,'CONFIGURATION_SCOPE','恢复期间会话已切换');const p=getContext().extensionSettings.tisya_v3_global;if(p)check(p.coreId===snapshot.bookId&&p.revision===snapshot.binding.revision,'CONFIGURATION_BINDING','恢复期间全局基点已切换');}
 async function publish(snapshot){validateSnapshot(snapshot);const key=worldKey(getContext()),data=bindWorld(snapshot,key),old=store.cacheSnapshot(),oldInterface=interfaceCache(),oldMarker=copy(getContext().extensionSettings[CACHE_KEY]),oldDomains=Object.fromEntries(Object.entries(domainCaches).map(([name,cache])=>{try{return [name,copy(cache.read())];}catch{return [name,undefined];}}));
   publishing=true;try{publishGuard(snapshot,key);store.replaceCache(data);if(snapshot.domains.interface!==undefined)await applyInterface(copy(snapshot.domains.interface));for(const [name,cache]of Object.entries(domainCaches)){publishGuard(snapshot,key);await cache.apply(copy(snapshot.domains[name]??cache.defaultValue));}publishGuard(snapshot,key);state={...copy(snapshot),ready:true,draft:null,error:null};activeKey=key;cacheStamp=JSON.stringify(store.cacheSnapshot());getContext().extensionSettings[CACHE_KEY]={bookId:snapshot.bookId,owner:copy(snapshot.owner),binding:copy(snapshot.binding),revision:snapshot.revision};everHydrated=true;previews.clear();if(onApplied)await onApplied(read());publishGuard(snapshot,key);}
   catch(error){let stillHere=false;try{publishGuard(snapshot,key);stillHere=true;}catch{}if(stillHere){if(old!==undefined){try{store.replaceCache(old);}catch{delete getContext().extensionSettings[KEY];}}else delete getContext().extensionSettings[KEY];if(oldMarker===undefined)delete getContext().extensionSettings[CACHE_KEY];else getContext().extensionSettings[CACHE_KEY]=oldMarker;if(oldInterface!==undefined&&applyInterface)try{await applyInterface(oldInterface);}catch{}for(const [name,cache]of Object.entries(domainCaches))if(oldDomains[name]!==undefined)try{await cache.apply(copy(oldDomains[name]));}catch{}}state={...state,ready:false,error:errorValue(error)};throw error;}finally{publishing=false;}return read();
 }
 function worldBindingsFor(snapshot,data){const stored=persistGlobalConfiguration(data,worldKey(getContext()),getContext());for(const key of Object.keys(data))delete data[key];Object.assign(data,stored);return [];}
 function matchesExpected(expected,current){check(expected&&expected.bookId===current.bookId&&same(expected.binding,current.binding),'CONFIGURATION_BINDING','所依据的配置书或资料绑定已改变');check(expected.revision===current.revision,'CONFIGURATION_CONFLICT','配置已有新版本，请重新核对');}
 async function persistDraft(draft){state.draft=copy(draft);state.error=null;try{
   const current=await books.readConfiguration();check(current.bookId===draft.expected.bookId&&same(current.binding,draft.expected.binding),'CONFIGURATION_BINDING','配置保存目标已切换');
   // A lost acknowledgement is resolved by the durable operation receipt.
   const receipt=current.versions.find(v=>v.operationId===draft.operationId);if(!receipt)matchesExpected(draft.expected,current);
   const saved=await books.saveConfiguration({domains:draft.domains,worldBindings:draft.worldBindings,expected:draft.expected,operationId:draft.operationId});return await publish(saved);
 }catch(error){state.draft=copy(draft);state.error=errorValue(error);throw error;}}
 async function hydrateInner({initializeIfMissing=false}={}){check(!state.draft,'CONFIGURATION_DRAFT_PENDING','尚有未完成配置草稿，请重试或明确放弃后再载入');const oldOwner=copy(state.owner);try{
   const current=await books.readConfiguration();if(current.exists)return await publish(validateSnapshot(current));
   check(initializeIfMissing,'CONFIGURATION_MISSING','全局配置尚未建立');
   if(current.initialConfiguration){
     const source=current.initialConfiguration,domains=copy(source.domains),key=worldKey(getContext()),configuration=domains.configuration;
     check(configuration,'CONFIGURATION_MISSING','原配置缺少创作设置，保留原记录');validateConfig(configuration);
     const archiveId=getContext().chatMetadata?.tisya_v3_books?.archiveId;
     const selected=source.worldBindings.find(row=>row.archiveId===archiveId)??source.worldBindings.find(row=>row.archiveId===source.binding?.archiveId);
     check(Object.hasOwn(configuration.worlds,key)||selected&&Object.hasOwn(configuration.worlds,selected.key),'CONFIGURATION_SOURCE_REQUIRED','请打开原配置对应的故事，核对后建立全局配置');
     const currentWorld=copy(configuration.worlds[key]??configuration.worlds[selected.key]);
     // Keep object references for every recorded story; use the selected
     // source's latest settings as the single shared configuration.
     for(const row of source.worldBindings){if(!configuration.worlds[row.key])continue;const scoped=persistGlobalConfiguration(configuration,row.key,{chatMetadata:{tisya_v3_books:{archiveId:row.archiveId}}});configuration.storyBindings=scoped.storyBindings;}
     configuration.worlds[key]=currentWorld;
     for(const [name,value]of Object.entries(domains))validateDomain(name,value);
     return await persistDraft({kind:'initialize',domains,worldBindings:worldBindingsFor(current,configuration),expected:expectedOf(current),operationId:'configuration-global:'+uuid()});
   }
   const key=worldKey(getContext()),raw=store.cacheSnapshot();
   // Explicit first initialization captures current settings once.
   const marker=getContext().extensionSettings[CACHE_KEY],canImportCache=!everHydrated&&(!marker||marker.bookId===current.bookId),useExisting=canImportCache&&raw!==undefined;const configuration=useExisting?copy(validateConfig(raw)):emptyConfig();
   configuration.worlds[key]=configuredWorld(configuration,key);
   const domains={configuration};if(typeof readInterface==='function'&&typeof applyInterface==='function'&&typeof validateInterface==='function'){const value=(canImportCache||same(oldOwner,current.owner))?copy(readInterface()):{联系人分组:{}};validateDomain('interface',value);domains.interface=value;}
   for(const [name,cache]of Object.entries(domainCaches))domains[name]=copy(canImportCache||same(oldOwner,current.owner)?cache.read():cache.defaultValue);
   for(const [name,value]of Object.entries(domains))validateDomain(name,value);
   return await persistDraft({kind:'initialize',domains,worldBindings:worldBindingsFor(current,configuration),expected:expectedOf(current),operationId:'configuration-init:'+uuid()});
 }catch(error){state.ready=false;state.error=errorValue(error);throw error;}}
 async function saveDomains(changes,expected,{operationId='configuration-save:'+uuid()}={}){liveGuard();matchesExpected(expected,state);const current=await books.readConfiguration();matchesExpected(expected,current);validateSnapshot(current);
   const domains=copy(current.domains);for(const [name,value]of Object.entries(changes))domains[name]=copy(validateDomain(name,value));
   // The cache may have a new native chat filename after a rename. Bind by the
   // stable archive ID, and persist the current key with the next real edit.
   if(!Object.hasOwn(changes,'configuration'))domains.configuration=bindWorld(current,worldKey(getContext()));
   return persistDraft({kind:'save',domains,worldBindings:worldBindingsFor(current,domains.configuration),expected:expectedOf(current),operationId});
 }
 const authority={guard,save:async(data,{expected,key})=>queue(async()=>{guard({raw:store.cacheSnapshot(),key});check(JSON.stringify(store.cacheSnapshot())===expected,'CONFIGURATION_CACHE','配置表单依据已变化');return saveDomains({configuration:data},expectedOf(state));})};store.installAuthority(authority);
 return Object.freeze({
   read,assertReady:liveGuard,hydrate:options=>queue(()=>hydrateInner(options)),
   saveDomain:(name,payload,expected,options={})=>queue(async()=>{const candidate={kind:'candidate',changes:{[name]:copy(payload)},expected:expectedOf(expected),operationId:options.operationId??'configuration-save:'+uuid()};try{return await saveDomains(candidate.changes,expected,{operationId:candidate.operationId});}catch(error){if(state.draft?.operationId!==candidate.operationId)state.draft=candidate;state.error=errorValue(error);throw error;}}),
   saveCombined:({configuration,interface:ui,configurationRevision,key},expected,options)=>queue(()=>{
     const current=store.read();const prepared=store.prepare(configuration,configurationRevision??current.revision,key??current.key);return saveDomains({configuration:prepared,...ui!==undefined?{interface:ui}:{}},expected,options);
   }),
   retryDraft:({expected}={})=>queue(async()=>{check(state.draft,'CONFIGURATION_DRAFT','没有待重试的配置草稿');if(expected)check(expected.bookId===state.draft.expected.bookId&&same(expected.binding,state.draft.expected.binding),'CONFIGURATION_BINDING','草稿属于另一资料绑定');const draft=copy(state.draft);return draft.kind==='candidate'?saveDomains(draft.changes,draft.expected,{operationId:draft.operationId}):persistDraft(draft);}),
   discardDraft(){state.draft=null;state.error=null;return read();},
   previewRestore:({revision,expected,domains:requestedDomains})=>queue(async()=>{liveGuard();const current=await books.readConfiguration();matchesExpected(expected,current);const previous=validateSnapshot(await books.readConfiguration({revision}));
     check(same(previous.owner,current.owner)&&previous.bookId===current.bookId,'CONFIGURATION_OWNER','历史配置属于另一全局基点');
     const restoredDomains=requestedDomains??['configuration','interface','worldbookInterface'].filter(name=>Object.hasOwn(current.domains,name)||Object.hasOwn(previous.domains,name));
     check(Array.isArray(restoredDomains)&&restoredDomains.length>0&&new Set(restoredDomains).size===restoredDomains.length&&restoredDomains.every(name=>['configuration','interface'].includes(name)||typeof domainValidators[name]==='function'),'CONFIGURATION_RESTORE_DOMAINS','请明确选择可恢复的配置域');
     const domains=copy(current.domains);for(const name of restoredDomains){if(Object.hasOwn(previous.domains,name))domains[name]=copy(previous.domains[name]);else delete domains[name];}
     const material=current;if(domains.configuration)domains.configuration.storyBindings=copy(current.domains.configuration.storyBindings);domains.configuration=bindWorld({...material,domains},worldKey(getContext()));
     const token=uuid(),preview={token,fromRevision:revision,currentRevision:current.revision,expected:expectedOf(current),restoredDomains:copy(restoredDomains),preservedDomains:Object.keys(current.domains).filter(name=>!restoredDomains.includes(name)),changes:restoredDomains.filter(name=>!same(current.domains[name],domains[name])).map(name=>({domain:name,before:copy(current.domains[name]),after:copy(domains[name])})),domains,worldBindings:worldBindingsFor(material,domains.configuration)};
     previews.set(token,preview);return copy(preview);
   }),
   restore:({token})=>queue(async()=>{const preview=previews.get(token);check(preview,'CONFIGURATION_PREVIEW','恢复预览已失效，请重新核对');liveGuard();const current=await books.readConfiguration();matchesExpected(preview.expected,current);const result=await persistDraft({kind:'restore',domains:preview.domains,worldBindings:preview.worldBindings,expected:preview.expected,operationId:'configuration-restore:'+token});previews.delete(token);return result;}),
   discardRestore({token}){check(previews.delete(token),'CONFIGURATION_PREVIEW','恢复预览不存在');return read();},
 });
}
