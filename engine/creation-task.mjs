import {clone,fail} from './common.mjs';

const FORMAT='tisya.creation-workbench/1';
const active=t=>t&&['preparing','streaming'].includes(t.status);
// A recoverable authoring draft, never an alternative store for accepted tables.
export function createCreationTasks({getContext,storage}={}){
 const states=new Map(),listeners=new Set(),controllers=new Map();
 const scope=()=>{const c=getContext();return JSON.stringify([c.chatId??null,c.groupId??null,c.characterId??null]);};
 function backend(){return storage===undefined?globalThis.sessionStorage:storage;}
 function entry(){const key=scope();if(!states.has(key)){let value={format:FORMAT,task:null,view:null};try{const raw=backend()?.getItem('tisya.creation:'+key);if(raw){const saved=JSON.parse(raw);if(saved.format!==FORMAT)throw Error('创作工作台缓存格式无效');value=saved;if(active(value.task)){value.task.status='error';value.task.phase='请求已中断';value.task.error='页面已重新载入，已保留收到的内容；可以检查后重新发送。';}}}catch(error){value.persistenceError=String(error.message??error);}states.set(key,value);}return {key,value:states.get(key)};}
 function save(key,value){try{backend()?.setItem('tisya.creation:'+key,JSON.stringify(value));delete value.persistenceError;}catch(error){value.persistenceError='创作草稿暂未写入浏览器缓存：'+String(error.message??error);if(value.task)value.task.persistenceError=value.persistenceError;}}
 function emit(key){if(key!==scope())return;const value=states.get(key);for(const fn of listeners)fn(clone(value?.task??null));}
 function snapshot(){return clone(entry().value.task);}
 function update(key,patch,{persist=true}={}){const value=states.get(key);Object.assign(value.task,patch,{updatedAt:Date.now()});if(persist)save(key,value);emit(key);}
 function subscribe(fn){listeners.add(fn);fn(snapshot());return ()=>listeners.delete(fn);}
 function rememberView(view){const {key,value}=entry();value.view=clone(view);save(key,value);}
 function view(){return clone(entry().value.view);}
 function clearView(){const {key,value}=entry();value.view=null;if(!active(value.task))value.task=null;save(key,value);}
 function cancel(){const {key,value}=entry();if(!active(value.task))return false;controllers.get(key)?.abort();update(key,{status:'cancelled',phase:'已停止',error:null});return true;}
 async function run(goal,options,generate){
  const {key,value}=entry();if(active(value.task))fail('MATRIX_CREATION_BUSY','当前创作仍在生成，可以先停止或等待完成');
  const controller=new AbortController(),abort=()=>controller.abort();controllers.set(key,controller);options.signal?.addEventListener('abort',abort,{once:true});if(options.signal?.aborted)controller.abort();
  const prior=options.messages??value.task?.messages??[];
  if(!Array.isArray(prior)||prior.some(m=>!['user','assistant'].includes(m?.role)||typeof m.content!=='string'))fail('MATRIX_CREATION','创作对话记录无效');
  const messages=clone(prior);if(messages.at(-1)?.role!=='user'||messages.at(-1)?.content!==goal)messages.push({role:'user',content:goal});
  value.task={id:'creation-task:'+crypto.randomUUID(),status:'preparing',phase:'准备资料与模板',text:'',messages,error:null,draft:null,contextKey:key,startedAt:Date.now(),updatedAt:Date.now()};value.view=null;save(key,value);emit(key);
  let persistedAt=0;
  const progress=p=>{if(controller.signal.aborted)return;const text=typeof p?.text==='string'?p.text:typeof p?.delta==='string'?value.task.text+p.delta:value.task.text;const phase={preparing:'准备资料与模板',prepared:'资料已就绪',waiting:'等待模型开始回复',generating:'正在生成',streaming:'正在生成',validating:'核对表单与引用'}[p?.stage]??p?.phase??value.task.phase;const now=Date.now(),persist=now-persistedAt>=500;if(persist)persistedAt=now;update(key,{status:text?'streaming':'preparing',phase,text,...(p?.contextKey?{contextKey:p.contextKey}:{}),...(p?.promptMessages?{promptMessages:clone(p.promptMessages)}:{}),...(p?.templateInfo?{templateInfo:p.templateInfo}:{})},{persist});options.onProgress?.(p);};
  try{const draft=await generate({...options,messages,signal:controller.signal,onProgress:progress});if(controller.signal.aborted)throw Object.assign(Error('创作已停止'),{name:'AbortError'});const text=draft.rawResponse??value.task.text;messages.push({role:'assistant',content:text});update(key,{status:'ready',phase:'草稿已生成，可以编辑与校验',text,messages,draft:clone(draft),contextKey:draft.contextKey});return draft;}
  catch(error){const cancelled=controller.signal.aborted||error.name==='AbortError',text=error.rawResponse??value.task.text;update(key,{status:cancelled?'cancelled':'error',phase:cancelled?'已停止':'生成未完成',error:cancelled?null:String(error.message??error),text,...(error.draft?{draft:clone(error.draft)}:{}),...(error.sheetContext?{sheetContext:clone(error.sheetContext)}:{}),...(error.cause?.formLocation?{formLocation:clone(error.cause.formLocation)}:{})});throw error;}
  finally{options.signal?.removeEventListener('abort',abort);controllers.delete(key);}
 }
 return {run,snapshot,subscribe,cancel,rememberView,view,clearView};
}
