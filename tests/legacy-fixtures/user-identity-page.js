// Historical UI retained only for compatibility regression; production entry points use Matrix forms.
import {scopedUtilityStyle} from '../../utility-style.js';
import {mountRunView} from '../../tables/run-view.js';
import {mountUnsavedPrompt} from '../../settings-unsaved.js';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const retainedDrafts=new Map();
export function mountIdentityPage(container,{service,tables,onNative,onWorldbook,onAtlas,onClose,initialOrigin=null,initialDesign=null,onAssistant=null,onMinimize=null}){
 let state=service.read(),selected=state.active,tab='profile',busy=false,alive=true,notice='',origins=[],cores=[],binding=null,creation=null,originCreate=null,originRecovery=false,selectionSubmission=null;
 let runView=null,operation=Promise.resolve(true),navigation=null,lastError=null;
 const key=JSON.stringify(state.scope),saved=retainedDrafts.get(key),drafts=saved?.drafts??new Map();
 const defaultScope=()=>({chat:!!state.scope.chatId,character:!!(state.scope.characterAvatar||state.scope.groupId!=null),global:false});
 let scopes=defaultScope(),scopeBaseline=JSON.stringify(scopes);
 if(saved){state=saved.state??state;selected=saved.selected;creation=saved.creation;binding=saved.binding;originCreate=saved.originCreate;originRecovery=saved.originRecovery??false;selectionSubmission=saved.selectionSubmission??null;scopes=saved.scopes??scopes;scopeBaseline=saved.scopeBaseline??scopeBaseline;}
 if(!creation&&initialDesign)creation={goal:'',useCore:initialDesign==='core',history:[],reviewed:false};
 const view=container.ownerDocument.createElement('div'),dialogs=container.ownerDocument.createElement('div');view.className='tisya-identity-view';container.classList.add('tisya-identity-page');container.replaceChildren(view,dialogs);
 const hostPage=container.parentElement?.matches('.tisya-page')?container.parentElement:null,hadHostClass=hostPage?.classList.contains('tisya-user-host-page');hostPage?.classList.add('tisya-user-host-page');
 const q=selector=>view.querySelector(selector),btn=(label,action)=>`<button type="button" data-user-action="${action}">${label}</button>`;
 const hasChanges=()=>drafts.size>0||selected!==state.active||JSON.stringify(scopes)!==scopeBaseline||!!binding||!!creation||!!originCreate||originRecovery;
 const retain=()=>{if(hasChanges())retainedDrafts.set(key,{state,creation,binding,originCreate,originRecovery,selected,drafts,scopes,scopeBaseline,selectionSubmission});else retainedDrafts.delete(key);};
 const prompt=mountUnsavedPrompt(container.ownerDocument,dialogs,{onStateChange:()=>sync()});
 function sync(){if(!alive)return;view.inert=busy||prompt.state().open;container.setAttribute('aria-busy',String(busy));const actual=service.read();const save=q('[data-user-action=save]'),cancel=q('[data-user-action=discard]');if(save)save.disabled=busy||prompt.state().open||!(hasChanges()||actual.pending||actual.creationPending);if(cancel)cancel.disabled=busy||prompt.state().open||!hasChanges();}
 function refresh(){state=service.read();if(!state.personas.some(x=>x.id===selected))selected=state.active;}
 const checkScope=()=>{if(JSON.stringify(service.read().scope)!==key)throw Error('会话已改变，草稿保留；请回到原会话继续。');};
 function accepted(){checkScope();state=service.read();for(const draft of drafts.values())draft.revision=state.revision;retain();}
 function render(){if(!alive)return;const pickerOpen=q('.identity-picker')?.open;const p=state.personas.find(x=>x.id===selected),draft=drafts.get(selected),d=p?.descriptor??{};
 view.innerHTML=`<style>.tisya-user{max-width:1000px;margin:auto;color:#e4ddc8;font-family:var(--tisya-global-font,TisyaReading),TisyaReading,serif;padding:12px 12px 90px}.tisya-user [hidden]{display:none!important}.tisya-user header,.tisya-user nav,.tisya-user .actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.tisya-user header h2{flex:1}.tisya-user button{font:inherit;min-height:42px;padding:9px 15px;border:1px solid #647066;border-radius:12px;background:#17332d;color:inherit}.tisya-user button[aria-selected=true]{background:#d5c087;color:#14251d}.tisya-user article{padding:18px;margin:16px 0;border:1px solid #65705a;border-radius:20px;background:#071b16}.tisya-user label{display:block;margin:12px 0}.tisya-user input,.tisya-user select,.tisya-user textarea{width:100%;box-sizing:border-box;padding:12px;background:#102720;color:inherit;border:1px solid #63715f;border-radius:12px;font:inherit}.tisya-user input[type=checkbox]{width:auto}.tisya-user textarea{min-height:180px}.tisya-user small{color:#afb8a0}.tisya-user pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:45vh;overflow:auto}.tisya-user footer{display:flex;gap:8px;flex-wrap:wrap;position:sticky;bottom:0;padding:12px;background:#0a211c;border-top:1px solid #647066}.tisya-user [role=status]{white-space:pre-wrap;overflow-wrap:anywhere}</style><style>${scopedUtilityStyle('.tisya-user')} .tisya-user{max-width:900px}.tisya-user article{border-radius:3px 20px 3px 20px;background:linear-gradient(130deg,#15372b99,#041410c9);padding:22px;border-color:#b7a46f44}.tisya-user nav{border-bottom:1px solid #b7a46f44}.tisya-user nav button{border:0;background:transparent;border-radius:0;color:#9fb3a2}.tisya-user nav button[aria-selected=true]{color:#d3c28c;background:transparent;border-bottom:2px solid #d3c28c}.tisya-user .identity-choice{display:block;width:100%;text-align:left;margin:6px 0}.tisya-user .identity-choice small{display:block}.tisya-user footer button:last-child{background:#c9b680;color:#15271f}.tisya-user [data-proposal]{min-height:240px}.tisya-user .identity-title{font-size:30px;font-weight:400;letter-spacing:.12em}
 .tisya-identity-page{display:flex;flex-direction:column;height:var(--tisya-settings-height,100dvh);max-height:100dvh;min-height:0;overflow:hidden;min-width:0}
 .tisya-identity-view{display:flex;flex:1;min-height:0;min-width:0}
 /* Vertical auto margins prevent this row-flex child from stretching, leaving
    its inner scroller unconstrained while the host clips the long form. */
 .tisya-identity-page .tisya-user{box-sizing:border-box;display:flex;flex-direction:column;flex:1;min-height:0;min-width:0;width:100%;margin:0 auto;padding:12px 12px 0;overflow:hidden}
 .tisya-identity-scroll{flex:1;min-height:0;min-width:0;overflow:auto;overscroll-behavior:contain;overflow-wrap:anywhere}
 .tisya-user .tisya-settings-actions{position:relative;flex:none;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);padding:10px 0 max(10px,env(safe-area-inset-bottom,0px))}
 .tisya-user .tisya-settings-actions button{min-width:0;min-height:44px;margin:0}
 #tisya-shell.tisya-page-open .tisya-page.tisya-user-host-page{display:flex;flex-direction:column;overflow:hidden}
 #tisya-shell .tisya-page.tisya-user-host-page>.tisya-sub-header,#tisya-shell .tisya-page.tisya-user-host-page>.tisya-sub-title{flex:none}
 #tisya-shell .tisya-page.tisya-user-host-page>.tisya-identity-page{flex:1 1 0;min-height:0;height:auto}
 </style><section class="tisya-user"><div class="tisya-identity-scroll"><header ${initialDesign?'hidden':''}><div><small>TISYA · USER</small><h2>${initialDesign?'缇斯亚助手 · 设计身份':'我扮演谁'}</h2></div>${btn('返回','close')}</header><p>当前会话：${esc(state.scope.chatId??'尚未打开聊天')} · ${esc(state.scope.groupId!=null?'群聊':state.scope.characterAvatar??'未选角色')}</p><details class="identity-picker" ${pickerOpen?'open':''}><summary>当前使用：${esc(state.personas.find(x=>x.id===state.active)?.name??'未选择')}　·　切换身份 ›</summary><input type="search" data-identity-search aria-label="搜索身份或来源" placeholder="搜索名字、世界或来源"><label>查看身份<select data-user-select>${state.personas.map(x=>`<option value="${esc(x.id)}" ${x.id===selected?'selected':''}>${esc(x.name)}${x.id===state.active?' · 使用中':''}</option>`).join('')}</select></label>${state.personas.map(x=>`<button type="button" class="identity-choice" data-identity-id="${esc(x.id)}" aria-pressed="${x.id===selected}">${esc(x.name)}${x.id===state.active?' · 使用中':''}<small>${esc(x.descriptor?.tisyaOrigin?.book??'原生用户身份')}</small></button>`).join('')}<small>选择暂存于本页，点击底部保存后切换；不会更改旧消息。</small></details><nav ${initialDesign?'hidden':''}>${[['profile','档案'],['bindings','绑定'],['injection','注入'],['manage','管理']].map(([id,label])=>`<button type="button" data-user-tab="${id}" aria-selected="${tab===id}">${label}</button>`).join('')}</nav><p role="status">${esc(busy?'正在处理，请稍候…':notice)}</p>${service.read().creationPending?'<p>有待核对的人物槽位；底部保存会继续同一次创建。</p>':''}${service.read().pending?'<p>有待核对的身份绑定；底部保存会继续处理。</p>':''}<div data-identity-progress></div>${initialDesign?`<article>${creation?creationContent():`<h3>人物档案已保存</h3><p>你可以先查看，再选择是否用作当前身份。</p>${originContent()}${btn('再设计一个','idea')}`}</article>`:p?content(p,d,draft):'<article>还没有身份，请先创建一个原生身份。</article>'}<div class="actions">${btn('原生完整控件','native')}${btn('重新读取','refresh')}${btn('导出未保存稿','export-draft')}</div></div><footer class="tisya-settings-actions">${btn('取消修改','discard')}${btn('保存','save')}</footer></section>`;
 runView=mountRunView(container.ownerDocument,q('[data-identity-progress]'),{service:tables,onMinimize:()=>onMinimize?.()});if(!creation)runView.root.hidden=true;
 if(busy)for(const b of view.querySelectorAll('button,select,input,textarea'))if(!b.closest('.tisya-run-view'))b.disabled=true;
 sync();
 }
 function content(p,d,draft){if(tab==='profile')return `<article><h3 class="identity-title">${esc(p.name)}</h3><small>${selected===state.active?'当前使用':'保存后切换到此身份'}</small><label>名称<input data-field="name" value="${esc(draft?.name??p.name)}"></label><label>完整设定<textarea data-field="description">${esc(draft?.description??d.description??'')}</textarea></label><small>来源：${d.tisyaMatrixOrigin?esc('当前表单 / '+d.tisyaMatrixOrigin.dossierId):d.tisyaOrigin?esc(d.tisyaOrigin.book+' / '+d.tisyaOrigin.id+'@'+d.tisyaOrigin.rev):'原生用户身份'}</small></article><article><h3>从原点开始</h3><div class="actions">${btn('选择已有原点','origins')}${btn('缇斯亚助手 · 基点与角色卡','cores')}${btn('缇斯亚助手 · 我的点子','idea')}${btn('打开图鉴档案','atlas')}</div>${originContent()}${creationContent()}</article>`;
 if(tab==='bindings')return `<article><h3>这次选择的范围</h3><label><input type="checkbox" data-scope="chat" ${scopes.chat?'checked':''} ${state.scope.chatId?'':'disabled'}> 本聊天</label><label><input type="checkbox" data-scope="character" ${scopes.character?'checked':''} ${state.scope.characterAvatar||state.scope.groupId!=null?'':'disabled'}> 当前${state.scope.groupId!=null?'群聊':'角色卡'}</label><label><input type="checkbox" data-scope="global" ${scopes.global?'checked':''}> 设为全局默认</label><p>聊天锁定：${esc(state.locked??'未锁定')}<br>全局默认：${esc(state.default??'未设置')}</p><pre>${esc(JSON.stringify(d.connections??[],null,2))}</pre><p>既有聊天和历史署名保持原样；群聊连接只关联该群。</p>${state.pending?`<pre>${esc(JSON.stringify(state.pending,null,2))}</pre>`:''}${btn('解除连接／多身份管理','native')}</article>`;
 if(tab==='injection')return `<article><h3>身份注入</h3><p>位置：${esc(d.position??'宿主默认')} · 深度：${esc(d.depth??'宿主默认')} · 消息角色：${esc(d.role??'宿主默认')}</p><p>身份世界书：${esc(d.lorebook??'未关联')}</p>${btn('世界书管理','worldbook')}${btn('调整注入／关联世界书','native')}<p>沿用原生人设与词元计数；档案系统会移除相同用户对象的重复简介。</p></article>`;
 return `<article><h3>身份管理</h3><p>创建、头像上传与裁切、复制、删除、称号、备份恢复、历史署名范围同步及扩展控件均沿用原生操作与确认。</p>${btn('打开全部管理控件','native')}${btn('刷新原生修改','refresh')}${btn('核对未完成的原点绑定','origin-resume')}${originRecovery?'<p>底部保存会继续核对原点绑定。</p>':''}<p>原生 JSON 备份不包含头像文件。</p></article>`;
 }
 function originContent(){return `${originCreate?`<p>准备另建人物槽位：${esc(originCreate.name)}</p><label><input type="checkbox" data-origin-create-reviewed ${originCreate.reviewed?'checked':''}> 已核对，保存时另建独立人物槽位</label>${btn('取消另建人物','origin-create-cancel')}`:''}${origins.length?`<label>固定原点版本<select data-origin>${origins.map((r,i)=>`<option value="${i}">${esc(r.name+' · '+r.world+' · v'+r.rev+' · '+r.book)}</option>`).join('')}</select></label>${btn('预览绑定此原点','origin-preview')}${btn('为此人物另建身份槽位','origin-create')}`:''}${binding?`<h4>绑定预览</h4><p>${esc(binding.name)}</p><pre>${esc(binding.description)}</pre><small>将更新当前活动身份 ${esc(binding.personaId)}；将选用该固定原点版本，保留会话已有进度，不修改原点原文。</small><label><input type="checkbox" data-origin-reviewed ${binding.reviewed?'checked':''}> 已核对，保存时将此档案用于上方所示身份</label>${btn('取消预览','origin-cancel')}`:''}`;}
 function creationContent(){if(creation?.savedRows||creation?.matrixReceipt)return `<h3>人物档案已保存</h3><p>正在为这份档案另建人物槽位，原身份保留。</p><p>点击底部保存继续创建同一人物槽位。</p>`;return creation?`<h3>把你的想法告诉小缇</h3><p>① 准备材料 → ② 生成完整档案 → ③ 核对另存。保存后可单独选择是否用作身份。</p><label>我的点子与必须保留的条件<textarea data-goal>${esc(creation.goal??'')}</textarea></label>${creation.useCore?`<label>基点固定版本<select data-core>${cores.map((x,i)=>`<option value="${i}" ${i===(creation.coreIndex??0)?'selected':''}>${esc(x.name+' @'+x.version+' · '+x.book)}</option>`).join('')}</select></label>`:''}<p>使用当前角色卡作为目标世界参考。先生成完整草稿，核对后保存人物档案。</p>${btn('发给 AI 生成草稿','generate')}${creation.draft?`${reviewFields()}<details><summary>完整结构与高级编辑</summary><label>完整草稿 JSON<textarea data-proposal>${esc(creation.proposalText??JSON.stringify(creation.draft.proposal,null,2))}</textarea></label></details><details><summary>模型原答</summary><pre>${esc(creation.draft.rawResponse??creation.draft.raw)}</pre></details><label><input type="checkbox" data-reviewed ${creation.reviewed?'checked':''}> 我已核对人物、世界、硬性条件与新设计</label><p>点击底部保存人物档案，并建立独立人物槽位；当前身份保留。</p>`:''}${creation.failedRaw?`<details open><summary>失败时保留的模型原答</summary><pre>${esc(creation.failedRaw)}</pre></details>`:''}${creation.history?.length?`<details><summary>之前的草稿（${creation.history.length}）</summary>${creation.history.map((row,i)=>btn('恢复草稿 '+(i+1),'draft-restore:'+i)).join('')}</details>`:''}${btn('取消建档','creation-cancel')}`:'';}
 function reviewFields(){const proposal=creation.draft.proposal;return `<h3>核对完整档案</h3>${(proposal.matrix?.changes??proposal.artifacts?.base?.changes??[]).map((row,i)=>`<fieldset><legend>${esc(row.values?.name??row.values?.名称??row.tableId??row.table??'档案')}</legend>${Object.entries(row.values??{}).map(([name,value])=>`<label>${esc(name)}<textarea data-proposal-row="${i}" data-proposal-key="${esc(name)}" data-value-type="${typeof value==='object'?'json':typeof value}">${esc(creation.fieldTexts?.[i+':'+name]??(typeof value==='object'?JSON.stringify(value,null,2):String(value)))}</textarea></label>`).join('')}</fieldset>`).join('')}`;}
 function run(fn){
  if(busy||!alive)return Promise.resolve(false);
  busy=true;lastError=null;notice='';sync();
  operation=(async()=>{try{const result=await fn();return result!==false;}catch(error){lastError=error;notice=error.message;tables.reportError?.('用户身份',error);return false;}finally{busy=false;retain();render();}})();return operation;
 }
 function validateSave(){
  checkScope();const actual=service.read();
  if(actual.pending&&actual.pending.id!==selected)throw Error('上次身份绑定尚未完成，请保留该身份继续核对，或取消本页修改后继续保存。');
  const ordinaryChanges=drafts.size>0||selected!==state.active||JSON.stringify(scopes)!==scopeBaseline;
  const recoveryOnly=!ordinaryChanges&&(originRecovery||binding?.attempted||actual.creationPending||creation?.matrixReceipt);
  if(actual.revision!==state.revision&&!actual.pending&&!recoveryOnly)throw Error('身份已被其他位置修改，草稿保留；请取消修改后重新读取。');
  for(const [id,draft] of drafts){if(!state.personas.some(p=>p.id===id))throw Error('身份已不存在');if(typeof draft.name!=='string'||!draft.name.trim()||/[\r\n]/.test(draft.name))throw Error('名字须是单行非空文字');if(typeof draft.description!=='string')throw Error('设定须为文字');}
  if(binding&&!binding.reviewed&&!originRecovery)throw Error('请先核对原点绑定预览');
  if(binding&&drafts.has(binding.personaId))throw Error('同一身份同时有资料编辑和原点预览，请取消原点预览或撤销该身份资料编辑后保存。');
  if(originCreate&&!originCreate.reviewed)throw Error('请先核对另建人物槽位');
  if(creation&&!creation.savedRows&&!creation.matrixReceipt){
   if(Object.keys(creation.fieldErrors??{}).length)throw Error('请先修正档案字段格式');
   if(!creation.draft)throw Error('请先生成完整人物草稿，或取消建档。');
   if([...view.querySelectorAll('[data-proposal-row]')].some(node=>!node.checkValidity()))throw Error('请先修正档案字段格式');
   if(!(q('[data-reviewed]')?.checked??creation.reviewed))throw Error('请先核对草稿');
   creation.reviewed=true;JSON.parse(creation.proposalText??JSON.stringify(creation.draft.proposal));if(creation.draft.format==='tisya.matrix-creation/1'&&typeof service.createFromMatrix!=='function')throw Error('统一人物槽位接口尚未接入');
  }
  if((binding||originRecovery)&&(creation||originCreate))throw Error('原点绑定与新建人物属于不同操作，请保留本次要保存的一项。');
  if(creation&&originCreate)throw Error('本次已有一个新人物草稿，请先取消另一项建档。');
  if(selected!==state.active&&!state.personas.some(p=>p.id===selected))throw Error('所选身份已不存在');
 }
 async function save(){
  validateSave();let savedParts=0;
  try{
   if(originRecovery){checkScope();const input=binding?(({reviewed,attempted,...rest})=>rest)(binding):undefined;await tables.resumeUserBinding(input);service.refresh();originRecovery=false;binding=null;accepted();savedParts++;}
   if(service.read().pending){const target=service.read().pending.id;await service.resume();if(selectionSubmission?.id===target){scopeBaseline=JSON.stringify(selectionSubmission.scopes);selectionSubmission=null;}accepted();savedParts++;}
   for(const [id,draft]of [...drafts]){checkScope();await service.saveProfile({id,...draft,revision:state.revision});drafts.delete(id);accepted();savedParts++;}
   if(binding){checkScope();const {reviewed,attempted,...input}=binding;binding.attempted=true;retain();await tables.saveIdentityOrigin(input);service.refresh();binding=null;accepted();savedParts++;}
   if(creation){
    if(creation.draft.format==='tisya.matrix-creation/1'){
     if(!creation.matrixReceipt){const draft=structuredClone(creation.draft);draft.proposal=JSON.parse(creation.proposalText??JSON.stringify(draft.proposal));const receipt=await tables.saveIdentityDraft(draft);if(!receipt?.state||receipt.contextKey!==draft.contextKey)throw Error('人物表单保存回执未确认');creation.matrixReceipt=receipt;creation.savedDraft=draft;retain();savedParts++;}
     checkScope();await service.createFromMatrix({draft:creation.savedDraft,receipt:creation.matrixReceipt});
    }else{
     if(!creation.savedRows){const draft=structuredClone(creation.draft);draft.proposal=JSON.parse(creation.proposalText??JSON.stringify(draft.proposal));creation.savedRows=await tables.saveIdentityDraft(draft);retain();savedParts++;}
     if(creation.savedRows.length!==1)throw Error('新用户人物必须有且只有一份主体档案');
     checkScope();await service.createFromOrigin(creation.savedRows[0]);
    }
    creation=null;accepted();savedParts++;notice='新人物槽位已建立，原身份保留；可从上方选择新人物';
   }else if(originCreate){checkScope();const {reviewed,...input}=originCreate;await service.createFromOrigin(input);originCreate=null;accepted();savedParts++;notice='已另建独立人物槽位，原身份保留';}
   else if(service.read().creationPending){checkScope();await service.resumeCreation();accepted();savedParts++;notice='新人物槽位已保存，原身份保留';}
   if(selected!==state.active||JSON.stringify(scopes)!==scopeBaseline){checkScope();selectionSubmission={id:selected,scopes:{...scopes}};retain();await service.select({id:selected,revision:state.revision,...scopes});selectionSubmission=null;accepted();savedParts++;}
   scopeBaseline=JSON.stringify(scopes);notice=notice||'本页修改已保存';retain();return true;
  }catch(error){if(savedParts)throw new Error('已有部分修改保存，剩余草稿保留；再次保存会继续未完成部分：'+error.message,{cause:error});throw error;}
 }
 function discard(){drafts.clear();creation=null;binding=null;originCreate=null;originRecovery=false;selectionSubmission=null;refresh();selected=state.active;scopes=defaultScope();scopeBaseline=JSON.stringify(scopes);notice=state.pending||state.creationPending?'未保存草稿已取消；已进入保存流程的操作保留，仍可继续核对。':'已取消修改，恢复到上次保存的内容。';retain();return true;}
 const saveDraft=()=>run(save),discardDraft=()=>run(discard);
 async function confirmLeave(){if(!alive||busy)return false;if(!hasChanges())return !prompt.state().open;return prompt.request({save:async()=>{if(!await saveDraft())throw lastError??Error('保存未完成');return !hasChanges();},discard:async()=>{if(!await discardDraft())throw lastError??Error('取消修改未完成');return !hasChanges();}});}
 function route(fn){if(busy||navigation||!alive)return Promise.resolve(false);navigation=(async()=>{if(!await confirmLeave()||!alive)return false;await fn?.();return true;})().catch(error=>{lastError=error;notice=error.message;render();return false;});return navigation.finally(()=>{navigation=null;});}
 function editSelected(id){if(busy||!state.personas.some(p=>p.id===id))return;selected=id;retain();render();}
 container.oninput=event=>{
  const target=event.target;if(!view.contains(target)||busy||prompt.state().open)return;
  if(target.matches('[data-identity-search]')){const value=target.value.trim();for(const node of view.querySelectorAll('[data-identity-id]'))node.hidden=!node.textContent.includes(value);return;}
  if(target.dataset.proposalRow!==undefined){const fieldKey=target.dataset.proposalRow+':'+target.dataset.proposalKey;creation.fieldTexts??={};creation.fieldErrors??={};creation.fieldTexts[fieldKey]=target.value;creation.reviewed=false;if(q('[data-reviewed]'))q('[data-reviewed]').checked=false;try{const value=target.dataset.valueType==='json'?JSON.parse(target.value):target.dataset.valueType==='number'?Number(target.value):target.dataset.valueType==='boolean'?JSON.parse(target.value):target.value;if(target.dataset.valueType==='number'&&(!target.value.trim()||!Number.isFinite(value)))throw Error('请输入有效数字');(creation.draft.proposal.matrix?.changes??creation.draft.proposal.artifacts.base.changes)[Number(target.dataset.proposalRow)].values[target.dataset.proposalKey]=value;creation.proposalText=JSON.stringify(creation.draft.proposal,null,2);creation.reviewed=false;if(q('[data-reviewed]'))q('[data-reviewed]').checked=false;q('[data-proposal]').value=creation.proposalText;delete creation.fieldErrors[fieldKey];target.setCustomValidity('');}catch{creation.fieldErrors[fieldKey]=true;target.setCustomValidity('请保持本字段的数据格式；复杂字段须为合法 JSON');}retain();sync();return;}
  if(target.dataset.field){const person=state.personas.find(p=>p.id===selected),draft={name:q('[data-field=name]').value,description:q('[data-field=description]').value,revision:state.revision};if(draft.name===person.name&&draft.description===(person.descriptor.description??''))drafts.delete(selected);else drafts.set(selected,draft);}
  if(target.matches('[data-goal]'))creation.goal=target.value;
  if(target.matches('[data-proposal]')){creation.proposalText=target.value;creation.reviewed=false;if(q('[data-reviewed]'))q('[data-reviewed]').checked=false;}
  retain();sync();
 };
 container.onchange=event=>{
  const target=event.target;if(!view.contains(target)||busy||prompt.state().open)return;
  if(target.matches('[data-user-select]'))return editSelected(target.value);
  if(target.dataset.scope)scopes[target.dataset.scope]=target.checked;
  if(target.matches('[data-reviewed]'))creation.reviewed=target.checked;
  if(target.matches('[data-origin-reviewed]'))binding.reviewed=target.checked;
  if(target.matches('[data-origin-create-reviewed]'))originCreate.reviewed=target.checked;
  if(target.matches('[data-core]'))creation.coreIndex=Number(target.value);
  retain();sync();
 };
 container.onclick=event=>{
  const button=event.target.closest('button');if(!button||!view.contains(button)||busy||prompt.state().open)return;
  if(button.dataset.identityId)return editSelected(button.dataset.identityId);
  if(button.dataset.userTab){tab=button.dataset.userTab;render();return;}
  const action=button.dataset.userAction;if(!action)return;
  if(action==='save')return saveDraft();if(action==='discard')return discardDraft();
  const routes={close:onClose,native:onNative,worldbook:onWorldbook,atlas:onAtlas,refresh:()=>run(()=>{refresh();selected=state.active;scopes=defaultScope();scopeBaseline=JSON.stringify(scopes);notice='已重新读取';})};
  if(Object.hasOwn(routes,action))return route(routes[action]);
  if((action==='idea'||action==='cores')&&onAssistant)return route(()=>onAssistant(action==='cores'?'core':'idea'));
  return run(async()=>{
   checkScope();
   if(action==='export-draft'){const url=URL.createObjectURL(new Blob([JSON.stringify({format:'tisya.identity-recovery/1',scope:state.scope,profiles:[...drafts],creation,binding,originCreate,selected,scopes},null,2)],{type:'application/json'}));const link=container.ownerDocument.createElement('a');link.href=url;link.download='用户身份-未保存草稿.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return;}
   if(action==='origins'){origins=await tables.identityOrigins();checkScope();if(!origins.length)notice='尚无原点人物，请先在世界维护建立原点档案';}
   if(action==='origin-create'){originCreate={...origins[Number(q('[data-origin]').value)],reviewed:false};notice='已加入本页草稿，请核对后点击底部保存';}
   if(action==='origin-preview'){binding={...await tables.previewIdentityOrigin(origins[Number(q('[data-origin]').value)]),reviewed:false};checkScope();}
   if(action==='origin-cancel')binding=null;if(action==='origin-create-cancel')originCreate=null;if(action==='origin-resume'){originRecovery=true;notice='已加入本页草稿，底部保存会继续核对原点绑定';}
   if(action==='idea')creation={goal:'',useCore:false,history:[],reviewed:false};
   if(action==='cores'){cores=await tables.identityCores();checkScope();creation={goal:'',useCore:true,history:[],reviewed:false};if(!cores.length)notice='尚无基点，请先在图鉴提取基点';}
   if(action==='generate'){
    creation.goal=q('[data-goal]').value;const core=creation.useCore?cores[Number(q('[data-core]').value)]:null;if(creation.useCore&&!core)throw Error('请选择已有基点');
    try{if(creation.draft){creation.history??=[];creation.history.push(structuredClone(creation.draft));}creation.draft=await tables.createIdentityDraft({goal:creation.goal,core:core?{book:core.book,id:core.id,version:core.version}:null});checkScope();creation.failedRaw=null;creation.proposalText=null;creation.reviewed=false;creation.fieldTexts={};creation.fieldErrors={};}catch(error){creation.failedRaw=error.rawResponse??tables.state().progress?.text??'';throw error;}
   }
   if(action.startsWith('draft-restore:')){const index=Number(action.split(':')[1]),old=creation.history[index];if(!old)throw Error('草稿不存在');if(creation.draft)creation.history.push(structuredClone(creation.draft));creation.draft=structuredClone(old);creation.proposalText=null;creation.reviewed=false;creation.fieldTexts={};creation.fieldErrors={};notice='已恢复草稿，请重新核对';}
   if(action==='creation-cancel')creation=null;
  });
 };
 const timer=setInterval(()=>{if(alive&&creation)runView?.tick();else if(runView)runView.root.hidden=true;},400);
 render();let ready=Promise.resolve(true);
 if(initialDesign==='core'&&!cores.length)ready=run(async()=>{cores=await tables.identityCores();checkScope();if(!cores.length)notice='尚无基点，请先在缇斯亚助手提取基点';});
 if(initialOrigin&&!binding)ready=run(async()=>{binding={...await tables.previewIdentityOrigin(initialOrigin),reviewed:false};checkScope();});
 else if(initialOrigin&&binding){notice='已恢复上次原点草稿，请先完成或取消后再选择另一原点。';render();}
 return {root:container,ready,settled:()=>Promise.all([operation,...(navigation?[navigation]:[])]),state:()=>({dirty:hasChanges(),busy,canSave:!busy&&hasChanges()}),saveDraft,discardDraft,confirmLeave,requestLeave:()=>({allowed:!busy&&!hasChanges()&&!prompt.state().open,reason:busy?'身份操作尚未完成':'有未保存的用户身份草稿'}),canLeave:()=>!busy&&!hasChanges(),hasDraft:hasChanges,dispose(){retain();prompt.dispose();alive=false;clearInterval(timer);if(hostPage&&!hadHostClass)hostPage.classList.remove('tisya-user-host-page');container.classList.remove('tisya-identity-page');container.onclick=null;container.oninput=null;container.onchange=null;},get busy(){return busy}};
}
