import {clone,digestAsync,sha256Async,fail} from './common.mjs';

// The durable workspace is a runtime projection, not a second journal backup.
// Current state and render materials are sufficient for an evidence-matched
// reopen; any replay, historical edit or CAS write must reattach the sole
// authoritative bundle before doing work.
export function compactRuntimeWorkspace(value){
 const bundle=value?.bundle;if(!bundle?.journal)return value;
 return {...value,bundle:{...bundle,journal:{...bundle.journal,entries:[]},workspace_short:'tisya.runtime-workspace/1'}};
}
export async function authoritativeWorkspace(storage,id,bundle){
 if(!bundle?.workspace_short)return bundle;
 if(bundle.workspace_short!=='tisya.runtime-workspace/1')fail('WORKSPACE_FORMAT','短工作区格式无法识别');
 const authoritative=await storage.get(id);if(!authoritative?.state||!Array.isArray(authoritative.journal?.entries))fail('ENGINE_STATE_MISSING','短工作区对应的权威存档无法读取');
 if((authoritative.local_revision??0)!==(bundle.local_revision??0))fail('SAVE_CONFLICT','短工作区与权威存档修订不一致');
 return authoritative;
}

// Derived only: the authoritative store owns a small, transactionally written
// workspace head. A matching head plus native evidence restores the complete
// workspace without reading, canonicalizing or reconciling the large bundle.
// The full input hash remains the compatibility/failure-closed projection key.
export function createFinalProjectionCache({storage,version='matrix-final-v3',onError=()=>{},persist=value=>value,restore=null,persistDelay=15000}){
 const memory=new Map(),flights=new Map(),pendingWrites=new Map(),unsaved=new Set(),prefix='derived:final-projection:';let writeTail=null,warned=false,hits=0,diskHits=0,misses=0,coalesced=0,workspaceHits=0,dirty=0,persistTimer=null;
 const warn=error=>{if(!warned){warned=true;onError(Error('最终资料缓存不可用，已改为实时计算：'+error.message));}};
 const key=owner=>prefix+owner;
 const workspaceKey=input=>JSON.stringify({messages:input.messages,proof:input.proof,playerBinding:input.playerBinding,manualReview:input.manualReview});
 const validHead=(head,owner)=>head?.format==='tisya.workspace-head/1'&&head.owner===owner&&Number.isSafeInteger(head.revision)&&head.revision>=0&&typeof head.token==='string'&&head.token?head:null;
 function remember(owner,inputKey,signature,value){const entry={inputKey,signature,value,workspace:null};memory.delete(owner);memory.set(owner,entry);while(memory.size>3)memory.delete(memory.keys().next().value);return entry;}
 function startWrites(){
  if(writeTail||!pendingWrites.size)return writeTail;
  // Supersede queued writes per owner instead of retaining every historical
  // snapshot in a promise chain. At most the running and latest queued full
  // projections are live; the last write still wins after an older disk await.
  const run=(async()=>{while(pendingWrites.size){const batch=[...pendingWrites.values()];pendingWrites.clear();for(const write of batch)try{await write();}catch(error){warn(error);}}})();
  writeTail=run.finally(()=>{writeTail=null;if(pendingWrites.size)startWrites();});return writeTail;
 }
 function write(owner,task){pendingWrites.set(owner,task);startWrites();return drainWrites();}
 async function drainWrites(){while(writeTail||pendingWrites.size){if(!writeTail)startWrites();await writeTail;}}
 // Commits only dirty-mark their derived snapshot; a trailing timer or an
 // explicit boundary flush (chat switch, page hidden) persists the latest one.
 // A rapid commit chain therefore pays one full snapshot write per owner,
 // not one per commit. A crash inside the window merely falls back to the
 // authoritative reconcile on the next cold open.
 function schedulePersist(){if(persistTimer||!unsaved.size)return;persistTimer=setTimeout(()=>{persistTimer=null;void flush();},persistDelay);persistTimer.unref?.();}
 function persistOwner(owner){
  const entry=memory.get(owner);if(!entry||!unsaved.has(owner))return;unsaved.delete(owner);
  write(owner,async()=>{
   // Canonical hashing is paid by the boundary flush, never by the commit
   // path; the retained input clone is released once the signature exists.
   const signature=entry.signature??await digestAsync({version,input:entry.input});entry.input=null;
   let workspace=null;
   if(entry.workspace){
    const [evidenceSignature,head]=await Promise.all([sha256Async(entry.workspace.key),typeof storage.stat==='function'?storage.stat(owner):Promise.resolve(null)]);
    const currentHead=validHead(head,owner);
    // A later transaction owns this chat now. Never let an older queued
    // snapshot replace its durable workspace; the newer one flushes after.
    if(typeof storage.stat==='function'&&!currentHead)return;
    if(currentHead&&(currentHead.revision!==entry.workspace.revision||entry.workspace.token&&currentHead.token!==entry.workspace.token))return;
    if(memory.get(owner)===entry){entry.signature=signature;entry.workspace={revision:entry.workspace.revision,token:currentHead?.token??null,key:entry.workspace.key,evidenceSignature};}
    workspace=currentHead?{revision:entry.workspace.revision,token:currentHead.token,evidenceSignature}:null;
   }
   await storage.set(key(owner),{format:workspace?'tisya.final-projection/3':'tisya.final-projection/2',version,owner,signature,value:persist(entry.value),...(workspace?{workspace}:{})});
  });
 }
 async function flush(){
  if(persistTimer){clearTimeout(persistTimer);persistTimer=null;}
  for(const owner of[...unsaved])persistOwner(owner);
  await drainWrites();
  if(unsaved.size)schedulePersist();
 }
 async function coldProject(owner,input,inputKey,compute){
  const signature=await digestAsync({version,input}),hot=memory.get(owner);if(hot?.signature===signature){hot.inputKey=inputKey;hits++;return clone(hot.value);}
  try{const row=await storage.get(key(owner));if((row?.format==='tisya.final-projection/2'||row?.format==='tisya.final-projection/3')&&row.version===version&&row.owner===owner&&row.signature===signature&&row.value){diskHits++;const value=restore?await restore(row.value,input,owner):row.value,entry=remember(owner,inputKey,signature,value);if(row.format==='tisya.final-projection/3'&&row.workspace)entry.workspace={...row.workspace,key:workspaceKey(input)};return clone(value);}}catch(error){warn(error);}
  misses++;const value=await compute(),cached=clone(value),entry=remember(owner,inputKey,signature,cached);entry.input=null;unsaved.add(owner);schedulePersist();return value;
 }
 function project(owner,input,compute){
  // Exact JSON bytes are sufficient for the in-memory hot path: no hash
  // collision and no omitted mutable host evidence. Canonical SHA-256 remains
  // the persistent identity, including when object insertion order changes.
  const inputKey=JSON.stringify({version,input}),hot=memory.get(owner);if(hot?.inputKey===inputKey){hits++;return Promise.resolve(clone(hot.value));}
  // UI refreshes, generation preparation and a clicked action can ask for the
  // same derived projection while its native hash or storage read is pending.
  // Share only identical input bytes; every caller still receives its own clone.
  const flightKey=owner+'\n'+inputKey,prior=flights.get(flightKey);if(prior){coalesced++;return prior.then(clone);}
  const task=coldProject(owner,input,inputKey,compute).finally(()=>{if(flights.get(flightKey)===task)flights.delete(flightKey);});flights.set(flightKey,task);return task.then(clone);
 }
 async function restoreWorkspace(owner,input){
  if(typeof storage.stat!=='function'||!Array.isArray(input?.messages)||!input?.proof)return null;
  const evidenceKey=workspaceKey(input);
  try{
   const head=validHead(await storage.stat(owner),owner);if(!head){dirty++;return null;}
   const hot=memory.get(owner),workspace=hot?.workspace;
   // A just-committed adopt has the revision and exact evidence immediately;
   // its random head token is filled by the queued persistence task. An older
   // entry can never satisfy a newer authoritative revision.
   if(workspace?.revision===head.revision&&(workspace.token===null||workspace.token===head.token)&&workspace.key===evidenceKey){hits++;workspaceHits++;return clone(hot.value);}
   const evidenceSignature=await sha256Async(evidenceKey),row=await storage.get(key(owner));
   if(row?.format==='tisya.final-projection/3'&&row.version===version&&row.owner===owner&&row.value&&row.workspace?.revision===head.revision&&row.workspace?.token===head.token&&row.workspace?.evidenceSignature===evidenceSignature){
    const value=restore?await restore(row.value,input,owner):row.value,entry=remember(owner,null,row.signature,value);entry.workspace={revision:head.revision,token:head.token,key:evidenceKey,evidenceSignature};diskHits++;workspaceHits++;return clone(value);
   }
   dirty++;return null;
  }catch(error){warn(error);dirty++;return null;}
 }
 function adopt(owner,input,value){
  // The controller increments only the authoritative revision after a
  // successful reconcile. Register that committed input against the identical
  // derived result instead of reconciling it again on the first cold reopen.
  // The disk copy is dirty-marked and persisted by the trailing flush, so a
  // commit chain coalesces into a single full snapshot write per owner.
  const expectedToken=typeof storage.workspaceToken==='function'?storage.workspaceToken(input.bundle):null,evidence=clone(input),inputKey=JSON.stringify({version,input:evidence}),entry=remember(owner,inputKey,null,clone(value)),revision=evidence.bundle?.local_revision??0,evidenceKey=workspaceKey(evidence);
  entry.workspace={revision,token:expectedToken,key:evidenceKey,evidenceSignature:null};
  entry.input=evidence;
  unsaved.add(owner);schedulePersist();
  return Promise.resolve();
 }
 return {project,restore:restoreWorkspace,adopt,report:()=>({hits,diskHits,misses,coalesced,workspaceHits,dirty,pending:memory.size,inflight:flights.size,unsaved:unsaved.size}),flush,clear(owner){memory.delete(owner);unsaved.delete(owner);return write(owner,()=>storage.set(key(owner),null));}};
}
