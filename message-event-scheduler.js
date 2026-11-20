const TARGETED_EVENTS=new Set(['MESSAGE_RECEIVED','MESSAGE_UPDATED','MESSAGE_EDITED','MESSAGE_SWIPED','MESSAGE_SWIPE_DELETED']);

export function messageEventId(name,args){
 if(!TARGETED_EVENTS.has(name))return null;
 const id=args?.[0];
 return typeof id==='number'&&Number.isSafeInteger(id)||typeof id==='string'&&/^\d+$/u.test(id)?String(id):null;
}

// Coalesce host bursts without decorating the whole chat for a one-row edit.
// Unknown event payloads retain the conservative full refresh behavior.
export function createMessageEventScheduler({decorate,findById,onBefore=()=>{},schedule=callback=>setTimeout(callback,0),cancel=clearTimeout}){
 let timer=null,all=false,ids=new Set(),active=true;
 function flush(){
  timer=null;if(!active)return;
  const everything=all,targets=[...ids];all=false;ids.clear();
  if(everything){decorate(null);return;}
  const nodes=targets.map(findById);
  if(nodes.some(node=>!node))decorate(null);else for(const node of nodes)decorate(node);
 }
 return {
  notify(name,args=[]){
   if(!active)return;onBefore();const id=messageEventId(name,args);if(id===null)all=true;else ids.add(id);
   if(timer!==null)cancel(timer);timer=schedule(flush);
  },
  dispose(){active=false;if(timer!==null)cancel(timer);timer=null;ids.clear();all=false;},
 };
}
