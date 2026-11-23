import {clone,digestAsync,sha256Async} from './common.mjs';

// Derived only: the authoritative store owns a small, transactionally written
// workspace head. A matching head plus native evidence restores the complete
// workspace without reading, canonicalizing or reconciling the large bundle.
// The full input hash remains the compatibility/failure-closed projection key.
export function createFinalProjectionCache({storage,version='matrix-final-v3',onError=()=>{},persist=value=>value,restore=null}){
 const memory=new Map(),flights=new Map(),pendingWrites=new Map(),prefix='derived:final-projection:';let writeTail=null,warned=false,hits=0,diskHits=0,misses=0,coalesced=0,workspaceHits=0,dirty=0;
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
 function write(owner,task){pendingWrites.set(owner,task);startWrites();return flush();}
 async function flush(){while(writeTail||pendingWrites.size){if(!writeTail)startWrites();await writeTail;}}
 async function coldProject(owner,input,inputKey,compute){
  const signature=await digestAsync({version,input}),hot=memory.get(owner);if(hot?.signature===signature){hot.inputKey=inputKey;hits++;return clone(hot.value);}
  try{const row=await storage.get(key(owner));if((row?.format==='tisya.final-projection/2'||row?.format==='tisya.final-projection/3')&&row.version===version&&row.owner===owner&&row.signature===signature&&row.value){diskHits++;const value=restore?await restore(row.value,input):row.value,entry=remember(owner,inputKey,signature,value);if(row.format==='tisya.final-projection/3'&&row.workspace)entry.workspace={...row.workspace,key:workspaceKey(input)};return clone(value);}}catch(error){warn(error);}
  misses++;const value=await compute(),cached=clone(value);remember(owner,inputKey,signature,cached);write(owner,()=>storage.set(key(owner),{format:'tisya.final-projection/2',version,owner,signature,value:persist(cached)}));return value;
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
    const value=restore?await restore(row.value,input):row.value,entry=remember(owner,null,row.signature,value);entry.workspace={revision:head.revision,token:head.token,key:evidenceKey,evidenceSignature};diskHits++;workspaceHits++;return clone(value);
   }
   dirty++;return null;
  }catch(error){warn(error);dirty++;return null;}
 }
 function adopt(owner,input,value){
  // The controller increments only the authoritative revision after a
  // successful reconcile. Register that committed input against the identical
  // derived result instead of reconciling it again on the first cold reopen.
  const expectedToken=typeof storage.workspaceToken==='function'?storage.workspaceToken(input.bundle):null,evidence=clone(input),inputKey=JSON.stringify({version,input:evidence}),entry=remember(owner,inputKey,null,clone(value)),revision=evidence.bundle?.local_revision??0,evidenceKey=workspaceKey(evidence);
  entry.workspace={revision,token:expectedToken,key:evidenceKey,evidenceSignature:null};
  // Make the exact hot input available immediately, but include both hashing
  // and persistence in flush(): a read immediately after sync must not race
  // the committed revision's asynchronous cache registration.
  return write(owner,async()=>{
   const [signature,evidenceSignature,head]=await Promise.all([digestAsync({version,input:evidence}),sha256Async(evidenceKey),typeof storage.stat==='function'?storage.stat(owner):Promise.resolve(null)]);
   const currentHead=validHead(head,owner);
   // A later transaction owns this chat now. Never let an older queued adopt
   // replace its durable workspace; the newer adopt is ordered after this one.
   if(typeof storage.stat==='function'&&!currentHead)return;
   if(currentHead&&(currentHead.revision!==revision||expectedToken&&currentHead.token!==expectedToken))return;
   if(memory.get(owner)===entry){entry.signature=signature;entry.workspace={revision,token:currentHead?.token??null,key:evidenceKey,evidenceSignature};}
   const workspace=currentHead?{revision,token:currentHead.token,evidenceSignature}:null;
   await storage.set(key(owner),{format:currentHead?'tisya.final-projection/3':'tisya.final-projection/2',version,owner,signature,value:persist(entry.value),...(workspace?{workspace}:{})});
  });
 }
 return {project,restore:restoreWorkspace,adopt,report:()=>({hits,diskHits,misses,coalesced,workspaceHits,dirty,pending:memory.size,inflight:flights.size}),flush,clear(owner){memory.delete(owner);return write(owner,()=>storage.set(key(owner),null));}};
}
