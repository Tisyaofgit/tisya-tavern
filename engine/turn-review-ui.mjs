import {mountReviewFormEditor} from './review-form-ui.mjs';
import {mountReviewWorkbench} from './review-workbench-ui.mjs';
import {floatingBounds} from '../floating-bounds.js';
export function mountTurnReview(document,{service,onError=()=>{},onForms=()=>{},active=true}){
 const el=(tag,text)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;return n;};
 const root=el('aside');root.className='tisya-turn-review';root.dataset.version='pet-review-foot-v2-20261116';root.hidden=true;
 const style=el('style');style.textContent=`
 .tisya-turn-review{--ink:#eee3c8;--muted:#b7c5b2;--gold:#d1bb7d;position:fixed;inset:0;z-index:9999;pointer-events:none;color:var(--ink);font:15px/1.65 var(--tisya-global-font,Georgia),"Noto Serif SC",serif}
 .tisya-turn-review *{box-sizing:border-box}.tisya-turn-review[hidden],.tisya-turn-review [hidden]{display:none!important}
 .tisya-turn-review button{font:inherit;color:inherit;border:1px solid #c4ab6860;border-radius:8px;background:#173d31;min-height:44px;padding:8px 15px;cursor:pointer}
 .tisya-turn-review button:disabled{opacity:.45;cursor:default}.tisya-turn-review button:focus-visible,.tisya-turn-review textarea:focus-visible{outline:2px solid var(--gold);outline-offset:2px}
 .tisya-turn-review>.review-notice{position:fixed;display:flex;align-items:center;justify-content:center;pointer-events:auto;min-height:44px;padding:8px 0;border:0;background:transparent;box-shadow:none;font-size:11px;line-height:1.4;max-width:150px;-webkit-tap-highlight-color:transparent}
 .review-notice-face{display:flex;align-items:center;justify-content:center;gap:4px;min-height:28px;padding:4px 9px;border:1px solid #d1bb7d80;border-radius:14px;background:linear-gradient(145deg,#254b3feb,#092b24f5);box-shadow:0 2px 8px #0003,inset 0 1px #f2e5aa1c;white-space:nowrap}
 .review-notice svg{width:13px;height:13px;flex:none}
 .tisya-turn-review>.review-notice[data-placement=drawer]{width:46px;min-height:76px;padding:9px 6px;border:1px solid #d1bb7d99;border-radius:15px 0 0 15px;border-right:0;font-size:12px;background:linear-gradient(145deg,#254b3feb,#092b24f5);box-shadow:-5px 4px 20px #0004}
 .review-notice[data-placement=drawer]>.review-notice-face{padding:0;border:0;border-radius:0;background:none;box-shadow:none;flex-direction:column;gap:4px}.review-notice[data-placement=drawer] svg{width:18px;height:18px}
 .review-notice[data-pending=true]>.review-notice-face{border-color:#e3c46b}.review-count{min-width:18px;padding:0 4px;border-radius:10px;background:#cfb56e;color:#16352b;font:12px/18px system-ui}
 .tisya-turn-review>section{position:fixed;pointer-events:auto;overflow:auto;overscroll-behavior:contain;background:linear-gradient(145deg,#153a2e,#09251e);border:1px solid #c4ab6890;border-radius:14px;padding:20px;box-shadow:0 24px 70px #0006,inset 0 1px #ecd59a18;margin:0}
 .tisya-turn-review header,.tisya-turn-review nav,.tisya-turn-review footer{display:flex;align-items:center;gap:10px;justify-content:space-between}.tisya-turn-review h2{font-size:23px;font-weight:400;margin:0}
 .tisya-turn-review nav{justify-content:flex-start;margin:16px 0}.tisya-turn-review p{color:var(--muted);font-size:13px;margin:10px 0}.tisya-turn-review label{display:block;margin:15px 0;color:var(--ink)}
 .tisya-turn-review input{accent-color:var(--gold);width:17px;height:17px;margin-right:8px}.tisya-turn-review textarea{display:block;width:100%;min-height:125px;resize:vertical;background:#071d18;color:var(--ink);border:1px solid #93a78270;border-radius:7px;padding:12px;font-family:inherit;font-size:14px;line-height:1.8;margin-top:8px}
 .tisya-turn-review input:not([type=checkbox]),.tisya-turn-review select{display:block;width:100%;min-height:40px;height:auto;margin:6px 0;padding:8px;background:#09251e;color:var(--ink);border:1px solid #93a78270;border-radius:6px;font:inherit}.tisya-turn-review nav{flex-wrap:wrap}.tisya-turn-review fieldset{border:1px solid #c4ab6860;border-radius:8px;margin:14px 0;padding:12px}.tisya-turn-review .field-row{border-bottom:1px solid #c4ab6830;padding:9px 0;display:grid;grid-template-columns:1fr 1fr;gap:5px}.tisya-turn-review .field-row>input{grid-column:1/-1}.tisya-turn-review .field-row label{margin:0}.tisya-turn-review pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}.tisya-turn-review small{color:var(--muted)}
 .tisya-turn-review .review-table-choice{border:1px solid #c4ab6840;border-radius:9px;margin:7px 0;padding:4px 10px}.review-table-heading{display:flex;align-items:center;gap:8px;cursor:pointer;min-height:44px}.review-table-heading>span{flex:1;min-width:0}.review-table-heading small{white-space:nowrap}.tisya-turn-review .review-field-choice{display:flex;align-items:center;gap:7px;margin:0;padding:8px 0}.review-field-choice>span{flex:1}.review-table-choice input[type=checkbox]{flex:none;width:20px;height:20px}.tisya-turn-review .review-workbench>div>details{margin:14px 0}.tisya-turn-review details>summary{cursor:pointer}.review-table-choice>div{border-top:1px solid #c4ab6830}
 .review-form-channel h3{font-size:17px;font-weight:500;margin:16px 0 8px}.tisya-turn-review .review-record{background:#173f3238;border-radius:12px;min-width:0;padding:12px}.tisya-turn-review .review-record legend{color:#e1ce94;font-size:14px;padding:0 7px}.tisya-turn-review .review-value-field{display:grid;gap:5px;margin:0;padding:11px 0;border-bottom:1px solid #d1bb7d26}.review-value-field:last-child{border-bottom:0}.review-value-field strong{font-size:14px;font-weight:500}.review-value-field small{overflow-wrap:anywhere}.tisya-turn-review .review-value-field input,.tisya-turn-review .review-value-field select,.tisya-turn-review .review-value-field textarea{margin:2px 0;min-height:42px}.tisya-turn-review .review-value-field textarea{min-height:68px}.review-field-effect{color:#d7cd9f}.review-raw{margin:18px 0;font-size:12px}.review-raw summary{cursor:pointer;color:var(--muted)}.review-field-warning{color:#efbda1!important}
 .tisya-turn-review footer{flex-wrap:wrap;border-top:1px solid #c4ab6840;padding-top:16px;margin-top:15px}.tisya-turn-review header h2{min-width:0}.tisya-turn-review header>button{flex:none}.tisya-turn-review .confirm{background:#d7c18a;color:#173426}.tisya-turn-review .history-entry{padding:12px 0;border-bottom:1px solid #c4ab6840;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px}
 @media(max-width:600px){.tisya-turn-review>section{padding:14px}.tisya-turn-review .review-tabs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:5px;margin:12px 0}.tisya-turn-review .review-tabs button{padding:6px 3px;font-size:12px;white-space:nowrap}.tisya-turn-review .review-value-field{gap:3px;padding:8px 0}}
 `;
 const panel=el('section');panel.hidden=true;panel.id='tisya-turn-review-panel';panel.setAttribute('role','dialog');panel.setAttribute('aria-label','每轮表单与归档确认');panel.tabIndex=-1;
 const toggle=el('button','表单与归档'),header=el('header'),title=el('h2','本轮待确认'),close=el('button','收起');
 header.append(title,close);const note=el('p'),archiveNote=el('p'),status=el('p');archiveNote.className='review-field-warning';archiveNote.hidden=true;status.setAttribute('role','status');
 const nav=el('nav'),currentButton=el('button','本轮'),historyButton=el('button','已存归档');nav.className='review-tabs';nav.append(currentButton,historyButton);
 const current=el('div'),history=el('div');history.hidden=true;
 const rawDetails=el('details');rawDetails.className='review-raw';rawDetails.append(el('summary','高级：查看或修正原始表单文本'));current.append(rawDetails);const editors={};for(const [key,label]of [['cells','本轮表单'],['archive','记忆归档']]){const group=el('label'),check=el('input');check.type='checkbox';check.checked=true;check.setAttribute('aria-label','保存'+label);const input=el('textarea');input.setAttribute('aria-label',label);group.append(check,document.createTextNode(label),input);rawDetails.append(group);editors[key]={input,check};}
 const footer=el('footer'),forms=el('button','表单字段'),confirm=el('button','确认并保存');confirm.className='confirm';footer.append(forms,confirm);current.append(footer);
 panel.append(header,note,archiveNote,nav,current,history,status);root.append(style,panel,toggle);document.body.append(root);
 let disposed=false,busy=false,dirty=false,snapshot=null,selected=null,epoch=0,pet=null,detachPet=null,petAnchor=null,pendingCount=0,noticeLabel='表单与归档';
 const win=document.defaultView,off=[];toggle.type=close.type='button';toggle.className='review-notice';toggle.setAttribute('aria-controls',panel.id);toggle.setAttribute('aria-expanded','false');
 const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('fill','none');icon.setAttribute('stroke','currentColor');icon.setAttribute('stroke-width','1.5');icon.setAttribute('aria-hidden','true');const path=document.createElementNS(icon.namespaceURI,'path');path.setAttribute('d','M6 3h12v18H6z M9 7h6 M9 11h6 M9 15h4');icon.append(path);const noticeText=el('span'),count=el('span');count.className='review-count';count.setAttribute('aria-hidden','true');const noticeFace=el('span');noticeFace.className='review-notice-face';noticeFace.append(icon,noticeText,count);toggle.replaceChildren(noticeFace);
 const clamp=(value,min,max)=>Math.max(min,Math.min(value,Math.max(min,max)));
 function place(){
  if(disposed)return;root.hidden=!active||!snapshot?.enabled;pet?.setNoticeSpace?.(root.hidden?0:50);
  const b=floatingBounds(document),foot=petAnchor?.foot,atFoot=petAnchor?.visible&&foot;
  const placement=atFoot?'foot':'drawer';toggle.dataset.placement=placement;toggle.dataset.pending=String(pendingCount>0);noticeText.textContent=atFoot?noticeLabel:'核验';count.textContent=String(pendingCount);count.hidden=!!atFoot||!pendingCount;toggle.setAttribute('aria-label',noticeLabel+'，打开表单与归档');toggle.title=noticeLabel;toggle.setAttribute('aria-expanded',String(!panel.hidden));toggle.hidden=!panel.hidden||b.height<44;
  const r=toggle.getBoundingClientRect(),width=atFoot?(r.width||100):46,height=r.height||(atFoot?44:76),cx=foot?foot.x+foot.width/2:0;
  const x=atFoot?clamp(cx-width/2,b.x,b.x+b.width-width):b.x+b.width-width+4,y=atFoot?clamp(foot.y+4,b.y,b.y+b.height-height):clamp(b.y+b.height*.5-height/2,b.y,b.y+b.height-height);
  Object.assign(toggle.style,{left:x+'px',top:y+'px',maxWidth:Math.min(150,b.width)+'px'});
  const panelWidth=Math.min(480,Math.max(1,b.width-12));Object.assign(panel.style,{width:panelWidth+'px',maxHeight:Math.max(0,b.height-12)+'px',left:(b.x+b.width-panelWidth-6)+'px',top:(b.y+6)+'px',visibility:b.height<64?'hidden':'visible'});
 }
 const listen=(node,event,fn)=>{node?.addEventListener(event,fn);off.push(()=>node?.removeEventListener(event,fn));};
 listen(win,'resize',place);listen(win.visualViewport,'resize',place);listen(win.visualViewport,'scroll',place);
 const resize=win.ResizeObserver?new win.ResizeObserver(place):null;for(const node of [document.querySelector('#chat'),document.querySelector('#send_form'),toggle])if(node)resize?.observe(node);
 function show(value,focus=false){panel.hidden=!value;place();if(focus)(value?close:toggle).focus({preventScroll:true});}
 const visualEditor=mountReviewFormEditor(document,{service,onError:error=>{status.textContent=error.message;},onChange:blocks=>{for(const key of ['cells','archive'])editors[key].input.value=blocks[key];dirty=true;}});current.insertBefore(visualEditor.root,rawDetails);
 const editorInput=review=>({uid:review.uid,sourceHash:review.sourceHash,contextKey:snapshot.contextKey,expectedRevision:snapshot.revision,cells:editors.cells.input.value,archive:editors.archive.input.value});
 const reparse=el('button','展开修改后的字段');reparse.type='button';reparse.onclick=()=>{if(selected)visualEditor.load(editorInput(selected),{readonly:selected.status==='confirmed'});};rawDetails.append(reparse);
 const workbench=mountReviewWorkbench(document,{service,run,getSnapshot:()=>snapshot,onForms});panel.insertBefore(workbench.root,status);current.insertBefore(workbench.requirements,footer);const saveDraft=el('button','保存候选草稿');footer.insertBefore(saveDraft,confirm);const reload=el('button','重载本轮');nav.append(reload);reload.onclick=()=>{dirty=false;selected=null;workbench.resetRequirements();refresh();};
 const reviewState=review=>review.status==='confirmed'?'已确认':review.archivePending?'归档待补':'待确认';
 const select=review=>{
  selected=review;dirty=false;current.hidden=false;history.hidden=true;
  const confirmed=review.status==='confirmed',candidate=snapshot.drafts?.[review.uid];
  const draft=!confirmed&&candidate?.hash===review.sourceHash?candidate:null;
  title.textContent=review.archivePending?'状态表单已保存，归档待补':'本轮'+reviewState(review);
  note.textContent='第 '+(review.index+1)+' 层'+(review.previousConfirmed?' · 重骰待确认，仍保留上次存档':'');
  archiveNote.hidden=!review.archivePending;
  archiveNote.textContent=review.archivePending?(review.archiveIssue??'请核对本轮记忆归档后再确认。'):'';
  for(const key of ['cells','archive']){editors[key].input.value=draft?.[key]??review[key]??'';editors[key].check.checked=true;editors[key].input.readOnly=confirmed;}
  visualEditor.load(editorInput(review),{readonly:confirmed});
  workbench.renderRequirements(snapshot,review,draft?.responses??review.decision?.responses);
  status.textContent=review.error??'';
  confirm.disabled=busy||confirmed||!!review.error;
 };
 async function refresh(){
  const at=++epoch;try{const next=await service.listTurnReviews();if(disposed||at!==epoch)return;if(!next){snapshot=null;selected=null;dirty=false;visualEditor.invalidate();show(false);return;}const before=selected;if(snapshot&&snapshot.contextKey!==next.contextKey){dirty=false;selected=null;panel.hidden=true;visualEditor.invalidate();}snapshot=next;workbench.refresh(next);
   const reviews=next.reviews,pending=reviews.filter(r=>r.status==='pending');pendingCount=pending.length;confirm.disabled=busy||!reviews.length;noticeLabel=pending.length?(pending.every(r=>r.archivePending)?'归档待补':'待确认')+' · '+pending.length:reviews.length?'本轮已确认 ✓':'表单与归档';place();
   if(dirty&&before){const live=reviews.find(r=>r.uid===before.uid);if(!live||live.sourceHash!==before.sourceHash||live.contextHash!==before.contextHash){status.textContent='正文或前序存档已变化，请重新打开本轮。';confirm.disabled=true;return;}}
   else{const chosen=reviews.find(r=>r.uid===before?.uid&&r.status==='pending')??pending[0]??reviews.at(-1);if(chosen){const workOpen=!workbench.root.hidden;select(chosen);if(workOpen){current.hidden=true;history.hidden=true;}}else{selected=null;visualEditor.invalidate();for(const e of Object.values(editors))e.input.value='';title.textContent='本轮暂无待确认内容';archiveNote.hidden=true;confirm.disabled=true;}}
   history.replaceChildren();for(const review of [...reviews].reverse()){const row=el('div');row.className='history-entry';const show=el('button','第 '+(review.index+1)+' 层 · '+reviewState(review));show.onclick=()=>select(review);row.append(show);if(review.status==='confirmed'){const undo=el('button','回退至此层之前');undo.onclick=()=>run(async()=>{await service.rewindTurnReviews({uid:review.uid,contextKey:snapshot.contextKey,expectedRevision:snapshot.revision});dirty=false;selected=null;});row.append(undo);}history.append(row);}
   return true;
  }catch(error){if(error.code==='CHAT_CHANGED'){snapshot=null;selected=null;dirty=false;show(false);return;}status.textContent=error.message;onError(error);}
 }
 async function run(fn){
  if(busy)return;
  const contextKey=snapshot?.contextKey;
  busy=true;confirm.disabled=true;status.textContent='正在保存…';
  let message;
  try{message=await fn()??'已保存';}catch(error){message=error.message;onError(error);}
  finally{busy=false;}
  if(await refresh()&&snapshot?.contextKey===contextKey)status.textContent=message;
 }
 for(const {input,check}of Object.values(editors)){input.oninput=()=>{dirty=true;visualEditor.rawChanged();};check.onchange=()=>{dirty=true;};}
 toggle.onclick=()=>{show(panel.hidden,true);if(!panel.hidden)refresh();};
 close.onclick=()=>show(false,true);
 currentButton.onclick=()=>{workbench.close();current.hidden=false;history.hidden=true;};historyButton.onclick=()=>{workbench.close();current.hidden=true;history.hidden=false;};
 forms.onclick=()=>{current.hidden=true;history.hidden=true;workbench.open();};const fieldsNav=el('button','字段与补录');fieldsNav.onclick=forms.onclick;nav.append(fieldsNav);saveDraft.onclick=()=>run(async()=>{if(!selected)return;await visualEditor.settled();const result=await service.reviewAction({action:'draft',uid:selected.uid,hash:selected.sourceHash,cells:editors.cells.input.value,archive:editors.archive.input.value,responses:workbench.responses(),contextKey:snapshot.contextKey,expectedRevision:snapshot.revision});snapshot.revision=result.revision;dirty=false;});
 confirm.onclick=()=>{
  if(!selected)return;
  return run(async()=>{
   const review=selected;
   const input={uid:review.uid,sourceHash:review.sourceHash,contextHash:review.contextHash,contextKey:snapshot.contextKey,expectedRevision:snapshot.revision,responses:workbench.responses(),...Object.fromEntries(Object.entries(editors).map(([key,e])=>[key,e.check.checked?e.input.value:'']))};
   await visualEditor.settled();
   const result=await service.confirmTurn(input);
   dirty=false;
   if(result?.status==='archive-pending')return '本轮归档待补：'+result.archiveIssue;
   selected=null;
   return '第 '+(review.index+1)+' 层已确认并保存。';
  });
 };
 panel.addEventListener('keydown',event=>{if(event.key==='Escape'){event.stopPropagation();show(false,true);}});
 const unsubscribe=service.subscribe(()=>refresh());const ready=refresh();return {root,ready,refresh,attachPet(value){detachPet?.();pet?.setNoticeSpace?.(0);pet=value;petAnchor=null;detachPet=pet?.observeAnchor?.(anchor=>{petAnchor=anchor;place();});place();},setActive(value){active=!!value;if(!active)panel.hidden=true;place();},openWorkbench(view='fields'){show(true);current.hidden=true;history.hidden=true;workbench.open(view);},dispose(){disposed=true;visualEditor.invalidate();detachPet?.();pet?.setNoticeSpace?.(0);resize?.disconnect();off.splice(0).forEach(fn=>fn());unsubscribe();root.remove();}};
}
