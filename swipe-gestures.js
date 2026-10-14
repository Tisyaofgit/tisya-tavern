// The native host owns this setting. Do not add an extension-side copy or
// intercept touch/scroll events: the host checks power_user.gestures itself.
export function createSwipeGestureControl({getContext,persist,onSync=()=>{}}){
 let busy=false;
 function snapshot(){const value=getContext().powerUserSettings?.gestures;return {available:typeof value==='boolean',enabled:typeof value==='boolean'?value:null,busy};}
 async function set(enabled,expected){
  const before=snapshot(),owner=getContext().powerUserSettings;
  if(busy)throw Error('滑动设置正在保存，请稍候');
  if(!before.available)throw Error('当前宿主未提供原生手势开关，请到原生用户设置中关闭 Gestures');
  if(typeof enabled!=='boolean'||before.enabled!==expected)throw Error('原生手势设置已变化，请重新操作');
  if(enabled===expected)return before;
  busy=true;owner.gestures=enabled;onSync(snapshot());
  try{
   if(await persist()!==true)throw Error('宿主尚未确认保存');
   if(getContext().powerUserSettings!==owner||owner.gestures!==enabled)throw Error('原生设置在保存期间发生变化，请重新核对');
   return snapshot();
  }catch(error){
   if(getContext().powerUserSettings===owner&&owner.gestures===enabled)owner.gestures=expected;
   throw Error('滑动设置保存未完成：'+error.message);
  }finally{busy=false;onSync(snapshot());}
 }
 return {snapshot,set};
}

export function mountSwipeGestureToggle(document,parent,{control,onError=()=>{}}){
 const label=document.createElement('label'),input=document.createElement('input'),text=document.createElement('span'),note=document.createElement('p');
 input.type='checkbox';input.setAttribute('aria-label','原生左右滑动手势');text.textContent='允许左右滑动切换／重骰';note.setAttribute('role','status');label.append(input,text);parent.append(label,note);let expected;
 function refresh(message){const state=control.snapshot();expected=state.enabled;input.checked=state.enabled===true;input.disabled=!state.available||state.busy;note.textContent=message??(!state.available?'此宿主未提供开关，请到原生用户设置关闭 Gestures。':'这是整个酒馆的原生设置。关闭后，重骰按钮和已有候选的 n/N 切换仍可使用。');}
 input.addEventListener('focus',()=>refresh());
 input.addEventListener('change',async()=>{
  const wanted=input.checked;input.disabled=true;
  try{await control.set(wanted,expected);refresh(wanted?'已开启原生左右滑动手势。':'已关闭原生左右滑动手势；仍可点按钮重骰和切换候选。');}
  catch(error){refresh(error.message);onError(error);}
 });
 refresh();return {refresh};
}
