import {PREFERENCE_GROUPS, effectivePreferences} from './preferences.mjs';
import {storyAvatar} from './identity.mjs';
import {selectControl} from './form-controls.mjs';
import {mountUnsavedPrompt} from '../settings-unsaved.js';
import {mountCreationWorkbench,mountCreationTable,creationTaskRunning,renderCreationAcceptance} from './creation-workbench.mjs';

const stamp = value => JSON.stringify(value);
const clone = value => structuredClone(value);
const check = (condition, message) => {if (!condition) throw Error(message);};
const wishGroup = PREFERENCE_GROUPS.find(group => group.id === 'W');
const wishOrder = wishGroup.options.map(option => option.id);
const orderedChoices = choices => wishOrder.filter(id => choices.includes(id));

export function mountStoryResources(document,root,options){return mountMatrixIdentity(document,root,{...options,resourcesOnly:true});}
export function mountMatrixCreation(document,root,options){return mountMatrixIdentity(document,root,{...options,resourcesOnly:true,creationOnly:true});}
export function mountMatrixIdentity(document, root, {identity, config, roles, onClose = () => {}, onNative = () => {},resourcesOnly=false,creationOnly=false,onCreate=null,isPresetActive=()=>true,onPresets=null,initialCreation=null,listCreationCores=null,initialOrigin=null,legacyOrigins=null}) {
 if(!identity){check(resourcesOnly,'用户身份服务尚未接入');identity={read:()=>{const roleScope=roles.scope?.(),parts=roleScope===undefined?[]:JSON.parse(roleScope);check(Array.isArray(parts),'故事身份会话标识无效');return {personas:[],active:'',revision:0,description:'',scope:{roleScope,chatId:parts[0],characterId:parts[1],groupId:parts[2]}};}};}
 let companion=null,recordDraft=null,recordConfirmed=false,dossierFields={},dossierBefore=null,generationDraft=null,generationText='',generationConfirmed=false,generationGoal='',generationKind='character',resourceBase=null,resourceDraft=null,legacyDossier=null;
 let generationReceipt=null,generationSavedDraft=null,generationFailure=null,generationUseCore=false,generationCreatePersona=false,generationMode='extend',creationCores=[],creationCoreIndex=0;
 let generationHistory=[],generationFieldTexts={},generationFieldErrors={},generationRepair=null;
 let generationWorkbench=null,generationUnsubscribe=null,generationTask=null,generationPending=Promise.resolve(),adoptedTaskId=null,generationStarting=false;
 const generationRunning=()=>generationStarting||creationTaskRunning(generationTask);
 function retainCreationView(){if(disposed||!roles.rememberCreationView)return;try{if(stamp(identity.read().scope)!==scope)return;roles.rememberCreationView({taskId:generationTask?.id??null,creation:generationSnapshot(),history:clone(generationHistory),messages:clone(generationTask?.messages??[])});}catch(error){report(error);}}
 function restoreCreationView(saved){const c=saved?.creation;if(!c)return false;generationDraft=clone(c.draft);generationText=c.text??'';generationGoal=c.goal??'';generationKind=c.kind??'character';generationMode=c.mode??'extend';generationUseCore=c.useCore===true;creationCoreIndex=c.coreIndex??0;generationCreatePersona=c.createPersona===true;generationFieldTexts=clone(c.fieldTexts??{});generationFieldErrors=clone(c.fieldErrors??{});creationDestination=clone(c.destination??creationDestination);creationSource=clone(c.source??null);generationHistory=clone(saved.history??[]);generationRepair=clone(c.repair??null);adoptedTaskId=c.draft?(saved.taskId??null):null;return true;}
 function clearCreationTaskView(){roles.clearCreationView?.();generationTask=roles.creationTask?.()??null;adoptedTaskId=null;}
 let creationDestination={book:'',newBook:false},creationSource=null,sourceBook='',sourceUid='',sourceListing=null,sourceRepair=null;
 let originDraft=null,originReviewed=false,originRecovery=false,originRows=[],originIndex=0,originCreate=null,originCreateReviewed=false;
 let identityScopeDraft,identityScopeBase,selectionSubmission=null;
 const companionDirty=()=>!!companion?.state?.().dirty;
 const extraDirty=()=>!!generationRepair||!!recordDraft||!!sourceRepair||Object.keys(dossierFields).length>0||!!generationDraft||!!generationGoal||!!generationReceipt||!!generationHistory.length||!!originDraft||originRecovery||!!originCreate||!!legacyDossier||!!resourceBase&&stamp(resourceBase)!==stamp(resourceDraft)||companionDirty();
 const clearExtras=()=>{recordDraft=null;recordConfirmed=false;dossierFields={};dossierBefore=null;sourceRepair=null;generationDraft=null;generationText='';generationConfirmed=false;generationGoal='';generationReceipt=null;generationSavedDraft=null;generationFailure=null;generationHistory=[];generationFieldTexts={};generationFieldErrors={};generationRepair=null;resourceBase=null;resourceDraft=null;legacyDossier=null;originDraft=null;originReviewed=false;originRecovery=false;originCreate=null;originCreateReviewed=false;selectionSubmission=null;};
 let savedIdentity = identity.read(), savedConfig = config.read(), draft, profileBase, wishBase, roleBase, profileEditorBase, wishEditorBase;
 let busy = false, navigating = false, disposed = false, pending = Promise.resolve(true), navigationPending = null, lastError = null;
 let scope = stamp(savedIdentity.scope), receipts = [], roleListingError = '', reviewRequired = false;
 const el = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  if (className) node.className = className;
  return node;
 };
 const content = el('div', null, 'tisya-identity-content');
 const footer = el('footer', null, 'tisya-settings-actions');
 const status = el('p', '', 'tisya-identity-status'), dialogs = el('div');
 status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
 const cancel = el('button', '取消修改', 'menu_button'), saveButton = el('button', '保存', 'menu_button');
 cancel.type = saveButton.type = 'button'; footer.append(status, cancel, saveButton);
 const hostPage = root.parentElement?.matches('.tisya-page') ? root.parentElement : null;
 const hadHostClass = hostPage?.classList.contains('tisya-matrix-page');
 hostPage?.classList.add('tisya-matrix-page');
 const style = el('style');
 style.textContent = `
 .tisya-matrix-identity{display:flex;flex-direction:column;min-width:0;width:100%;max-width:900px;margin:0 auto;min-height:0;height:var(--tisya-settings-height,100dvh);max-height:100dvh;overflow:hidden;overflow-wrap:anywhere;box-sizing:border-box}
 #tisya-shell.tisya-page-open .tisya-page.tisya-matrix-page{display:flex;flex-direction:column;overflow:hidden}
 #tisya-shell .tisya-page.tisya-matrix-page>.tisya-sub-header,#tisya-shell .tisya-page.tisya-matrix-page>.tisya-sub-title{flex:none}
 #tisya-shell .tisya-page.tisya-matrix-page>.tisya-matrix-identity{flex:1 1 0;min-height:0;height:auto}
 .tisya-identity-content{flex:1;min-height:0;min-width:0;overflow:auto;overscroll-behavior:contain;padding:0 4px;scroll-padding-block:12px}
 .tisya-matrix-identity .tisya-settings-actions{position:relative;flex:none;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px;margin:0;padding:10px 4px max(10px,env(safe-area-inset-bottom,0px));border-top:1px solid #b9a66d66;background:#0b3025;z-index:3}
 .tisya-matrix-identity .tisya-settings-actions p{grid-column:1/-1;margin:0;font-size:13px;line-height:1.5;overflow-wrap:anywhere}
 .tisya-matrix-identity .tisya-settings-actions p:empty{display:none}
 .tisya-matrix-identity .tisya-settings-actions button{width:100%;min-width:0;min-height:44px;margin:0!important;padding:10px 12px}
 .tisya-matrix-identity .tisya-settings-actions button:disabled{opacity:.5;cursor:default}
 .tisya-matrix-identity .tisya-identity-nav{display:flex;flex-wrap:wrap;gap:6px}
 .tisya-matrix-identity [role=alert]{color:#edbd9d}
 .tisya-matrix-identity fieldset{min-width:0}
 `;
 root.classList.add('tisya-matrix-identity'); root.replaceChildren(style, content, footer, dialogs);

 function profileFor(id = draft?.id) {return savedIdentity.personas.find(profile => profile.id === id);}
 function roleValues(value = savedConfig) {
  const avatar = storyAvatar(value);
  return {mode:avatar.mode,book:roles.database?'当前世界表单':avatar.binding?.book??value.coreBook??'基点书',uid:roles.database?(avatar.binding?.database?avatar.binding.dossierId:''):avatar.binding?.uid==null?'':String(avatar.binding.uid)};
 }
 function resetDraft(id = savedIdentity.active) {
  const profile = profileFor(id), original = profile ? profile.descriptor.description ?? '' : savedIdentity.description ?? '';
  const legacy = savedConfig.story.wish ?? '';
  const description = legacy && original !== legacy && !original.endsWith('\n\n' + legacy)
   ? [original, legacy].filter(Boolean).join('\n\n') : original || legacy;
  const choices = orderedChoices(effectivePreferences(savedConfig).choices.W ?? []).filter(id => id !== 'W07');
  profileBase = {name: profile?.name ?? '', description: original};
  wishBase = {description: original, choices: clone(choices)};
  profileEditorBase = {...profileBase, description};
  wishEditorBase = {description, choices: clone(choices)};
  roleBase = roleValues();
  draft = {id, name: profileBase.name, description, choices, ...clone(roleBase), createName: '', createContent: '', createConfirmed: false};
  identityScopeDraft={chat:!!savedIdentity.scope.chatId,character:false,global:false};identityScopeBase=clone(identityScopeDraft);
  receipts = []; reviewRequired = false;
 }
 resetDraft();
 const profileDirty = () => !resourcesOnly && (draft.name !== profileBase.name || draft.description !== profileBase.description);
 const wishDirty=()=>!resourcesOnly&&(draft.description!==wishBase.description||stamp(draft.choices)!==stamp(wishBase.choices)||!!savedConfig.story.wish);
 const roleDirty = () => stamp({mode: draft.mode, book: draft.book, uid: draft.mode === 'bound' ? draft.uid : ''}) !== stamp({...roleBase, uid: roleBase.mode === 'bound' ? roleBase.uid : ''});
 const createDirty = () => !!(draft.createName || draft.createContent || draft.createConfirmed);
 const identityScopeDirty=()=>!resourcesOnly&&stamp(identityScopeDraft)!==stamp(identityScopeBase);
 const selectionDirty = () => !resourcesOnly&&(draft.id !== savedIdentity.active || !!savedIdentity.pending||identityScopeDirty());
 // Existing recovery intents and merged legacy wishes can be explicitly saved,
 // but neither is a newly typed draft that should trap navigation after cancel.
 const hasDraftChanges = () => reviewRequired || draft.name !== profileEditorBase.name || draft.description !== profileEditorBase.description
  || draft.description !== wishEditorBase.description || stamp(draft.choices) !== stamp(wishEditorBase.choices)
  || roleDirty() || createDirty() || draft.id !== savedIdentity.active || identityScopeDirty() || extraDirty();
 const hasChanges = () => hasDraftChanges() || profileDirty() || wishDirty() || !!savedIdentity.pending || !!savedIdentity.creationPending;
 const prompt = mountUnsavedPrompt(document, dialogs, {onStateChange: () => syncActions()});
 const state = () => ({dirty: hasChanges(), draftDirty: hasDraftChanges(), profileDirty: profileDirty(), wishDirty: wishDirty(), roleDirty: roleDirty(), createDirty: createDirty(), selectionDirty: selectionDirty(), reviewRequired, receipts: [...receipts], busy: busy || !!companion?.state?.().busy || prompt.state().busy, creationRunning:generationRunning(), creationTask:generationTask?.id??null, canSave: hasChanges() && !busy && !generationRunning(), selected: draft.id, active: savedIdentity.active});
 function syncActions() {
  if (disposed) return;
  if(companion?.root)content.append(companion.root);
  cancel.disabled = busy || generationRunning() || !!companion?.state?.().busy || prompt.state().open || !hasDraftChanges();
  saveButton.disabled = creationOnly&&!!generationRepair&&!generationDraft || busy || generationRunning() || !!companion?.state?.().busy || prompt.state().open || !hasChanges();
  content.inert = busy || prompt.state().open;
  root.setAttribute('aria-busy', String(busy));
 }
 function report(error) {
  if (disposed) return;
  lastError = error; status.setAttribute('role', 'alert'); status.textContent = error?.message || String(error);
 }
 function changed() {
  status.setAttribute('role', 'status'); status.textContent = hasChanges() ? '有未保存修改' : '';
  syncActions();retainCreationView();
 }
 function run(fn) {
  if (busy || disposed) return Promise.resolve(false);
  busy = true; lastError = null; syncActions();
  pending = (async () => {
   try {return await fn() !== false;}
   catch (error) {report(error); return false;}
   finally {busy = false; if (!disposed) syncActions();}
  })();
  return pending;
 }
 const button = (text, fn) => {const node = el('button', text, 'menu_button'); node.type = 'button'; node.onclick = () => run(fn); return node;};
 const routeButton = (text, fn) => {const node = el('button', text, 'menu_button'); node.type = 'button'; node.onclick = () => route(fn, true); return node;};
 const field = (label, control) => {
  const row = el('label', label);
  row.style.cssText = 'display:grid;gap:6px;margin:12px 0';
  control.style.maxWidth = '100%'; control.style.minWidth = '0';
  if (control.type === 'checkbox') {row.className = 'tisya-check-row'; row.style.cssText = '';}
  row.append(control.tagName === 'SELECT' ? selectControl(document, control) : control);
  return row;
 };
 const input = (key, multi = false) => {
  const node = el(multi ? 'textarea' : 'input', null, 'text_pole');
  node.value = draft[key]; node.style.cssText = 'width:100%;box-sizing:border-box';
  if (multi) node.rows = 7;
  node.oninput = () => {if (!busy && !disposed) {draft[key] = node.value; changed();}};
  return node;
 };
 const option = (select, label, value) => {const node = el('option', label); node.value = value; select.append(node);};
 function guard() {
  const current = identity.read();
  check(stamp(current.scope) === scope, '会话已改变，草稿仍保留；请回到原会话保存，或取消修改后重新读取。');
  check(current.revision === savedIdentity.revision, '身份已被其他位置修改，草稿仍保留；请取消修改后重新读取。');
  check(config.read().revision === savedConfig.revision, '配置已被其他页面更新，草稿仍保留；请取消修改后重新读取。');
 }
 function captureIdentity() {
  const current = identity.read();
  check(stamp(current.scope) === scope, '保存期间会话改变，已保存的部分保留；请回到原会话核对。');
  savedIdentity = current;
 }
 function recordReceipt(label) {if (!receipts.includes(label)) receipts.push(label);}
 async function validate() {
  check(!generationRunning(),'创作仍在进行，请等草稿完成后保存。');
  check(!reviewRequired, '已有部分确认保存，但保存期间会话改变；请先核对已保存内容，再取消修改后重新读取。');
  guard();
  if (profileDirty()) {
   if (profileFor()) check(typeof draft.name === 'string' && draft.name.trim() && !/[\r\n]/.test(draft.name), '名字须是单行非空文字');
   check(typeof draft.description === 'string', '心愿须为文字');
  }
  if (draft.id) check(!!profileFor(), '用户身份已不存在');
  if(selectionDirty()){
   check(draft.id&&profileFor(),'请选择仍存在的用户身份');
   check(!identityScopeDraft.chat||savedIdentity.scope.chatId,'请先打开要绑定的聊天');
   check(!identityScopeDraft.character||savedIdentity.scope.characterAvatar||savedIdentity.scope.groupId!=null,'请先打开要绑定的角色卡或群聊');
  }
  if(savedIdentity.creationPending)check(typeof identity.resumeCreation==='function','未完成人物槽位的恢复接口尚未接入');
  if(originDraft||originRecovery||originCreate){
   check(legacyOrigins,'旧原点恢复接口尚未接入');
   check(!profileDirty()&&!wishDirty()&&!selectionDirty()&&!roleDirty()&&!createDirty()&&!recordDraft&&!Object.keys(dossierFields).length&&!generationGoal&&!generationDraft&&!legacyDossier&&(!resourceBase||stamp(resourceBase)===stamp(resourceDraft))&&!companionDirty(),'原点恢复与其他资料修改请分次保存，当前草稿仍保留。');
   check(!originDraft||originReviewed||originRecovery,'请先核对旧原点绑定预览');
   if(originCreate){check(!originDraft&&!originRecovery,'原点绑定与另建人物请分次保存');check(originCreateReviewed,'请先核对另建人物槽位');check(typeof identity.createFromOrigin==='function','原点人物槽位接口尚未接入');}
  }
  if (createDirty()&&!roles.database) {
   check(draft.createName.trim() === draft.createName && draft.createName && !/[\r\n]/.test(draft.createName), '角色名称须为单行非空文字');
   check(draft.createContent.trim(), '请填写角色条目原文');
   check(draft.createConfirmed, '请勾选“保存时创建并绑定当前聊天”，确认这次要创建的角色。');
   check(draft.mode === 'bound', '创建角色需要使用“绑定角色”主控模式');
  }
  if ((roleDirty() || createDirty())&&!roles.database) {
   check(savedIdentity.scope.chatId, '请先打开要绑定的聊天');
   check(['unbound', 'generic', 'bound', 'ensemble'].includes(draft.mode), '角色绑定模式无效');
   check(draft.book && draft.book.trim() === draft.book, '基点书名称不能为空');
   const listing = await roles.list(draft.book);
   if (createDirty()) {
    const title = draft.createName.startsWith('【角色】') ? draft.createName : '【角色】' + draft.createName;
    const same = listing.entries.filter(row => row.name === title);
    check(same.length <= 1, '基点书中有多个同名角色，请先核对');
    check(!same.length || same[0].content === draft.createContent, '已有同名角色且内容不同，请选择已有条目或使用另一名称');
   } else {
    check(listing.exists !== false, '请选择已建立的基点书');
    if (draft.mode === 'bound') check(listing.entries.some(row => String(row.uid) === draft.uid), '请选择仍存在的基点书角色条目');
   }
  }
  await validateExtras();
  await companion?.validateDraft?.();
  // List/read operations can yield while the host changes chat or another editor saves.
  guard();
 }
 async function save() {
  if (!hasChanges()) return true;
  await validate();
  try {
   if(originDraft||originRecovery){
    if(originRecovery)await legacyOrigins.resume(originDraft?clone(originDraft):undefined);
    else await legacyOrigins.save(clone(originDraft));
    captureIdentity();savedConfig=config.read();originDraft=null;originReviewed=false;originRecovery=false;resetDraft(savedIdentity.active);recordReceipt('既有原点身份恢复');guard();
   }
   if(originCreate){await identity.createFromOrigin(clone(originCreate.reference));captureIdentity();originCreate=null;originCreateReviewed=false;recordReceipt('既有原点独立人物槽位');guard();}
   if(savedIdentity.creationPending&&!generationReceipt){await identity.resumeCreation();captureIdentity();clearCreationTaskView();recordReceipt('人物槽位恢复');guard();}
   await saveRecord();
   if (savedIdentity.pending) {
    const target=savedIdentity.pending.id;await identity.resume(); captureIdentity();if(selectionSubmission?.id===target){identityScopeBase=clone(selectionSubmission.scopes);selectionSubmission=null;}recordReceipt('身份切换'); guard();
   }
   if (profileDirty()) {
    if (profileFor()) await identity.saveProfile({id: draft.id, revision: savedIdentity.revision, name: draft.name, description: draft.description});
    else await identity.saveWish({revision: savedIdentity.revision, description: draft.description});
    profileBase = {name: draft.name, description: draft.description};
    profileEditorBase = clone(profileBase);
    recordReceipt('姓名与心愿'); captureIdentity(); guard();
   }
   if (wishDirty()) {
    const next = clone(savedConfig), choices = [...draft.choices];
    if (draft.description.trim()) choices.push('W07');
    next.story.play ??= {}; next.story.play.choices ??= {};
    next.story.play.choices.W = orderedChoices(choices); next.story.wish = '';
    savedConfig = await config.save(next);
    wishBase = {description: draft.description, choices: clone(draft.choices)};
    wishEditorBase = clone(wishBase);
    recordReceipt('心愿选项'); guard();
   }
   if (createDirty()&&!roles.database) {
    const entry = await roles.create({book: draft.book, name: draft.createName, content: draft.createContent}, savedConfig.revision);
    savedConfig = config.read(); roleBase = roleValues();
    draft.mode = roleBase.mode; draft.book = roleBase.book; draft.uid = String(entry.uid);
    draft.createName = ''; draft.createContent = ''; draft.createConfirmed = false;
    recordReceipt('角色条目与当前聊天绑定'); guard();
   } else if (roleDirty()) {
    savedConfig = await roles.bind({mode:draft.mode,book:draft.book,uid:draft.uid,...(roles.database?{dossierId:draft.uid}:{})},savedConfig.revision);
    roleBase = roleValues(); draft.mode = roleBase.mode; draft.book = roleBase.book; draft.uid = roleBase.uid;
    recordReceipt('主控模式与当前聊天绑定'); guard();
   }
   if(resourceBase&&stamp(resourceDraft)!==stamp(resourceBase)){savedConfig=await roles.saveResources(clone(resourceDraft),savedConfig.revision);resourceBase=clone(resourceDraft);recordReceipt('资料书与手机世界');guard();}
   if (draft.id !== savedIdentity.active||identityScopeDirty()) {
    selectionSubmission={id:draft.id,scopes:clone(identityScopeDraft)};
    await identity.select({id: draft.id, revision: savedIdentity.revision, ...identityScopeDraft});
    captureIdentity();identityScopeBase=clone(identityScopeDraft);selectionSubmission=null;recordReceipt('身份切换与范围'); guard();
   }
   if(companionDirty()){
    const previousReceipt=companion.state?.().receipt?.operationId,complete=await companion.saveDraft(),companionState=companion.state?.();
    if(companionState?.receipt?.confirmed&&companionState.receipt.operationId!==previousReceipt)recordReceipt('小剧场与手机呈现');
    check(complete!==false,companionState?.error??'呈现配置保存未完成，草稿仍保留');recordReceipt('小剧场与手机呈现');guard();
   }
  } catch (cause) {
   // Only a matching durable selection intent authorizes resuming a failed step.
   // Field equality alone never proves that a failed write reached its store.
   const latest = identity.read();
   if (latest.pending?.id === draft.id && stamp(latest.scope) === scope) savedIdentity = latest;
   if(stamp(latest.scope)===scope&&(latest.creationPending?.id===savedIdentity.creationPending?.id&&latest.creationPending||generationSavedDraft&&generationSavedDraft.operationId===latest.creationPending?.reference?.operationId||originCreate&&stamp(originCreate.reference)===stamp(latest.creationPending?.reference)))savedIdentity=latest;
   if (cause.receipt?.confirmed === true && stamp(cause.receipt.scope) === scope) {
    if (cause.receipt.kind === 'profile' && cause.receipt.id === draft.id || cause.receipt.kind === 'wish') {
     recordReceipt('姓名与心愿'); reviewRequired = true;
    }
   }
   if (receipts.length && stamp(latest.scope) !== scope) reviewRequired = true;
   if (!disposed) await draw();
   const prefix = receipts.length ? '已保存：' + receipts.join('、') + '；其余修改仍保留。' : '';
   throw new Error(prefix + cause.message, {cause});
  }
  if (!disposed) {
   await draw(); status.setAttribute('role', 'status'); status.textContent = creationOnly?'已保存创作档案。可在用户身份页选择当前主控人物。':'已保存本页的身份、心愿、档案与资料设置。';
  }
  return true;
 }
 async function discard() {
  check(!generationRunning(),'请先停止创作；收起页面不会中断任务。');
  check(!creationLocked(),'这份创作已经开始保存，请继续保存并核对同一次提交；恢复草稿仍保留，也可先导出。');
  if(companion?.discardDraft)check(await companion.discardDraft()!==false,'呈现配置取消未完成');clearExtras();clearCreationTaskView();
  savedIdentity = identity.read(); savedConfig = config.read(); scope = stamp(savedIdentity.scope); resetDraft();
  await draw(); status.setAttribute('role', 'status');
  status.textContent = savedIdentity.pending||savedIdentity.creationPending ? '未保存的输入已取消；已进入保存的身份操作仍待核对，请使用保存继续。' : '已取消修改，恢复到已保存的内容。';
  return true;
 }
 const saveDraft = () => run(save), discardDraft = () => run(discard);
 async function confirmLeave() {
  if (disposed || busy && !navigating) return false;
  if (navigating) return true;
  if (navigationPending) return false;
  if(creationOnly&&roles.rememberCreationView&&!creationLocked()){retainCreationView();return !prompt.state().open;}
  if (!hasDraftChanges()) return !prompt.state().open;
  return prompt.request({
   save: async () => {if (!await saveDraft()) throw lastError ?? Error('保存未完成，草稿仍保留。'); return !hasChanges();},
   discard: async () => {if (!await discardDraft()) throw lastError ?? Error('取消修改未完成。'); return !hasDraftChanges();}
  });
 }
 function route(fn, external = false) {
  if (busy || disposed || navigationPending) return Promise.resolve(false);
  navigationPending = (async () => {
   if (!await confirmLeave() || disposed) return false;
   navigating = external;
   try {await fn(); return true;}
   catch (error) {report(error); return false;}
   finally {navigating = false;}
  })();
  return navigationPending.finally(() => {navigationPending = null;});
 }
 cancel.onclick = discardDraft; saveButton.onclick = saveDraft;

 async function validateExtras(){
  if(roles.database){
   if(Object.keys(dossierFields).length||createDirty()||recordDraft||sourceRepair){check(recordDraft,'请先预览人物档案变更');check(recordConfirmed,'请确认保存时提交已预览的表单变更');await roles.validateEdit(recordDraft);}
   if(roleDirty()&&!recordDraft?.bindOnCommit){check(['unbound','generic','bound','ensemble'].includes(draft.mode),'角色绑定模式无效');if(draft.mode==='bound'){const listed=await roles.list();check(listed.entries.some(row=>row.dossierId===draft.uid&&row.entityId),'请选择已登记的人物表单');}}
   if(generationGoal||generationDraft||generationReceipt||generationHistory.length){
    check(generationDraft,'请先生成并核对创作草稿，或取消本次输入');check(generationConfirmed,'请确认保存时提交创作草稿');check(creationDestination.book?.trim(),'请选择保存到的世界基点书，或填写新世界书名称');check(!recordDraft,'人物档案变更与新创作是不同事务，请先完成当前人物变更再创建新内容');
    if(generationCreatePersona&&generationKind==='character')check(typeof identity.createFromMatrix==='function','统一人物槽位接口尚未接入');
    if(!generationReceipt){
     check(!Object.keys(generationFieldErrors).length,'请先修正创作字段的数据格式');
     check([...root.querySelectorAll('[data-creation-row]')].every(node=>node.checkValidity()),'请先修正创作字段的数据格式');
     if(generationDraft.creationSource){const source=generationDraft.creationSource,latest=await listCreationCores();check(latest.some(row=>row.book===source.book&&row.id===source.id&&row.version===source.version&&stamp(row)===stamp(source)),'所选基点版本已改变，创作草稿保留');}
     const proposal=parseGeneration();check(proposal.matrix?.changes?.length,'目前没有可保存的已通过条目，请先继续修复待办');generationDraft.destination=clone(creationDestination);if(typeof roles.validateCreation==='function')await roles.validateCreation({...generationDraft,proposal});else check(!(proposal.unresolved??[]).length,'创作草稿仍有待补事项');
    }
   }
  }
  if(legacyDossier){check(legacyDossier.name.trim()&&!/[\r\n]/.test(legacyDossier.name),'角色名称须为单行非空文字');const listed=await roles.list(legacyDossier.book),row=listed.entries.find(row=>String(row.uid)===String(legacyDossier.uid));check(row&&row.name===legacyDossier.before.name&&row.content===legacyDossier.before.content,'角色档案已被其他页面修改，请核对后重新读取');}
  if(resourceBase&&stamp(resourceDraft)!==stamp(resourceBase)){
   const available=await roles.resources();check(resourceDraft.referenceBooks.every(name=>available.books.includes(name)&&!available.excluded.includes(name)),'资料书选择无效、已缺失或不可选');
   const world=resourceDraft.phoneWorld;
   if(world){if(roles.database)check(available.worlds.some(row=>row.worldId===world.worldId),'所选世界记录已不存在');else{const rows=await roles.worldDefinitions(world.book);check(rows.some(row=>String(row.uid)===String(world.uid)),'所选手机世界定义已不存在');}}
  }
 }
 function parseGeneration(){try{return JSON.parse(generationText);}catch{throw Error('创作草稿格式损坏，原始内容仍保留，请重新读取草稿');}}
 function creationLocked(){return !!generationReceipt||!!generationSavedDraft;}
 function generationSnapshot(){return clone({draft:generationDraft,text:generationText,goal:generationGoal,kind:generationKind,mode:generationMode,useCore:generationUseCore,coreIndex:creationCoreIndex,createPersona:generationCreatePersona,fieldTexts:generationFieldTexts,fieldErrors:generationFieldErrors,destination:creationDestination,source:creationSource,repair:generationRepair});}
 function rememberGeneration(){if(generationDraft)generationHistory.push(generationSnapshot());}
 function exportDraft(){return clone({format:'tisya.unified-identity-recovery/1',scope:savedIdentity.scope,identityRevision:savedIdentity.revision,configRevision:savedConfig.revision,profile:draft,identityScopes:identityScopeDraft,recordDraft,recordConfirmed,dossierFields,dossierBefore,sourceRepair,legacyDossier,resources:resourceDraft,creation:generationSnapshot(),creationHistory:generationHistory,creationReceipt:generationReceipt,creationSavedDraft:generationSavedDraft,creationFailure:generationFailure,originDraft,originReviewed,originRecovery,originCreate,originCreateReviewed});}
 function downloadDraft(){const url=URL.createObjectURL(new Blob([JSON.stringify(exportDraft(),null,2)],{type:'application/json'})),link=el('a');link.href=url;link.download='用户身份-未保存草稿.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 async function saveRecord(){
  if(recordDraft){
   let result;try{result=await roles.commitEdit(recordDraft);}catch(error){
    if(error.databaseReceipt?.confirmed){recordReceipt('人物表单（后续绑定仍待核对）');try{await companion?.acceptDatabaseReceipt?.(error.databaseReceipt);}catch(receiptError){throw Object.assign(new Error(error.message+'；呈现草稿回执核对未完成：'+receiptError.message,{cause:error}),{databaseReceipt:error.databaseReceipt});}}
    throw error;
   }
   check(result?.databaseReceipt?.confirmed,'角色保存未返回确认回执');savedConfig=config.read();
   if(recordDraft.bindOnCommit){roleBase=roleValues();draft.mode=roleBase.mode;draft.book=roleBase.book;draft.uid=roleBase.uid;}
   else roleBase=roleValues();
   recordReceipt('人物档案与当前聊天绑定');recordDraft=null;recordConfirmed=false;dossierFields={};dossierBefore=null;sourceRepair=null;draft.createName='';draft.createContent='';draft.createConfirmed=false;
   guard();await companion?.acceptDatabaseReceipt?.(result.databaseReceipt);
  }
  if(legacyDossier){
   let result;
   try{result=await roles.edit(clone(legacyDossier),savedConfig.revision);}
   catch(error){
    const receipt=error.dossierReceipt,title=legacyDossier.name.startsWith('【角色】')?legacyDossier.name:'【角色】'+legacyDossier.name;
    if(receipt?.confirmed&&receipt.scope===roles.scope?.()&&receipt.book===legacyDossier.book&&String(receipt.entry?.uid)===String(legacyDossier.uid)&&receipt.entry.name===title&&receipt.entry.content===legacyDossier.content){legacyDossier.before=clone(receipt.entry);recordReceipt('角色档案（聊天身份同步待完成）');}
    throw error;
   }
   check(result?.uid!==undefined,'角色档案保存未返回条目回执');legacyDossier=null;savedConfig=config.read();roleBase=roleValues();recordReceipt('角色档案');guard();
  }
  if(generationDraft){
   const request=generationSavedDraft??{...generationDraft,destination:clone(creationDestination),proposal:parseGeneration(),createPersona:generationCreatePersona};
   if(!generationReceipt){
    let result;
    try{result=await roles.saveCreation(request,{destination:request.destination});}
    catch(error){
     if(error.draft||error.archivePlan||error.archiveReceipt){
      const retained=error.draft?clone(error.draft):clone(request);
      if(error.archivePlan)retained.archivePlan=clone(error.archivePlan);
      if(error.archiveReceipt)retained.archiveReceipt=clone(error.archiveReceipt);
      // A rejected source preflight retains editable input. Once an archive
      // plan or durable intent exists, even an unknown result must resume it.
      if(retained.archivePlan||retained.recovery||retained.archiveReceipt)generationSavedDraft=clone(retained);
      generationDraft=clone(retained);generationText=JSON.stringify(retained.proposal,null,2);
      if(retained.archiveReceipt?.confirmed)recordReceipt('基点书归档（聊天接入待继续）');
     }
     throw error;
    }
    check(result?.state&&result.contextKey===request.contextKey&&Number.isInteger(result.revision),'创作保存未返回当前聊天的确认表单');generationReceipt=result;generationSavedDraft=clone(request);recordReceipt('基点书角色或世界档案与当前表单');
   }
   const result=generationReceipt;
   const receipt={confirmed:true,contextKey:result.contextKey,beforeRevision:request.expectedRevision,revision:result.revision,records:request.proposal.matrix.changes.map(change=>({tableId:change.tableId,recordId:change.recordId}))};
   await companion?.acceptDatabaseReceipt?.(receipt);
   if(generationCreatePersona&&request.kind==='character'){await identity.createFromMatrix({draft:request,receipt:result});captureIdentity();recordReceipt('独立人物槽位');}
   const remaining=request.acceptance;generationRepair=remaining&&((remaining.pending?.length??0)||(remaining.warnings?.length??0))?{acceptance:clone(remaining),rawResponse:request.rawResponse??'',contextKey:result.contextKey,operationId:request.operationId,revision:result.revision,kind:request.kind,source:clone(request.source??null),destination:clone(request.destination),acceptedRecords:request.proposal.matrix.changes.map(change=>({tableId:change.tableId,recordId:change.recordId})),repairContext:clone(result.repairContext??null)}:null;
   generationDraft=null;generationText='';generationConfirmed=false;generationGoal='';generationReceipt=null;generationSavedDraft=null;generationFailure=null;generationHistory=[];generationFieldTexts={};generationFieldErrors={};clearCreationTaskView();guard();if(generationRepair)retainCreationView();
  }
 }
 function showRecordPreview(container){
  if(!recordDraft)return;const preview=el('section');preview.dataset.identityDraft='';preview.append(el('h4','提交前核对'),el('p','这些变更尚未保存；勾选确认后，使用页面底部保存。'));
  if(recordDraft.bindOnCommit)preview.append(el('p','保存时建立人物并绑定当前聊天；作者来源保留。'));
  if(recordDraft.importSource)preview.append(el('p','原来源：'+recordDraft.importSource.book+' / UID '+recordDraft.importSource.uid+' / SHA-256 '+recordDraft.importSource.digest));
  for(const change of recordDraft.diff)preview.append(el('p',change.label+'：'+(change.before===undefined?'未提供':JSON.stringify(change.before))+' → '+JSON.stringify(change.after)));
  const confirm=el('input');confirm.type='checkbox';confirm.dataset.databaseConfirm='';if(recordDraft.kind==='create')confirm.dataset.roleCreateConfirm='';confirm.checked=recordConfirmed;
  confirm.onchange=()=>{recordConfirmed=confirm.checked;changed();};preview.append(field('保存时提交这些表单变更',confirm));container.append(preview);
 }
 function invalidateRecord(){recordDraft=null;recordConfirmed=false;changed();}
 async function drawDatabase(){
  const section=el('section');section.dataset.storyAvatar='';section.dataset.databaseIdentity='';section.append(el('h3','故事人物 · 当前表单'),el('p','人物档案、世界时间与小手机共用当前聊天的统一表单。作者原文作为来源保留，编辑只提交明确修改的字段。'));content.append(section);
  let listing;try{listing=await roles.list();}catch(error){section.append(el('p','当前表单暂不可读：'+error.message));listing={entries:[],schema:[]};}if(disposed)return;
  const mode=el('select'),picker=el('select');mode.dataset.avatarMode='';picker.dataset.roleEntry='';
  for(const [id,label]of [['unbound','不绑定角色'],['generic','通用'],['bound','绑定当前人物'],['ensemble','无主控纯群像 / 场外导演模式']])option(mode,label,id);mode.value=draft.mode;
  option(picker,'选择表单人物','');for(const row of listing.entries)option(picker,row.name,row.dossierId);if(draft.uid&&!listing.entries.some(row=>row.dossierId===draft.uid))option(picker,'原人物记录已缺失，请重新选择',draft.uid);picker.value=draft.uid;
  mode.onchange=()=>{draft.mode=mode.value;changed();};picker.onchange=()=>{const next=picker.value;if(Object.keys(dossierFields).length||recordDraft||sourceRepair){picker.value=draft.uid;picker.tisyaRefresh?.();return route(async()=>{draft.uid=next;dossierBefore=null;await draw();changed();});}draft.uid=next;dossierBefore=null;changed();return run(draw);};
  section.append(field('主控模式',mode),field('当前人物',picker));
  const binding=storyAvatar(savedConfig).binding;
  if(binding&&!binding.database){const migration=el('section');migration.append(el('p','当前聊天仍引用旧角色原文；可在下方选择同一基点书，由助手提炼成规范表单。'));
   if(onCreate)migration.append(routeButton('将旧角色交给助手提炼',()=>handoffSource(binding)));section.append(migration);}
  const row=listing.entries.find(row=>row.dossierId===draft.uid);
  if(row){
   const edit=el('section');edit.dataset.roleEdit='';edit.append(el('h3','编辑角色档案'));section.append(edit);dossierBefore??=clone(row);const extras=el('details');extras.append(el('summary','更多档案字段'));const parsers=[];
   if(sourceRepair){const original=el('details');original.open=true;original.dataset.sourceRepair='';original.append(el('summary','按原文整理旧档案：'+sourceRepair.source.book+' / '+sourceRepair.source.uid),el('pre',sourceRepair.source.content),el('p','请按原文填写下方标准字段，再预览档案变更。保存时核对旧迁移来源，保留人物编号与原文；已填写的其他内容不会被覆盖。'));edit.append(original);}
   for(const def of listing.schema.filter(field=>!field.read_only&&!field.alias_of&&!field.formula&&!['row_uuid','char_id'].includes(field.key))){
    const original=dossierBefore.values[def.key],type=String(def.type??'TEXT').toUpperCase();let node,parse,initial;
    if(type==='ENUM'&&Array.isArray(def.enum)){node=el('select');option(node,'未提供','');for(const choice of def.enum)option(node,String(choice),String(choice));initial=original??'';parse=raw=>raw===''?undefined:raw;}
    else if(type==='BOOLEAN'){node=el('select');option(node,'未提供','');option(node,'是','true');option(node,'否','false');initial=original===undefined?'':String(original);parse=raw=>raw===''?undefined:raw==='true';}
    else if(type==='NUMBER'||type==='INTEGER'){node=el('input');node.type='number';initial=original===undefined?'':String(original);parse=raw=>{if(raw==='')return undefined;const value=Number(raw);check(Number.isFinite(value),(def.label??def.key)+' 须为有效数值');return value;};}
    else if(['JSON','OBJECT','ARRAY','COORD','LIST','MAP','STRUCT'].includes(type)||original!==undefined&&typeof original==='object'){node=el('textarea');initial=original===undefined?'':JSON.stringify(original,null,2);parse=raw=>{if(raw==='')return undefined;try{return JSON.parse(raw);}catch{throw Error((def.label??def.key)+' 须为有效 JSON');}};}
    else{node=el('textarea');initial=original??'';parse=raw=>raw;}
    node.className='text_pole';node.value=Object.hasOwn(dossierFields,def.key)?dossierFields[def.key]:initial;node.style.cssText='width:100%;box-sizing:border-box';if(node.tagName==='TEXTAREA')node.rows=def.key==='manifest'?9:2;node.dataset.roleField=def.key;if(def.key==='name')node.dataset.roleEditName='';if(def.key==='manifest')node.dataset.roleEditContent='';
    const update=()=>{if(node.value===String(initial))delete dossierFields[def.key];else dossierFields[def.key]=node.value;invalidateRecord();preview.replaceChildren();};node.oninput=update;node.onchange=update;
    const stateLabel={unknown:'未知',unset:'未提供',cleared:'已清除',none:'明确无',not_applicable:'不适用'}[row.states[def.key]??'unset'];(['name','manifest','public_identity','scene_personality_desc'].includes(def.key)?edit:extras).append(field((def.label??def.key)+(stateLabel?'（'+stateLabel+'）':''),node));parsers.push({key:def.key,parse});
   }
   const preview=el('div');edit.append(extras,button('预览档案变更',async()=>{check(!createDirty()&&!generationGoal,'请先完成或取消当前新建内容');const values={};for(const {key,parse}of parsers)if(Object.hasOwn(dossierFields,key)){const value=parse(dossierFields[key]);if(value!==undefined)values[key]=value;}if(sourceRepair){check(sourceRepair.dossierId===row.dossierId,'整理目标已改变，请重新选择原文');recordDraft=await roles.previewSourceRepair({dossierId:row.dossierId,source:clone(sourceRepair.source),values});}else recordDraft=await roles.previewEdit({dossierId:row.dossierId,values,before:dossierBefore});recordConfirmed=false;preview.replaceChildren();showRecordPreview(preview);changed();}),preview);if(['edit','source-repair'].includes(recordDraft?.kind))showRecordPreview(preview);
  }
  await drawSourceChoices(section);
  if(onCreate){
   section.append(routeButton('前往缇斯亚助手创建人物',()=>onCreate({kind:'character',destination:{book:sourceBook||'',newBook:false}})),routeButton('前往缇斯亚助手创建世界',()=>onCreate({kind:'world',destination:{book:'',newBook:true}})));
  }
  await drawResources();
 }
 async function drawSourceChoices(section){
  if(typeof roles.sourceChoices!=='function')return;
  const box=el('section');box.dataset.sourceBooks='';box.append(el('h3','基点书 · 资料来源'));section.append(box);
  try{sourceListing=await roles.sourceChoices(sourceBook||undefined);}catch(error){box.append(el('p','基点书读取失败：'+error.message),button('重新读取基点书',draw));return;}
  if(disposed)return;sourceBook=sourceListing.book||sourceBook;
  const books=el('select'),entries=el('select');books.dataset.roleBook='';entries.dataset.sourceEntry='';
  option(books,'选择世界基点书','');for(const name of sourceListing.books??[])option(books,name,name);books.value=sourceBook;
  const rows=[...(sourceListing.entries??[]),...(sourceListing.unmarkedEntries??[])];
  option(entries,'选择角色条目','');for(const row of rows)option(entries,(row.name||row.title)+' · '+(row.definition?'规范表单':'原文资料'),String(row.uid));entries.value=sourceUid;
  books.onchange=()=>{sourceBook=books.value;sourceUid='';return run(draw);};entries.onchange=()=>{sourceUid=entries.value;return run(draw);};
  box.append(field('世界基点书',books),field('角色条目',entries),el('p','原文资料可交给助手提炼；已有规范表单可预览后用于当前聊天。来源条目和当前故事进度分别保存。'));
  const selected=rows.find(row=>String(row.uid)===sourceUid);
  if(selected){
   const raw=el('details');raw.append(el('summary','查看作者原文'),el('pre',selected.content));box.append(raw);
   if(draft.uid&&typeof roles.previewSourceRepair==='function')box.append(button('按原文整理旧档案',async()=>{check(!recordDraft&&!generationGoal&&!generationDraft&&!createDirty(),'请先保存或取消当前档案草稿');const snapshot=await roles.readSource({book:sourceBook,uid:selected.uid});guard();sourceRepair={dossierId:draft.uid,source:clone(snapshot)};await draw();changed();}));
   if(selected.definition)box.append(button('预览使用此人物',async()=>{check(!recordDraft&&!Object.keys(dossierFields).length,'请先保存或取消当前人物修改');const snapshot=await roles.readSource({book:sourceBook,uid:selected.uid});recordDraft=await roles.previewSourceImport(snapshot,{bindOnCommit:true});recordConfirmed=false;await draw();changed();}));
   else if(onCreate)box.append(routeButton('交给缇斯亚助手提炼',()=>handoffSource({book:sourceBook,uid:selected.uid})));
  }
  if(recordDraft?.kind==='source-import'||recordDraft?.kind==='source-migration')showRecordPreview(box);
 }
 async function handoffSource(reference){
  check(typeof roles.previewSourceMigration==='function','来源提炼接口尚未接入');const handoff=await roles.previewSourceMigration(reference);guard();
  if(handoff.requiresExtraction)await onCreate({kind:'character',mode:handoff.mode,source:handoff.source,destination:handoff.destination,goal:handoff.goal});
  else{recordDraft=handoff;recordConfirmed=false;await draw();changed();}
 }
 async function drawCreation(){
  generationUnsubscribe?.();generationUnsubscribe=null;generationWorkbench?.dispose();generationWorkbench=null;
  const generated=el('section'),kind=el('select'),goal=el('textarea'),generationPreview=el('div');
  generated.dataset.databaseCreation='';goal.dataset.creationGoal='';goal.className='text_pole';goal.value=generationGoal;goal.rows=5;
  const abandonGeneration=()=>{check(!creationLocked(),'本次保存已开始，请使用底部保存继续核对同一份草稿。');rememberGeneration();generationDraft=null;generationText='';generationConfirmed=false;generationFailure=null;generationFieldTexts={};generationFieldErrors={};renderGeneration();changed();};
  option(kind,'新人物','character');option(kind,'新世界','world');kind.value=generationKind;kind.dataset.creationKind='';
  kind.onchange=()=>{if(creationLocked()){kind.value=generationKind;return;}abandonGeneration();generationKind=kind.value;changed();};
  goal.oninput=()=>{if(creationLocked()||generationRunning())return;generationGoal=goal.value;generationConfirmed=false;changed();};
  kind.disabled=goal.disabled=creationLocked();
  let destinations=[];if(typeof roles.sourceChoices==='function'){try{destinations=(await roles.sourceChoices(creationDestination.book||undefined)).books??[];}catch(error){generated.append(el('p','保存位置读取失败：'+error.message));}}
  const targetBook=el('select'),newBook=el('input');targetBook.dataset.creationBook='';newBook.dataset.creationBookName='';newBook.className='text_pole';
  option(targetBook,'选择要保存的世界基点书','');for(const name of destinations)option(targetBook,name,name);targetBook.value=creationDestination.book;newBook.value=creationDestination.newBook?creationDestination.book:'';
  targetBook.disabled=newBook.disabled=creationLocked();
  const targetRow=field('保存到世界基点书',targetBook),newRow=field('新世界书名称',newBook);
  const syncDestination=()=>{targetRow.hidden=generationKind==='world';newRow.hidden=generationKind!=='world';};syncDestination();
  targetBook.onchange=()=>{creationDestination={book:targetBook.value,newBook:false,...(creationSource?.book===targetBook.value?{uid:creationSource.uid}:{})};generationConfirmed=false;changed();};
  newBook.oninput=()=>{creationDestination={book:newBook.value,newBook:true};generationConfirmed=false;changed();};
  generated.append(targetRow,newRow);
  const changeKind=kind.onchange;kind.onchange=()=>{changeKind();creationDestination={book:'',newBook:generationKind==='world'};creationSource=null;syncDestination();};
  if(creationSource){const sourceInfo=el('details');sourceInfo.append(el('summary','来源：'+creationSource.book+' / '+(creationSource.name??creationSource.title??creationSource.uid)),el('pre',creationSource.content??''));generated.append(sourceInfo);}
  const creationModeControl=el('select');creationModeControl.dataset.creationMode='';option(creationModeControl,'补充新内容','extend');option(creationModeControl,'修订已有定义','revise');creationModeControl.value=generationMode;creationModeControl.disabled=creationLocked();creationModeControl.onchange=()=>{abandonGeneration();generationMode=creationModeControl.value;changed();};
  generated.append(el('h3','与缇斯亚一起创作'),field('创作类型',kind),field('创作方式',creationModeControl));
  if(generationUseCore){
   const core=el('select');core.dataset.creationCore='';option(core,'请选择固定基点','');
   creationCores.forEach((row,i)=>option(core,row.name+' @'+row.version+' · '+row.book,String(i)));
   core.value=creationCores.length?String(creationCoreIndex):'';core.disabled=creationLocked();
   core.onchange=()=>{abandonGeneration();creationCoreIndex=Number(core.value);changed();};generated.append(field('基点固定版本',core));
   if(!creationCores.length)generated.append(el('p','没有可用的既有基点；请先建立基点，或返回选择“设计用户身份”。'));
  }
  if(typeof identity.createFromMatrix==='function'){
   const persona=el('input');persona.type='checkbox';persona.dataset.creationPersona='';persona.checked=generationCreatePersona;persona.disabled=creationLocked();
   persona.onchange=()=>{generationCreatePersona=persona.checked;changed();};generated.append(field('另建用户身份供扮演使用（可选）',persona));
  }
  const renderGeneration=()=>{
   generationPreview.replaceChildren();
   if(generationHistory.length&&!creationLocked()){
    const history=el('details');history.dataset.creationHistory='';history.append(el('summary','之前的创作草稿（'+generationHistory.length+'）'));
    generationHistory.forEach((snapshot,index)=>history.append(button('恢复创作草稿 '+(index+1),async()=>{check(!creationLocked(),'请先完成已保存的人物槽位');const previous=clone(snapshot);rememberGeneration();generationDraft=previous.draft;generationText=previous.text;generationGoal=previous.goal;generationKind=previous.kind;generationMode=previous.mode;generationUseCore=previous.useCore;creationCoreIndex=previous.coreIndex;generationCreatePersona=previous.createPersona;generationFieldTexts=previous.fieldTexts;generationFieldErrors=previous.fieldErrors;creationDestination=previous.destination??creationDestination;creationSource=previous.source??null;generationConfirmed=false;generationFailure=null;await draw();changed();})));
    generationPreview.append(history);
   }
   if(generationFailure){const failed=el('details');failed.append(el('summary','未完成的模型原答'),el('pre',typeof generationFailure==='string'?generationFailure:JSON.stringify(generationFailure,null,2)));generationPreview.append(failed);}
   if(generationRepair)renderCreationAcceptance(document,generationPreview,{acceptance:generationRepair.acceptance,rawResponse:generationRepair.rawResponse,saved:true,onRepair:()=>sendRepair(),disabled:generationRunning()||typeof roles.repairCreation!=='function'});
   if(!generationDraft)return;
   if(generationDraft.acceptance)renderCreationAcceptance(document,generationPreview,{acceptance:generationDraft.acceptance,rawResponse:generationDraft.rawResponse,onRepair:()=>sendRepair(),disabled:generationRunning()||typeof roles.repairCreation!=='function'||(generationDraft.proposal?.matrix?.changes?.length??0)>0});
   if(generationDraft.proposal?.matrix?.changes?.length===0){generationPreview.append(el('p','当前没有依赖完整的已通过条目；待修原文保留，不会写入空档案。'));return;}
   if(creationLocked()){generationPreview.append(el('p',generationReceipt?'人物表单已保存；使用底部保存继续完成同一人物槽位，不会重复创建档案。':generationSavedDraft?.archiveReceipt?.confirmed?'基点书已确认归档，当前聊天尚未接入；使用底部保存继续同一次提交。':'这份创作上次保存尚未完成；使用底部保存读取实际结果后继续同一次提交。'));return;}
   const confirmed=el('input');confirmed.type='checkbox';confirmed.dataset.creationConfirm='';confirmed.checked=generationConfirmed;
   const typed=el('div');typed.dataset.creationFields='';typed.dataset.creationDraft='';
   const invalidate=()=>{generationConfirmed=false;confirmed.checked=false;changed();};
   confirmed.onchange=()=>{generationConfirmed=confirmed.checked;changed();};
   let proposal;try{proposal=JSON.parse(generationText);}catch{proposal=null;}
   mountCreationTable(document,typed,{proposal,schema:generationDraft.schema,fieldTexts:generationFieldTexts,fieldErrors:generationFieldErrors,onInvalid:invalidate,onChange:next=>{
    const binding=next.matrix.binding,primary=next.matrix.changes.find(row=>generationKind==='character'?row.tableId==='T_CHAR_DOSSIER'&&row.recordId===binding?.dossierId:row.tableId==='T_STATIC_WORLDS'&&row.recordId===binding?.worldId);
    if(primary?.values.name!==undefined)next.name=primary.values.name;generationText=JSON.stringify(next,null,2);invalidate();
   }});
   const raw=el('details');raw.append(el('summary','模型原答'),el('pre',typeof generationDraft.rawResponse==='string'?generationDraft.rawResponse:JSON.stringify(generationDraft.rawResponse,null,2)));
   generationPreview.append(typed,raw,field('保存时提交这份创作草稿',confirmed));
  };
  function adoptDraft(next,taskId){if(disposed||creationLocked()||!next)return;guard();if(taskId&&adoptedTaskId===taskId)return;rememberGeneration();generationRepair=null;generationDraft=clone(next);generationDraft.destination=clone(next.destination??creationDestination);creationDestination=clone(generationDraft.destination);generationKind=next.kind??generationKind;generationMode=next.mode??generationMode;generationGoal=next.goal??generationGoal;generationText=JSON.stringify(next.proposal,null,2);generationConfirmed=false;generationFailure=null;generationFieldTexts={};generationFieldErrors={};adoptedTaskId=taskId??next.operationId;renderGeneration();changed();}
  function syncCreationControls(){const locked=creationLocked()||generationRunning();for(const node of generated.querySelectorAll('[data-creation-kind],[data-creation-mode],[data-creation-book],[data-creation-book-name],[data-creation-core],[data-creation-persona]'))node.disabled=locked;generationPreview.inert=generationRunning();}
  function receiveTask(task){if(disposed||stamp(identity.read().scope)!==scope)return;generationTask=task;generationWorkbench?.render(task);syncCreationControls();if(task?.status==='ready'&&task.draft&&!generationStarting){try{adoptDraft(task.draft,task.id);}catch(error){report(error);}}if(task?.status==='error')generationFailure=task.text??task.error?.rawResponse??null;syncActions();}
  async function sendRepair(){
   if(generationRunning()||disposed)return false;check(typeof roles.repairCreation==='function','待修服务尚未就绪；原文和已保存引用已保留，不会重放已保存条目。');
   generationStarting=true;syncActions();syncCreationControls();generationPending=(async()=>{try{guard();const next=await roles.repairCreation(clone(generationRepair??{draft:generationDraft}),{goal:generationGoal||'只修复待办；保留已保存条目，优化建议另列',onProgress:()=>{if(!disposed)receiveTask(roles.creationTask?.()??generationTask);}});if(!disposed)adoptDraft(next,roles.creationTask?.()?.id??next.operationId);return true;}catch(error){if(!disposed)report(error);return false;}finally{generationStarting=false;if(!disposed){generationTask=roles.creationTask?.()??generationTask;generationWorkbench?.render(generationTask);syncCreationControls();syncActions();retainCreationView();}}})();return generationPending;
  }
  async function sendCreation(){
   if(generationRepair)return sendRepair();
   if(generationRunning()||disposed)return false;generationStarting=true;syncActions();syncCreationControls();
   generationPending=(async()=>{try{
    guard();check(savedIdentity.scope.chatId,'请先打开要绑定的聊天');check(!creationLocked(),'请先完成已保存的人物槽位');check(!savedIdentity.creationPending,'请先使用底部保存恢复已开始的人物槽位');
    check(!recordDraft&&!Object.keys(dossierFields).length&&!createDirty(),'请先完成或取消当前人物修改');check(generationGoal.trim(),'请写下创作要求');
    check(creationDestination.book?.trim(),'请选择保存到的世界基点书，或填写新世界书名称');
    let source=creationSource?clone(creationSource):null;
    if(generationUseCore){check(typeof listCreationCores==='function','基点读取接口尚未接入');const previous=creationCores[creationCoreIndex];check(previous,'请选择已有基点');const latest=await listCreationCores();guard();source=latest.find(row=>row.book===previous.book&&row.id===previous.id&&row.version===previous.version);check(source&&stamp(source)===stamp(previous),'所选基点版本已改变，请重新读取');}
    retainCreationView();const next=await roles.createDraft({goal:generationGoal,kind:generationKind,mode:generationMode,source:source?clone(source):null,destination:clone(creationDestination),messages:clone(generationTask?.messages??[]),onProgress:()=>{if(!disposed)receiveTask(roles.creationTask?.()??generationTask);}});
    if(disposed)return true;if(source&&generationUseCore)next.creationSource=clone(source);const task=roles.creationTask?.();adoptDraft(next,task?.id??next.operationId);goal.value='';if(task)receiveTask(task);return true;
   }catch(error){if(!disposed){generationFailure=error.rawResponse??generationTask?.text??null;renderGeneration();if(generationTask?.status!=='cancelled')report(error);}return false;}
   finally{generationStarting=false;if(!disposed){generationTask=roles.creationTask?.()??generationTask;generationWorkbench?.render(generationTask);syncCreationControls();syncActions();retainCreationView();}}
   })();return generationPending;
  }
  const conversation=el('div');generationWorkbench=mountCreationWorkbench(document,conversation,{composer:goal,onSend:sendCreation,onCancel:()=>roles.cancelCreation?.(),onError:report});generationWorkbench.setLocked(creationLocked());
  generated.append(conversation,el('p','结果在下方表格中核对和修改；列表、字段组和规则内容都可以逐格编辑。确认后使用底部保存。'),generationPreview);renderGeneration();content.append(generated);
  generationTask=roles.creationTask?.()??null;receiveTask(generationTask);generationUnsubscribe=roles.subscribeCreation?.(receiveTask)??null;

 }
 async function drawLegacyDossier(section,rows){
  const selected=rows.find(row=>String(row.uid)===draft.uid);if(!selected)return;const box=el('section');box.dataset.roleEdit='';const name=el('input'),text=el('textarea');name.className=text.className='text_pole';name.dataset.roleEditName='';text.dataset.roleEditContent='';text.rows=12;name.value=legacyDossier?.name??selected.name.replace(/^【角色】/u,'');text.value=legacyDossier?.content??selected.content;
  const update=()=>{legacyDossier={book:draft.book,uid:selected.uid,name:name.value,content:text.value,before:clone(legacyDossier?.before??selected)};if(name.value===selected.name.replace(/^【角色】/u,'')&&text.value===selected.content)legacyDossier=null;changed();};name.oninput=text.oninput=update;box.append(el('h3','编辑角色档案'),field('角色名称',name),field('完整档案原文',text),el('p','底部保存更新同一个角色条目，不重置现有手机与故事。'));section.append(box);
 }
 function drawLegacyRecovery(){
  if(!legacyOrigins)return;
  const section=el('details');section.dataset.legacyOrigins='';section.open=!!originDraft||originRecovery||!!originCreate;
  section.append(el('summary','既有原点档案与恢复'),el('p','这里只读取既有原点和继续已开始的身份操作；新人物与新世界使用上方统一表单。'));
  if(!roles.database)section.append(button('读取已有原点档案',async()=>{check(!originDraft&&!originRecovery&&!originCreate,'请先保存或取消当前原点操作');originRows=await legacyOrigins.list();guard();await draw();changed();}));
  if(!roles.database&&originRows.length){
   const picker=el('select');picker.dataset.origin='';originRows.forEach((row,i)=>option(picker,row.name+' · '+row.book+' @'+row.rev,String(i)));picker.value=String(originIndex);picker.onchange=()=>originIndex=Number(picker.value);section.append(field('固定原点版本',picker));
   section.append(button('预览绑定此原点',async()=>{check(!originCreate,'请先保存或取消另建人物槽位');originDraft=await legacyOrigins.preview(clone(originRows[originIndex]));guard();originReviewed=false;originRecovery=false;await draw();changed();}));
   if(typeof identity.createFromOrigin==='function')section.append(button('为此人物另建身份槽位',async()=>{check(!originDraft&&!originRecovery,'请先保存或取消当前原点绑定');const row=originRows[originIndex];check(row,'请选择仍存在的原点档案');originCreate={name:row.name,description:row.description,reference:{book:row.book,originId:row.originId,id:row.id,rev:row.rev}};originCreateReviewed=false;await draw();changed();}));
  }
  section.append(button('核对未完成的原点绑定',async()=>{check(!originCreate,'请先保存或取消另建人物槽位');originRecovery=true;await draw();changed();}));
  if(originRecovery)section.append(el('p','底部保存会继续核对既有存档中的绑定；没有旧存档时不会建立新账本。'));
  if(originDraft){
   section.append(el('h4',originDraft.name),el('pre',originDraft.description),el('p','保存时应用到该预览指定的身份，保留固定原点版本。'));
   const reviewed=el('input');reviewed.type='checkbox';reviewed.dataset.originReviewed='';reviewed.checked=originReviewed;reviewed.onchange=()=>{originReviewed=reviewed.checked;changed();};section.append(field('已核对，保存时应用此原点档案',reviewed));
  }
  if(originCreate){
   section.append(el('h4','另建独立身份：'+originCreate.name),el('pre',originCreate.description??''),el('p','固定来源：'+originCreate.reference.book+' / '+originCreate.reference.id+' @'+originCreate.reference.rev+'。底部保存会保留原身份，另建此人物槽位。'));
   const reviewed=el('input');reviewed.type='checkbox';reviewed.dataset.originCreateReviewed='';reviewed.checked=originCreateReviewed;reviewed.onchange=()=>{originCreateReviewed=reviewed.checked;changed();};section.append(field('已核对，保存时另建独立人物槽位',reviewed));
  }
  content.append(section);
 }
 async function drawResources(){
  if(typeof roles.resources!=='function')return;const section=el('section');section.dataset.referenceBooks='';section.append(el('h3','可选资料书启用'));content.append(section);let available;
  try{available=await roles.resources();}catch(error){section.append(el('p','资料选择暂不可读：'+error.message));return;}if(disposed)return;
  if(!resourceBase){resourceBase={referenceBooks:[...available.referenceBooks],phoneWorld:clone(available.phoneWorld)};resourceDraft=clone(resourceBase);}
  const names=available.books.filter(name=>!available.excluded.includes(name));for(const name of new Set([...names,...resourceDraft.referenceBooks])){const node=el('input');node.type='checkbox';node.checked=resourceDraft.referenceBooks.includes(name);node.dataset.referenceBook=name;node.onchange=()=>{resourceDraft.referenceBooks=node.checked?[...new Set([...resourceDraft.referenceBooks,name])]:resourceDraft.referenceBooks.filter(item=>item!==name);changed();};section.append(field(name+(names.includes(name)?'':'（已缺失或不可选，请取消）'),node));}
  section.append(el('h3','小手机对应世界'),el('p','选择只保存定位，不套用旧初态、不清空已有数据。'));
  if(roles.database){const world=el('select');world.dataset.phoneWorldEntry='';option(world,'暂不选择世界','');for(const row of available.worlds)option(world,row.name,row.worldId);const id=resourceDraft.phoneWorld?.database?resourceDraft.phoneWorld.worldId:'';if(id&&!available.worlds.some(row=>row.worldId===id))option(world,'原世界已不存在，请重新选择',id);world.value=id;world.onchange=()=>{resourceDraft.phoneWorld=world.value?{database:true,worldId:world.value}:null;changed();};section.append(field('统一表单世界',world));}
  else{
   const book=el('select'),entry=el('select');book.dataset.phoneWorldBook='';entry.dataset.phoneWorldEntry='';option(book,'暂不选择手机世界','');for(const name of new Set([...available.books.filter(name=>name!==available.templateBook),resourceDraft.phoneWorld?.book].filter(Boolean)))option(book,name,name);book.value=resourceDraft.phoneWorld?.book??'';
   const load=async selected=>{const name=book.value;let rows=[],failure;try{if(name)rows=await roles.worldDefinitions(name);}catch(error){failure=error;}if(disposed)return;entry.replaceChildren();option(entry,'暂不选择定义','');for(const row of rows)option(entry,row.name,String(row.uid));if(selected&&!rows.some(row=>String(row.uid)===String(selected.uid)))option(entry,'原定义已缺失或读取失败，请重新选择',String(selected.uid));entry.value=selected?String(selected.uid):'';entry.tisyaRefresh?.();if(failure)throw failure;};
   let previous=book.value;book.onchange=()=>run(async()=>{const old=resourceDraft.phoneWorld;try{await load(null);previous=book.value;resourceDraft.phoneWorld=null;changed();}catch(error){book.value=previous;book.tisyaRefresh?.();await load(old).catch(()=>{});throw error;}});entry.onchange=()=>{resourceDraft.phoneWorld=book.value&&entry.value?{book:book.value,uid:entry.value}:null;changed();};section.append(field('手机世界资料书',book),field('【手机世界】定义',entry));try{await load(resourceDraft.phoneWorld);}catch(error){section.append(el('p','手机世界读取失败：'+error.message));}
  }
  const books=el('section');books.dataset.templateBook='';books.append(el('h3','内置模板、扩展资料与美化书'),el('p','模板只用于新内容创作。更新保留用户编辑，来源冲突需要明确处理。'));
  const report=available.builtinStatus??roles.builtinStatus?.();if(report){for(const error of report.errors??[])books.append(el('p',(error.bookId??'目录')+'：'+error.message));for(const conflict of report.conflicts??[]){const row=el('details');row.append(el('summary',conflict.book+' / '+(conflict.entryId??'整本书')+' · '+conflict.type));for(const change of conflict.fields??[])row.append(el('pre','字段：'+change.field+'\n原版：'+change.base+'\n当前：'+change.current+'\n新版：'+change.upstream));if(conflict.entryId)for(const [choice,label]of [['keep','保留当前内容'],['upstream','采用插件新版']])row.append(button(label,async()=>{check(!hasDraftChanges(),'请先保存或取消当前修改');await roles.resolveBuiltinConflict({...conflict,choice});await draw();}));books.append(row);}}
  if(typeof roles.ensureTemplates==='function')books.append(button('检查内置书更新',async()=>{check(!hasDraftChanges(),'请先保存或取消当前修改');await roles.ensureTemplates();savedConfig=config.read();await draw();}));section.append(books);
 }

 async function draw() {
  if (disposed) return;
  generationUnsubscribe?.();generationUnsubscribe=null;generationWorkbench?.dispose();generationWorkbench=null;
  content.replaceChildren(el('h2',creationOnly?'创作工作台':resourcesOnly?'故事档案与资料书':'用户身份'));
  if(creationLocked()&&!creationOnly){const recovery=el('section');recovery.dataset.creationRecovery='';recovery.append(el('h3','继续上次创作保存'),el('p','上次创作保存尚未完成，草稿及保存依据已恢复。请使用底部保存继续同一次提交。'),button('导出创作恢复草稿',downloadDraft));content.append(recovery);}
  if(creationOnly){await drawCreation();syncActions();return;}
  if(!resourcesOnly){
  const nav = el('div', null, 'tisya-identity-nav');
  nav.append(routeButton('返回', onClose), routeButton('原生身份管理', onNative));
  const reload = el('button', '重新读取', 'menu_button'); reload.type = 'button'; reload.onclick = () => route(discard);
  nav.append(reload,button('导出身份草稿',downloadDraft)); content.append(nav);
  if(!isPresetActive()){
   const notice=el('section');notice.dataset.identityPresetNotice='';notice.setAttribute('role','status');notice.append(el('p','当前还没有选中 Tisya 预设。身份与心愿可在此保存；选择 Tisya 后会用于回复。'));
   if(onPresets)notice.append(routeButton('打开预设设置',onPresets,true));content.append(notice);
  }
  const picker = el('select', null, 'text_pole'); picker.dataset.identityPicker = '';
  for (const profile of savedIdentity.personas) option(picker, profile.name + (profile.id === savedIdentity.active ? ' · 使用中' : ''), profile.id);
  picker.value = draft.id; picker.disabled = !savedIdentity.personas.length;
  picker.onchange = () => {
   const id = picker.value;
   picker.value = draft.id; picker.tisyaRefresh?.();
   if (id === draft.id) return Promise.resolve(true);
   return route(async () => {
    const current = identity.read();
    check(current.personas.some(profile => profile.id === id), '所选身份已不存在，请重新读取。');
    savedIdentity = current; savedConfig = config.read(); scope = stamp(current.scope); resetDraft(id);
    await draw(); changed();
   });
  };
  content.append(field('切换用户身份', picker));
  if(savedIdentity.personas.length){
   const bindings=el('details');bindings.dataset.identityScopes='';bindings.append(el('summary','身份应用范围'),el('p','这些选择随页面底部保存生效；解除既有连接可打开原生身份管理。'));
   for(const [key,label,available]of [['chat','本聊天',!!savedIdentity.scope.chatId],['character',savedIdentity.scope.groupId!=null?'当前群聊':'当前角色卡',!!savedIdentity.scope.characterAvatar||savedIdentity.scope.groupId!=null],['global','设为全局默认',true]]){
    const control=el('input');control.type='checkbox';control.dataset.identityScope=key;control.checked=identityScopeDraft[key];control.disabled=!available;control.onchange=()=>{identityScopeDraft[key]=control.checked;changed();};bindings.append(field(label,control));
   }
   bindings.append(el('p','聊天锁定：'+(savedIdentity.locked??'未锁定')+' · 全局默认：'+(savedIdentity.default??'未设置')));content.append(bindings);
  }
  if (!savedIdentity.personas.length) content.append(el('p', '尚未创建原生用户身份，可通过上方“原生身份管理”创建。'));
  if (draft.id !== savedIdentity.active) content.append(el('p', '正在编辑待切换身份；使用底部保存后才切换并绑定当前聊天。'));
  if (savedIdentity.pending) content.append(el('p', '上次身份切换尚未完成：' + (savedIdentity.pending.error ?? savedIdentity.pending.stage) + '。使用底部保存继续核对。'));
  if(savedIdentity.creationPending){const notice=el('p','上次人物槽位创建尚未完成：'+(savedIdentity.creationPending.error??savedIdentity.creationPending.stage)+'。使用底部保存继续同一人物，不会重复创建已保存的档案。');notice.dataset.identityCreationPending='';content.append(notice);}
  if (profileFor()) {const name = input('name'); name.dataset.identityName = ''; content.append(field('名称', name));}

  const wishSection = el('section'); wishSection.dataset.contractorWish = ''; wishSection.append(el('h3', '心愿直通'));
  const description = input('description', true); description.dataset.identityWish = ''; description.placeholder = '把想告诉缇斯亚的心愿写在这里';
  const module0 = el('fieldset'); module0.dataset.wishModule = '0'; module0.append(el('legend', '模块 0-B · 契约者私密心愿槽 [CONTRACTOR.WISH]'), el('p', 'W00 · 选开“绝对不拒绝模式”'));
  const optional = el('fieldset'); optional.dataset.builtinWishes = ''; optional.append(el('legend', '内置可选心愿'));
  for (const choice of wishGroup.options) {
   const box = choice.id === 'W00' ? module0 : optional;
   if (choice.id === 'W07') box.append(field('自定义心愿', description));
   else {
    const control = el('input'); control.type = 'checkbox'; control.value = choice.id; control.checked = draft.choices.includes(choice.id);
    control.dataset.wishOption = choice.id; control.setAttribute('aria-label', choice.label);
    control.onchange = () => {
     if (busy || disposed) return;
     draft.choices = orderedChoices(control.checked ? [...draft.choices, choice.id] : draft.choices.filter(id => id !== choice.id)); changed();
    };
    box.append(field(choice.label, control));
   }
   const details = el('details'), original = el('pre', choice.effect);
   original.style.cssText = 'white-space:pre-wrap;overflow-wrap:anywhere;max-width:100%;min-width:0';
   details.append(el('summary', '原文'), original); box.append(details);
  }
  wishSection.append(module0, optional); content.append(wishSection);
  }
  drawLegacyRecovery();
  if(roles.database){await drawDatabase();syncActions();return;}

  const section = el('section'); section.dataset.storyAvatar = ''; section.append(el('h3', 'user · 主控化身绑定')); content.append(section);
  let listing;
  try {listing = await roles.list(draft.book); roleListingError = '';}
  catch (error) {
   roleListingError = error.message;
   section.append(el('p', '基点书读取失败：' + roleListingError), button('重试准备基点书', async () => {await roles.ensureBook(draft.book); await draw();}));
   syncActions(); return;
  }
  if (disposed) return;
  const mode = el('select', null, 'text_pole'); mode.dataset.avatarMode = '';
  option(mode, '不绑定角色', 'unbound'); option(mode, '通用', 'generic');
  option(mode, PREFERENCE_GROUPS.find(group => group.id === 'N01').options.find(choice => choice.id === 'N01-B').label, 'bound');
  option(mode, '无主控纯群像 / 场外导演模式', 'ensemble'); mode.value = draft.mode;
  const book = el('select', null, 'text_pole'); book.dataset.roleBook = '';
  for (const name of new Set([draft.book, listing.book, ...(listing.books ?? [])])) if (name) option(book, name + ((listing.books ?? []).includes(name) ? '' : '（尚未建立）'), name);
  book.value = draft.book;
  const entries = el('select', null, 'text_pole'); entries.dataset.roleEntry = '';
  const preview = el('p'); preview.dataset.rolePreview = ''; let rows = listing.entries;
  const show = () => {
   entries.disabled = draft.mode !== 'bound' || draft.createConfirmed;
   const selected = rows.find(row => String(row.uid) === draft.uid);
   preview.textContent = draft.createConfirmed ? '保存时将创建新角色，并绑定当前聊天。'
    : draft.mode === 'bound' ? selected?.name ?? '请选择已有角色，或在下方填写并确认创建新角色。'
    : mode.options[mode.selectedIndex]?.textContent ?? '';
   mode.tisyaRefresh?.(); book.tisyaRefresh?.(); entries.tisyaRefresh?.();
  };
  const fill = data => {
   rows = data; entries.replaceChildren(); option(entries, '选择【角色】条目', '');
   for (const row of rows) option(entries, row.name, String(row.uid));
   if (draft.uid && !rows.some(row => String(row.uid) === draft.uid)) option(entries, '原选择已不存在，请重新选择', draft.uid);
   entries.value = draft.uid; show();
  };
  fill(rows);
  const sourceError = el('p'); sourceError.setAttribute('role', 'alert');
  const retrySource = button('重试读取资料来源', async () => loadSource()); retrySource.hidden = true;
  async function loadSource() {
   try {
    const next = await roles.list(draft.book);
    if (disposed) return;
    fill(next.entries); roleListingError = ''; sourceError.textContent = ''; retrySource.hidden = true;
   } catch (error) {
    fill([]); roleListingError = error.message;
    sourceError.textContent = '基点书读取失败：' + error.message; retrySource.hidden = false;
    throw error;
   }
  }
  mode.onchange = () => {if (busy || disposed) return; draft.mode = mode.value; show(); changed();};
  book.onchange = () => {
   if (busy || disposed) return Promise.resolve(false);
   draft.book = book.value; draft.uid = ''; changed();
   return run(async()=>{await loadSource();section.querySelector('[data-role-edit]')?.remove();await drawLegacyDossier(section,rows);});
  };
  entries.onchange=()=>{if(busy||disposed)return;const next=entries.value;if(legacyDossier){entries.value=draft.uid;entries.tisyaRefresh?.();return route(async()=>{draft.uid=next;await draw();changed();});}draft.uid=next;changed();section.querySelector('[data-role-edit]')?.remove();drawLegacyDossier(section,rows);};
  section.append(field('主控模式', mode), field('基点书 · 资料来源', book), sourceError, retrySource, el('p', '基点书不自动启用为世界书；插件只读取选中的角色条目，注入当前聊天的故事身份槽位。'), field('角色档案', entries), preview);
  const create = el('section'); create.dataset.roleCreate = ''; create.append(el('h3', '创建角色并保存到基点书'));
  const roleName = input('createName'), roleContent = input('createContent', true), confirm = el('input');
  roleName.dataset.roleName = ''; roleContent.dataset.roleContent = ''; confirm.type = 'checkbox'; confirm.dataset.roleCreateConfirm = ''; confirm.checked = draft.createConfirmed;
  confirm.onchange = () => {
   if (busy || disposed) return;
   draft.createConfirmed = confirm.checked;
   if (confirm.checked) {draft.mode = 'bound'; mode.value = 'bound';}
   show(); changed();
  };
  create.append(field('角色名称', roleName), field('角色条目原文', roleContent), field('保存时创建并绑定当前聊天', confirm), el('p', '确认名称、原文和上方资料来源后，勾选创建，再使用底部保存。'));
  section.append(create);
  await drawLegacyDossier(section,rows);await drawResources();syncActions();
 }
 const ready = run(async () => {
  try {await roles.ensureBook();}
  catch (error) {status.textContent = '基点书自动准备失败：' + error.message;}
  savedConfig=config.read();resetDraft(savedIdentity.active);
  if(initialCreation){check(['character','world'].includes(initialCreation.kind),'创作入口类型无效');generationKind=initialCreation.kind;generationMode=initialCreation.mode??'extend';check(['extend','revise'].includes(generationMode),'创作方式无效');generationGoal=String(initialCreation.goal??'');generationUseCore=initialCreation.useCore===true;generationCreatePersona=initialCreation.createPersona===true;creationSource=clone(initialCreation.source??null);creationDestination=clone(initialCreation.destination??{book:'',newBook:initialCreation.kind==='world'});if(generationUseCore){check(typeof listCreationCores==='function','基点读取接口尚未接入');creationCores=await listCreationCores();guard();}}
  if(typeof roles.pendingCreation==='function'){const recovered=await roles.pendingCreation();guard();if(recovered){check(recovered.proposal?.matrix&&recovered.destination?.book&&['character','world'].includes(recovered.kind),'上次创作恢复草稿不完整，原记录仍保留');generationDraft=clone(recovered);generationSavedDraft=clone(recovered);generationText=JSON.stringify(recovered.proposal,null,2);generationKind=recovered.kind;generationMode=recovered.mode??'extend';generationGoal=String(recovered.goal??'');generationCreatePersona=recovered.createPersona===true;generationConfirmed=true;creationDestination=clone(recovered.destination);creationSource=clone(recovered.source??null);}}
  if(!generationSavedDraft&&!savedIdentity.creationPending)restoreCreationView(roles.creationView?.());
  if(initialOrigin){check(legacyOrigins?.preview,'既有原点读取接口尚未接入');originDraft=await legacyOrigins.preview(clone(initialOrigin));guard();}
  await draw();if(initialCreation)content.querySelector('[data-database-creation]')?.scrollIntoView?.({block:'start'});
 });
 return {
  root,ready,state,saveDraft,discardDraft,confirmLeave,validateDraft:validate,exportDraft,
  refreshState:syncActions,setCompanion(panel){companion=panel;syncActions();return this;},
  settled: () => Promise.all([pending,generationPending, ...(navigationPending ? [navigationPending] : [])]),
  requestLeave: () => {
   if(creationOnly&&!creationLocked())retainCreationView();
   const allowed=navigating||!busy&&!companion?.state?.().busy&&(!hasDraftChanges()||creationOnly&&!!roles.rememberCreationView&&!creationLocked())&&!prompt.state().open;
   return {allowed, dirty: hasChanges(), reason: allowed ? '' : busy ? '身份操作正在进行' : '有未保存的修改'};
  },
  dispose() {if (disposed) return;retainCreationView();generationUnsubscribe?.();generationWorkbench?.dispose(); prompt.dispose(); disposed = true; if (hostPage && !hadHostClass) hostPage.classList.remove('tisya-matrix-page'); root.replaceChildren();}
 };
}
