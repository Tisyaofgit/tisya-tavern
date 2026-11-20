import {describeReviewForms} from '../../engine/review-form-document.mjs';
export function reviewFixture(){
 const listeners=new Set();let available=true,number=1;
 const state={enabled:true,contextKey:'pet-review-isolated',revision:1,settings:{policy:{},custom:[],labels:{}},catalog:[],requirements:[],drafts:{},reviews:[]};
 const pending=()=>{state.reviews=[{uid:'reply-'+number,sourceHash:'source-'+number,contextHash:'context-'+number,index:number,status:'pending',cells:'旅人.hp: -2 | P1',archive:''}];number++;};pending();
 const emit=()=>listeners.forEach(fn=>fn());
 return {state,service:{describeTurnReview:async input=>describeReviewForms({schema:{ACTOR:{id:'ACTOR',label:'旅人状态',fields:[{key:'name',label:'姓名',type:'TEXT'},{key:'hp',label:'体力',type:'NUMBER'}]}},tables:{ACTOR:{actor:{values:{name:'旅人',hp:10},states:{name:'known',hp:'known'}}}},runtime:{scope:{}}},input),listTurnReviews:async()=>available?structuredClone(state):null,subscribe(fn){listeners.add(fn);return ()=>listeners.delete(fn);},async checkTurnReview(input){return {status:'valid',issues:[],archiveIssue:null};},async confirmTurn(input){Object.assign(state.reviews.find(r=>r.uid===input.uid),{status:'confirmed',cells:input.cells,archive:input.archive});state.revision++;emit();},async reviewAction(input){state.drafts[input.uid]={hash:input.hash,cells:input.cells,archive:input.archive,responses:input.responses};return {revision:++state.revision};}},addPending(){pending();emit();},setAvailable(value){available=value;emit();},listenerCount:()=>listeners.size};
}
