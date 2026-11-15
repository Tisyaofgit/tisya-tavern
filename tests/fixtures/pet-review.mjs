export function reviewFixture(){
 const listeners=new Set();let available=true,number=1;
 const state={enabled:true,contextKey:'pet-review-isolated',revision:1,settings:{policy:{},custom:[],labels:{}},catalog:[],requirements:[],drafts:{},reviews:[]};
 const pending=()=>{state.reviews=[{uid:'reply-'+number,sourceHash:'source-'+number,contextHash:'context-'+number,index:number,status:'pending',cells:'旅人.体力：8',archive:'信已交给船夫。'}];number++;};pending();
 const emit=()=>listeners.forEach(fn=>fn());
 return {state,service:{listTurnReviews:async()=>available?structuredClone(state):null,subscribe(fn){listeners.add(fn);return ()=>listeners.delete(fn);},async confirmTurn(input){Object.assign(state.reviews.find(r=>r.uid===input.uid),{status:'confirmed',cells:input.cells,archive:input.archive});state.revision++;emit();},async reviewAction(input){state.drafts[input.uid]={hash:input.hash,cells:input.cells,archive:input.archive,responses:input.responses};return {revision:++state.revision};}},addPending(){pending();emit();},setAvailable(value){available=value;emit();},listenerCount:()=>listeners.size};
}
