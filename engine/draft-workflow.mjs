// One serialized lifecycle for settings views: operations, leave confirmation,
// and navigation share the same busy/disposed state and error authority.
export function createDraftWorkflow({
 prompt,hasChanges,hasDraftChanges=hasChanges,save,discard,
 onSync=()=>{},onReport=()=>{},onRunStart=()=>{},onRunEnd=()=>{},
 leaveWithoutPrompt=()=>false,
 saveError='保存未完成，修改仍保留。',discardError='取消修改未完成。'
}){
 let busy=false,navigating=false,disposed=false,pending=Promise.resolve(true),navigationPending=null,lastError=null;
 function report(error){if(disposed)return;lastError=error;onReport(error);}
 function run(fn){
  if(busy||disposed)return Promise.resolve(false);
  const context=onRunStart();busy=true;lastError=null;onSync();
  pending=(async()=>{
   try{return await fn()!==false;}
   catch(error){report(error);return false;}
   finally{busy=false;if(!disposed){onSync();onRunEnd(context);}}
  })();
  return pending;
 }
 const saveDraft=()=>run(save),discardDraft=()=>run(discard);
 async function confirmLeave(){
  if(disposed||busy&&!navigating)return false;
  if(navigating)return true;
  if(navigationPending)return false;
  if(leaveWithoutPrompt())return !prompt.state().open;
  if(!hasChanges())return !prompt.state().open;
  return prompt.request({
   save:async()=>{if(!await saveDraft())throw lastError??Error(saveError);return !hasChanges();},
   discard:async()=>{if(!await discardDraft())throw lastError??Error(discardError);return !hasDraftChanges();}
  });
 }
 function route(fn,options={}){
  const external=typeof options==='boolean'?options:options.external===true;
  if(busy||disposed||navigationPending)return Promise.resolve(false);
  navigationPending=(async()=>{
   if(!await confirmLeave()||disposed)return false;
   navigating=external;
   try{await fn();return true;}
   catch(error){report(error);return false;}
   finally{navigating=false;}
  })();
  return navigationPending.finally(()=>{navigationPending=null;});
 }
 return {
  get busy(){return busy;},get navigating(){return navigating;},get disposed(){return disposed;},
  report,run,route,confirmLeave,saveDraft,discardDraft,
  settled:(extra=[])=>Promise.all([pending,...extra,...(navigationPending?[navigationPending]:[])]),
  dispose(){disposed=true;prompt.dispose();}
 };
}
