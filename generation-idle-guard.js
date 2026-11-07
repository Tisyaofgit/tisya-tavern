// The native composer unlocks visually before its Generate promise and input
// mutex finish. Do not let that brief interval silently discard a send click.
export function mountGenerationIdleGuard(document,{events,eventTypes,waitForIdle,isGenerating,onError=()=>{},defer=()=>new Promise(resolve=>setTimeout(resolve,0))}){
 let pending=false,epoch=0,disposed=false;
 const error=()=>Object.assign(Error('上一轮正在完成保存，请稍候再发送或修改；输入内容已保留。'),{code:'GENERATION_FINALIZING'});
 function assertIdle(){if(pending)throw error();}
 function started(_type,options={},dryRun=false){
  if(dryRun||options?.dryRun)return;
  pending=true;const token=++epoch;
  // Return synchronously: the host awaits generation-start listeners, while
  // its idle gate resolves only after that same generation has returned.
  Promise.resolve().then(waitForIdle).then(defer).then(()=>{if(!disposed&&token===epoch)pending=false;},reason=>{if(!disposed&&token===epoch){pending=false;onError(reason);}});
 }
 function send(event){
  if(!pending||isGenerating()||!event.target.closest?.('#send_but'))return;
  event.preventDefault();event.stopImmediatePropagation();onError(error());
 }
 events.on(eventTypes.GENERATION_STARTED,started);
 document.addEventListener('click',send,true);
 return {assertIdle,pending:()=>pending,dispose(){disposed=true;pending=false;epoch++;events.removeListener(eventTypes.GENERATION_STARTED,started);document.removeEventListener('click',send,true);}};
}
