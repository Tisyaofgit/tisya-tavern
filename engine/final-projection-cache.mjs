import {clone,digestAsync} from './common.mjs';

// Derived only: the caller reads the authoritative bundle before every lookup.
// One latest entry per chat survives reloads; exact input evidence prevents a
// previous prompt, branch, phone frame or player binding from being reused.
export function createFinalProjectionCache({storage,version='matrix-final-v2',onError=()=>{},persist=value=>value,restore=null}){
 const memory=new Map(),flights=new Map(),prefix='derived:final-projection:';let tail=Promise.resolve(),warned=false,hits=0,diskHits=0,misses=0,coalesced=0;
 const warn=error=>{if(!warned){warned=true;onError(Error('最终资料缓存不可用，已改为实时计算：'+error.message));}};
 const key=owner=>prefix+owner;
 function remember(owner,inputKey,signature,value){memory.delete(owner);memory.set(owner,{inputKey,signature,value});while(memory.size>3)memory.delete(memory.keys().next().value);}
 function write(owner,entry){tail=tail.catch(()=>{}).then(()=>storage.set(key(owner),entry)).catch(warn);return tail;}
 async function coldProject(owner,input,inputKey,compute){
  const signature=await digestAsync({version,input}),hot=memory.get(owner);if(hot?.signature===signature){hot.inputKey=inputKey;hits++;return clone(hot.value);}
  try{const row=await storage.get(key(owner));if(row?.format==='tisya.final-projection/1'&&row.version===version&&row.owner===owner&&row.signature===signature&&row.value){diskHits++;const value=restore?await restore(row.value,input):row.value;remember(owner,inputKey,signature,value);return clone(value);}}catch(error){warn(error);}
  misses++;const value=await compute(),cached=clone(value);remember(owner,inputKey,signature,cached);write(owner,{format:'tisya.final-projection/1',version,owner,signature,value:persist(cached)});return value;
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
 return {project,report:()=>({hits,diskHits,misses,coalesced,pending:memory.size,inflight:flights.size}),flush:()=>tail,clear(owner){memory.delete(owner);return write(owner,null);}};
}
