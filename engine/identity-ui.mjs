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
export function mountMatrixIdentity(document, root, {identity, config, roles, onClose = () => {}, onNative = () => {},resourcesOnly=false,creationOnly=false,onCreate=null,isPresetActive=()=>true,onPresets=null,initialCreation=null,listCreationCores=null}) {
 check(roles?.database,'身份页需要统一表单服务；书籍原文请通过当前来源选择提炼');
 if(!identity){check(resourcesOnly,'用户身份服务尚未接入');identity={read:()=>{const roleScope=roles.scope?.(),parts=roleScope===undefined?[]:JSON.parse(roleScope);check(Array.isArray(parts),'故事身份会话标识无效');return {personas:[],active:'',revision:0,description:'',scope:{roleScope,chatId:parts[0],characterId:parts[1],groupId:parts[2]}};}};}
 let authorDraft=null,authorPlan=null,authorSavePending=false;
 let companion=null,recordDraft=null,recordConfirmed=false,dossierFields={},dossierBefore=null,generationDraft=null,generationText='',generationConfirmed=false,generationGoal='',generationKind='character',resourceBase=null,resourceDraft=null;
 let generationReceipt=null,generationSavedDraft=null,generationFailure=null,generationUseCore=false,generationCreatePersona=false,generationBindOnSave=false,generationMode='extend',creationCores=[],creationCoreIndex=0;
 let generationHistory=[],generationFieldTexts={},generationFieldErrors={},generationRepair=null;
 let generationWorkbench=null,generationUnsubscribe=null,generationTask=null,generationPending=Promise.resolve(),adoptedTaskId=null,generationStarting=false;
 const generationRunning=()=>generationStarting||creationTaskRunning(generationTask);
 function retainCreationView(){if(disposed||!roles.rememberCreationView||!generationDraft&&!generationRepair&&!generationGoal&&!generationHistory.length&&!generationTask)return;try{if(stamp(identity.read().scope)!==scope)return;roles.rememberCreationView({taskId:generationTask?.id??null,creation:generationSnapshot(),history:clone(generationHistory),messages:clone(generationTask?.messages??[])});}catch(error){report(error);}}
 function restoreCreationView(saved){
  const c=saved?.creation,repair=c?.repair??saved?.repair??null;if(!repair&&!c?.draft&&!c?.goal&&!saved?.history?.length&&!saved?.taskId)return false;
  generationBindOnSave=c?.bindOnSave===true;generationSavedDraft=clone(c?.savedDraft??null);
  generationDraft=clone(c?.savedDraft??c?.draft??null);generationConfirmed=!!c?.savedDraft;generationText=c?.text??'';generationGoal=c?.goal??'';generationKind=c?.kind??repair?.kind??'character';generationMode=c?.mode??repair?.mode??'extend';generationUseCore=c?.useCore===true;creationCoreIndex=c?.coreIndex??0;generationCreatePersona=c?.createPersona===true;generationFieldTexts=clone(c?.fieldTexts??{});generationFieldErrors=clone(c?.fieldErrors??{});creationDestination=clone(c?.destination??repair?.destination??creationDestination);creationSource=clone(c?.source??repair?.source??null);generationHistory=clone(saved.history??[]);generationRepair=clone(repair);adoptedTaskId=c?.draft?(saved.taskId??null):null;return true;
 }
 const hasCreationBinding=proposal=>!!(proposal?.matrix?.binding?.entityId&&proposal.matrix.binding.dossierId);
 const creationSaveBlocked=()=>creationOnly&&(!generationDraft&&!savedIdentity.creationPending||generationDraft?.proposal?.matrix?.changes?.length===0);
 function clearCreationTaskView(){roles.clearCreationView?.();generationTask=roles.creationTask?.()??null;adoptedTaskId=null;}
 async function keepCurrentAfterCreation(){
  check(stamp(identity.read().scope)===scope,'聊天已改变，请回原聊天核对人物');
  check(generationSavedDraft?.bindOnSave,'没有待收尾的人物绑定');
  await roles.completeCreationBinding(generationSavedDraft,{keepCurrent:true});
  savedConfig=config.read();roleBase=roleValues();Object.assign(draft,clone(roleBase));
  generationDraft=null;generationSavedDraft=null;generationReceipt=null;generationText='';generationGoal='';generationConfirmed=false;generationHistory=[];generationBindOnSave=false;generationFailure=null;generationFieldTexts={};generationFieldErrors={};clearCreationTaskView();
  await draw();changed();status.textContent='已保留当前人物选择；新档案仍在当前表单和基点书中，可随时选择使用。';
 }
 let creationDestination={book:'',newBook:false},creationSource=null,sourceBook='',sourceUid='',sourceListing=null;
 let identityScopeDraft,identityScopeBase,selectionSubmission=null;
 const companionDirty=()=>!!companion?.state?.().dirty;
 const extraDirty=()=>!!authorDraft||!!generationRepair||!!recordDraft||Object.keys(dossierFields).length>0||!!generationDraft||!!generationGoal||!!generationReceipt||!!generationHistory.length||!!resourceBase&&stamp(resourceBase)!==stamp(resourceDraft)||companionDirty();
 const clearExtras=()=>{authorDraft=null;authorPlan=null;authorSavePending=false;recordDraft=null;recordConfirmed=false;dossierFields={};dossierBefore=null;generationDraft=null;generationText='';generationConfirmed=false;generationGoal='';generationReceipt=null;generationSavedDraft=null;generationFailure=null;generationHistory=[];generationFieldTexts={};generationFieldErrors={};generationRepair=null;resourceBase=null;resourceDraft=null;selectionSubmission=null;};
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
  return {mode:avatar.mode,book:'当前世界表单',uid:avatar.binding?.database?avatar.binding.dossierId:''};
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
 const state = () => ({dirty: hasChanges(), draftDirty: hasDraftChanges(), profileDirty: profileDirty(), wishDirty: wishDirty(), roleDirty: roleDirty(), createDirty: createDirty(), selectionDirty: selectionDirty(), reviewRequired, receipts: [...receipts], busy: busy || !!companion?.state?.().busy || prompt.state().busy, creationRunning:generationRunning(), creationTask:generationTask?.id??null, canSave: hasChanges() && !creationSaveBlocked() && !busy && !generationRunning(), selected: draft.id, active: savedIdentity.active});
 function syncActions() {
  if (disposed) return;
  if(companion?.root)content.append(companion.root);
  cancel.disabled = busy || generationRunning() || !!companion?.state?.().busy || prompt.state().open || !hasDraftChanges();
  saveButton.disabled = creationSaveBlocked() || busy || generationRunning() || !!companion?.state?.().busy || prompt.state().open || !hasChanges();
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
  if(authorDraft&&!authorPlan)authorPlan=await roles.previewAuthorSource(clone(authorDraft));
  await validateExtras();
  await companion?.validateDraft?.();
  // List/read operations can yield while the host changes chat or another editor saves.
  guard();
 }
 async function save() {
  if (!hasChanges()) return true;
  await validate();
  try {
   if(savedIdentity.creationPending&&!generationReceipt){await identity.resumeCreation();captureIdentity();clearCreationTaskView();recordReceipt('人物槽位恢复');guard();}
   if(authorDraft){
    authorSavePending=true;
    try{const receipt=await roles.saveAuthorSource(authorPlan);check(receipt.confirmed,'人物原文保存未确认');sourceBook=receipt.source.book;sourceUid=String(receipt.source.uid);authorDraft=null;authorPlan=null;authorSavePending=false;recordReceipt('简单基点人物原文');guard();}
    catch(error){authorSavePending=error.authorReceipt?.status==='unknown';if(error.authorReceipt?.confirmed){authorDraft=null;authorPlan=null;authorSavePending=false;recordReceipt('简单基点人物原文');}throw error;}
   }
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
   if (roleDirty()) {
    savedConfig = await roles.bind({mode:draft.mode,dossierId:draft.uid},savedConfig.revision);
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
   if(stamp(latest.scope)===scope&&(latest.creationPending?.id===savedIdentity.creationPending?.id&&latest.creationPending||generationSavedDraft&&generationSavedDraft.operationId===latest.creationPending?.reference?.operationId))savedIdentity=latest;
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
  check(!authorSavePending,'人物原文保存结果尚未确认，请先重试同一次保存；草稿已保留，可导出。');
  check(!generationRunning(),'请先停止创作；收起页面不会中断任务。');
  check(!creationLocked(),'这份创作已经开始保存，请继续保存并核对同一次提交；恢复草稿仍保留，也可先导出。');
  if(companion?.discardDraft)check(await companion.discardDraft()!==false,'呈现配置取消未完成');clearExtras();clearCreationTaskView();
  savedIdentity = identity.read(); savedConfig = config.read(); scope = stamp(savedIdentity.scope); resetDraft();
  if(creationOnly)restoreCreationView(roles.creationView?.());
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
   if(Object.keys(dossierFields).length||createDirty()||recordDraft){check(recordDraft,'请先预览人物档案变更');check(recordConfirmed,'请确认保存时提交已预览的表单变更');await roles.validateEdit(recordDraft);}
   if(roleDirty()&&!recordDraft?.bindOnCommit){check(['unbound','generic','bound','ensemble'].includes(draft.mode),'角色绑定模式无效');if(draft.mode==='bound'){const listed=await roles.list();check(listed.entries.some(row=>row.dossierId===draft.uid&&row.entityId),sourceUid?'所选基点条目尚未用作当前人物，请点击下方“提炼并用作当前人物”或“预览使用此人物”':'请选择当前人物，或先在下方选择基点人物并使用');}}
   if(generationGoal||generationDraft||generationReceipt||generationHistory.length){
    check(generationDraft,'请先生成并核对创作草稿，或取消本次输入');check(generationConfirmed,'请确认保存时提交创作草稿');check(creationDestination.book?.trim(),'请选择保存到的世界基点书，或填写新世界书名称');check(!recordDraft,'人物档案变更与新创作是不同事务，请先完成当前人物变更再创建新内容');
    if(generationCreatePersona&&generationKind==='character'&&hasCreationBinding(parseGeneration()))check(typeof identity.createFromMatrix==='function','统一人物槽位接口尚未接入');
    if(generationBindOnSave)check(generationKind==='character'&&hasCreationBinding(parseGeneration()),'当前草稿尚未形成可用的人物档案，请继续修复后再保存为当前人物');
    if(!generationReceipt){
     check(!Object.keys(generationFieldErrors).length,'请先修正创作字段的数据格式');
     check([...root.querySelectorAll('[data-creation-row]')].every(node=>node.checkValidity()),'请先修正创作字段的数据格式');
     if(generationDraft.creationSource){const source=generationDraft.creationSource,latest=await listCreationCores();check(latest.some(row=>row.book===source.book&&row.id===source.id&&row.version===source.version&&stamp(row)===stamp(source)),'所选基点版本已改变，创作草稿保留');}
     const proposal=parseGeneration();check(proposal.matrix?.changes?.length,'目前没有可保存的已通过条目，请先继续修复待办');generationDraft.destination=clone(creationDestination);if(typeof roles.validateCreation==='function')await roles.validateCreation({...generationDraft,proposal});else check(!(proposal.unresolved??[]).length,'创作草稿仍有待补事项');
    }
   }
  }
  if(resourceBase&&stamp(resourceDraft)!==stamp(resourceBase)){
   const available=await roles.resources();check(resourceDraft.referenceBooks.every(name=>available.books.includes(name)&&!available.excluded.includes(name)),'资料书选择无效、已缺失或不可选');
   const world=resourceDraft.phoneWorld;
   if(world)check(available.worlds.some(row=>row.worldId===world.worldId),'所选世界记录已不存在');
  }
 }
 function parseGeneration(){try{return JSON.parse(generationText);}catch{throw Error('创作草稿格式损坏，原始内容仍保留，请重新读取草稿');}}
 function creationLocked(){return !!generationReceipt||!!generationSavedDraft;}
 function generationSnapshot(){return clone({draft:generationDraft,savedDraft:generationSavedDraft,text:generationText,goal:generationGoal,kind:generationKind,mode:generationMode,useCore:generationUseCore,coreIndex:creationCoreIndex,createPersona:generationCreatePersona,bindOnSave:generationBindOnSave,fieldTexts:generationFieldTexts,fieldErrors:generationFieldErrors,destination:creationDestination,source:creationSource,repair:generationRepair});}
 function rememberGeneration(){if(generationDraft)generationHistory.push(generationSnapshot());}
 function exportDraft(){return clone({format:'tisya.unified-identity-recovery/1',scope:savedIdentity.scope,identityRevision:savedIdentity.revision,configRevision:savedConfig.revision,profile:draft,identityScopes:identityScopeDraft,recordDraft,recordConfirmed,dossierFields,dossierBefore,authorDraft,authorPlan,authorSavePending,resources:resourceDraft,creation:generationSnapshot(),creationHistory:generationHistory,creationReceipt:generationReceipt,creationSavedDraft:generationSavedDraft,creationFailure:generationFailure});}
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
   recordReceipt('人物档案与当前聊天绑定');recordDraft=null;recordConfirmed=false;dossierFields={};dossierBefore=null;draft.createName='';draft.createContent='';draft.createConfirmed=false;
   guard();await companion?.acceptDatabaseReceipt?.(result.databaseReceipt);
  }
  if(generationDraft){
   const proposal=parseGeneration(),request=generationSavedDraft??{...generationDraft,destination:clone(creationDestination),proposal,createPersona:generationCreatePersona&&hasCreationBinding(proposal),...(generationBindOnSave?{bindOnSave:true,bindingConfigurationRevision:savedConfig.revision}:{})};
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
    check(result?.state&&result.contextKey===request.contextKey&&Number.isInteger(result.revision),'创作保存未返回当前聊天的确认表单');generationReceipt=result;generationSavedDraft=clone(request);recordReceipt('基点书角色或世界档案与当前表单');retainCreationView();
   }
   const result=generationReceipt;
   const receipt={confirmed:true,contextKey:result.contextKey,beforeRevision:request.expectedRevision,revision:result.revision,records:request.proposal.matrix.changes.map(change=>({tableId:change.tableId,recordId:change.recordId}))};
   await companion?.acceptDatabaseReceipt?.(receipt);
   if(request.bindOnSave){
    guard();const binding=request.proposal.matrix.binding,current=storyAvatar(config.read());
    if(!(current.mode==='bound'&&current.binding?.database&&current.binding.entityId===binding.entityId&&current.binding.dossierId===binding.dossierId)){
     check(config.read().revision===request.bindingConfigurationRevision,'人物已保存，但当前聊天选择已改变；请返回人物页选择该档案，原选择未被覆盖');
     try{savedConfig=await roles.bind({mode:'bound',entityId:binding.entityId,dossierId:binding.dossierId},request.bindingConfigurationRevision);}
     catch(error){throw Error('人物表单已保存，当前人物绑定未完成；再次保存可继续：'+error.message,{cause:error});}
    }else savedConfig=config.read();
    roleBase=roleValues();Object.assign(draft,clone(roleBase));recordReceipt('当前人物绑定');guard();await roles.completeCreationBinding(request);
   }
   if(request.createPersona&&request.kind==='character'&&hasCreationBinding(request.proposal)){await identity.createFromMatrix({draft:request,receipt:result});captureIdentity();recordReceipt('独立人物槽位');}
   const remaining=result.repairContext?.acceptance??request.acceptance;generationRepair=remaining&&((remaining.pending?.length??0)||(remaining.warnings?.length??0))?{acceptance:clone(remaining),rawResponse:result.repairContext?.rawResponse??request.rawResponse??'',contextKey:result.contextKey,operationId:request.operationId,revision:result.revision,kind:request.kind,mode:request.mode,source:clone(request.source??null),destination:clone(request.destination),acceptedRecords:clone(result.repairContext?.acceptedRecords??request.proposal.matrix.changes.map(change=>({tableId:change.tableId,recordId:change.recordId}))),repairContext:clone(result.repairContext??null)}:null;
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
  mode.onchange=()=>{draft.mode=mode.value;changed();};picker.onchange=()=>{const next=picker.value;if(Object.keys(dossierFields).length||recordDraft){picker.value=draft.uid;picker.tisyaRefresh?.();return route(async()=>{draft.uid=next;dossierBefore=null;await draw();changed();});}draft.uid=next;dossierBefore=null;changed();return run(draw);};
  section.append(field('主控模式',mode),field('当前人物',picker));
  const binding=storyAvatar(savedConfig).binding;
  if(binding&&!binding.database){const migration=el('section');migration.append(el('p','当前聊天仍引用旧角色原文；可在下方选择同一基点书，由助手提炼成规范表单。'));
   if(onCreate)migration.append(routeButton('将旧角色交给助手提炼',()=>handoffSource(binding)));section.append(migration);}
  const row=listing.entries.find(row=>row.dossierId===draft.uid);
  if(row){
   const edit=el('section');edit.dataset.roleEdit='';edit.append(el('h3','编辑角色档案'));section.append(edit);dossierBefore??=clone(row);const extras=el('details');extras.append(el('summary','更多档案字段'));const parsers=[];
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
   const preview=el('div');edit.append(extras,button('预览档案变更',async()=>{check(!createDirty()&&!generationGoal,'请先完成或取消当前新建内容');const values={};for(const {key,parse}of parsers)if(Object.hasOwn(dossierFields,key)){const value=parse(dossierFields[key]);if(value!==undefined)values[key]=value;}recordDraft=await roles.previewEdit({dossierId:row.dossierId,values,before:dossierBefore});recordConfirmed=false;preview.replaceChildren();showRecordPreview(preview);changed();}),preview);if(recordDraft?.kind==='edit')showRecordPreview(preview);
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
  books.onchange=()=>{if(authorDraft){books.value=sourceBook;return run(()=>{throw Error('请先保存或取消简单人物草稿');});}sourceBook=books.value;sourceUid='';return run(draw);};entries.onchange=()=>{if(authorDraft){entries.value=sourceUid;return run(()=>{throw Error('请先保存或取消简单人物草稿');});}sourceUid=entries.value;return run(draw);};
  box.append(field('世界基点书',books),field('角色条目',entries),el('p','选中条目后，使用下方的人物按钮：原文先由助手提炼并核对，保存后绑定当前人物；已有规范表单可直接预览使用。来源条目和当前故事进度分别保存。'));
  if(roles.previewAuthorSource&&roles.saveAuthorSource){
   box.append(button('新建简单基点人物',async()=>{check(!authorDraft,'请先保存或取消当前简单人物草稿');authorDraft={book:sourceBook||savedConfig.coreBook||'基点书',uid:null,name:'',content:'',before:null};authorPlan=null;await draw();changed();}));
  }
  const selected=rows.find(row=>String(row.uid)===sourceUid);
  if(selected){
   if(!selected.definition&&roles.previewAuthorSource&&roles.saveAuthorSource)box.append(button('编辑简单基点人物',async()=>{check(!authorDraft,'请先保存或取消当前简单人物草稿');const before=await roles.readSource({book:sourceBook,uid:selected.uid});guard();authorDraft={book:sourceBook,uid:before.uid,name:before.title.replace(/^【角色】/u,''),content:before.content,before};authorPlan=null;await draw();changed();}));
   const raw=el('details'),original=el('pre',selected.content);original.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;max-width:100%;min-width:0';raw.append(el('summary','查看作者原文'),original);box.append(raw);
   if(selected.definition)box.append(button('预览使用此人物',async()=>{check(!recordDraft&&!Object.keys(dossierFields).length,'请先保存或取消当前人物修改');const snapshot=await roles.readSource({book:sourceBook,uid:selected.uid});recordDraft=await roles.previewSourceImport(snapshot,{bindOnCommit:true});recordConfirmed=false;await draw();changed();}));
   else if(onCreate){
    const use=el('button','提炼并用作当前人物','menu_button');use.type='button';use.dataset.useSourceCharacter='';
    use.onclick=async()=>{
     if(busy||disposed||navigationPending)return false;
     // This explicit use action replaces only the unsaved protagonist choice.
     // Other edits still pass through the shared save/discard navigation flow.
     const previous={mode:draft.mode,book:draft.book,uid:draft.uid};Object.assign(draft,clone(roleBase));syncActions();
     const moved=await route(()=>handoffSource({book:sourceBook,uid:selected.uid},{bindOnSave:true}),true);
     if(!moved&&!disposed){Object.assign(draft,previous);changed();}return moved;
    };box.append(use,routeButton('交给缇斯亚助手提炼',()=>handoffSource({book:sourceBook,uid:selected.uid})));
   }
  }
  if(authorDraft){
   const edit=el('fieldset');edit.dataset.simpleCore='';edit.append(el('legend',authorDraft.uid===null?'新建简单基点人物':'编辑简单基点人物'),el('p','填写名称与人物原文即可保存。需要细化时，再交给助手提炼为表单。'));
   for(const [key,label]of [['book','保存到基点书'],['name','人物名称'],['content','完整人物原文']]){const node=el(key==='content'?'textarea':'input');node.value=authorDraft[key];node.setAttribute('aria-label',label);node.dataset.simpleCoreField=key;node.style.cssText='width:100%;min-width:0;box-sizing:border-box';if(key==='content')node.rows=12;if(authorSavePending||key==='book'&&authorDraft.uid!==null)node.disabled=true;node.oninput=()=>{authorDraft[key]=node.value;authorPlan=null;changed();};edit.append(field(label,node));}
   edit.append(el('p','使用底部“保存”提交；“取消修改”保留原有内容。'));box.append(edit);
  }
  if(recordDraft?.kind==='source-import')showRecordPreview(box);
 }
 async function handoffSource(reference,{bindOnSave=false}={}){
  check(typeof roles.previewSourceExtraction==='function','来源提炼接口尚未接入');const handoff=await roles.previewSourceExtraction(reference);guard();
  if(handoff.requiresExtraction)await onCreate({kind:'character',mode:handoff.mode,source:handoff.source,destination:handoff.destination,goal:handoff.goal,...(bindOnSave?{bindOnSave:true}:{})});
  else{recordDraft=handoff;recordConfirmed=false;await draw();changed();}
 }
 async function drawCreation(){
  generationUnsubscribe?.();generationUnsubscribe=null;generationWorkbench?.dispose();generationWorkbench=null;
  const generated=el('section'),kind=el('select'),goal=el('textarea'),generationPreview=el('div');
  if(generationBindOnSave){const intent=el('p','正在将基点人物用作当前人物：先生成并核对档案，确认保存后自动绑定当前聊天。');intent.dataset.creationBindIntent='';generated.append(intent);}
  generated.dataset.databaseCreation='';goal.dataset.creationGoal='';goal.className='text_pole';goal.value=generationGoal;goal.rows=5;
  const abandonGeneration=()=>{check(!creationLocked(),'本次保存已开始，请使用底部保存继续核对同一份草稿。');rememberGeneration();generationDraft=null;generationText='';generationConfirmed=false;generationFailure=null;generationFieldTexts={};generationFieldErrors={};renderGeneration();syncCreationControls();changed();};
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
  const destinationHint=el('p');destinationHint.dataset.creationDestinationNotice='';destinationHint.hidden=true;generated.append(targetRow,newRow,destinationHint);
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
    generationHistory.forEach((snapshot,index)=>history.append(button('恢复创作草稿 '+(index+1),async()=>{check(!creationLocked(),'请先完成已保存的人物槽位');const previous=clone(snapshot);rememberGeneration();generationDraft=previous.draft;generationText=previous.text;generationGoal=previous.goal;generationKind=previous.kind;generationMode=previous.mode;generationUseCore=previous.useCore;creationCoreIndex=previous.coreIndex;generationCreatePersona=previous.createPersona;generationBindOnSave=previous.bindOnSave===true;generationFieldTexts=previous.fieldTexts;generationFieldErrors=previous.fieldErrors;creationDestination=previous.destination??creationDestination;creationSource=previous.source??null;generationConfirmed=false;generationFailure=null;await draw();changed();})));
    generationPreview.append(history);
   }
   if(generationFailure){const failed=el('details');failed.append(el('summary','未完成的模型原答'),el('pre',typeof generationFailure==='string'?generationFailure:JSON.stringify(generationFailure,null,2)));generationPreview.append(failed);}
   if(generationRepair)renderCreationAcceptance(document,generationPreview,{acceptance:generationRepair.acceptance,rawResponse:generationRepair.rawResponse,saved:true,onRepair:()=>sendRepair(),disabled:generationRunning()||typeof roles.repairCreation!=='function'});
   if(!generationDraft)return;
   if(generationDraft.acceptance)renderCreationAcceptance(document,generationPreview,{acceptance:generationDraft.acceptance,rawResponse:generationDraft.rawResponse,onRepair:()=>sendRepair(),disabled:generationRunning()||typeof roles.repairCreation!=='function'||(generationDraft.proposal?.matrix?.changes?.length??0)>0});
   if(generationDraft.proposal?.matrix?.changes?.length===0){generationPreview.append(el('p','当前没有依赖完整的已通过条目；待修原文保留，不会写入空档案。'));return;}
   if(creationLocked()){generationPreview.append(el('p',generationReceipt?'人物表单已保存；使用底部保存继续完成同一人物绑定或槽位，不会重复创建档案。':generationSavedDraft?.archiveReceipt?.confirmed?'基点书已确认归档，当前聊天接入待核对；使用底部保存继续同一次提交。':'这份创作上次保存尚未完成；使用底部保存读取实际结果后继续同一次提交。'));if(generationSavedDraft?.bindOnSave&&!generationSavedDraft.createPersona)generationPreview.append(button('保留当前选择，结束绑定',keepCurrentAfterCreation));return;}
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
  function adoptDraft(next,taskId){if(disposed||creationLocked()||!next)return;guard();if(taskId&&adoptedTaskId===taskId)return;rememberGeneration();generationRepair=null;generationDraft=clone(next);generationDraft.destination=clone(next.destination??creationDestination);creationDestination=clone(generationDraft.destination);generationKind=next.kind??generationKind;generationMode=next.mode??generationMode;generationGoal='';goal.value='';generationText=JSON.stringify(next.proposal,null,2);generationConfirmed=false;generationFailure=null;generationFieldTexts={};generationFieldErrors={};adoptedTaskId=taskId??next.operationId;renderGeneration();syncCreationControls();changed();}
  function syncCreationControls(){const locked=creationLocked()||generationRunning(),repairPinned=!!generationRepair?.acceptance?.pending?.length;for(const node of generated.querySelectorAll('[data-creation-kind],[data-creation-mode],[data-creation-book],[data-creation-book-name],[data-creation-core]'))node.disabled=locked||repairPinned||!!generationDraft&&node.matches('[data-creation-book],[data-creation-book-name]');destinationHint.hidden=!generationDraft&&!repairPinned;destinationHint.textContent=repairPinned?'待修条目继续保存到同一世界书；已保存条目会保留。':'已有草稿，先点底部“取消修改”取消草稿，再更换目标。';const persona=generated.querySelector('[data-creation-persona]');if(persona)persona.disabled=locked||generationKind!=='character'||!!generationDraft&&!hasCreationBinding(generationDraft.proposal);for(const repair of generationPreview.querySelectorAll('[data-creation-repair]'))repair.disabled=locked||typeof roles.repairCreation!=='function'||!repairPinned&&(generationDraft?.proposal?.matrix?.changes?.length??0)>0;generationPreview.inert=generationRunning();}
  function receiveTask(task){if(disposed||stamp(identity.read().scope)!==scope)return;generationTask=task;generationWorkbench?.render(task);syncCreationControls();if(task?.status==='ready'&&task.draft&&!generationStarting){try{adoptDraft(task.draft,task.id);}catch(error){report(error);}}if(task?.status==='error')generationFailure=task.text??task.error?.rawResponse??null;syncActions();}
  async function sendRepair(){
   if(generationRunning()||disposed)return false;check(typeof roles.repairCreation==='function','待修服务尚未就绪；原文和已保存引用已保留，不会重放已保存条目。');
   generationStarting=true;syncActions();syncCreationControls();generationPending=(async()=>{try{guard();check(!creationLocked(),'请先完成已开始的保存');const repair=generationRepair??{draft:{...generationDraft,proposal:parseGeneration()}};check(repair.acceptance?.pending?.length||repair.draft?.acceptance?.pending?.length,'当前没有待修条目');check(!repair.draft?.proposal?.matrix?.changes?.length,'请先核对并保存已通过条目，再修复剩余内容');retainCreationView();const next=await roles.repairCreation(clone(repair),{goal:generationGoal.trim()||'只修复待办；保留已保存条目，优化建议另列',onProgress:()=>{if(!disposed)receiveTask(roles.creationTask?.()??generationTask);}});if(!disposed)adoptDraft(next,roles.creationTask?.()?.id??next.operationId);return true;}catch(error){if(!disposed&&generationTask?.status!=='cancelled')report(error);return false;}finally{generationStarting=false;if(!disposed){generationTask=roles.creationTask?.()??generationTask;generationWorkbench?.render(generationTask);syncCreationControls();syncActions();retainCreationView();}}})();return generationPending;
  }
  async function sendCreation(){
   if(generationRepair?.acceptance?.pending?.length||generationDraft?.acceptance?.pending?.length&&generationDraft.proposal?.matrix?.changes?.length===0)return sendRepair();
   if(generationRunning()||disposed)return false;generationStarting=true;syncActions();syncCreationControls();
   generationPending=(async()=>{try{
    guard();check(savedIdentity.scope.chatId,'请先打开要绑定的聊天');check(!creationLocked(),'请先完成已保存的人物槽位');check(!savedIdentity.creationPending,'请先使用底部保存恢复已开始的人物槽位');
    check(!recordDraft&&!Object.keys(dossierFields).length&&!createDirty(),'请先完成或取消当前人物修改');const requestedGoal=generationGoal.trim()?generationGoal:generationDraft?.goal;check(requestedGoal?.trim(),'请写下创作要求');
    check(creationDestination.book?.trim(),'请选择保存到的世界基点书，或填写新世界书名称');
    let source=creationSource?clone(creationSource):null;
    if(generationUseCore){check(typeof listCreationCores==='function','基点读取接口尚未接入');const previous=creationCores[creationCoreIndex];check(previous,'请选择已有基点');const latest=await listCreationCores();guard();source=latest.find(row=>row.book===previous.book&&row.id===previous.id&&row.version===previous.version);check(source&&stamp(source)===stamp(previous),'所选基点版本已改变，请重新读取');}
    retainCreationView();const next=await roles.createDraft({goal:requestedGoal,kind:generationKind,mode:generationMode,source:source?clone(source):null,destination:clone(creationDestination),messages:clone(generationTask?.messages??[]),onProgress:()=>{if(!disposed)receiveTask(roles.creationTask?.()??generationTask);}});
    if(disposed)return true;if(source&&generationUseCore)next.creationSource=clone(source);const task=roles.creationTask?.();adoptDraft(next,task?.id??next.operationId);goal.value='';if(task)receiveTask(task);return true;
   }catch(error){if(!disposed){generationFailure=error.rawResponse??generationTask?.text??null;renderGeneration();if(generationTask?.status!=='cancelled')report(error);}return false;}
   finally{generationStarting=false;if(!disposed){generationTask=roles.creationTask?.()??generationTask;generationWorkbench?.render(generationTask);syncCreationControls();syncActions();retainCreationView();}}
   })();return generationPending;
  }
  const conversation=el('div');generationWorkbench=mountCreationWorkbench(document,conversation,{composer:goal,onSend:sendCreation,onCancel:()=>roles.cancelCreation?.(),onError:report});generationWorkbench.setLocked(creationLocked());
  generated.append(conversation,el('p','结果在下方表格中核对和修改；列表、字段组和规则内容都可以逐格编辑。确认后使用底部保存。'),generationPreview);renderGeneration();content.append(generated);
  generationTask=roles.creationTask?.()??null;receiveTask(generationTask);generationUnsubscribe=roles.subscribeCreation?.(receiveTask)??null;

 }
 async function drawResources(){
  if(typeof roles.resources!=='function')return;const section=el('section');section.dataset.referenceBooks='';section.append(el('h3','可选资料书启用'));content.append(section);let available;
  try{available=await roles.resources();}catch(error){section.append(el('p','资料选择暂不可读：'+error.message));return;}if(disposed)return;
  if(!resourceBase){resourceBase={referenceBooks:[...available.referenceBooks],phoneWorld:clone(available.phoneWorld)};resourceDraft=clone(resourceBase);}
  const names=available.books.filter(name=>!available.excluded.includes(name));for(const name of new Set([...names,...resourceDraft.referenceBooks])){const node=el('input');node.type='checkbox';node.checked=resourceDraft.referenceBooks.includes(name);node.dataset.referenceBook=name;node.onchange=()=>{resourceDraft.referenceBooks=node.checked?[...new Set([...resourceDraft.referenceBooks,name])]:resourceDraft.referenceBooks.filter(item=>item!==name);changed();};section.append(field(name+(names.includes(name)?'':'（已缺失或不可选，请取消）'),node));}
  section.append(el('h3','小手机对应世界'),el('p','选择只保存定位，不套用旧初态、不清空已有数据。'));
  if(roles.database){const world=el('select');world.dataset.phoneWorldEntry='';option(world,'暂不选择世界','');for(const row of available.worlds)option(world,row.name,row.worldId);const id=resourceDraft.phoneWorld?.database?resourceDraft.phoneWorld.worldId:'';if(id&&!available.worlds.some(row=>row.worldId===id))option(world,'原世界已不存在，请重新选择',id);world.value=id;world.onchange=()=>{resourceDraft.phoneWorld=world.value?{database:true,worldId:world.value}:null;changed();};section.append(field('统一表单世界',world));}

 }

 async function draw() {
  if (disposed) return;
  generationUnsubscribe?.();generationUnsubscribe=null;generationWorkbench?.dispose();generationWorkbench=null;
  content.replaceChildren(el('h2',creationOnly?'创作工作台':resourcesOnly?'故事档案与资料书':'用户身份'));
  if(creationLocked()&&!creationOnly){const recovery=el('section');recovery.dataset.creationRecovery='';recovery.append(el('h3','继续上次创作保存'),el('p','上次创作保存尚未完成，草稿及保存依据已恢复。请使用底部保存继续同一次提交。'),button('导出创作恢复草稿',downloadDraft));if(generationSavedDraft?.bindOnSave&&!generationSavedDraft.createPersona)recovery.append(button('保留当前选择，结束绑定',keepCurrentAfterCreation));content.append(recovery);}
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
  await drawDatabase();syncActions();
 }
 const ready = run(async () => {
  try {await roles.ensureBook();}
  catch (error) {status.textContent = '基点书自动准备失败：' + error.message;}
  savedConfig=config.read();resetDraft(savedIdentity.active);
  if(initialCreation){check(['character','world'].includes(initialCreation.kind),'创作入口类型无效');generationKind=initialCreation.kind;generationMode=initialCreation.mode??'extend';check(['extend','revise'].includes(generationMode),'创作方式无效');generationGoal=String(initialCreation.goal??'');generationUseCore=initialCreation.useCore===true;generationCreatePersona=initialCreation.createPersona===true;generationBindOnSave=initialCreation.bindOnSave===true;creationSource=clone(initialCreation.source??null);creationDestination=clone(initialCreation.destination??{book:'',newBook:initialCreation.kind==='world'});if(generationUseCore){check(typeof listCreationCores==='function','基点读取接口尚未接入');creationCores=await listCreationCores();guard();}}
  if(typeof roles.pendingCreation==='function'){const recovered=await roles.pendingCreation();guard();if(recovered){check(recovered.proposal?.matrix&&recovered.destination?.book&&['character','world'].includes(recovered.kind),'上次创作恢复草稿不完整，原记录仍保留');generationDraft=clone(recovered);generationSavedDraft=clone(recovered);generationText=JSON.stringify(recovered.proposal,null,2);generationKind=recovered.kind;generationMode=recovered.mode??'extend';generationGoal=String(recovered.goal??'');generationCreatePersona=recovered.createPersona===true;generationBindOnSave=recovered.bindOnSave===true;generationConfirmed=true;creationDestination=clone(recovered.destination);creationSource=clone(recovered.source??null);}}
  if(!generationSavedDraft&&!savedIdentity.creationPending)restoreCreationView(roles.creationView?.());
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
