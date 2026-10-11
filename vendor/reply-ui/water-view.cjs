'use strict';
const {decodedResourceImage,mountPresentationTemplate}=require('./resource-runtime.cjs');
const {createHeartService,createHeartCursor}=require('./heart-service.cjs');
const {createWaterMotion}=require('./water-motion.cjs');
const {decorateTerms,bindCodexReferences}=require('./term-decorator.cjs');
const {mountCodexCard}=require('./codex-card.cjs');
const {mountBoundMedia}=require('./media-presenter.cjs');
const {mountInteractionFeedback}=require('./interaction.cjs');
const {renderProse}=require('./prose-view.cjs');
const {mountDisplayDocuments}=require('./card-display.cjs');
const {parseDisplayRail}=require('./output-rail.cjs');
const {validateDisplayData,displayCandidateRows}=require('./display-data.cjs');
const {WATER_CONTROL_CSS,decorateWaterControl}=require('./water-controls.cjs');
const {CHAT_FIELDS}=require('./chat-effects-options.cjs');
const {JOURNEY_FIELDS}=require('./journey-options.cjs');
// Chat atmosphere/navigation belong to the shell. Changing those preferences
// must not discard a message, its open folds, iframe or reading position.
function displayStamp(configs){return JSON.stringify(Object.fromEntries(Object.entries(configs).map(([id,cfg])=>[id,id==='extensions'?Object.fromEntries(Object.entries(cfg.effective.values).filter(([key])=>!Object.hasOwn(CHAT_FIELDS,key)&&!Object.hasOwn(JOURNEY_FIELDS,key))):cfg])));}
function mountWaterView({container,source,cover,controller,assets,motionMeta,layout,css,exists,emotes,onError,display,cardBridge,prepareDisplayDocument,openApplication}){
 if(!display||typeof display.body!=='string'||typeof display.extra!=='string'||typeof openApplication!=='function')throw Error('TISYA_DISPLAY_PIPELINE_REQUIRED');
 const doc=container.ownerDocument,win=doc.defaultView,root=container.attachShadow({mode:'open'}),shell=mountPresentationTemplate({document:doc,root,layout,css:css+'\n'+WATER_CONTROL_CSS});
 const $=s=>root.querySelector(s),el=(tag,text,cls)=>{const n=doc.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
 const data=validateDisplayData(parseDisplayRail(source)),world=data.title.world;let alive=true,toastTimer,refreshEpoch=0;const cleanups=[];let configStamp=null,codexRevision=null;let proseCleanup=()=>{},extraCleanup=()=>{},extraReady=Promise.resolve(),bodyDisplay=null,extraDisplay=null,extraState=null;const extraStates=new Map();let extraSelected=null;
 let paused=false,visible=true;const displayMotion={body:true,extra:true};
 function pauseDisplays(){bodyDisplay?.setPaused(paused||!visible||!displayMotion.body);extraDisplay?.setPaused(paused||!visible||!displayMotion.extra||worldMinimized);}
 const call=(op,p)=>controller.call(op,p),resolveURL=p=>p;
 function notice(text){if(!alive)return;$('#toast').textContent=text;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{if(alive)$('#toast').hidden=true;},4000);}
 function fail(e){onError(e);}
 const decodeImage=async url=>{const im=await decodedResourceImage({document:doc,url,isAlive:()=>alive});return {width:im.naturalWidth,height:im.naturalHeight};};
 for(const name of ['dashboard-frame','lamp-scene','scroll-sides'])container.style.setProperty('--asset-'+name,'url("'+assets[name+'.png']+'")');
 for(const n of root.querySelectorAll('[data-asset]'))n.src=assets[n.dataset.asset];
 for(const [id,name]of Object.entries({'task-toggle':'task','next-toggle':'pending'}))decorateWaterControl($('#'+id),assets[name+'.svg']);
 $('#mode-toggle').replaceChildren();decorateWaterControl($('#mode-toggle'),assets['quill.svg']);
 $('.hero').hidden=!cover;if(cover)$('#cover').src=cover;
 $('.hero-text h1').textContent=data.title.text;$('.hero-text p').textContent=data.title.world??'';$('.dateline').textContent=[data.title.time,data.title.place].filter(x=>x!==null).join('　·　');
 $('.journey-region').setAttribute('aria-label','旅程');
 const journey=require('./journey-view.cjs').mountJourneyView({container:$('#journey-dashboard'),source,call,assets,onError:fail});
 let journeyMinimized=false,journeyTouched=false,worldMinimized=false,worldTouched=false;
 const {mountPendantRack}=require('./pendant-rack.cjs');
 const rack=mountPendantRack({root:shell,assets});
 function minimizeWorld(value,event){if(event)worldTouched=true;worldMinimized=value;rack.setExpanded('world-extension',!value,{animate:!!event});pauseDisplays();}
 function minimizeJourney(value,event){if(event)journeyTouched=true;journeyMinimized=value;rack.setExpanded('journey',!value,{animate:!!event});}
 rack.register({id:'world-extension',title:'世界扩展',region:$('.world-extension'),panel:$('#world-extension-expanded'),landing:$('#world-extension-landing'),cover,onToggle:(expanded,event)=>minimizeWorld(!expanded,event)});
 rack.register({id:'journey',title:'旅程',region:$('.journey-region'),panel:$('#journey-dashboard'),landing:$('#journey-landing'),cover:assets['journey-cover.png'],onToggle:(expanded,event)=>minimizeJourney(!expanded,event)});
 function applyJourneyDefault(configs){journey.applySettings(configs.extensions);if(!journeyTouched)minimizeJourney(configs.extensions.effective.values.旅程球默认状态==='收起');if(!worldTouched)minimizeWorld(configs.extensions.effective.values.世界扩展默认状态==='收起');}
 $('.extension-world').textContent=world??'';$('.extension-world').hidden=world===null;

 const variableRouting=require('./mvu-output.cjs').normalizeMvuOutput(source);
 const explicit=require('./xml-envelope.cjs').replyRegion(variableRouting.source).thoughts;
 if(explicit.length){const d=el('details',undefined,'explicit-thought'),summary=el('summary','思考与检查'),text=el('pre',explicit.map(row=>row.text).join('\n\n'));d.append(summary,text);$('#page').prepend(d);}
 const heartService=createHeartService({call,exists,resolveURL,decodeImage});
 const motion=createWaterMotion({root:$('#page'),canvas:null,lampCanvas:$('#lamp-flame'),assets,manifest:motionMeta,onError:fail});
 const feedback=mountInteractionFeedback(shell);
const hearts=[];function mountHeart(host,items,animal){
 const cursor=createHeartCursor(items),creature=el('button',undefined,'creature');const swimmer=motion.attach(creature,animal);creature.setAttribute('aria-label',animal==='jelly'?'戳一下水母':'戳一下蝌蚪');
 const line=el('div',undefined,'heart-line'),bubble=el('button',undefined,'heart-bubble'),text=el('span'),dots=el('span',undefined,'heart-dots'),emotion=el('span',undefined,'emotion'),picture=el('img');picture.alt='';emotion.append(picture);bubble.append(text,dots);line.append(bubble,emotion);host.append(creature,line);let epoch=0,disposed=false;
 async function render(){const current=++epoch,item=cursor.current();if(!item){host.hidden=true;return;}host.hidden=false;host.dataset.mood=item.mood??'';
  text.textContent=item.text;dots.replaceChildren();if(cursor.count()>1)for(let i=0;i<cursor.count();i++)dots.append(el('i',undefined,i===cursor.index()?'active':''));
  dots.hidden=cursor.count()<=1;bubble.setAttribute('aria-label',cursor.count()>1?item.text+'；第'+(cursor.index()+1)+'条，共'+cursor.count()+'条，点击下一条':item.text);bubble.setAttribute('data-index',String(cursor.index()));const cached=heartService.peek(item.mood,'缇斯亚');emotion.hidden=!cached;if(cached){picture.src=cached.url;picture.alt=cached.name;picture.dataset.object=cached.id;}else picture.removeAttribute('src');bubble.disabled=false;let binding=null;try{binding=await heartService.resolve(item.mood==='无'?null:item.mood,'缇斯亚');}catch(e){if(!disposed&&current===epoch){host.dataset.error=e.message;emotion.hidden=true;picture.removeAttribute('src');notice('表情未显示：'+e.message);}}if(disposed||current!==epoch)return;
  emotion.hidden=binding===null;if(binding){picture.src=binding.url;picture.alt=binding.name;picture.dataset.object=binding.id;delete host.dataset.error;}else picture.removeAttribute('src');bubble.disabled=false;
 }
 bubble.addEventListener('click',e=>{e.stopPropagation();if(cursor.count()>1){cursor.next();render().catch(fail);}});
 creature.addEventListener('click',e=>{e.stopPropagation();swimmer.poke();});
 const controller={render,cursor,setMood(name){const item=cursor.current();if(item)item.mood=name;return render();},dispose(){disposed=true;epoch++;swimmer.dispose();}};hearts.push(controller);return controller;
}
const taskHeart=mountHeart($('#task-heart'),data.task.heart.items,'jelly'),nextHeart=mountHeart($('#next-heart'),data.next.heart.items,'tadpole');
function fold(button,content){$(button).addEventListener('click',()=>{const open=$(content).hidden;$(content).hidden=!open;$(button).setAttribute('aria-expanded',String(open));});}
fold('#task-toggle','#task-content');fold('#next-toggle','#next-content');
function section(parent,title,rows,kind='ledger'){
 const d=el('details',undefined,'ledger-section '+kind),s=el('summary'),index=el('span',String(parent.children.length+1).padStart(2,'0'),'ledger-index'),label=el('span',title),count=el('small',String(rows.length).padStart(2,'0'),'ledger-count');
 index.setAttribute('aria-hidden','true');count.setAttribute('aria-label',rows.length+'条');s.append(index,label,count);d.append(s);
 const body=el('div',undefined,'ledger-body');
 for(const row of rows){const article=el('article',undefined,'ledger-entry');if(row.label){const h=el('div',undefined,'entry-heading');h.append(el('span',row.label));if(row.status)h.append(el('small',row.status,'entry-status'));article.append(h);}article.append(el('p',row.text));if(row.fields){const dl=el('dl');for(const [label,value]of row.fields)dl.append(el('dt',label),el('dd',value));article.append(dl);}body.append(article);}
 d.append(body);parent.append(d);
 if(kind==='audit-ledger'){
  body.replaceChildren();
  for(const row of rows){const item=el('details',undefined,'audit-bead'),head=el('summary'),orb=el('span',row.status==='符合'?'✓':'·','status-orb');orb.setAttribute('aria-hidden','true');head.append(orb,el('span',row.label));head.setAttribute('aria-label',row.label+'：'+row.status);item.append(head,el('p',row.text));body.append(item);}
 }

}
section($('#task-content'),'任务',data.task.tasks.map(t=>({label:'任务 '+String(t.id).padStart(2,'0'),text:data.envelope.wire?t.plan:t.input,fields:data.envelope.wire?[]:[['来源',t.source],['安排',t.plan],['停笔',t.stop]]})),'task-ledger');
section($(data.envelope.wire?'#next-content':'#task-content'),'核验',data.task.audit.map(a=>({label:a.kind,status:a.status,text:a.evidence})),'audit-ledger');
section($('#task-content'),'人物·待确认',[...data.task.characters.map(c=>({label:c.actor,text:c.intent??'意图未确认',fields:[['依据',c.evidence]]})),...data.task.pending.map(text=>({label:'待确认',text}))]);
section($('#next-content'),'待办事项',data.next.tasks.map(t=>({label:'下一步',text:t.text})),'todo-ledger');
section($('#next-content'),'本轮交付',data.next.delivered.map(text=>({text})));
section($('#next-content'),'候选与分支',[...displayCandidateRows(data.next),...data.next.branches.map(b=>({label:b.when,text:b.tasks.join('、')}))]);
const refs=Object.entries(data.task.refs).flatMap(([key,values])=>values.map(text=>({label:key==='style'?'文风':'人物',text})));
section($('#task-content'),'依据',refs,'reference-ledger');
const taskCounter=el('span',undefined,'top-counters');for(const [label,count]of [['任务',data.task.tasks.length],['核验',data.task.audit.length],['待确认',data.task.pending.length]]){const bead=el('span',undefined,'count-bead');bead.append(el('b',String(count)),doc.createTextNode(label));taskCounter.append(bead);}$('.task-line').replaceChildren(taskCounter);
 let mode='append',actionBusy=false;
 const modeNames={replace:'替换输入框',append:'续接输入框',send:'直接发送'},shortNames={replace:'替换',append:'续接',send:'直发'};
 function modeDisplay(){$('#mode-current').textContent=shortNames[mode];$('#mode-toggle').dataset.mode=mode;for(const b of $('#mode-menu').children)b.setAttribute('aria-checked',String(b.dataset.mode===mode));}
 for(const [id,name]of Object.entries(modeNames)){const b=el('button',name);decorateWaterControl(b,assets[id+'.svg']);b.dataset.mode=id;b.setAttribute('role','menuitemradio');b.onclick=async()=>{if(actionBusy)return;actionBusy=true;try{const config=await call('display.inspect',{owner:'next'});await call('display.save',{owner:'next',value:{...config.value,行动写入方式:name},expected:config.revision});if(!alive)return;mode=id;modeDisplay();$('#mode-menu').hidden=true;$('#mode-toggle').setAttribute('aria-expanded','false');}catch(e){fail(e);}finally{actionBusy=false;}};$('#mode-menu').append(b);}
 $('#mode-toggle').onclick=()=>{$('#mode-menu').hidden=!$('#mode-menu').hidden;$('#mode-toggle').setAttribute('aria-expanded',String(!$('#mode-menu').hidden));};
 async function action(text,button,forcedMode){if(actionBusy)return;actionBusy=true;const nodes=[...root.querySelectorAll('.action,#mode-toggle,#mode-menu button')];nodes.forEach(n=>n.disabled=true);try{await controller.action(forcedMode||mode,text,source);if(!alive)return;root.querySelectorAll('.action').forEach(n=>n.classList.toggle('selected',n===button));$('#action-feedback').textContent=(forcedMode||mode)==='send'?'所选行动已交给原生发送。':(forcedMode||mode)==='replace'?'已替换输入框，尚未发送。':'已续接输入框，尚未发送。';}catch(e){if(e.code==='TISYA_INPUT_SEND_REJECTED')notice(e.reason==='busy'?'当前正在生成，请稍后再发送。':'本次发送未被接受，输入内容已保留。');else if(e.code==='TISYA_ACTION_DRAFT_CHANGED')notice('检测到你正在编辑输入框，本次行动未发送。');else fail(e);}finally{actionBusy=false;if(alive)nodes.forEach(n=>n.disabled=false);}}
 for(const a of data.next.actions){const b=el('button',undefined,'action');b.append(el('span',String(a.id).padStart(2,'0'),'number'),el('span',a.text,'copy'));b.onclick=()=>action(a.text,b);$('#actions').append(b);}
 $('#action-feedback').textContent='点击行动，按羽毛笔旁的当前模式执行。';
 let termTicket=0,termCleanup=()=>{};
 const termFailure=e=>notice('词条未完成：'+(e.code||e.message));
 async function showTerm(reference){const ref=typeof reference==='string'?{id:reference}:reference,ticket=++termTicket;const record=await call('codex.get',{id:ref.id,...(ref.path?{path:ref.path}:{})});if(!alive||ticket!==termTicket)return;if(record.value.世界!==world)throw Error('TISYA_REFERENCE_WORLD');termCleanup();termCleanup=()=>{};$('#term-dialog').dataset.object=ref.id;$('#term-dialog').dataset.path=record.path;$('#term-title').textContent=record.value.名称;$('#term-summary').textContent=ref.explicitRevision?'指定修订':'当前图鉴版本';$('#term-body').replaceChildren();$('#term-body').hidden=false;$('#term-details').hidden=false;
  if(ref.media){const r=require('./codex-meta.cjs').projectCodex(record.value).resources.find(r=>r.用途===ref.media.role&&r.类型===ref.media.kind);if(!r||!await exists(r.路径))throw Error('TISYA_REFERENCE_MEDIA_MISSING');if(!alive||ticket!==termTicket)return;const bound=mountBoundMedia({container:$('#term-body'),binding:{kind:r.类型,url:r.路径,name:r.用途},onError:termFailure,resolveURL});termCleanup=()=>bound.dispose();}
  else{const card=mountCodexCard({container:$('#term-body'),value:record.value,mini:true,path:record.path,onError:termFailure,resolveURL});termCleanup=()=>card.dispose();}
  if(!$('#term-dialog').open)$('#term-dialog').showModal();
 }
 $('#term-dialog').addEventListener('close',()=>{termTicket++;termCleanup();termCleanup=()=>{};});cleanups.push(()=>{termTicket++;termCleanup();});
 $('#term-details').onclick=()=>{const route={page:'codex',tab:'entries',id:$('#term-dialog').dataset.object,path:$('#term-dialog').dataset.path};$('#term-dialog').close();return navigate(route);};
 async function refresh(){const ticket=++refreshEpoch;const configs=await call('display.batch',{owners:['title','task','heart','body','extra','next','extensions']});const index=await call('codex.list',{world,includeArchived:true});if(!alive||ticket!==refreshEpoch)return;configStamp=displayStamp(configs);codexRevision=index.revision;applyJourneyDefault(configs);
  for(const n of root.querySelectorAll('[data-component]')){const cfg=configs[n.dataset.component].effective.values;n.dataset.motion=String(cfg.动画效果);n.dataset.decoration=cfg.装饰程度;}
  rack.setMotion('world-extension',configs.extra.effective.values.动画效果!==false&&configs.extensions.effective.values.动画效果!==false);rack.setMotion('journey',configs.extensions.effective.values.动画效果!==false);
  for(const n of root.querySelectorAll('.heart-host'))n.dataset.motion=String(configs.heart.effective.values.动画效果);
  mode=Object.keys(modeNames).find(k=>modeNames[k]===configs.next.effective.values.行动写入方式);if(!mode)throw Error('TISHA_ACTION_MODE');modeDisplay();
  const bodyState=bodyDisplay?.captureState();proseCleanup();displayMotion.body=configs.body.effective.values.动画效果!==false;displayMotion.extra=configs.extra.effective.values.动画效果!==false;
  const bodyView=mountDisplayDocuments({container:$('#story'),html:display.body,label:'正文',cardBridge,typography:configs.body.effective.values,prepareDocument:prepareDisplayDocument,onError:fail,onReady:body=>{
   if(world!==null){bindCodexReferences(body,index.rows,{world},showTerm,termFailure);decorateTerms(body,index.rows,{world,policy:configs.body.effective.values.重复词条,limit:configs.body.effective.values.词条上限,proseOnly:true},id=>showTerm({id,path:index.rows.find(r=>r.id===id)?.path}).catch(termFailure));}
  }});bodyDisplay=bodyView;proseCleanup=()=>{bodyView.dispose();if(bodyDisplay===bodyView)bodyDisplay=null;};bodyView.restoreState(bodyState);pauseDisplays();await bodyView.ready;
  if(!alive||ticket!==refreshEpoch)return;
  for(const h of hearts)h.render().catch(e=>{if(alive)notice('表情暂未加载：'+e.message);});motion.refresh();
 }
 async function navigate(route){try{const result=await openApplication(route);if(!result.allowed)notice('请先在手机应用中保存或放弃当前修改。');}catch(error){notice('应用未打开：'+(error.code||error.message));}}
 for(const d of root.querySelectorAll('dialog'))d.querySelector('.close').onclick=()=>d.close();
 // Registered output consumers create pages only for actual payloads. No sample
 // inventory or invented character/building variables enter the real runtime.
 const {createDashboardRegistry}=require('./dashboard-registry.cjs');let dashboard;
 dashboard=createDashboardRegistry({read:async()=>{throw Error('TISHA_RESIDENT_MODULE_UNREGISTERED');},onChange:s=>{extraCleanup();extraCleanup=()=>{};const tabs=$('#world-extension-tabs'),content=$('#world-extension-content');rack.setAvailable('world-extension',s.pages.length>0);tabs.hidden=s.pages.length<2;tabs.replaceChildren();content.replaceChildren();for(const [i,p] of s.pages.entries()){const b=el('button');const number=el('span',String(i+1).padStart(2,'0'),'extension-tab-number');number.setAttribute('aria-hidden','true');b.append(number,el('span',p.title));b.setAttribute('aria-pressed',String(s.selected===p.id));b.setAttribute('aria-controls','world-extension-content');b.onclick=()=>dashboard.select(p.id);tabs.append(b);}const selected=s.pages.find(p=>p.id===s.selected);if(selected){content.setAttribute('aria-label',selected.title);dashboard.render(content,s.selected);}}});
 const payloads={};
 function panelTitle(panel,i){const inert=doc.createElement('template');inert.innerHTML=panel.html;const node=inert.content.querySelector('title,h1,h2,summary');const title=(panel.label||node?.textContent||panel.ruleName||panel.tag?.replace(/_/g,' ')||'扩展 '+(i+1)).trim().replace(/\s+/g,' ');return title.slice(0,60)||'扩展 '+(i+1);}
 const panels=display.extraPanels??(display.extra.trim()?[{id:'extra',html:display.extra,label:'卡片扩展'}]:[]);
 for(const [i,panel]of panels.entries()){
  const id=panel.id;dashboard.register({id,title:panelTitle(panel,i),policy:'output',dependencies:[],validate:v=>typeof v==='string',render:(target,v)=>{
   extraCleanup();let part=null;extraSelected=id;
   const panelFailure=e=>{if(!alive||extraSelected!==id||e.message==='TISYA_DISPLAY_CANCELLED')return;const d=el('details'),head=el('summary','查看原始扩展内容'),pre=el('pre',v);pre.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere';d.append(head,pre);target.replaceChildren(el('p','此页暂未显示：'+(e.code||e.message)),d);notice('扩展页未显示：'+panelTitle(panel,i));};
   try{part=mountDisplayDocuments({container:target,html:v,label:panelTitle(panel,i),cardBridge,prepareDocument:prepareDisplayDocument,onError:panelFailure});extraDisplay=part;part.restoreState(extraStates.get(id));pauseDisplays();extraReady=part.ready.catch(panelFailure);}catch(e){panelFailure(e);extraReady=Promise.resolve();}
   extraCleanup=()=>{if(part){if(extraDisplay===part){extraState=part.captureState();extraStates.set(id,extraState);extraDisplay=null;}part.dispose();}};return extraCleanup;
  }});payloads[id]=panel.html;
 }
 for(const [id,title]of [['archive','档案']]){dashboard.register({id,title,policy:'output',dependencies:[],validate:v=>typeof v==='string',render:(target,v)=>{return renderProse(target,v);}});if(data[id].trim())payloads[id]=data[id];}
 if(data.vars.trim()){const details=el('details',undefined,'variable-record'),summary=el('summary','变量更新记录');details.append(summary);const content=el('div');details.append(content);$('#next-content').append(details);try{renderProse(content,'变量提案（实际结算结果见叙事设置）\n'+JSON.stringify(require('./kernel-wire.cjs').parseVariablePatch(data.vars),null,2));}catch(e){renderProse(content,'变量提案格式未识别：'+(e.code||e.message));}}
 const observer=new win.IntersectionObserver(entries=>{visible=entries.some(x=>x.isIntersecting);motion.pause(paused||!visible);rack.pause(paused||!visible);pauseDisplays();},{rootMargin:'100px'});observer.observe(container);cleanups.push(()=>observer.disconnect());
 const ready=(async()=>{await motion.ready;if(cover)await decodeImage(cover);await refresh();await journey.refresh();await dashboard.update(payloads);await extraReady;})();ready.catch(()=>{});
 function captureState(){if(extraDisplay&&extraSelected)extraStates.set(extraSelected,extraDisplay.captureState());return {journey:journey.captureState(),journeyMinimized,journeyTouched,worldMinimized,worldTouched,extraStates:Object.fromEntries(extraStates),worldSelected:dashboard.snapshot().selected,folds:['task','next'].map(id=>!$('#'+id+'-content').hidden),details:[...root.querySelectorAll('details')].filter(n=>!n.closest('.journey-reader')).map(n=>n.open),displays:{body:bodyDisplay?.captureState(),extra:extraDisplay?.captureState()||extraState}};}
 function restoreState(state){if(!state)return;journey.restoreState(state.journey);if(state.worldTouched===true){worldTouched=true;minimizeWorld(state.worldMinimized===true);}if(state.journeyTouched===true){journeyTouched=true;minimizeJourney(state.journeyMinimized===true);}if(state.worldSelected&&state.worldSelected!==dashboard.snapshot().selected&&dashboard.snapshot().pages.some(p=>p.id===state.worldSelected))dashboard.select(state.worldSelected);for(const [id,value]of Object.entries(state.extraStates??{}))extraStates.set(id,value);['task','next'].forEach((id,i)=>{$('#'+id+'-content').hidden=!state.folds[i];$('#'+id+'-toggle').setAttribute('aria-expanded',String(!!state.folds[i]));});[...root.querySelectorAll('details')].filter(n=>!n.closest('.journey-reader')).forEach((n,i)=>{n.open=!!state.details[i];});bodyDisplay?.restoreState(state.displays?.body);if(extraSelected&&extraStates.has(extraSelected))extraDisplay?.restoreState(extraStates.get(extraSelected));else if(state.displays?.extra){extraState=state.displays.extra;extraDisplay?.restoreState(extraState);}}
 return {root,ready,refresh,captureState,restoreState,suspend(){paused=true;motion.pause(true);rack.pause(true);pauseDisplays();},async isCurrent(){await journey.refresh();const configs=await call('display.batch',{owners:['title','task','heart','body','extra','next','extensions']});if(!alive)return false;const index=await call('codex.list',{world,includeArchived:true});const same=displayStamp(configs)===configStamp&&index.revision===codexRevision;if(same)applyJourneyDefault(configs);return same;},report:()=>({source:'message.current',motion:motion.report(),disposed:!alive}),dispose(){alive=false;refreshEpoch++;clearTimeout(toastTimer);cleanups.forEach(f=>f());proseCleanup();extraCleanup();journey.dispose();rack.dispose();motion.dispose();hearts.forEach(h=>h.dispose());dashboard.dispose();feedback.dispose();root.replaceChildren();}};
}
module.exports={mountWaterView};
