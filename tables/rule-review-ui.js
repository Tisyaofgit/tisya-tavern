// Render only one question. Selection persistence remains owned by saveRuleChoice.
// The WeakMap retains the user's position across the service's saved-review redraw.
const views=new WeakMap();
export function renderRuleReview(document,parent,{review,stale=false,onChoose,onComplete}){
 const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
 let state=views.get(parent);const identity=review?review.fingerprint+'|'+(review.at??''):null;
 if(!state||state.identity!==identity){state={identity,index:review?(review.issues.findIndex(i=>!review.decisions[i.id])<0?review.issues.length:review.issues.findIndex(i=>!review.decisions[i.id])):0,pending:null,error:'',busy:false};views.set(parent,state);}
 if(state.pending){const p=state.pending,decision=review?.decisions[p.choice.issueId];const saved=p.choice.action==='reopen'?!decision:decision?.action===p.choice.action&&(p.choice.action!=='optimize'||decision.optionId===p.choice.optionId);if(saved){state.index=p.choice.action==='reopen'?p.index:Math.min(p.index+1,review.issues.length);state.pending=null;state.busy=false;state.error='';}}
 if(review)state.index=Math.min(state.index,review.issues.length);state.review=review;state.onChoose=onChoose;state.onComplete=onComplete;state.stale=stale;
 function button(host,label,fn,{disabled=false}={}){const b=el('button',label);b.type='button';b.disabled=state.busy||disabled;b.onclick=fn;host.append(b);return b;}
 function show(index){state.index=index;state.error='';draw();}
 async function choose(choice){
  if(state.busy)return;const pending={choice,index:state.index};state.pending=pending;state.busy=true;state.error='';draw();
  try{await state.onChoose(choice);}catch(error){if(state.pending===pending)state.error=error?.message??String(error);}
  finally{if(state.pending===pending){state.pending=null;state.busy=false;draw();}}
 }
 function draw(){
  parent.replaceChildren();const review=state.review;
  if(!review){parent.append(el('p','尚未校对。按原卡初始化前会检查规则冲突、缺口和不可执行条件。'));return;}
  if(state.stale){const n=el('p','原始规则已改变，请重新校对；此前选择暂不适用。');n.setAttribute('role','alert');parent.append(n);return;}
  if(!review.issues.length){parent.append(el('p','本次校对未提出规则问题，可以继续生成表格。'));if(state.onComplete)button(parent,'继续生成表格',state.onComplete);return;}
  const unresolved=review.issues.filter(i=>!review.decisions[i.id]),bar=el('div');bar.className='tisya-rule-step-nav';bar.style.cssText='display:flex;align-items:center;gap:8px;flex-wrap:wrap';
  if(state.index>0)button(bar,'‹ 上一项',()=>show(state.index-1));
  const count=el('strong',state.index>=review.issues.length?'选择已核对':`第 ${state.index+1} / ${review.issues.length} 项`);bar.append(count);parent.append(bar);
  if(state.error){const error=el('p',state.error);error.setAttribute('role','alert');parent.append(error);}
  const progress=el('p',state.busy?'正在保存这项选择…':`已保存 ${review.issues.length-unresolved.length} / ${review.issues.length} 项选择`);progress.setAttribute('role','status');parent.append(progress);
  if(state.index>=review.issues.length){
   parent.append(el('p',unresolved.length?`还有 ${unresolved.length} 项未选择。`:'规则选择已保存。下一步是生成并核对表格，不需要重新校对原卡。'));
   if(unresolved.length)button(parent,'处理未选项目',()=>show(review.issues.indexOf(unresolved[0])));else if(state.onComplete)button(parent,'继续生成表格',state.onComplete);
   const label=el('label','回看已选项目'),picker=el('select');picker.setAttribute('aria-label','回看规则项目');review.issues.forEach((issue,index)=>{const o=el('option',`${index+1}. ${issue.title}`);o.value=String(index);picker.append(o);});label.append(picker);parent.append(label);button(parent,'查看这一项',()=>show(Number(picker.value)));return;
  }
  const issue=review.issues[state.index],choice=review.decisions[issue.id],box=el('section');box.dataset.ruleIssue=issue.id;box.style.cssText='min-width:0;max-width:100%';
  const title=el('h3',issue.title);if(!choice){title.style.color='#c62828';title.setAttribute('role','alert');}box.append(title,el('p',issue.problem));
  const original=el('details');original.append(el('summary','查看原卡依据'));for(const anchor of issue.sources)original.append(el('small',anchor.sourceId),el('pre',anchor.quote));box.append(original);
  if(choice){
   box.append(el('p',choice.action==='keep'?'已保留原规则并静默此项':'已选优化：'+issue.options.find(o=>o.id===choice.optionId)?.label));
   button(box,'重新选择此项',()=>choose({issueId:issue.id,action:'reopen'}));button(box,state.index===review.issues.length-1?'完成核对':'下一项 ›',()=>show(state.index+1));
  }else{
   button(box,'保留原规则并静默',()=>choose({issueId:issue.id,action:'keep'}));
   for(const option of issue.options){const details=el('details');details.append(el('summary','优化思路：'+option.label),el('p',option.rationale),el('p','影响与取舍：'+option.tradeoffs));for(const change of option.changes)details.append(el('small',change.sourceId),el('p','修改前'),el('pre',change.before),el('p','缇斯亚版'),el('pre',change.after));button(details,'应用此方案：'+option.label,()=>choose({issueId:issue.id,action:'optimize',optionId:option.id}));box.append(details);}
   if(!issue.options.length)box.append(el('p','当前没有可验证的纯规则优化方案；可以保留静默，或补充设定后重新校对。'));
  }
  parent.append(box);
 }
 draw();return {showIssue(id){const index=state.review?.issues.findIndex(i=>i.id===id);if(index>=0)show(index);}};
}
