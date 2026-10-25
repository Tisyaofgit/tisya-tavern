const clone=structuredClone;
const stages=new Set(['sources','preparing','prepared','waiting','buffered','connected','thinking','receiving','received','validating','saving','complete']);
const kinds=new Set(['extract','opening','history','genesis']);
const owner=binding=>{if(!binding)return null;const {activeSourceKeys,currentSourceKey,...stable}=binding;return stable;};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

/** Transient task observation. Only a complete service result becomes a review draft. */
export function createDesignProgress({getBinding=()=>null,clock=()=>Date.now(),id=()=>crypto.randomUUID()}={}){
 const listeners=new Set();let value=null,draft=null,previewText='',disposed=false,sequence=0;
 const current=()=>!value||same(value.binding,owner(getBinding()));
 const snapshot=()=>current()&&value?clone(value):null;
 function emit(){if(disposed)return;const progress=snapshot(),event={progress,previewText:progress?previewText:''};for(const listener of listeners)try{listener(clone(event));}catch{}}
 function update(jobId,event){if(disposed||value?.id!==jobId||value.status!=='running')return false;const next={...value};if(next.binding===null)next.binding=clone(owner(getBinding()));
  if(stages.has(event.phase??event.stage))next.phase=event.phase??event.stage;
  for(const key of ['characters','completed','total','floor'])if(Number.isSafeInteger(event[key])&&event[key]>=0)next[key]=event[key];
  if(typeof event.text==='string')previewText=event.text.slice(-2000);
  next.updatedAt=clock();next.sequence=++sequence;value=next;emit();return true;
 }
 async function run({kind,operation='generate',reviewDraft=null},execute){
  if(disposed)throw Error('设定任务服务已关闭');if(value?.status==='running')throw Error('另一项设定任务正在处理');if(!kinds.has(kind)||!['generate','save'].includes(operation))throw Error('设定任务类型无效');
  const jobId=id(),startedAt=clock();if(operation==='generate'){draft=null;previewText='';}else if(reviewDraft)draft=clone(reviewDraft);
  value={id:jobId,kind,operation,status:'running',phase:operation==='save'?'saving':'sources',startedAt,updatedAt:startedAt,characters:0,binding:clone(owner(getBinding())),sequence:++sequence,error:null,cancellable:operation==='generate'};emit();
  try{const result=await execute(event=>update(jobId,event));if(disposed||value?.id!==jobId)return result;
   if(operation==='generate')draft=clone(result);else draft=null;
   value={...value,status:operation==='save'?'saved':'awaiting-review',phase:'complete',updatedAt:clock(),sequence:++sequence,cancellable:false,error:null};emit();return result;
  }catch(error){if(!disposed&&value?.id===jobId){const cancelled=error?.name==='AbortError';value={...value,status:cancelled?'cancelled':'failed',updatedAt:clock(),sequence:++sequence,cancellable:false,error:{code:String(error?.code??''),message:cancelled?'请求已停止。':String(error?.message??error)}};emit();}throw error;}
 }
 return {run,snapshot,state:()=>({progress:snapshot(),draft:current()?clone(draft):null,previewText:current()?previewText:''}),
  discard(){if(value?.status==='running')throw Error('请先停止或等待设定任务完成');draft=null;previewText='';value=null;emit();},
  subscribe(listener){if(typeof listener!=='function')throw Error('Progress listener must be a function');listeners.add(listener);try{listener({progress:snapshot(),previewText:current()?previewText:''});}catch{}return()=>listeners.delete(listener);},
  dispose(){disposed=true;listeners.clear();draft=null;previewText='';value=null;}
 };
}
