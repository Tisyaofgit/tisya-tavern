// One decision for one attempted settings navigation. The owning view keeps
// authority over its draft, persistence, and whether a save actually succeeded.
export function mountUnsavedPrompt(document, container, {onStateChange = () => {}} = {}) {
 let alive = true, pending = null, busy = false;
 const state = () => ({open: !!pending, busy});
 const changed = () => { if (alive) onStateChange(state()); };
 const activeElement = () => {
  let node = document.activeElement;
  while (node?.shadowRoot?.activeElement) node = node.shadowRoot.activeElement;
  return node;
 };
 function finish(value) {
  const current = pending;
  if (!current) return;
  pending = null;
  busy = false;
  current.root.remove();
  current.resolve(value);
  if (current.focus?.isConnected) current.focus.focus();
  changed();
 }
 function request({save, discard, proceed} = {}) {
  // Repeated clicks must not share a successful result and navigate twice.
  if (!alive || pending) return Promise.resolve(false);
  const make = (tag, text, className) => {
   const node = document.createElement(tag);
   if (text !== undefined) node.textContent = text;
   if (className) node.className = className;
   return node;
  };
  const root = make('div', undefined, 'tisya-unsaved-prompt');
  const style = make('style');
  style.textContent = `.tisya-unsaved-prompt{position:fixed;inset:0;z-index:2147483600;display:grid;place-items:center;padding:max(16px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) max(16px,env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left));background:#071a19a8;box-sizing:border-box;color:#e7e8d5;font:15px/1.6 var(--tisya-global-font,TisyaReading),system-ui,sans-serif}.tisya-unsaved-prompt *{box-sizing:border-box}.tisya-unsaved-card{width:min(100%,420px);max-height:100%;overflow:auto;padding:22px;border:1px solid #aeb58a;border-radius:20px;background:#113b32;box-shadow:0 12px 50px #0005;overflow-wrap:anywhere}.tisya-unsaved-card h2{margin:0 0 10px;font-size:20px;color:inherit}.tisya-unsaved-card p{margin:8px 0;color:inherit}.tisya-unsaved-card [role=alert]{color:#ffe2b0}.tisya-unsaved-card [role=alert]:empty{display:none}.tisya-unsaved-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:20px}.tisya-unsaved-actions button{appearance:none;min-width:0;min-height:44px;margin:0;padding:10px 12px;border:1px solid #9ca883;border-radius:12px;background:#ffffff0b;color:inherit;font:inherit;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent}.tisya-unsaved-actions button:first-child{grid-column:1/-1;background:#d5d9b2;color:#173e32}.tisya-unsaved-actions button:disabled{opacity:.5;cursor:wait}.tisya-unsaved-actions button:focus{outline:none}.tisya-unsaved-actions button:focus-visible{outline:2px solid #f2e4ac;outline-offset:3px}@media(max-width:340px){.tisya-unsaved-card{padding:16px}.tisya-unsaved-actions{grid-template-columns:1fr}.tisya-unsaved-actions button:first-child{grid-column:auto}}`;
  const card = make('section', undefined, 'tisya-unsaved-card');
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'true');
  card.setAttribute('aria-label', '保存未完成的修改');
  const error = make('p');
  error.setAttribute('role', 'alert');
  const actions = make('div', undefined, 'tisya-unsaved-actions');
  const saveButton = make('button', '保存并切换');
  const discardButton = make('button', '放弃修改');
  const stayButton = make('button', '继续编辑');
  for (const button of [saveButton, discardButton, stayButton]) button.type = 'button';
  actions.append(saveButton, discardButton, stayButton);
  card.append(make('h2', '有未保存的修改'), make('p', '保存本页修改后切换，或放弃修改继续。'), error, actions);
  root.append(style, card);
  const focus = activeElement();
  const result = new Promise(resolve => { pending = {root, resolve, focus}; });
  container.append(root);
  const current = pending;
  async function apply(callback, verb) {
   if (!alive || busy || pending !== current) return;
   busy = true;
   error.textContent = '';
   card.setAttribute('aria-busy', 'true');
   for (const button of actions.children) button.disabled = true;
   changed();
   try {
    if (typeof callback !== 'function') throw Error(verb + '操作未连接，修改仍保留。');
    if (await callback() === false) throw Error(verb + '未完成，修改仍保留。');
    if (!alive || pending !== current) return;
    if (proceed) await proceed();
    if (alive && pending === current) finish(true);
   } catch (cause) {
    if (alive && pending === current) error.textContent = cause?.message || String(cause);
   } finally {
    if (alive && pending === current) {
     busy = false;
     card.setAttribute('aria-busy', 'false');
     for (const button of actions.children) button.disabled = false;
     changed();
    }
   }
  }
  saveButton.onclick = () => apply(save, '保存');
  discardButton.onclick = () => apply(discard, '放弃修改');
  stayButton.onclick = () => { if (!busy) finish(false); };
  root.addEventListener('keydown', event => {
   if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    if (!busy) finish(false);
   } else if (event.key === 'Tab') {
    const buttons = [...actions.children].filter(node => !node.disabled);
    if (!buttons.length) { event.preventDefault(); return; }
    const first = buttons[0], last = buttons.at(-1), active = activeElement();
    if (event.shiftKey && (active === first || !card.contains(active))) {
     event.preventDefault(); last.focus();
    } else if (!event.shiftKey && (active === last || !card.contains(active))) {
     event.preventDefault(); first.focus();
    }
   }
  });
  stayButton.focus();
  changed();
  return result;
 }
 return {request, state, dispose() { if (!alive) return; finish(false); alive = false; }};
}
