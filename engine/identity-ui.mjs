import {PREFERENCE_GROUPS, effectivePreferences} from './preferences.mjs';
import {storyAvatar} from './identity.mjs';
import {selectControl} from './form-controls.mjs';
import {mountUnsavedPrompt} from '../settings-unsaved.js';

const stamp = value => JSON.stringify(value);
const clone = value => structuredClone(value);
const check = (condition, message) => {if (!condition) throw Error(message);};
const wishGroup = PREFERENCE_GROUPS.find(group => group.id === 'W');
const wishOrder = wishGroup.options.map(option => option.id);
const orderedChoices = choices => wishOrder.filter(id => choices.includes(id));

export function mountMatrixIdentity(document, root, {identity, config, roles, onClose = () => {}, onNative = () => {}}) {
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
 .tisya-matrix-identity{display:flex;flex-direction:column;min-width:0;width:100%;max-width:900px;margin:auto;min-height:0;height:var(--tisya-settings-height,100dvh);max-height:100dvh;overflow:hidden;overflow-wrap:anywhere;box-sizing:border-box}
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
  return {mode: avatar.mode, book: avatar.binding?.book ?? value.coreBook ?? '基点书', uid: avatar.binding?.uid == null ? '' : String(avatar.binding.uid)};
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
  receipts = []; reviewRequired = false;
 }
 resetDraft();
 const profileDirty = () => draft.name !== profileBase.name || draft.description !== profileBase.description;
 const wishDirty = () => draft.description !== wishBase.description || stamp(draft.choices) !== stamp(wishBase.choices) || !!savedConfig.story.wish;
 const roleDirty = () => stamp({mode: draft.mode, book: draft.book, uid: draft.mode === 'bound' ? draft.uid : ''}) !== stamp({...roleBase, uid: roleBase.mode === 'bound' ? roleBase.uid : ''});
 const createDirty = () => !!(draft.createName || draft.createContent || draft.createConfirmed);
 const selectionDirty = () => draft.id !== savedIdentity.active || !!savedIdentity.pending;
 // Existing recovery intents and merged legacy wishes can be explicitly saved,
 // but neither is a newly typed draft that should trap navigation after cancel.
 const hasDraftChanges = () => reviewRequired || draft.name !== profileEditorBase.name || draft.description !== profileEditorBase.description
  || draft.description !== wishEditorBase.description || stamp(draft.choices) !== stamp(wishEditorBase.choices)
  || roleDirty() || createDirty() || draft.id !== savedIdentity.active;
 const hasChanges = () => hasDraftChanges() || profileDirty() || wishDirty() || !!savedIdentity.pending;
 const prompt = mountUnsavedPrompt(document, dialogs, {onStateChange: () => syncActions()});
 const state = () => ({dirty: hasChanges(), draftDirty: hasDraftChanges(), profileDirty: profileDirty(), wishDirty: wishDirty(), roleDirty: roleDirty(), createDirty: createDirty(), selectionDirty: selectionDirty(), reviewRequired, receipts: [...receipts], busy: busy || prompt.state().busy, canSave: hasChanges() && !busy, selected: draft.id, active: savedIdentity.active});
 function syncActions() {
  if (disposed) return;
  cancel.disabled = busy || prompt.state().open || !hasDraftChanges();
  saveButton.disabled = busy || prompt.state().open || !hasChanges();
  content.inert = busy || prompt.state().open;
  root.setAttribute('aria-busy', String(busy));
 }
 function report(error) {
  if (disposed) return;
  lastError = error; status.setAttribute('role', 'alert'); status.textContent = error?.message || String(error);
 }
 function changed() {
  status.setAttribute('role', 'status'); status.textContent = hasChanges() ? '有未保存修改' : '';
  syncActions();
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
  check(!reviewRequired, '已有部分确认保存，但保存期间会话改变；请先核对已保存内容，再取消修改后重新读取。');
  guard();
  if (profileDirty()) {
   if (profileFor()) check(typeof draft.name === 'string' && draft.name.trim() && !/[\r\n]/.test(draft.name), '名字须是单行非空文字');
   check(typeof draft.description === 'string', '心愿须为文字');
  }
  if (draft.id) check(!!profileFor(), '用户身份已不存在');
  if (createDirty()) {
   check(draft.createName.trim() === draft.createName && draft.createName && !/[\r\n]/.test(draft.createName), '角色名称须为单行非空文字');
   check(draft.createContent.trim(), '请填写角色条目原文');
   check(draft.createConfirmed, '请勾选“保存时创建并绑定当前聊天”，确认这次要创建的角色。');
   check(draft.mode === 'bound', '创建角色需要使用“绑定角色”主控模式');
  }
  if (roleDirty() || createDirty()) {
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
  // List/read operations can yield while the host changes chat or another editor saves.
  guard();
 }
 async function save() {
  if (!hasChanges()) return true;
  await validate();
  try {
   if (savedIdentity.pending) {
    await identity.resume(); captureIdentity(); recordReceipt('身份切换'); guard();
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
   if (createDirty()) {
    const entry = await roles.create({book: draft.book, name: draft.createName, content: draft.createContent}, savedConfig.revision);
    savedConfig = config.read(); roleBase = roleValues();
    draft.mode = roleBase.mode; draft.book = roleBase.book; draft.uid = String(entry.uid);
    draft.createName = ''; draft.createContent = ''; draft.createConfirmed = false;
    recordReceipt('角色条目与当前聊天绑定'); guard();
   } else if (roleDirty()) {
    savedConfig = await roles.bind({mode: draft.mode, book: draft.book, uid: draft.uid}, savedConfig.revision);
    roleBase = roleValues(); draft.mode = roleBase.mode; draft.book = roleBase.book; draft.uid = roleBase.uid;
    recordReceipt('主控模式与当前聊天绑定'); guard();
   }
   if (draft.id !== savedIdentity.active) {
    await identity.select({id: draft.id, revision: savedIdentity.revision, chat: !!savedIdentity.scope.chatId, character: false, global: false});
    captureIdentity(); recordReceipt('身份切换'); guard();
   }
  } catch (cause) {
   // Only a matching durable selection intent authorizes resuming a failed step.
   // Field equality alone never proves that a failed write reached its store.
   const latest = identity.read();
   if (latest.pending?.id === draft.id && stamp(latest.scope) === scope) savedIdentity = latest;
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
   await draw(); status.setAttribute('role', 'status'); status.textContent = '已保存本页的身份、心愿与主控设置。';
  }
  return true;
 }
 async function discard() {
  savedIdentity = identity.read(); savedConfig = config.read(); scope = stamp(savedIdentity.scope); resetDraft();
  await draw(); status.setAttribute('role', 'status');
  status.textContent = savedIdentity.pending ? '未保存的输入已取消；上次身份切换仍待核对，请使用保存继续。' : '已取消修改，恢复到已保存的内容。';
  return true;
 }
 const saveDraft = () => run(save), discardDraft = () => run(discard);
 async function confirmLeave() {
  if (disposed || busy && !navigating) return false;
  if (navigating) return true;
  if (navigationPending) return false;
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

 async function draw() {
  if (disposed) return;
  content.replaceChildren(el('h2', '用户身份'));
  const nav = el('div', null, 'tisya-identity-nav');
  nav.append(routeButton('返回', onClose), routeButton('原生身份管理', onNative));
  const reload = el('button', '重新读取', 'menu_button'); reload.type = 'button'; reload.onclick = () => route(discard);
  nav.append(reload); content.append(nav);
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
  if (!savedIdentity.personas.length) content.append(el('p', '尚未创建原生用户身份，可通过上方“原生身份管理”创建。'));
  if (draft.id !== savedIdentity.active) content.append(el('p', '正在编辑待切换身份；使用底部保存后才切换并绑定当前聊天。'));
  if (savedIdentity.pending) content.append(el('p', '上次身份切换尚未完成：' + (savedIdentity.pending.error ?? savedIdentity.pending.stage) + '。使用底部保存继续核对。'));
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
   return run(loadSource);
  };
  entries.onchange = () => {if (busy || disposed) return; draft.uid = entries.value; show(); changed();};
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
  section.append(create); syncActions();
 }
 const ready = run(async () => {
  try {await roles.ensureBook();}
  catch (error) {status.textContent = '基点书自动准备失败：' + error.message;}
  await draw();
 });
 return {
  root, ready, state, saveDraft, discardDraft, confirmLeave,
  settled: () => Promise.all([pending, ...(navigationPending ? [navigationPending] : [])]),
  requestLeave: () => {
   const allowed = navigating || !busy && !hasDraftChanges() && !prompt.state().open;
   return {allowed, dirty: hasChanges(), reason: allowed ? '' : busy ? '身份操作正在进行' : '有未保存的修改'};
  },
  dispose() {if (disposed) return; prompt.dispose(); disposed = true; if (hostPage && !hadHostClass) hostPage.classList.remove('tisya-matrix-page'); root.replaceChildren();}
 };
}
