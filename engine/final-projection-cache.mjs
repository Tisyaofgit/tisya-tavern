import {clone,digestAsync} from './common.mjs';

// Derived only: the caller reads the authoritative bundle before every lookup.
// One latest entry per chat survives reloads; exact input evidence prevents a
// previous prompt, branch, phone frame or player binding from being reused.
export function createFinalProjectionCache({storage,version='matrix-final-v2',onError=()=>{},persist=value=>value,restore=null}){
 const memory=new Map(),prefix='derived:final-projection:';let tail=Promise.resolve(),warned=false,hits=0,diskHits=0,misses=0;
 const warn=error=>{if(!warned){warned=true;onError(Error('最终资料缓存不可用，已改为实时计算：'+error.message));}};
 const key=owner=>prefix+owner;
 function remember(owner,inputKey,signature,value){memory.delete(owner);memory.set(owner,{inputKey,signature,value});while(memory.size>3)memory.delete(memory.keys().next().value);}
 function write(owner,entry){tail=tail.catch(()=>{}).then(()=>storage.set(key(owner),entry)).catch(warn);return tail;}
 async function project(owner,input,compute){
  // Exact JSON bytes are sufficient for the in-memory hot path: no hash
  // collision and no omitted mutable host evidence. Canonical SHA-256 remains
  // the persistent identity, including when object insertion order changes.
  const inputKey=JSON.stringify({version,input}),hot=memory.get(owner);if(hot?.inputKey===inputKey){hits++;return clone(hot.value);}
  const signature=await digestAsync({version,input});if(hot?.signature===signature){hot.inputKey=inputKey;hits++;return clone(hot.value);}
  try{const row=await storage.get(key(owner));if(row?.format==='tisya.final-projection/1'&&row.version===version&&row.owner===owner&&row.signature===signature&&row.value){diskHits++;const value=restore?await restore(row.value,input):row.value;remember(owner,inputKey,signature,value);return clone(value);}}catch(error){warn(error);}
  misses++;const value=await compute(),cached=clone(value);remember(owner,inputKey,signature,cached);write(owner,{format:'tisya.final-projection/1',version,owner,signature,value:persist(cached)});return value;
 }
 return {project,report:()=>({hits,diskHits,misses,pending:memory.size}),flush:()=>tail,clear(owner){memory.delete(owner);return write(owner,null);}};
}
