import {NEXT_TEMPLATE,WATER_CONTROL_CSS,decorateWaterControl,mountOriginalLedger} from './reply-ui-original.js';
import {mountHeartBlock} from './reply-details.js';
export {WATER_CONTROL_CSS};

// Keep the approved template hierarchy and ledger renderer. The reader model
// contains only the original public task summary and ACL-checked pending rows.
export function mountRoundPanel(document,container,value,part){
 if(!['task','next'].includes(part))throw Error('TISYA_ROUND_PART_INVALID');
 if(part==='next'){const t=document.createElement('template');t.innerHTML=NEXT_TEMPLATE;container.append(t.content);}
 const button=container.querySelector('#'+part+'-toggle'),content=container.querySelector('#'+part+'-content'),placeholder=container.querySelector('#'+part+'-heart');
 if(!button||!content||!placeholder)throw Error('TISYA_ROUND_TEMPLATE_INVALID');
 const onepass=value.protocol===4,six=value.protocol===3||onepass;
 let alive=true;button.type='button';
 if(six){button.textContent=part==='task'?(onepass?'偏好 · 草案与推演':'开篇摘要'):'核验与待办';container.dataset.replyProtocol=onepass?'onepass':'six';}
 decorateWaterControl(button,new URL('./assets/controls/'+(part==='task'?'task':'pending')+'.svg',import.meta.url).href);
 const toggle=()=>{if(!alive||!container.isConnected)return;content.hidden=!content.hidden;button.setAttribute('aria-expanded',String(!content.hidden));};
 button.addEventListener('click',toggle);
 const heart=mountHeartBlock(document,container,part==='task'?value.taskHeart:value.nextHeart,{label:six?(part==='task'?'开篇心声':'收篇心声'):(part==='task'?'任务心声':'剧情心声')});
 if(heart){heart.id=part+'-heart';placeholder.replaceWith(heart);}else placeholder.remove();
 const empty=(title,text,kind)=>{const ledger=mountOriginalLedger(document,content,title,[],kind),p=document.createElement('p');p.textContent=text;ledger.querySelector('.ledger-body').append(p);};
 if(value.rounds.error){const p=document.createElement('p');p.setAttribute('role','status');p.textContent='任务与待办暂未通过显示校验，原消息保留。';content.append(p);}
 else if(part==='task'){
  if(onepass){
   mountOriginalLedger(document,content,'用户偏好分析',value.preferences??[],'preference-ledger');
   const design=new Set(['设计','信息迷雾','世界推演']);
   mountOriginalLedger(document,content,'创作草案',value.rounds.tasks.filter(r=>!design.has(r.label)),'draft-ledger');
   mountOriginalLedger(document,content,'人物与世界推演',value.rounds.tasks.filter(r=>design.has(r.label)),'simulation-ledger');
  }else{
  if(value.rounds.tasks.length)mountOriginalLedger(document,content,six?'开篇摘要':'任务',value.rounds.tasks,'task-ledger');else empty(six?'暂无公开摘要':'暂无公开任务',six?'本条没有可展示的开篇摘要。':'本条没有可展示的任务摘要。','task-ledger');
  }
 }else{
  mountOriginalLedger(document,content,'核验',value.audit.map(a=>({label:a.kind,status:a.status,text:a.evidence})),'audit-ledger');
  if(value.rounds.pending.length)mountOriginalLedger(document,content,'待办事项',value.rounds.pending,'todo-ledger');else empty('暂无公开待办','本条没有可展示的待办记录。','todo-ledger');
  if(value.rounds.delivered.length)mountOriginalLedger(document,content,'本轮交付',value.rounds.delivered);
  if(six&&value.rounds.candidates?.length)mountOriginalLedger(document,content,'后续候选（尚未发生）',value.rounds.candidates,'candidate-ledger');
  if(value.rounds.pendingError){const p=document.createElement('p');p.setAttribute('role','status');p.textContent='待办记录未通过公开权限校验，原消息保留。';content.append(p);}
 }
 if(part==='task'){
  const counters=document.createElement('span');counters.className='top-counters';
  for(const [label,count]of [[six?'摘要':'任务',value.rounds.tasks?.length??0],['核验',value.audit.length],['待办',value.rounds.pending?.length??0]]){const bead=document.createElement('span'),n=document.createElement('b');bead.className='count-bead';n.textContent=String(count);bead.append(n,document.createTextNode(label));counters.append(bead);}
  container.querySelector('.task-line').replaceChildren(counters);
 }
 return {heart,capture(){return {open:!content.hidden,ledgers:[...content.querySelectorAll('details')].map(n=>n.open),heart:heart?.captureHeart?.()};},restore(state){if(!state)return;if(typeof state.open==='boolean'){content.hidden=!state.open;button.setAttribute('aria-expanded',String(state.open));}for(const [i,n]of [...content.querySelectorAll('details')].entries())if(typeof state.ledgers?.[i]==='boolean')n.open=state.ledgers[i];heart?.restoreHeart?.(state.heart);},dispose(){alive=false;button.removeEventListener('click',toggle);heart?.disposeHeart?.();}};
}
