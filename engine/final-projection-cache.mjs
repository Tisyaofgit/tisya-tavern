import {clone,digestAsync} from './common.mjs';

// Derived only: the caller reads the authoritative bundle before every lookup.
// One latest entry per chat survives reloads; exact input evidence prevents a
// previous prompt, branch, phone frame or player binding from being reused.
export function createFinalProjectionCache({storage,version='matrix-final-v3',onError=()=>{},persist=value=>value,restore=null}){
 const memory=new Map(),flights=new Map(),pendingWrites=new Map(),prefix='derived:final-projection:';let writeTail=null,warned=false,hits=0,diskHits=0,misses=0,coalesced=0;
 const warn=error=>{if(!warned){warned=true;onError(Error('最终资料缓存不可用，已改为实时计算：'+error.message));}};
 const key=owner=>prefix+owner;
 function remember(owner,inputKey,signature,value){const entry={inputKey,signature,value};memory.delete(owner);memory.set(owner,entry);while(memory.size>3)memory.delete(memory.keys().next().value);return entry;}
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
  try{const row=await storage.get(key(owner));if(row?.format==='tisya.final-projection/2'&&row.version===version&&row.owner===owner&&row.signature===signature&&row.value){diskHits++;const value=restore?await restore(row.value,input):row.value;remember(owner,inputKey,signature,value);return clone(value);}}catch(error){warn(error);}
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
 function adopt(owner,input,value){
  // The controller increments only the authoritative revision after a
  // successful reconcile. Register that committed input against the identical
  // derived result instead of reconciling it again on the first cold reopen.
  const evidence=clone(input),inputKey=JSON.stringify({version,input:evidence}),entry=remember(owner,inputKey,null,clone(value));
  // Make the exact hot input available immediately, but include both hashing
  // and persistence in flush(): a read immediately after sync must not race
  // the committed revision's asynchronous cache registration.
  return write(owner,async()=>{const signature=await digestAsync({version,input:evidence});if(memory.get(owner)===entry)entry.signature=signature;await storage.set(key(owner),{format:'tisya.final-projection/2',version,owner,signature,value:persist(entry.value)});});
 }
 return {project,adopt,report:()=>({hits,diskHits,misses,coalesced,pending:memory.size,inflight:flights.size}),flush,clear(owner){memory.delete(owner);return write(owner,()=>storage.set(key(owner),null));}};
}
