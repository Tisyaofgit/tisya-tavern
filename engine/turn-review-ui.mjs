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
 .tisya-turn-review>.review-notice[data-placement=drawer]{width:42px;min-height:64px;padding:7px 5px;border:1px solid #d1bb7d99;border-radius:13px;font-size:11px;background:linear-gradient(145deg,#254b3feb,#092b24f5);box-shadow:0 3px 14px #0004;touch-action:none;user-select:none;cursor:grab}
 .tisya-turn-review>.review-notice[data-placement=drawer][data-dragging=true]{cursor:grabbing;box-shadow:0 5px 22px #0007}
 .review-notice[data-placement=drawer][data-side=left]{border-radius:0 13px 13px 0;border-left:0}.review-notice[data-placement=drawer][data-side=right]{border-radius:13px 0 0 13px;border-right:0}
 .review-notice[data-placement=drawer]>.review-notice-face{padding:0;border:0;border-radius:0;background:none;box-shadow:none;flex-direction:column;gap:3px}.review-notice[data-placement=drawer] svg{width:16px;height:16px}
 .review-notice[data-pending=true]>.review-notice-face{border-color:#e3c46b}.review-count{min-width:18px;padding:0 4px;border-radius:10px;background:#cfb56e;color:#16352b;font:12px/18px system-ui}.review-notice[data-placement=drawer] .review-count{min-width:16px;padding:0 3px;font-size:11px;line-height:16px}
 .tisya-turn-review>section{position:fixed;pointer-events:auto;overflow:auto;overscroll-behavior:contain;background:linear-gradient(145deg,#153a2e,#09251e);border:1px solid #c4ab6890;border-radius:14px;padding:20px;box-shadow:0 24px 70px #0006,inset 0 1px #ecd59a18;margin:0}
 .tisya-turn-review header,.tisya-turn-review nav,.tisya-turn-review footer{display:flex;align-items:center;gap:10px;justify-content:space-between}.tisya-turn-review h2{font-size:23px;font-weight:400;margin:0}
 .tisya-turn-review nav{justify-content:flex-start;margin:16px 0}.tisya-turn-review p{color:var(--muted);font-size:13px;margin:10px 0}.tisya-turn-review label{display:block;margin:15px 0;color:var(--ink)}
 .tisya-turn-review input{accent-color:var(--gold);width:17px;height:17px;margin-right:8px}.tisya-turn-review textarea{display:block;width:100%;min-height:125px;resize:vertical;background:#071d18;color:var(--ink);border:1px solid #93a78270;border-radius:7px;padding:12px;font-family:inherit;font-size:14px;line-height:1.8;margin-top:8px}
 .tisya-turn-review input:not([type=checkbox]),.tisya-turn-review select{display:block;width:100%;min-height:40px;height:auto;margin:6px 0;padding:8px;background:#09251e;color:var(--ink);border:1px solid #93a78270;border-radius:6px;font:inherit}.tisya-turn-review nav{flex-wrap:wrap}.tisya-turn-review fieldset{border:1px solid #c4ab6860;border-radius:8px;margin:14px 0;padding:12px}.tisya-turn-review .field-row{border-bottom:1px solid #c4ab6830;padding:9px 0;display:grid;grid-template-columns:1fr 1fr;gap:5px}.tisya-turn-review .field-row>input{grid-column:1/-1}.tisya-turn-review .field-row label{margin:0}.tisya-turn-review pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}.tisya-turn-review small{color:var(--muted)}
 .tisya-turn-review .review-table-choice{border:1px solid #c4ab6840;border-radius:9px;margin:7px 0;padding:4px 10px}.review-table-heading{display:flex;align-items:center;gap:8px;cursor:pointer;min-height:44px}.review-table-heading>span{flex:1;min-width:0}.review-table-heading small{white-space:nowrap}.tisya-turn-review .review-field-choice{display:flex;align-items:center;gap:7px;margin:0;padding:8px 0}.review-field-choice>span{flex:1}.review-table-choice input[type=checkbox]{flex:none;width:20px;height:20px}.tisya-turn-review .review-workbench>div>details{margin:14px 0}.tisya-turn-review details>summary{cursor:pointer}.review-table-choice>div{border-top:1px solid #c4ab6830}
 .review-form-channel h3{font-size:17px;font-weight:500;margin:16px 0 8px}.tisya-turn-review .review-record{background:#173f3238;border-radius:12px;min-width:0;padding:12px}.tisya-turn-review .review-record legend{color:#e1ce94;font-size:14px;padding:0 7px}.tisya-turn-review .review-value-field{display:grid;gap:5px;margin:0;padding:11px 0;border-bottom:1px solid #d1bb7d26}.review-value-field:last-child{border-bottom:0}.review-value-field strong{font-size:14px;font-weight:500}.review-value-field small{overflow-wrap:anywhere}.tisya-turn-review .review-value-field input,.tisya-turn-review .review-value-field select,.tisya-turn-review .review-value-field textarea{margin:2px 0;min-height:42px}.tisya-turn-review .review-value-field textarea{min-height:68px}.review-field-effect{color:#d7cd9f}.review-raw{margin:18px 0;font-size:12px}.review-raw summary{cursor:pointer;color:var(--muted)}.review-field-warning{color:#efbda1!important}
 .tisya-turn-review footer{flex-wrap:wrap;border-top:1px solid #c4ab6840;padding-top:16px;margin-top:15px}.tisya-turn-review header h2{min-width:0}.tisya-turn-review header>button{flex:none}.tisya-turn-review .confirm{background:#d7c18a;color:#173426}.tisya-turn-review .history-entry{padding:12px 0;border-bottom:1px solid #c4ab6840;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px}
 .tisya-turn-review>section>header{position:sticky;top:-20px;z-index:4;margin:-4px -4px 0;padding:4px 4px 12px;background:#12372bf5;backdrop-filter:blur(12px)}
 .tisya-turn-review .review-tabs{display:grid;grid-template-columns:1fr 1fr;gap:8px}.review-tabs button{font-weight:600}.review-tabs .review-nav-secondary{color:var(--muted);background:#102e25;font-weight:400}
 .review-issues{margin:12px 0 18px;padding:14px;border:1px solid #e7a58b99;border-radius:12px;background:#542d27a8;box-shadow:inset 3px 0 #efb095}.review-issues>strong{font-size:16px;color:#ffe0cd}.review-issues p{margin:4px 0 10px;color:#f0c8b8}.review-issues ol{margin:0;padding-left:0;list-style:none;display:grid;gap:7px}.review-issues button{width:100%;height:auto;min-height:44px;padding:9px 11px;text-align:left;white-space:normal;line-height:1.55;background:#3b2823;border-color:#e7a58b66}
 .review-value-field.has-review-issue{margin:4px -8px;padding:11px 8px;border-left:3px solid #efad92;border-radius:5px;background:#673c2b38}.review-value-field.has-review-issue>strong{color:#ffd5bd}
 .tisya-turn-review footer{position:sticky;bottom:-20px;z-index:4;display:grid;grid-template-columns:1fr 1fr 1.35fr;gap:9px;margin:18px -4px -4px;padding:14px 4px 4px;background:#0c2b22f5;backdrop-filter:blur(12px)}.tisya-turn-review footer button{min-height:48px;padding:10px 12px}.tisya-turn-review footer .confirm{font-weight:700;box-shadow:0 3px 14px #0003}
 @media(min-width:760px){.review-form-editor{display:grid;grid-template-columns:1fr 1fr;gap:18px;align-items:start}.review-form-channel{min-width:0}}
 @media(max-width:600px){.tisya-turn-review>section{padding:14px}.tisya-turn-review>section>header{top:-14px}.tisya-turn-review .review-tabs{gap:7px;margin:12px 0}.tisya-turn-review .review-tabs button{padding:9px 6px;font-size:14px;white-space:nowrap}.tisya-turn-review .review-value-field{gap:4px;padding:10px 0}.tisya-turn-review footer{bottom:-14px;grid-template-columns:1fr 1fr}.tisya-turn-review footer .confirm{grid-column:1/-1;grid-row:1;min-height:52px}.review-issues{padding:11px}}
 `;
 const panel=el('section');panel.hidden=true;panel.id='tisya-turn-review-panel';panel.setAttribute('role','dialog');panel.setAttribute('aria-label','每轮表单与归档确认');panel.tabIndex=-1;
 const toggle=el('button','表单与归档'),header=el('header'),title=el('h2','本轮待确认'),close=el('button','收起');
 header.append(title,close);const note=el('p'),archiveNote=el('p'),status=el('p');archiveNote.className='review-field-warning';archiveNote.hidden=true;status.setAttribute('role','status');
 const nav=el('nav'),currentButton=el('button','本轮核对'),historyButton=el('button','归档记录');nav.className='review-tabs';nav.append(currentButton,historyButton);
 const current=el('div'),history=el('div');history.hidden=true;const issueBox=el('section');issueBox.className='review-issues';issueBox.hidden=true;
 const rawDetails=el('details');rawDetails.className='review-raw';rawDetails.append(el('summary','高级：查看或修正原始表单文本'));current.append(issueBox,rawDetails);const editors={};for(const [key,label]of [['cells','本轮表单'],['archive','记忆归档']]){const group=el('label'),check=el('input');check.type='checkbox';check.checked=true;check.setAttribute('aria-label','保存'+label);const input=el('textarea');input.setAttribute('aria-label',label);group.append(check,document.createTextNode(label),input);rawDetails.append(group);editors[key]={input,check};}
 const footer=el('footer'),confirm=el('button','确认并保存');confirm.className='confirm';footer.append(confirm);current.append(footer);
 panel.append(header,note,archiveNote,nav,current,history,status);root.append(style,panel,toggle);document.body.append(root);
 let disposed=false,busy=false,dirty=false,snapshot=null,selected=null,epoch=0,pet=null,detachPet=null,petAnchor=null,pendingCount=0,noticeLabel='表单与归档';
 const win=document.defaultView,off=[];toggle.type=close.type='button';toggle.className='review-notice';toggle.setAttribute('aria-controls',panel.id);toggle.setAttribute('aria-expanded','false');
 const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('fill','none');icon.setAttribute('stroke','currentColor');icon.setAttribute('stroke-width','1.5');icon.setAttribute('aria-hidden','true');const path=document.createElementNS(icon.namespaceURI,'path');path.setAttribute('d','M6 3h12v18H6z M9 7h6 M9 11h6 M9 15h4');icon.append(path);const noticeText=el('span'),count=el('span');count.className='review-count';count.setAttribute('aria-hidden','true');const noticeFace=el('span');noticeFace.className='review-notice-face';noticeFace.append(icon,noticeText,count);toggle.replaceChildren(noticeFace);
 const clamp=(value,min,max)=>Math.max(min,Math.min(value,Math.max(min,max)));
 const positionKey='tisya.turn-review.drawer-position.v1';let drawerPosition={side:'right',ratio:.5},drag=null,suppressClick=false;
 try{const saved=JSON.parse(win.localStorage?.getItem(positionKey)??'null');if(saved&&['left','right'].includes(saved.side)&&Number.isFinite(saved.ratio))drawerPosition={side:saved.side,ratio:clamp(saved.ratio,0,1)};}catch{}
 function saveDrawerPosition(){try{win.localStorage?.setItem(positionKey,JSON.stringify(drawerPosition));}catch{}}
 function place(){
  if(disposed)return;root.hidden=!active||!snapshot?.enabled;pet?.setNoticeSpace?.(root.hidden?0:50);
  const b=floatingBounds(document),foot=petAnchor?.foot,atFoot=petAnchor?.visible&&foot;
  const placement=atFoot?'foot':'drawer';toggle.dataset.placement=placement;toggle.dataset.side=drawerPosition.side;toggle.dataset.pending=String(pendingCount>0);noticeText.textContent=atFoot?noticeLabel:'核验';count.textContent=String(pendingCount);count.hidden=!!atFoot||!pendingCount;toggle.setAttribute('aria-label',noticeLabel+'，打开表单与归档'+(atFoot?'':'；可拖动调整左右侧与上下位置'));toggle.title=noticeLabel+(atFoot?'':' · 拖动调整位置');toggle.setAttribute('aria-expanded',String(!panel.hidden));toggle.hidden=!panel.hidden||b.height<44;
  const r=toggle.getBoundingClientRect(),width=atFoot?(r.width||100):42,height=r.height||(atFoot?44:64),cx=foot?foot.x+foot.width/2:0;
  const drawerX=drawerPosition.side==='left'?b.x-4:b.x+b.width-width+4,x=atFoot?clamp(cx-width/2,b.x,b.x+b.width-width):drawerX,y=atFoot?clamp(foot.y+4,b.y,b.y+b.height-height):b.y+Math.max(0,b.height-height)*drawerPosition.ratio;
  Object.assign(toggle.style,{left:x+'px',top:y+'px',maxWidth:Math.min(150,b.width)+'px'});
  const panelWidth=Math.min(860,Math.max(1,b.width-12)),panelLeft=drawerPosition.side==='left'?b.x+2:b.x+b.width-panelWidth-6;Object.assign(panel.style,{width:panelWidth+'px',maxHeight:Math.max(0,b.height-12)+'px',left:panelLeft+'px',top:(b.y+6)+'px',visibility:b.height<64?'hidden':'visible'});
 }
 const listen=(node,event,fn)=>{node?.addEventListener(event,fn);off.push(()=>node?.removeEventListener(event,fn));};
 listen(win,'resize',place);listen(win.visualViewport,'resize',place);listen(win.visualViewport,'scroll',place);
 const resize=win.ResizeObserver?new win.ResizeObserver(place):null;for(const node of [document.querySelector('#chat'),document.querySelector('#send_form'),toggle])if(node)resize?.observe(node);
 listen(toggle,'pointerdown',event=>{
  if(toggle.dataset.placement!=='drawer'||panel.hidden===false||event.button!==0)return;
  drag={id:event.pointerId,x:event.clientX,y:event.clientY,top:parseFloat(toggle.style.top)||0,moved:false};toggle.dataset.dragging='false';try{toggle.setPointerCapture?.(event.pointerId);}catch{}
 });
 listen(toggle,'pointermove',event=>{
  if(!drag||drag.id!==event.pointerId)return;if(!drag.moved&&Math.hypot(event.clientX-drag.x,event.clientY-drag.y)<6)return;drag.moved=true;event.preventDefault();toggle.dataset.dragging='true';
  const b=floatingBounds(document),height=toggle.getBoundingClientRect().height||64,available=Math.max(0,b.height-height),y=clamp(drag.top+event.clientY-drag.y,b.y,b.y+available),mid=b.x+b.width/2;
  drawerPosition={side:event.clientX<mid?'left':'right',ratio:available?clamp((y-b.y)/available,0,1):.5};place();
 });
 const finishDrag=(event,cancelled=false)=>{
  if(!drag||drag.id!==event.pointerId)return;const moved=drag.moved;drag=null;toggle.dataset.dragging='false';try{toggle.releasePointerCapture?.(event.pointerId);}catch{}if(moved){saveDrawerPosition();if(!cancelled){suppressClick=true;win.setTimeout(()=>{suppressClick=false;},0);}}
 };
 listen(toggle,'pointerup',event=>finishDrag(event));listen(toggle,'pointercancel',event=>finishDrag(event,true));
 listen(toggle,'keydown',event=>{
  if(toggle.dataset.placement!=='drawer'||!event.altKey||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();
  if(event.key==='ArrowLeft'||event.key==='ArrowRight')drawerPosition.side=event.key==='ArrowLeft'?'left':'right';else drawerPosition.ratio=clamp(drawerPosition.ratio+(event.key==='ArrowUp'?-.08:.08),0,1);saveDrawerPosition();place();
 });
 function show(value,focus=false){panel.hidden=!value;place();if(focus)(value?close:toggle).focus({preventScroll:true});}
 const visualEditor=mountReviewFormEditor(document,{service,onError:error=>{status.textContent=error.message;},onChange:blocks=>{for(const key of ['cells','archive'])editors[key].input.value=blocks[key];dirty=true;presentIssues([]);}});current.insertBefore(visualEditor.root,rawDetails);
 function presentIssues(issues=[]){
  visualEditor.showIssues(issues);issueBox.replaceChildren();issueBox.hidden=!issues.length;if(!issues.length){issueBox.removeAttribute('role');return;}issueBox.setAttribute('role','alert');
  issueBox.append(el('strong','发现 '+issues.length+' 处需要修正'),el('p','修改后可再次检查；检查通过前不会保存。'));
  const list=el('ol');for(const [index,issue]of issues.entries()){
   const item=el('li'),jump=el('button',(index+1)+'. '+(issue.message??issue.label??'字段需要修正'));jump.type='button';jump.onclick=()=>{if(!visualEditor.focusIssue(issue)){rawDetails.open=true;editors[issue.channel??'cells']?.input.focus();}};item.append(jump);list.append(item);
  }issueBox.append(list);
 }
 const editorInput=review=>({uid:review.uid,sourceHash:review.sourceHash,contextKey:snapshot.contextKey,expectedRevision:snapshot.revision,cells:editors.cells.input.value,archive:editors.archive.input.value});
 const reparse=el('button','展开修改后的字段');reparse.type='button';reparse.onclick=()=>{if(selected)visualEditor.load(editorInput(selected),{readonly:selected.status==='confirmed'});};rawDetails.append(reparse);
 const workbench=mountReviewWorkbench(document,{service,run,getSnapshot:()=>snapshot,onForms});panel.insertBefore(workbench.root,status);current.insertBefore(workbench.requirements,footer);const saveDraft=el('button','保存草稿'),check=el('button','检查全部字段');footer.insertBefore(saveDraft,confirm);footer.insertBefore(check,confirm);const reload=el('button','重新读取');reload.className='review-nav-secondary';nav.append(reload);reload.onclick=()=>{dirty=false;selected=null;workbench.resetRequirements();refresh();};
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
  status.textContent=review.error??'';presentIssues([]);
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
 async function run(fn,{working='正在保存…'}={}){
  if(busy)return;
  const contextKey=snapshot?.contextKey;let failure=null;
  busy=true;confirm.disabled=true;check.disabled=true;status.textContent=working;
  let message;
  try{message=await fn()??'已保存';}catch(error){failure=error;message=error.message;onError(error);}
  finally{busy=false;check.disabled=false;}
  if(await refresh()&&snapshot?.contextKey===contextKey){status.textContent=message;if(failure)presentIssues(failure.details?.issues??[]);}
 }
 for(const {input,check:enabled}of Object.values(editors)){input.oninput=()=>{dirty=true;presentIssues([]);visualEditor.rawChanged();};enabled.onchange=()=>{dirty=true;};}
 toggle.onclick=()=>{if(suppressClick){suppressClick=false;return;}show(panel.hidden,true);if(!panel.hidden)refresh();};
 close.onclick=()=>show(false,true);
 currentButton.onclick=()=>{workbench.close();current.hidden=false;history.hidden=true;};historyButton.onclick=()=>{workbench.close();current.hidden=true;history.hidden=false;};
 const fieldsNav=el('button','字段设置');fieldsNav.className='review-nav-secondary';fieldsNav.onclick=()=>{current.hidden=true;history.hidden=true;workbench.open();};nav.append(fieldsNav);saveDraft.onclick=()=>run(async()=>{if(!selected)return;await visualEditor.settled();const result=await service.reviewAction({action:'draft',uid:selected.uid,hash:selected.sourceHash,cells:editors.cells.input.value,archive:editors.archive.input.value,responses:workbench.responses(),contextKey:snapshot.contextKey,expectedRevision:snapshot.revision});snapshot.revision=result.revision;dirty=false;return '草稿已保存，可稍后继续核对。';});
 check.onclick=()=>{if(!selected)return;const review=selected;return run(async()=>{await visualEditor.settled();const input={uid:review.uid,sourceHash:review.sourceHash,contextHash:review.contextHash,contextKey:snapshot.contextKey,expectedRevision:snapshot.revision,responses:workbench.responses(),...Object.fromEntries(Object.entries(editors).map(([key,e])=>[key,e.check.checked?e.input.value:'']))},result=await service.checkTurnReview(input);if(result.status==='invalid')throw Object.assign(Error('本轮表单尚不能保存，共 '+result.issues.length+' 处需要修正'),{details:{issues:result.issues}});return result.archiveIssue?'字段检查通过；记忆归档仍需补正：'+result.archiveIssue:'全部字段检查通过，可以确认保存。';},{working:'正在检查全部字段…'});};
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
