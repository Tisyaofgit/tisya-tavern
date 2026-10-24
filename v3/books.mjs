import {validateRow,validateReferences,registryIndex} from '../tables/schema.js';
import {mergeDefinitionRegistries} from './design-schema.mjs';
import {tableRegistry} from './host-runtime.mjs';
/** Three durable worldbooks, one physical-document writer per transport. */
const BOOK = 'tisyaBook';
const NS = 'tisyaNamespace';
const INTENT = 'tisyaBindingIntent';
export const BOOK_FORMAT = 'tisya.book/1';
export const BINDING_FORMAT = 'tisya.archive-binding/1';
export const POINTER_FORMAT = 'tisya.active-binding/1';
export const GLOBAL_POINTER_FORMAT = 'tisya.global-binding/1';
const clone = value => value == null ? value : structuredClone(value);
const stable = value => value && typeof value === 'object' ? Array.isArray(value) ? value.map(stable) : Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
const equal = (a,b) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));
const stamp = value => JSON.stringify(stable(value));
async function fingerprint(value) {
  check(globalThis.crypto?.subtle,'CAPABILITY_UNAVAILABLE','SHA-256 is required for draft identity',{capability:'crypto.subtle'});
  const bytes=await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(stamp(value??null)));
  return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
const plain = value => value && typeof value === 'object' && !Array.isArray(value);
export class BookError extends Error {
  constructor(code,message,details={}) { super(message); this.name='BookError'; this.code=code; this.details=details; }
}
const check = (ok,code,message,details) => { if(!ok) throw new BookError(code,message,details); };
const text = (value,label) => { check(typeof value==='string' && value.trim() && value.length<=300,'INVALID_ID',`${label} must be a nonempty string`); return value; };
const validOwner = owner => plain(owner) && typeof owner.chatId==='string' && owner.chatId && typeof owner.branchId==='string' && owner.branchId;
const prefKey = owner => { check(plain(owner)&&['account','player'].includes(owner.kind),'PREFERENCE_OWNER','Preference owner kind must be account or player'); return `${owner.kind}:${text(owner.id,'Preference owner ID')}`; };
const disabled = entry => entry?.disable===true && entry.constant===false && entry.probability===0 && entry.key?.length===0 && entry.keysecondary?.length===0;
function makePrivate(entry,comment) { Object.assign(entry,{comment,disable:true,constant:false,vectorized:false,key:[],keysecondary:[],probability:0,useProbability:true,excludeRecursion:true,preventRecursion:true}); return entry; }
function document(data) { check(plain(data)&&plain(data.entries),'BOOK_DOCUMENT','Worldbook must have an entries object'); return data; }
const coordinators = new WeakMap();
function coordinator(transport) {
  if(!coordinators.has(transport)) coordinators.set(transport,{tails:new Map(),reserved:new Map()});
  return coordinators.get(transport);
}
function serial(coordinate,name,work) {
  const task=(coordinate.tails.get(name)??Promise.resolve()).then(work);
  const tail=task.catch(()=>{}); coordinate.tails.set(name,tail);
  tail.finally(()=>{if(coordinate.tails.get(name)===tail)coordinate.tails.delete(name);});
  return task;
}
function parseManifest(data,name) {
  const found=Object.values(data?.entries??{}).filter(entry=>entry?.extensions?.[BOOK]);
  check(found.length<=1,'DUPLICATE_MANIFEST','Worldbook has multiple managed manifests',{name});
  if(!found.length) return null;
  const wire=found[0]; check(disabled(wire),'MANIFEST_ACTIVATION','Book manifest must remain disabled',{name});
  let value; try { value=JSON.parse(wire.content); } catch { throw new BookError('MANIFEST_JSON','Book manifest is not valid JSON',{name}); }
  check(value?.format===BOOK_FORMAT && ['archive','origin','core'].includes(value.kind) && typeof value.id==='string' && Number.isSafeInteger(value.revision) && value.revision>=0,'MANIFEST_FORMAT','Invalid managed book manifest',{name});
  check(wire.extensions[BOOK].id===value.id,'MANIFEST_ID','Manifest identity differs from its marker',{name});
  text(value.displayName,'Book display name');
  return {wire,value,physicalName:name};
}
function publicBook(record) { if(!record)return null; const v=record.value; return {id:v.id,kind:v.kind,displayName:v.displayName,revision:v.revision,physicalName:record.physicalName,...v.kind==='core'?{playerIds:clone(v.playerIds??[])}:{},...v.binding?.owner?{owner:clone(v.binding.owner)}:{},definitions:(v.definitions??[]).map(({id,revision,name})=>({id,revision,...name?{name}:{}}))}; }
function definitionRegistry(record,ref) {
  if(!ref.definitionId)return null;
  const definition=(record.value.definitions??[]).find(d=>d.id===ref.definitionId&&d.revision===ref.revision);
  check(definition,'DEFINITION_MISSING','Selected definition revision is absent',{ref});
  return definition.registry?clone(definition.registry):null;
}
function definitionRows(record,ref) {
  if(!ref.definitionId)return [];
  check(Number.isSafeInteger(ref.revision)&&ref.revision>=0,'DEFINITION_REVISION','Selected definition requires an exact revision');
  const matches=(record.value.definitions??[]).filter(d=>d.id===ref.definitionId&&d.revision===ref.revision);
  check(matches.length===1,'DEFINITION_MISSING','Selected definition revision is absent',{ref});
  check(Array.isArray(matches[0].rows),'DEFINITION_ROWS','Definition rows must be an array');
  return clone(matches[0].rows);
}
function mergeRows(...groups) {
  const rows=new Map();
  for(const group of groups)for(const row of group){text(row?.id,'Initial row ID');check(!rows.has(row.id)||equal(rows.get(row.id),row),'INITIAL_ROW_CONFLICT','Selected definitions contain different rows with the same ID',{id:row.id});rows.set(row.id,clone(row));}
  return [...rows.values()];
}
/** Definitions are reusable material; existing ledger facts remain authoritative. */
export async function compareDefinitionRows({definitionRows,currentRows,sources=[]}) {
  check(Array.isArray(definitionRows)&&Array.isArray(currentRows),'DEFINITION_ROWS','Definition comparison requires row arrays');
  const current=new Map(currentRows.map(row=>[row.id,row])),conflicts=[];
  for(const row of definitionRows){const existing=current.get(row.id);if(!existing)continue;
    const paths=[['table'],...Object.keys(row.values??{})].map(key=>Array.isArray(key)?key:['values',key]);
    for(const path of paths){const read=object=>path.reduce((v,key)=>v?.[key],object),defined=read(row),known=read(existing);if(known===undefined||equal(defined,known))continue;
      const conflict={id:JSON.stringify([row.id,path]),rowId:row.id,table:existing.table,path,hasDefinition:defined!==undefined,hasCurrent:known!==undefined,...defined!==undefined?{definitionValue:clone(defined)}:{},...known!==undefined?{currentValue:clone(known)}:{},sources:clone(sources.filter(source=>source.rowIds.includes(row.id))),resolution:'current-ledger'};
      conflict.fingerprint=await fingerprint(conflict);conflicts.push(conflict);
    }
  }return conflicts;
}

