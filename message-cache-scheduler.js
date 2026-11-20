// Disk cleanup is derived-data maintenance, not part of the message action's
// critical path. Each notification supersedes the preceding chat generation.
export function createMessageCacheScheduler({window,getScope,getMessages,reconcile,onError=()=>{},delay=48}){
 let generation=0,timer=null,active=true;
 const current=(ticket,scope,messages)=>active&&ticket===generation&&getScope()===scope&&getMessages()===messages;
 function schedule(){
  if(!active)return;const ticket=++generation;if(timer!==null)window.clearTimeout(timer);
  timer=window.setTimeout(()=>{
   timer=null;const scope=getScope(),messages=getMessages();
   if(scope===null||scope===undefined||!current(ticket,scope,messages))return;
   Promise.resolve(reconcile(scope,messages,{isCurrent:()=>current(ticket,scope,messages)})).catch(onError);
  },delay);
 }
 schedule.dispose=()=>{active=false;generation++;if(timer!==null)window.clearTimeout(timer);timer=null;};
 return schedule;
}
