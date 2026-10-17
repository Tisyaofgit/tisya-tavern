import {elements} from '../ui/dom.js';
// Text-only source rendering: card markup and proposed rules are never executed.
export function renderRuleReview(document,parent,{review,stale=false,onChoose}){
 const el=elements(document);
 parent.replaceChildren();
 if(!review){parent.append(el('p','尚未校对。按原卡初始化前会检查规则冲突、缺口和不可执行条件。'));return;}
 if(stale){const n=el('p','原始规则已改变，请重新校对；此前选择暂不适用。');n.style.color='#c62828';n.setAttribute('role','alert');parent.append(n);return;}
 if(!review.issues.length){parent.append(el('p','本次校对未提出规则问题；这不是所有运行场景均正确的保证。'));return;}
 for(const issue of review.issues){
  const choice=review.decisions[issue.id],box=el('details');box.dataset.ruleIssue=issue.id;box.open=!choice;
  const title=el('summary',(choice?choice.action==='keep'?'已保留并静默 · ':'已选优化 · ':'待选择 · ')+issue.title);if(!choice){title.style.color='#c62828';title.style.fontWeight='700';box.style.border='1px solid #c62828';title.setAttribute('role','alert');}box.append(title,el('p',issue.problem));
  for(const anchor of issue.sources)box.append(el('small',anchor.sourceId),el('pre',anchor.quote));
  const button=(label,action)=>{const b=el('button',label);b.type='button';b.onclick=action;box.append(b);};
  if(choice){if(choice.action==='optimize')box.append(el('p','生效方案：'+issue.options.find(o=>o.id===choice.optionId)?.label));button('重新选择此项',()=>onChoose({issueId:issue.id,action:'reopen'}));}
  else{
   button('保留原规则并静默',()=>onChoose({issueId:issue.id,action:'keep'}));
   for(const option of issue.options){const details=el('details');details.append(el('summary','优化思路：'+option.label),el('p',option.rationale),el('p','影响与取舍：'+option.tradeoffs));for(const change of option.changes)details.append(el('small',change.sourceId),el('p','修改前'),el('pre',change.before),el('p','缇斯亚版'),el('pre',change.after));const b=el('button','应用此方案：'+option.label);b.type='button';b.onclick=()=>onChoose({issueId:issue.id,action:'optimize',optionId:option.id});details.append(b);box.append(details);}
   if(!issue.options.length)box.append(el('p','当前没有可验证的纯规则优化方案；可以保留静默，或补充设定后重新校对。'));
  }
  parent.append(box);
 }
}
