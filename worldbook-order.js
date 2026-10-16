// Target host: TauriTavern 2.3.0. Ordering is opt-in and never writes native Order.
const META='tisyaConsoleOrder';
const anchor=e=>JSON.stringify([e.position,e.position===4?e.depth??4:null,e.position===4?e.role??0:null,e.position===7?e.outletName??'':null]);
export function prepareWorldbookOrder(data,prefs){
 if(!prefs?.layoutOrder)return false;
 if(!Array.isArray(data.globalLore)||!Array.isArray(data.characterLore))throw Error('宿主世界书来源事件不匹配');
 const names=[...new Set([...(prefs.bookOrder??[]),...data.globalLore.map(e=>e.world),...data.characterLore.map(e=>e.world)])];
 const merged=[...data.globalLore,...data.characterLore].map((e,i)=>({e,i})).sort((a,b)=>names.indexOf(a.e.world)-names.indexOf(b.e.world)||(a.e.displayIndex??a.i)-(b.e.displayIndex??b.i)||a.i-b.i);
 const ranked=merged.map(({e},rank)=>({...e,order:merged.length-rank,[META]:{rank,scanOrder:merged.length-rank}}));
 // Both lists are already limited to the active context by the native host.
 // Consolidating only these lists avoids a second source-priority sort.
 data.globalLore.splice(0,data.globalLore.length,...ranked);data.characterLore.splice(0,data.characterLore.length);
 return true;
}
export function finishWorldbookOrder(args){
 if(args?.state?.next!==0||!args?.activated?.entries)return false;
 const map=args.activated.entries;if(!(map instanceof Map))throw Error('宿主世界书激活集合不匹配');
 const pairs=[...map.entries()];if(!pairs.some(([,e])=>e[META]?.rank!==undefined))return false;
 // Recreate the host's native final sort, then reorder only the opted-in slots
 // within each anchor. Chat/persona slots and different anchors stay in place.
 pairs.sort(([,a],[,b])=>(b[META]?.scanOrder??b.order)-(a[META]?.scanOrder??a.order));
 const buckets=new Map();pairs.forEach((pair,i)=>{if(pair[1][META]?.rank===undefined)return;const key=anchor(pair[1]);if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(i);});
 for(const slots of buckets.values()){const values=slots.map(i=>pairs[i]);const forward=values[0][1].position===7;values.sort(([,a],[,b])=>forward?a[META].rank-b[META].rank:b[META].rank-a[META].rank);slots.forEach((slot,i)=>pairs[slot]=values[i]);}
 // Use copies, so recursive candidate priorities are unchanged if a later
 // listener extends the scan. Outlet uses push; all other native anchors unshift.
 pairs.forEach(([key,e],i)=>map.set(key,{...e,order:pairs.length-i,[META]:{...e[META],scanOrder:e[META]?.scanOrder??e.order}}));
 return true;
}
export function installWorldbookOrder({getContext,onError}){
 const c=getContext(),loaded=c.eventTypes.WORLDINFO_ENTRIES_LOADED,done=c.eventTypes.WORLDINFO_SCAN_DONE;let failure=null;
 const prefs=()=>getContext().extensionSettings['缇斯亚世界书'];
 const wrap=fn=>args=>{try{return fn(args)}catch(e){failure=e;onError(e);throw e}};
 if(loaded&&done){c.eventSource.on(loaded,wrap(data=>prepareWorldbookOrder(data,prefs())));c.eventSource.on(done,wrap(finishWorldbookOrder));}
 return {clear(){failure=null},assertReady(){if(prefs()?.layoutOrder&&(!loaded||!done))throw Error('此宿主缺少世界书排布事件，已停止发送');if(failure)throw failure;},available:!!loaded&&!!done};
}
