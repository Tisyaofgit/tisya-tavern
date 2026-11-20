import {clone,digest} from './common.mjs';

// Derived only: the caller reads the authoritative bundle before every lookup.
// One latest entry per chat survives reloads; exact input evidence prevents a
// previous prompt, branch, phone frame or player binding from being reused.
export function createFinalProjectionCache({storage,version='matrix-final-v1',onError=()=>{}}){
 const memory=new Map(),prefix='derived:final-projection:';let tail=Promise.resolve(),warned=false,hits=0,diskHits=0,misses=0;
 const warn=error=>{if(!warned){warned=true;onError(Error('最终资料缓存不可用，已改为实时计算：'+error.message));}};
 const key=owner=>prefix+owner;
 function remember(owner,signature,value){memory.delete(owner);memory.set(owner,{signature,value:clone(value)});while(memory.size>3)memory.delete(memory.keys().next().value);}
 function write(owner,entry){tail=tail.catch(()=>{}).then(()=>storage.set(key(owner),entry)).catch(warn);return tail;}
 async function project(owner,input,compute){
  const signature=digest({version,input}),hot=memory.get(owner);if(hot?.signature===signature){hits++;return clone(hot.value);}
  try{const row=await storage.get(key(owner));if(row?.format==='tisya.final-projection/1'&&row.version===version&&row.owner===owner&&row.signature===signature&&row.value){diskHits++;remember(owner,signature,row.value);return clone(row.value);}}catch(error){warn(error);}
  misses++;const value=await compute();remember(owner,signature,value);write(owner,{format:'tisya.final-projection/1',version,owner,signature,value:clone(value)});return value;
 }
 return {project,report:()=>({hits,diskHits,misses,pending:memory.size}),flush:()=>tail,clear(owner){memory.delete(owner);return write(owner,null);}};
}