/**
 * Required host functions: transport.readFresh/save/createEntry, listNames,
 * getContext, assertIdle, saveMetadata, readMetadata. Context is
 * {owner:{chatId,branchId},playerId?,epoch?,draft?}. Metadata functions operate
 * on this plugin's pointer only. Native checkpoints are host locators/receipts.
 */
export function createBookManager(options) {
  const {transport,listNames,getContext,assertIdle,saveMetadata,readMetadata,
    saveCurrentBranch,activateChat,activateUser,restoreNative,readNative,invalidate,projectLedger,readGlobalMetadata,saveGlobalMetadata,requireChatLocator=false,
    registry=tableRegistry,now=()=>new Date().toISOString(),uuid=()=>globalThis.crypto.randomUUID()}=options;
  for(const [key,value] of Object.entries({listNames,getContext,assertIdle,saveMetadata,readMetadata}))check(typeof value==='function','CAPABILITY_UNAVAILABLE',`Book manager requires ${key}`,{capability:key});
  for(const key of ['readFresh','save','createEntry'])check(typeof transport?.[key]==='function','CAPABILITY_UNAVAILABLE',`Worldbook transport requires ${key}`,{capability:key});
  const coordinate=coordinator(transport), index=new Map(), observed=new Map(), fullCache=new Map(), routes=new Map(), viewSnapshots=new WeakMap();
  registryIndex(registry);
  let opTail=Promise.resolve();
  const operation=work=>{const task=opTail.then(work);opTail=task.catch(()=>{});return task;};
  const capability=(name,fn)=>{check(typeof fn==='function','CAPABILITY_UNAVAILABLE',`${name} is unavailable`,{capability:name});return fn;};
  const context=()=>{const c=getContext();check(validOwner(c?.owner),'HOST_OWNER','Stable chat and branch IDs are unavailable');return clone(c);};
  function guardContext(c,{player=true}={}) {const a=context();check(equal(a.owner,c.owner)&&equal(a.epoch,c.epoch)&&(!player||equal(a.playerId,c.playerId)),'CONTEXT_CHANGED','Active chat, branch or player changed during the operation');}
  async function idle(){const result=await assertIdle();check(result!==false,'BUSY','Finish the current generation before changing a binding');}
  async function scan() {
    const names=await listNames();check(Array.isArray(names)&&names.every(n=>typeof n==='string'),'BOOK_NAMES','Worldbook inventory must be a list of physical names');
    const next=new Map();
    for(const name of [...new Set(names)]){const data=await transport.readFresh(name);if(data===null)continue;document(data);const record=parseManifest(data,name);if(!record)continue;check(!next.has(record.value.id),'DUPLICATE_BOOK_ID','Managed book ID appears in multiple physical books',{id:record.value.id});next.set(record.value.id,record);fullCache.set(name,clone(data));}
    index.clear();for(const [id,record]of next)index.set(id,record);return [...index.values()];
  }
  async function load(id,kind) {
    text(id,'Book ID');if(!index.has(id))await scan();const cached=index.get(id);check(cached,'BOOK_MISSING','Selected managed book does not exist',{id});
    const data=await transport.readFresh(cached.physicalName);check(data,'BOOK_MISSING','Managed worldbook is missing',{id});document(data);const record=parseManifest(data,cached.physicalName);
    check(record?.value.id===id,'BOOK_ID_CHANGED','Physical worldbook identity changed',{id});if(kind)check(record.value.kind===kind,'BOOK_KIND',`Expected ${kind} book`,{id});index.set(id,record);fullCache.set(record.physicalName,clone(data));return {...record,data};
  }
  function allocate(name,data) {
    const entry=transport.createEntry(name,data);check(entry&&Number.isSafeInteger(entry.uid)&&entry.uid>=0,'WORLD_UID','Host did not allocate a valid worldbook UID');
    check(data.entries[String(entry.uid)]===entry,'WORLD_UID','Host entry factory must add and return its new entry');return entry;
  }
  async function writeManifest(id,expectedRevision,mutate) {
    const known=await load(id);
    return serial(coordinate,known.physicalName,async()=>{
      const current=await load(id);check(current.value.revision===expectedRevision,'BOOK_CONFLICT','Book revision changed',{id,expectedRevision,actualRevision:current.value.revision});
      const next=clone(current.value);await mutate(next);next.revision=current.value.revision+1;next.updatedAt=now();
      current.wire.content=JSON.stringify(next);await transport.save(current.physicalName,current.data);
      const actual=await load(id);check(equal(actual.value,next),'BOOK_READBACK','Book readback differs from its write',{id});return actual;
    });
  }
  async function selected(ref,kind) {
    check(plain(ref),'BINDING_REFERENCE',`${kind} selection is required`);const record=await load(ref.bookId,kind);const clean={bookId:record.value.id};
    if(ref.definitionId!==undefined){clean.definitionId=text(ref.definitionId,'Definition ID');clean.revision=ref.revision;}
    definitionRows(record,clean);return {record,ref:clean};
  }
  function playerValue(player) {check(plain(player),'PLAYER_REQUIRED','Select a player explicitly');text(player.id,'Player ID');return clone(player);}
  async function initialFor(binding) {
    const origin=await selected(binding.origin,'origin'),core=await selected(binding.core,'core');
    const rows=mergeRows(definitionRows(origin.record,origin.ref),definitionRows(core.record,core.ref));
    validateDefinitionRows(rows,mergeDefinitionRegistries(registry,definitionRegistry(origin.record,origin.ref),definitionRegistry(core.record,core.ref)));
    if(binding.player.objectId)check(rows.some(row=>row.id===binding.player.objectId),'PLAYER_OBJECT','Selected player object is absent from the chosen definitions');
    return rows;
  }
  function validateDefinitionRows(rows,definitionRegistry=registry) {
    check(Array.isArray(rows),'DEFINITION_ROWS','Definition rows must be an array');const ids=new Set();
    for(const row of rows){check(!ids.has(row?.id),'DUPLICATE_ROW','Definition contains duplicate row IDs',{id:row?.id});ids.add(row?.id);check(!['native_cells','preferences'].includes(row?.table)&&!row?.values?.原生引用,'DEFINITION_AUTHORITY','Native values and confirmed preferences retain their own authority');validateRow(definitionRegistry,row);check(Number.isSafeInteger(row.rev)&&row.rev>0,'ROW_REVISION','Definition rows require a positive row revision');}
    validateReferences(rows,definitionRegistry);for(const row of rows){for(const id of row.access.readers)check(id==='读者'||ids.has(id),'DEFINITION_ACCESS_REFERENCE','Definition reader must be the registered reader token or an included object',{rowId:row.id,id});for(const id of row.access.knowers)check(ids.has(id),'DEFINITION_ACCESS_REFERENCE','Definition knower must be inside the complete row set',{rowId:row.id,id});}
  }
  async function materialFor(record,binding,currentRows) {
    const origin=await selected(binding.origin,'origin'),core=await selected(binding.core,'core');
    const sources=[['origin',origin],['core',core]].filter(([,entry])=>entry.ref.definitionId).map(([kind,entry])=>({kind,...clone(entry.ref),rowIds:definitionRows(entry.record,entry.ref).map(row=>row.id)}));
    const rows=mergeRows(definitionRows(origin.record,origin.ref),definitionRows(core.record,core.ref));
    if(currentRows===undefined){
      const logical=`tisya:tables:${record.value.id}`,entries=Object.values(namespace(logical,record.data));check(entries.length<=1,'DUPLICATE_LEDGER','Archive has multiple branch ledger entries');
      if(entries.length){check(disabled(entries[0]),'LEDGER_ACTIVATION','Branch ledger must remain disabled');check(equal(entries[0].extensions?.tisyaTableLedger?.owner,binding.owner),'LEDGER_OWNER','Branch ledger belongs to another owner');let state;try{state=JSON.parse(entries[0].content);}catch{throw new BookError('LEDGER_FORMAT','Branch ledger is not JSON');}
        const selectedRegistry=mergeDefinitionRegistries(registry,definitionRegistry(origin.record,origin.ref),definitionRegistry(core.record,core.ref));for(const prior of [state.baseView?.registry,state.definitionRegistry,...(state.commits??[]).filter(commit=>commit.registry).map(commit=>commit.registry)].filter(Boolean))mergeDefinitionRegistries(prior,selectedRegistry);
        const result=await capability('projectLedger',projectLedger)({state,owner:clone(binding.owner),archiveId:record.value.id,locator:clone(binding.locator)});currentRows=Array.isArray(result)?result:result?.rows;check(Array.isArray(currentRows),'LEDGER_PROJECTION','Ledger projection must return current retained rows');
      }else currentRows=[];
    }
    return {selectedDefinitionRows:rows,selectedDefinitionSources:sources,definitionConflicts:await compareDefinitionRows({definitionRows:rows,currentRows,sources})};
  }
  async function globalBinding() {
    const pointer=await capability('readGlobalMetadata',readGlobalMetadata)();
    if(pointer===null)return {pointer:null,core:null};
    check(pointer?.format===GLOBAL_POINTER_FORMAT&&typeof pointer.coreId==='string'&&Number.isSafeInteger(pointer.revision)&&pointer.revision>0,'GLOBAL_POINTER','全局基点指针无效');
    return {pointer:clone(pointer),core:publicBook(await load(pointer.coreId,'core'))};
  }
  async function selectGlobalCore({coreId,expectedRevision,operationId}) {
    await idle();text(operationId,'Operation ID');const core=await load(coreId,'core'),before=await globalBinding();
    if(before.pointer?.operationId===operationId){check(before.pointer.coreId===coreId,'OPERATION_CONFLICT','全局基点操作编号被用于其他书');return before;}
    check((before.pointer?.revision??null)===expectedRevision,'GLOBAL_CONFLICT','全局基点已变化，请重新载入');
    if(before.pointer?.coreId===coreId)return before;
    const pointer={format:GLOBAL_POINTER_FORMAT,coreId:core.value.id,revision:(before.pointer?.revision??0)+1,operationId};
    let failure;try{await capability('saveGlobalMetadata',saveGlobalMetadata)(pointer,{expected:before.pointer,operationId});}catch(error){failure=error;}
    const actual=await globalBinding();if(!equal(actual.pointer,pointer)){if(failure)throw failure;throw new BookError('GLOBAL_READBACK','全局基点保存未获回执');}
    return actual;
  }
  async function preference(owner,fallbackCore,{register=true}={}) {
    const key=prefKey(owner);owner={kind:owner.kind,id:owner.id};
    return serial(coordinate,`preference-owner:${key}`,async()=>{
      const core=await load(fallbackCore,'core');
      if(!(core.value.preferenceOwners??[]).some(o=>prefKey(o)===key)&&register)
        await writeManifest(core.value.id,core.value.revision,next=>{next.preferenceOwners=[...(next.preferenceOwners??[]),clone(owner)];});
      return {bookId:core.value.id,owner:clone(owner)};
    });
  }
  async function registerPlayer(coreId,player){
    const core=await load(coreId,'core');
    if((core.value.playerIds??[]).includes(player.id))return;
    await writeManifest(coreId,core.value.revision,next=>{next.playerIds=[...(next.playerIds??[]),player.id];});
  }
  function checkPlayerPreference(player,owner) {prefKey(owner);check(owner.kind!=='player'||owner.id===player.id,'PREFERENCE_PLAYER','Player preference owner must match the selected player');}
  async function runtimeBinding() {
    const pointer=await readMetadata();if(pointer==null)return {pointer:null,binding:null,archive:null};
    check(pointer.format===POINTER_FORMAT&&typeof pointer.archiveId==='string'&&Number.isSafeInteger(pointer.bindingRevision),'POINTER_FORMAT','Active book pointer has an invalid format');
    const archive=await load(pointer.archiveId,'archive');const binding=archive.value.binding;
    check(binding?.format===BINDING_FORMAT&&binding.revision===pointer.bindingRevision,'BINDING_INCOMPLETE','Binding commit needs recovery; the active pointer and archive revision differ',{pointer,actualRevision:binding?.revision});
    return {pointer:clone(pointer),binding:clone(binding),archive:publicBook(archive)};
  }
  function namespace(logical,data) {return Object.fromEntries(Object.entries(data?.entries??{}).filter(([,entry])=>entry.extensions?.[NS]?.logicalId===logical));}
  function routeFor(logical) {const route=routes.get(logical);check(route,'UNKNOWN_LOGICAL_BOOK','Logical book has not been bound by readRuntime',{logical});return route;}
  function assertNamespace(logical,entry) {
    const route=routeFor(logical);check(entry.extensions?.[NS]?.logicalId===logical,'NAMESPACE_ESCAPE','An entry belongs to another namespace');
    check(disabled(entry),'NAMESPACE_ACTIVATION','Private runtime entries must remain disabled');
    if(route.kind==='originals')check(entry.extensions?.tisyaOriginal?.bookId===logical,'ORIGINAL_NAMESPACE','Original book identity must equal its logical book ID');
    else {check(entry.extensions?.tisyaTableLedger?.schema==='tisya.ledger-storage/1','LEDGER_NAMESPACE','Runtime ledger marker is missing');check(equal(entry.extensions.tisyaTableLedger.owner,route.ledgerOwner),'LEDGER_OWNER','Runtime ledger owner differs from the selected binding');}
  }
  const virtualTransport=Object.freeze({
    capabilities:Object.freeze({managedSingleWriter:true,conditionalWrites:false,consistencyScope:'shared-transport-single-controller',crossWindowAtomicity:false}),
    async readFresh(logical){const route=routeFor(logical),record=await load(route.physicalId);const entries=namespace(logical,record.data);for(const entry of Object.values(entries))assertNamespace(logical,entry);observed.set(logical,stamp(entries));const view={entries:clone(entries)};viewSnapshots.set(view,{logical,stamp:stamp(entries)});return view;},
    createEntry(logical,data){
      const route=routeFor(logical);document(data);check(viewSnapshots.get(data)?.logical===logical,'READ_BEFORE_WRITE','Read this logical view before allocating an entry');
      const cached=fullCache.get(route.physicalName);check(cached,'READ_BEFORE_WRITE','Read the physical book before allocating an entry');const shadow=clone(cached);
      const reservations=coordinate.reserved.get(route.physicalName)??new Map();coordinate.reserved.set(route.physicalName,reservations);
      for(const [uid,wire]of reservations)shadow.entries[uid]=clone(wire);
      const entry=allocate(route.physicalName,shadow);entry.extensions={...(entry.extensions??{}),[NS]:{format:'tisya.namespace/1',logicalId:logical,kind:route.kind}};
      check(!data.entries[String(entry.uid)],'WORLD_UID_COLLISION','Host allocated an existing logical UID');data.entries[String(entry.uid)]=entry;reservations.set(String(entry.uid),clone(entry));return entry;
    },
    async save(logical,data,lease){
      const route=routeFor(logical);document(data);check(viewSnapshots.get(data)?.logical===logical,'READ_BEFORE_WRITE','Read this logical namespace view before writing it');
      for(const [uid,entry]of Object.entries(data.entries)){check(String(entry.uid)===uid,'WORLD_UID','Entry UID differs from its dictionary key');assertNamespace(logical,entry);}
      const expected=viewSnapshots.get(data).stamp,desired=clone(data.entries);
      return serial(coordinate,route.physicalName,async()=>{
        const current=await load(route.physicalId),existing=namespace(logical,current.data);check(stamp(existing)===expected,'NAMESPACE_CONFLICT','Logical namespace changed after it was read',{logical});
        const next=clone(current.data);for(const uid of Object.keys(existing))delete next.entries[uid];
        for(const [uid,entry]of Object.entries(desired)){check(!next.entries[uid],'WORLD_UID_COLLISION','UID belongs to a different namespace',{uid,logical});next.entries[uid]=entry;}
        if(lease)await lease();await transport.save(route.physicalName,next);const readback=await load(route.physicalId);check(equal(readback.data,next),'NAMESPACE_READBACK','Physical book readback differs from merged write',{logical});observed.set(logical,stamp(desired));viewSnapshots.set(data,{logical,stamp:stamp(desired)});
        const reservations=coordinate.reserved.get(route.physicalName);for(const uid of Object.keys(desired))reservations?.delete(uid);
      });
    },
  });
  function addRoute(logical,record,kind,ledgerOwner){const route={logical,physicalId:record.value.id,physicalName:record.physicalName,kind,ledgerOwner:clone(ledgerOwner)};const old=routes.get(logical);check(!old||equal(old,route),'ROUTE_REBIND','A stable logical book cannot be rebound');routes.set(logical,route);return logical;}
  async function readRuntime({currentRows}={}) {
    const active=await runtimeBinding();check(active.binding,'UNBOUND','Select an archive before starting generation');const c=context();check(equal(active.binding.owner,c.owner),'BINDING_OWNER','The selected archive belongs to another chat or branch');
    check(c.playerId===undefined||c.playerId===active.binding.player.id,'BINDING_PLAYER','Native player differs from the archive binding');
    const archive=await load(active.archive.id,'archive'),origin=await selected(active.binding.origin,'origin'),core=await selected(active.binding.core,'core');
    const global=await globalBinding();check(global.core,'GLOBAL_UNBOUND','请先选择全局基点书');
    const pref=await preference(active.binding.preference.owner,global.core.id);await registerPlayer(global.core.id,active.binding.player);checkPlayerPreference(active.binding.player,pref?.owner);const prefBook=await load(pref.bookId,'core');check((prefBook.value.preferenceOwners??[]).some(o=>equal(o,pref.owner)),'PREFERENCE_BINDING','Preference owner is not registered in the bound core book');
    const priorPreferenceId=Object.values(prefBook.data.entries).map(e=>e.extensions?.[NS]?.logicalId).find(id=>id===`tisya:preferences:${prefKey(pref.owner)}`);
    const books={originals:addRoute(`tisya:originals:${archive.value.id}`,archive,'originals'),tables:addRoute(`tisya:tables:${archive.value.id}`,archive,'tables',active.binding.owner),preferences:addRoute(priorPreferenceId??`tisya:preferences:${pref.bookId}:${prefKey(pref.owner)}`,prefBook,'preferences',{chatId:'tisya-preferences',branchId:'global'})};
    const initialRegistry=mergeDefinitionRegistries(registry,definitionRegistry(origin.record,origin.ref),definitionRegistry(core.record,core.ref)),initialRows=mergeRows(definitionRows(origin.record,origin.ref),definitionRows(core.record,core.ref));validateDefinitionRows(initialRows,initialRegistry);
    if(active.binding.player.objectId)check(initialRows.some(row=>row.id===active.binding.player.objectId),'PLAYER_OBJECT','Selected player object is absent from the chosen definitions');
    const leaseContext=context();
    const lease=async()=>{guardContext(leaseContext);check(equal((await globalBinding()).pointer,global.pointer),'GLOBAL_CHANGED','全局基点已切换');check(equal(await readMetadata(),active.pointer),'RUNTIME_BINDING_CHANGED','This runtime belongs to an earlier binding');};
    const scopedTransport=Object.freeze({capabilities:virtualTransport.capabilities,
      readFresh:async logical=>{await lease();check(Object.values(books).includes(logical),'RUNTIME_BOOK','Logical book is outside this runtime');return virtualTransport.readFresh(logical);},
      createEntry:(logical,data)=>{guardContext(leaseContext);check(Object.values(books).includes(logical),'RUNTIME_BOOK','Logical book is outside this runtime');return virtualTransport.createEntry(logical,data);},
      save:async(logical,data)=>{await lease();check(Object.values(books).includes(logical),'RUNTIME_BOOK','Logical book is outside this runtime');return virtualTransport.save(logical,data,lease);},
    });
    const material=await materialFor(archive,active.binding,currentRows);
    return {archive:publicBook(archive),origin:{...publicBook(origin.record),selection:origin.ref},core:{...publicBook(core.record),selection:core.ref},player:clone(active.binding.player),preferenceOwner:clone(pref.owner),preferenceBookId:pref.bookId,owner:clone(active.binding.owner),bindingRevision:active.binding.revision,books,transport:scopedTransport,initialRows,initialRegistry,...material};
  }
  async function create(request) {
    await idle();const {kind,name,operationId}=request;const captured=kind==='core'?null:context(),guardCreation=()=>{if(captured)guardContext(captured);};check(['archive','origin','core'].includes(kind),'BOOK_KIND','Book kind must be archive, origin or core');text(name,'Book name');text(operationId,'Operation ID');
    const records=await scan();const duplicate=records.find(r=>r.value.creationOperation===operationId);
    const creationFingerprint=await fingerprint(request);
    if(duplicate){check(duplicate.value.creationFingerprint===creationFingerprint,'OPERATION_CONFLICT','Operation ID was reused with different creation data');return publicBook(duplicate);}
    const value={format:BOOK_FORMAT,id:`${kind}:${uuid()}`,kind,displayName:name,revision:0,createdAt:now(),updatedAt:now(),creationOperation:operationId,creationFingerprint,definitions:clone(request.definitions??[])};
    check(Array.isArray(value.definitions)&&value.definitions.every(d=>plain(d)&&typeof d.id==='string'&&Number.isSafeInteger(d.revision)&&d.revision>=0&&Array.isArray(d.rows)),'DEFINITION_FORMAT','Definitions require id, revision and rows');
    for(const definition of value.definitions){if(definition.registry)definition.registry=mergeDefinitionRegistries(registry,definition.registry);validateDefinitionRows(definition.rows,definition.registry??registry);}
    const keys=value.definitions.map(d=>`${d.id}@${d.revision}`);check(new Set(keys).size===keys.length,'DUPLICATE_DEFINITION','Definition IDs and revisions must be unique');
    if(kind==='archive'){
      const owner=clone(request.owner??captured.owner);check(validOwner(owner),'ARCHIVE_OWNER','Archive requires a stable chat and branch owner');
      const origin=await selected(request.origin,'origin'),core=await selected(request.core,'core'),player=playerValue(request.player);checkPlayerPreference(player,request.preferenceOwner);
      value.binding={format:BINDING_FORMAT,revision:0,owner,origin:origin.ref,core:core.ref,player};
      if(request.locator!==undefined)value.binding.locator=clone(request.locator);else if(equal(owner,captured.owner)&&captured.locator)value.binding.locator=clone(captured.locator);
      await initialFor(value.binding);
      value.binding.preference=await preference(request.preferenceOwner,core.record.value.id);
      await registerPlayer(core.record.value.id,player);
      if(request.nativeCheckpoint!==undefined)value.nativeCheckpoint=clone(request.nativeCheckpoint);
      else if(equal(owner,captured.owner)&&typeof readNative==='function')value.nativeCheckpoint=clone(await readNative({owner}));
      if(request.forkOf!==undefined)value.forkOf=clone(request.forkOf);
    }
    guardCreation();const physicalName=`Tisya-${value.id.replace(':','-')}`;
    return serial(coordinate,physicalName,async()=>{
      check(await transport.readFresh(physicalName)===null,'BOOK_EXISTS','资料书已经存在，未覆盖；请重新读取目录后选择已有资料');const data={entries:{}};const entry=makePrivate(allocate(physicalName,data),'Tisya book');entry.extensions={...(entry.extensions??{}),[BOOK]:{id:value.id,format:BOOK_FORMAT}};entry.content=JSON.stringify(value);
      guardCreation();await transport.save(physicalName,data);const actualData=await transport.readFresh(physicalName);check(equal(actualData,data),'BOOK_READBACK','New book readback differs from write');const record=parseManifest(actualData,physicalName);index.set(value.id,record);fullCache.set(physicalName,clone(actualData));return publicBook(record);
    });
  }
  async function rename({id,name,expectedRevision,operationId}) {
    await idle();const captured=getContext()?.owner?context():null;text(name,'Book name');text(operationId,'Operation ID');const current=await load(id);
    const receipt=current.value.operations?.[operationId];if(receipt){check(receipt.kind==='rename'&&receipt.name===name,'OPERATION_CONFLICT','Operation ID was reused with a different rename');return publicBook(current);}
    check(Number.isSafeInteger(expectedRevision),'EXPECTED_REVISION','Rename requires the observed book revision');
    const next=await writeManifest(id,expectedRevision,value=>{if(captured)guardContext(captured);value.displayName=name;value.operations={...(value.operations??{}),[operationId]:{kind:'rename',name}};});return publicBook(next);
  }
  async function saveDefinition(request) {
    await idle();const captured=context(),{bookId,expectedBookRevision,expectedDefinitionRevision,name,rows,operationId}=request;text(operationId,'Operation ID');text(name,'Definition name');const definitionRegistry=request.registry?mergeDefinitionRegistries(registry,request.registry):registry;validateDefinitionRows(rows,definitionRegistry);
    const current=await load(bookId);check(['origin','core'].includes(current.value.kind),'BOOK_KIND','Definitions belong in origin or core books');const requestFingerprint=await fingerprint(request),receipt=current.value.operations?.[operationId];
    if(receipt){check(receipt.kind==='definition'&&receipt.fingerprint===requestFingerprint,'OPERATION_CONFLICT','Definition operation ID was reused with different content');return readDefinition({bookId,definitionId:receipt.definitionId,revision:receipt.revision});}
    check(Number.isSafeInteger(expectedBookRevision),'EXPECTED_REVISION','Saving a definition requires the observed book revision');const definitionId=request.definitionId??`definition:${uuid()}`;text(definitionId,'Definition ID');
    const previous=(current.value.definitions??[]).filter(d=>d.id===definitionId),latest=previous.reduce((max,d)=>Math.max(max,d.revision),0);
    check(previous.length?expectedDefinitionRevision===latest:expectedDefinitionRevision===undefined||expectedDefinitionRevision===null,'DEFINITION_CONFLICT','Definition revision changed',{definitionId,expectedDefinitionRevision,actualRevision:latest});
    const revision=latest+1,definition={id:definitionId,revision,name,rows:clone(rows),...(request.registry?{registry:clone(definitionRegistry)}:{}),createdAt:now()};
    await writeManifest(bookId,expectedBookRevision,next=>{guardContext(captured);next.definitions=[...(next.definitions??[]),definition];next.operations={...(next.operations??{}),[operationId]:{kind:'definition',definitionId,revision,fingerprint:requestFingerprint}};});
    return readDefinition({bookId,definitionId,revision});
  }
  async function readDefinition({bookId,definitionId,revision}) {
    const record=await load(bookId);check(['origin','core'].includes(record.value.kind),'BOOK_KIND','Definitions belong in origin or core books');text(definitionId,'Definition ID');check(Number.isSafeInteger(revision)&&revision>=0,'DEFINITION_REVISION','Read an exact definition revision');const matches=(record.value.definitions??[]).filter(d=>d.id===definitionId&&d.revision===revision);check(matches.length===1,'DEFINITION_MISSING','Definition revision does not exist');
    return {bookId,bookRevision:record.value.revision,kind:record.value.kind,definitionId,revision,name:matches[0].name??definitionId,rows:clone(matches[0].rows),...(matches[0].registry?{registry:clone(matches[0].registry)}:{})};
  }
  function intentEntry(data,id) {const matches=Object.values(data.entries).filter(e=>e.extensions?.[INTENT]?.id===id);check(matches.length<=1,'DUPLICATE_INTENT','Duplicate binding intent');return matches[0]??null;}
  async function putIntent(archiveId,intent) {
    const record=await load(archiveId);
    return serial(coordinate,record.physicalName,async()=>{const current=await load(archiveId),existing=intentEntry(current.data,intent.id);let saved=null;if(existing){try{saved=JSON.parse(existing.content);}catch{throw new BookError('INTENT_FORMAT','Binding intent is not JSON');}}
      check((saved?.version??0)===(intent.version??0),'INTENT_CONFLICT','Binding intent was changed by another writer',{id:intent.id});
      const next={...clone(intent),version:(intent.version??0)+1};const wire=existing??makePrivate(allocate(current.physicalName,current.data),'Tisya binding intent');wire.extensions={...(wire.extensions??{}),[INTENT]:{id:intent.id}};wire.content=JSON.stringify(next);await transport.save(current.physicalName,current.data);const actual=await load(archiveId);check(intentEntry(actual.data,intent.id)?.content===wire.content,'INTENT_READBACK','Binding intent readback differs');Object.assign(intent,next);return clone(next);});
  }
  async function findIntent(id) {for(const record of await scan()){if(record.value.kind!=='archive')continue;const loaded=await load(record.value.id),wire=intentEntry(loaded.data,id);if(wire){check(disabled(wire),'INTENT_ACTIVATION','Binding intent must remain disabled');try{return {archiveId:record.value.id,intent:JSON.parse(wire.content)};}catch{throw new BookError('INTENT_FORMAT','Binding intent is not JSON');}}}return null;}
  async function pending() {
    const result=[];for(const record of await scan()){if(record.value.kind!=='archive')continue;const loaded=await load(record.value.id);
      for(const entry of Object.values(loaded.data.entries)){if(!entry.extensions?.[INTENT])continue;check(disabled(entry),'INTENT_ACTIVATION','Binding intent must remain disabled');let intent;try{intent=JSON.parse(entry.content);}catch{throw new BookError('INTENT_FORMAT','Binding intent is not JSON');}
        check(intent?.format==='tisya.binding-intent/1'&&intent.id===entry.extensions[INTENT].id,'INTENT_FORMAT','Binding intent identity is invalid');if(intent.phase!=='complete')result.push({archiveId:record.value.id,...clone(intent)});
      }
    }return result;
  }
  async function select(request) {
    await idle();text(request.operationId,'Operation ID');const prior=await findIntent(request.operationId);
    if(prior){check(equal(prior.intent.request,request),'OPERATION_CONFLICT','Operation ID was reused with different binding choices');return continueIntent(prior.archiveId,prior.intent);}
    const captured=context(),active=await runtimeBinding();check(request.expectedBindingRevision===(active.pointer?.bindingRevision??null),'BINDING_CONFLICT','Active binding revision changed');
    const unresolved=(await pending()).find(i=>[i.sourceContext?.owner,i.targetBinding?.owner].some(owner=>equal(owner,captured.owner)));
    check(!unresolved,'BINDING_PENDING','Resume the existing binding switch before starting another',{intentId:unresolved?.id});
    const archiveId=request.archiveId??active.pointer?.archiveId;text(archiveId,'Archive ID');const target=await load(archiveId,'archive');let binding=clone(target.value.binding);check(binding?.format===BINDING_FORMAT,'BINDING_FORMAT','Archive binding is invalid');
    if(request.origin!==undefined)binding.origin=(await selected(request.origin,'origin')).ref;
    if(request.core!==undefined)binding.core=(await selected(request.core,'core')).ref;
    if(request.player!==undefined){binding.player=playerValue(request.player);if(binding.player.id!==target.value.binding.player.id)check(request.preferenceOwner!==undefined,'PREFERENCE_OWNER_REQUIRED','Changing player requires an explicit preference owner');}
    if(request.preferenceOwner!==undefined||request.core!==undefined){const owner=request.preferenceOwner??binding.preference.owner;checkPlayerPreference(binding.player,owner);binding.preference=await preference(owner,binding.core.bookId,{register:false});}
    await initialFor(binding);
    const material=await materialFor(target,binding);
    if(request.origin!==undefined||request.core!==undefined){const acknowledgements=request.definitionResolutions??[];check(Array.isArray(acknowledgements),'DEFINITION_RESOLUTIONS','Definition resolutions must be an array');
      const unresolved=material.definitionConflicts.filter(conflict=>!acknowledgements.some(a=>a.id===conflict.id&&a.fingerprint===conflict.fingerprint&&a.resolution==='retain-current'));
      if(unresolved.length)return {status:'needs-review',definitionConflicts:unresolved,selectedDefinitionRows:material.selectedDefinitionRows,selectedDefinitionSources:material.selectedDefinitionSources,active:clone(active)};
    }
    const changed=!equal(binding,target.value.binding);if(changed)binding.revision++;
    if(active.pointer?.archiveId===archiveId&&!changed)return {status:'unchanged',...active};
    if(active.pointer)capability('saveCurrentBranch',saveCurrentBranch);
    const foreign=!equal(captured.owner,binding.owner),restoreCheckpoint=foreign||!!(active.pointer&&active.pointer.archiveId!==archiveId);
    if(foreign){capability('activateChat',activateChat);if(requireChatLocator)check(binding.locator?.ref,'CHAT_LOCATOR_REQUIRED','Foreign archive has no verified native chat locator');}
    if(restoreCheckpoint){check(target.value.nativeCheckpoint!==undefined,'NATIVE_CHECKPOINT_REQUIRED','Selected archive needs a native checkpoint locator');capability('restoreNative',restoreNative);capability('readNative',readNative);}
    if(captured.playerId!==binding.player.id)capability('activateUser',activateUser);
    capability('invalidate',invalidate);guardContext(captured);
    if(request.preferenceOwner!==undefined||request.core!==undefined)binding.preference=await preference(request.preferenceOwner??binding.preference.owner,binding.core.bookId);
    await registerPlayer(binding.core.bookId,binding.player);
    const intent={format:'tisya.binding-intent/1',id:request.operationId,request:clone(request),sourcePointer:clone(active.pointer),sourceBinding:clone(active.binding),sourceContext:{owner:clone(captured.owner),playerId:captured.playerId,epoch:captured.epoch},sourceHasDraft:!!captured.draft,sourceDraftFingerprint:await fingerprint(captured.draft),targetArchiveId:archiveId,targetBinding:binding,targetPreviousBinding:clone(target.value.binding),targetManifestRevision:target.value.revision,nativeCheckpoint:clone(target.value.nativeCheckpoint),activatePlayer:captured.playerId!==binding.player.id,foreign,restoreCheckpoint,phase:'prepared',createdAt:now()};
    await putIntent(archiveId,intent);return continueIntent(archiveId,intent);
  }
  async function continueIntent(archiveId,intent) {
    await idle();if(intent.phase==='complete')return {status:'complete',intentId:intent.id,...await runtimeBinding()};
    const save=async phase=>{intent.phase=phase;delete intent.error;await putIntent(archiveId,intent);};
    try {
      if(intent.phase==='prepared'){
        guardContext(intent.sourceContext);const active=await readMetadata();check(equal(active,intent.sourcePointer),'BINDING_CONFLICT','Active pointer changed before switching');
        const draft=context().draft;check(await fingerprint(draft)===intent.sourceDraftFingerprint,'DRAFT_CHANGED','Draft changed after the binding switch was prepared');
        if(intent.sourcePointer){const result=await capability('saveCurrentBranch',saveCurrentBranch)({archiveId:intent.sourcePointer.archiveId,binding:clone(intent.sourceBinding),draft:clone(draft),operationId:intent.id});check(result?.saved===true,'BRANCH_NOT_SAVED','Current branch did not confirm a durable save');if(intent.sourceHasDraft)check(result.draftSaved===true,'DRAFT_UNSAVED','Current draft must be saved under its original archive');if(result.nativeCheckpoint!==undefined){const source=await load(intent.sourcePointer.archiveId);await writeManifest(source.value.id,source.value.revision,next=>{next.nativeCheckpoint=clone(result.nativeCheckpoint);});}}
        guardContext(intent.sourceContext);await capability('invalidate',invalidate)({reason:'book-binding-switch',operationId:intent.id});await save('saved');
      }
      if(intent.phase==='saved'){
        check([intent.sourceContext.owner,intent.targetBinding.owner].some(owner=>equal(owner,context().owner)),'CONTEXT_CHANGED','Resume the switch from its source or target chat');
        if(intent.foreign){await capability('activateChat',activateChat)({owner:clone(intent.targetBinding.owner),locator:clone(intent.targetBinding.locator),operationId:intent.id});check(equal(context().owner,intent.targetBinding.owner),'CHAT_ACTIVATION_READBACK','Host chat activation did not select the requested owner');}
        else check(equal(context().owner,intent.targetBinding.owner),'CONTEXT_CHANGED','Current chat changed before binding activation');
        await save('chat');
      }
      if(intent.phase==='chat'){
        check(equal(context().owner,intent.targetBinding.owner),'CONTEXT_CHANGED','Active chat changed during switch');
        if(intent.activatePlayer||context().playerId!==intent.targetBinding.player.id){await capability('activateUser',activateUser)({player:clone(intent.targetBinding.player),operationId:intent.id});check(context().playerId===intent.targetBinding.player.id,'PLAYER_ACTIVATION_READBACK','Native player activation did not match the selection');}
        await save('player');
      }
      if(intent.phase==='player'){
        check(equal(context().owner,intent.targetBinding.owner),'CONTEXT_CHANGED','Active chat changed before native restoration');
        if(intent.restoreCheckpoint){await capability('restoreNative',restoreNative)({checkpoint:clone(intent.nativeCheckpoint),owner:clone(intent.targetBinding.owner),operationId:intent.id});const actual=await capability('readNative',readNative)({owner:clone(intent.targetBinding.owner)});check(equal(actual,intent.nativeCheckpoint),'NATIVE_READBACK','Native checkpoint readback does not match the selected archive');}
        await save('native');
      }
      if(intent.phase==='native'){
        const target=await load(archiveId);if(!equal(target.value.binding,intent.targetBinding)){check(equal(target.value.binding,intent.targetPreviousBinding),'BINDING_CONFLICT','Archive binding changed during switching');await writeManifest(archiveId,target.value.revision,next=>{next.binding=clone(intent.targetBinding);});}
        await save('binding');
      }
      if(intent.phase==='binding'){
        const c=context();check(equal(c.owner,intent.targetBinding.owner)&&c.playerId===intent.targetBinding.player.id,'CONTEXT_CHANGED','Host context differs from the binding being committed');
        const pointer={format:POINTER_FORMAT,archiveId,bindingRevision:intent.targetBinding.revision};const before=await readMetadata();
        if(!equal(before,pointer)){try{await saveMetadata(clone(pointer),{expected:clone(before),operationId:intent.id});}catch(error){const actual=await readMetadata();if(!equal(actual,pointer))throw error;}}
        check(equal(await readMetadata(),pointer),'POINTER_READBACK','Active pointer did not persist');await save('complete');
      }
      return {status:'complete',intentId:intent.id,...await runtimeBinding()};
    } catch(error){intent.error={code:error.code??'HOST_ERROR',message:error.message,at:now()};try{await putIntent(archiveId,intent);}catch(recordError){error.intentPersistenceError=recordError.message;}throw error;}
  }
  async function fork(request) {
    await idle();const captured=context(),{targetOwner,operationId}=request;text(operationId,'Operation ID');check(validOwner(targetOwner)&&equal(captured.owner,targetOwner),'FORK_OWNER','Host must activate the new branch before binding its archive');
    const sourceId=request.source?.archiveId??request.source?.archive?.id??request.source?.pointer?.archiveId;
    const sourceRevision=request.source?.bindingRevision??request.source?.binding?.revision??request.source?.pointer?.bindingRevision;
    const source=await load(sourceId,'archive');check(source.value.binding.revision===sourceRevision,'FORK_SOURCE_CONFLICT','Source binding revision changed before branch creation');
    check(!equal(source.value.binding.owner,targetOwner),'FORK_OWNER','A fork must use a different branch owner');
    capability('invalidate',invalidate);const before=await readMetadata();
    const existing=(await scan()).find(r=>r.value.creationOperation===operationId);
    check(before===null||before.archiveId===sourceId||before.archiveId===existing?.value.id,'FORK_POINTER','New branch already points to a different archive');
    const input={kind:'archive',name:request.name??`${source.value.displayName} · 分支`,owner:clone(targetOwner),origin:clone(source.value.binding.origin),core:clone(source.value.binding.core),player:clone(source.value.binding.player),preferenceOwner:clone(source.value.binding.preference.owner),operationId,forkOf:{archiveId:sourceId,bindingRevision:sourceRevision},...captured.locator?{locator:clone(captured.locator)}:{}};
    const created=await create(input),pointer={format:POINTER_FORMAT,archiveId:created.id,bindingRevision:0};guardContext(captured);
    check(captured.playerId===source.value.binding.player.id,'FORK_PLAYER','The new branch must retain the selected native player');
    await capability('invalidate',invalidate)({reason:'book-branch-fork',operationId});guardContext(captured);
    if(!equal(before,pointer)){try{await saveMetadata(pointer,{expected:before,operationId});}catch(error){if(!equal(await readMetadata(),pointer))throw error;}}
    check(equal(await readMetadata(),pointer),'POINTER_READBACK','Fork pointer did not persist');return readRuntime();
  }
  async function saveDraft({archiveId,owner,draft,operationId}) {
    text(operationId,'Operation ID');check(equal(context().owner,owner),'DRAFT_OWNER','Draft owner is not the active branch');const known=await load(archiveId,'archive');check(equal(known.value.binding.owner,owner),'DRAFT_OWNER','Draft archive belongs to another branch');
    return serial(coordinate,known.physicalName,async()=>{const current=await load(archiveId),matches=Object.values(current.data.entries).filter(entry=>entry.extensions?.tisyaDraft?.archiveId===archiveId);check(matches.length<=1,'DUPLICATE_DRAFT','Archive has multiple current drafts');let previous=null;if(matches.length){check(disabled(matches[0]),'DRAFT_ACTIVATION','Archive draft must be disabled');previous=JSON.parse(matches[0].content);}
      if(previous?.operationId===operationId){check(equal(previous.draft,draft??null),'OPERATION_CONFLICT','Draft operation ID was reused with different text');return {saved:true,version:previous.version};}
      const value={format:'tisya.archive-draft/1',owner:clone(owner),draft:clone(draft??null),version:(previous?.version??0)+1,operationId,updatedAt:now()},wire=matches[0]??makePrivate(allocate(current.physicalName,current.data),'Tisya draft');wire.extensions={...(wire.extensions??{}),tisyaDraft:{archiveId}};wire.content=JSON.stringify(value);
      check(equal(context().owner,owner),'DRAFT_OWNER','Draft owner changed before persistence');await transport.save(current.physicalName,current.data);const actual=await load(archiveId);check(Object.values(actual.data.entries).find(entry=>entry.extensions?.tisyaDraft?.archiveId===archiveId)?.content===wire.content,'DRAFT_READBACK','Draft readback differs');return {saved:true,version:value.version};
    });
  }
  const CONFIGURATION='tisyaConfiguration';
  async function configurationLocation(){
    const active=await globalBinding();check(active.core,'GLOBAL_UNBOUND','请先选择全局基点书');
    const record=await load(active.core.id,'core');
    return {active,record,bookId:record.value.id,owner:{kind:'global',id:'tisya'},binding:{scope:'global',coreId:record.value.id,revision:active.pointer.revision}};
  }
  function configurationRecord(location){
    const matches=Object.values(location.record.data.entries).filter(entry=>equal(entry.extensions?.[CONFIGURATION]?.owner,location.owner));
    check(matches.length<=1,'CONFIGURATION_DUPLICATE','全局基点存在多份配置记录');if(!matches.length)return null;
    const wire=matches[0];check(disabled(wire),'CONFIGURATION_ACTIVATION','配置记录必须关闭自动注入');let value;
    try{value=JSON.parse(wire.content);}catch{throw new BookError('CONFIGURATION_JSON','配置记录已损坏，保留原数据');}
    check(value?.format==='tisya.configuration-book/1'&&value.bookId===location.bookId&&equal(value.owner,location.owner)&&Number.isSafeInteger(value.revision)&&value.revision>0&&Array.isArray(value.versions)&&value.versions.length===value.revision,'CONFIGURATION_FORMAT','配置记录版本或归属不一致');
    for(let i=0;i<value.versions.length;i++){const v=value.versions[i];check(v.revision===i+1&&plain(v.domains)&&Array.isArray(v.worldBindings)&&typeof v.operationId==='string','CONFIGURATION_HISTORY','配置版本历史不完整');}
    check(wire.extensions[CONFIGURATION].bookId===location.bookId,'CONFIGURATION_BOOK','配置标记不属于此基点书');return {wire,value};
  }
  function configurationView(location,record,requestedRevision){
    const revision=record?.value.revision??null,chosen=requestedRevision??revision;
    check(requestedRevision===undefined||Number.isSafeInteger(chosen)&&chosen>0&&chosen<=revision,'CONFIGURATION_REVISION','指定配置版本不存在');
    const version=record?.value.versions.find(v=>v.revision===chosen);
    return {exists:!!record,bookId:location.bookId,owner:clone(location.owner),forkOf:clone(location.forkOf),binding:clone(location.binding),revision,selectedRevision:chosen,domains:clone(version?.domains??{}),worldBindings:clone(version?.worldBindings??[]),versions:(record?.value.versions??[]).map(({revision,createdAt,operationId})=>({revision,createdAt,operationId}))};
  }
  async function readConfiguration({revision}={}){
    const location=await configurationLocation(),record=configurationRecord(location),view=configurationView(location,record,revision);
    if(record||revision!==undefined)return view;
    const owners=Object.values(location.record.data.entries).map(e=>e.extensions?.[CONFIGURATION]?.owner).filter(o=>o&&o.kind!=='global');
    if(!owners.length)return view;
    const playerId=getContext()?.playerId,selected=owners.filter(o=>o.kind==='player'&&o.id===playerId),owner=selected.length===1?selected[0]:owners.length===1?owners[0]:null;
    check(owner,'CONFIGURATION_SOURCE_REQUIRED','此基点有多份原配置，请先切到要沿用的用户身份，再载入全局配置');
    const source=configurationRecord({...location,owner}),last=source.value.versions.at(-1);
    return {...view,initialConfiguration:{owner:clone(owner),revision:source.value.revision,domains:clone(last.domains),worldBindings:clone(last.worldBindings),binding:clone(last.binding)}};
  }
  async function saveConfiguration(request){
    await idle();const first=await configurationLocation(),{domains,worldBindings,expected,operationId}=request;text(operationId,'Configuration operation ID');
    check(plain(domains)&&Array.isArray(worldBindings),'CONFIGURATION_PAYLOAD','配置域和会话绑定格式无效');
    check(plain(expected)&&expected.bookId===first.bookId&&equal(expected.binding,first.binding),'CONFIGURATION_BINDING','配置保存所依据的书或存档绑定已改变');
    const digest=await fingerprint({domains,worldBindings,binding:first.binding});
    return serial(coordinate,first.record.physicalName,async()=>{
      const current=await configurationLocation();check(equal(current.binding,first.binding)&&current.bookId===first.bookId&&equal(current.owner,first.owner),'CONFIGURATION_BINDING','保存期间配置归属已改变');
      const prior=configurationRecord(current),receipt=prior?.value.versions.find(v=>v.operationId===operationId);
      if(receipt){check(receipt.fingerprint===digest,'OPERATION_CONFLICT','配置保存操作编号被用于不同内容');return configurationView(current,prior);}
      check((prior?.value.revision??null)===expected.revision,'CONFIGURATION_CONFLICT','配置书已有新版本，请重新核对',{expected:expected.revision,actual:prior?.value.revision??null});
      const last=prior?.value.versions.at(-1);if(last&&equal(last.domains,domains)&&equal(last.worldBindings,worldBindings))return configurationView(current,prior);
      const version={revision:(prior?.value.revision??0)+1,createdAt:now(),operationId,fingerprint:digest,binding:clone(current.binding),domains:clone(domains),worldBindings:clone(worldBindings)};
      const value={format:'tisya.configuration-book/1',bookId:current.bookId,owner:clone(current.owner),revision:version.revision,versions:[...(prior?.value.versions??[]),version]};
      let wire=prior?.wire;if(!wire){const shadow=clone(current.record.data);for(const [uid,entry]of coordinate.reserved.get(current.record.physicalName)??[])shadow.entries[uid]=clone(entry);wire=allocate(current.record.physicalName,shadow);current.record.data.entries[String(wire.uid)]=wire;}
      makePrivate(wire,'Tisya configuration');wire.extensions={...(wire.extensions??{}),[CONFIGURATION]:{format:'tisya.configuration-marker/1',bookId:current.bookId,owner:clone(current.owner)}};wire.content=JSON.stringify(value);
      check(equal((await globalBinding()).pointer,first.active.pointer),'CONFIGURATION_BINDING','写入前全局基点已切换');
      let saveError;try{await transport.save(current.record.physicalName,current.record.data);}catch(error){saveError=error;}
      const actual=await configurationLocation(),saved=configurationRecord(actual);check(equal(actual.binding,first.binding),'CONFIGURATION_BINDING','配置已写入原书，全局基点已切换');
      if(!equal(saved?.value,value)){if(saveError)throw saveError;throw new BookError('CONFIGURATION_READBACK','配置写回核验未完成，草稿保留');}
      check(equal(actual.record.data,current.record.data),'CONFIGURATION_READBACK','配置书其他条目在写回时发生变化');return configurationView(actual,saved);
    });
  }
  return Object.freeze({
    capabilities:Object.freeze({managedSingleWriter:true,conditionalWrites:false,crossWindowAtomicity:false,renamePhysicalFiles:false,fork:true}),
    list:async kind=>(await scan()).filter(r=>!kind||r.value.kind===kind).map(publicBook),
    globalBinding,selectGlobalCore:request=>operation(()=>selectGlobalCore(request)),
    create:request=>operation(()=>create(request)),rename:request=>operation(()=>rename(request)),
    saveDefinition:request=>operation(()=>saveDefinition(request)),readDefinition,
    binding:runtimeBinding,readRuntime,
    select:request=>operation(()=>select(request)),
    fork:request=>operation(()=>fork(request)),
    saveDraft,readConfiguration,saveConfiguration,
    readDraft:async archiveId=>{const record=await load(archiveId,'archive'),entries=Object.values(record.data.entries).filter(e=>e.extensions?.tisyaDraft?.archiveId===archiveId);check(entries.length<=1,'DUPLICATE_DRAFT','Archive has multiple drafts');if(!entries.length)return null;check(disabled(entries[0]),'DRAFT_ACTIVATION','Archive draft must be disabled');return JSON.parse(entries[0].content);},
    resume:id=>operation(async()=>{const found=await findIntent(id);check(found,'INTENT_MISSING','Binding intent does not exist',{id});return continueIntent(found.archiveId,found.intent);}),
    pending,
  });
}
