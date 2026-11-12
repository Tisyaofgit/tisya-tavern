// Request-only source framing for the verified TauriTavern PromptManager path.
// Source text is retained. Card/World Info activation and native placement stay
// with the host; this adapter never reads a card again to expand its macros.
const NOTE = '2_floating_prompt';
const EVENTS = ['GENERATION_AFTER_COMMANDS', 'WORLDINFO_ENTRIES_LOADED',
 'WORLD_INFO_ACTIVATED', 'GENERATE_AFTER_COMBINE_PROMPTS',
 'CHAT_COMPLETION_SETTINGS_READY', 'GENERATION_ENDED', 'GENERATION_STOPPED'];
const MARKERS = Object.freeze({
 charDescription:'角色卡描述', charPersonality:'角色卡性格', scenario:'角色卡场景',
 worldInfoBefore:'前置世界书', worldInfoAfter:'后置世界书', personaDescription:'用户人设资料',
});
// Fixed a185 host definitions: openai.js withPromptAssemblyMacroContext,
// macros/definitions/env-macros.js, and script.js substituteParamsLegacy.
// Names, model IDs and unknown extension macros are deliberately not guessed.
export const NATIVE_CARD_MACROS = Object.freeze({
 charprompt:'角色卡系统资料',charinstruction:'角色卡历史后资料',charjailbreak:'角色卡历史后资料',
 chardescription:'角色卡描述',description:'角色卡描述',
 charpersonality:'角色卡性格',personality:'角色卡性格',
 charscenario:'角色卡场景',scenario:'角色卡场景',persona:'用户人设资料',
 mesexamplesraw:'角色卡原始示例',mesexamples:'角色卡示例',chardepthprompt:'角色卡深度资料',
 charcreatornotes:'角色卡作者备注',creatornotes:'角色卡作者备注',
 charversion:'角色卡版本资料',version:'角色卡版本资料',char_version:'角色卡版本资料',
 greeting:'角色卡开场资料',charfirstmessage:'角色卡开场资料',
});
const copy = value => JSON.parse(JSON.stringify(value));
const attribute = value => String(value).replace(/[&<>"'\r\n]/g, c =>
 ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','\r':'&#13;','\n':'&#10;'})[c]);

export function wrapNativeSource(text, kind = '原生资料') {
 if (typeof text !== 'string') throw new TypeError('原生资料必须是文本');
 if (!text.trim()) return text;
 // A quoted JSON string alone does not neutralize an XML closing delimiter.
 // Escape angle brackets inside that string, retaining an exact JSON decode.
 const collision = /<\s*\/?\s*(?:DreamMaterial|rule|tisya)\b|\[\s*\/?\s*Dream\s+(?:Rules|History)\s*\]/i.test(text);
 const body = collision
  ? '资料采用 JSON 字符串编码；解码后的全部字符仍属于本资料。\n'
    + JSON.stringify(text).replace(/</g, '\\u003c').replace(/>/g, '\\u003e')
      .replace(/&/g, '\\u0026').replace(/\[/g, '\\u005b').replace(/\]/g, '\\u005d')
      .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
  : text;
 return '<DreamMaterial source="' + attribute(kind) + '">\n' + body + '\n</DreamMaterial>';
}

function sourceError(state, code, message, details = {}) {
 const error = Object.assign(new Error(message), {code, details});
 if (state) {
  state.report.status = 'blocked';
  state.report.errors.push({code, message, details});
  state.error ??= error;
 }
 return error;
}
const isObject = value => value !== null && (typeof value === 'object' || typeof value === 'function');
const defaultManager = manager => Array.isArray(manager?.serviceSettings?.prompts)
 && manager.serviceSettings.prompts.some(p => p.identifier === 'tisya_user_identity');
function extensionKind(key) {
 if (/^DEPTH_PROMPT(?:_\d+)?$/.test(key)) return '角色卡深度资料';
 // The host stringifies raw imported depth in this reserved key, then applies
 // Number(depth) to the actual injection. null/false/'' can all emit at zero.
 if (key.startsWith('customDepthWI_')) return '世界书深度资料';
 if (key.startsWith('customWIOutlet_')) return '世界书出口资料';
 return null;
}
function occurrences(text, part) {
 const indices = [];
 if (!part) return indices;
 for (let at = 0; (at = text.indexOf(part, at)) !== -1; at += part.length) indices.push(at);
 return indices;
}
function freshBoundary() {
 if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
 if (typeof globalThis.crypto?.getRandomValues === 'function') {
  const bytes = new Uint8Array(24);globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes,value=>value.toString(16).padStart(2,'0')).join('');
 }
 throw new Error('宿主缺少生成临时资料边界的随机源');
}

export function createNativeSourceLayers({
 PromptManager, Message, ChatCompletion, getContext, getScope,
 isManagerActive = defaultManager, getAuthorsNotePolicy = () => ({enabled:undefined}),
 preparePreset = null, prepareMessage = null, finalizeMessages = null,
} = {}) {
 let current = null, last = null, serial = 0, disposed = false;
 const handlers = new WeakMap(), prepared = new WeakMap(), messageOwners = new WeakMap();
 const managerPrototype = PromptManager?.prototype;
 const originalPrepare = managerPrototype?.preparePrompt;
 const originalCreate = Message?.createAsync;
 const completionPrototype = ChatCompletion?.prototype;
 const originalGetChat = completionPrototype?.getChat;
 const installed = {prepare:false, message:false, finalize:false};
 const scope = () => typeof getScope === 'function' ? getScope() : undefined;
 const context = () => typeof getContext === 'function' ? getContext() : null;

 function check(state) {
  if (!state || current !== state || !state.open)
   throw sourceError(state, 'NATIVE_LAYER_STALE', '原生资料装配轮次已变化');
  if (scope() !== state.scope)
   throw sourceError(state, 'NATIVE_LAYER_SCOPE', '原生资料准备后会话或配置已变化');
  if (state.error) throw state.error;
  return state;
 }
 function count(state, kind, text, identifier) {
  state.report.sources[kind] = (state.report.sources[kind] ?? 0) + 1;
  state.report.projections.push({kind, identifier:String(identifier), characters:text.length});
 }
 function activeManager(state, manager) {
  if (!state?.open || state.phase !== 'assembly') return false;
  return isManagerActive(manager) === true;
 }
 function pendingSource(state, text, kind) {
  if (!text.trim()) return text;
  let nonce;
  try {nonce=freshBoundary();}
  catch(error) {throw sourceError(state,'NATIVE_LAYER_BOUNDARY_API',error.message);}
  const start='<DreamMaterial source="'+attribute(kind)+'">\n<!--TISYA_NATIVE_SOURCE_START:'+nonce+'-->\n';
  const end='\n<!--TISYA_NATIVE_SOURCE_END:'+nonce+'-->\n</DreamMaterial>';
  if (text.includes(start) || text.includes(end))
   throw sourceError(state,'NATIVE_LAYER_BOUNDARY_COLLISION','原生资料临时边界发生碰撞');
  state.pending.push({start,end,kind});
  return start+text+end;
 }
 function frameNativeMacroTokens(state,text) {
  if(typeof text!=='string'||!text.includes('{{')) return text;
  const stack=[],ranges=[];
  for(let at=0;at<text.length-1;at++) {
   if(text.slice(at,at+2)==='{{') {stack.push(at);at++;continue;}
   if(text.slice(at,at+2)!=='}}'||!stack.length) continue;
   const start=stack.pop(),end=at+2,body=text.slice(start+2,at).trim();at++;
   const match=body.match(/^([!?~#\/]*)\s*([a-z][a-z0-9_-]*)([\s\S]*)$/i);
   if(!match) continue;
   const name=match[2].toLowerCase(),kind=NATIVE_CARD_MACROS[name];
   if(!kind) continue;
   // Framing a value inside a macro argument may alter a variable write or
   // conditional operation. Stop before invoking the native evaluator.
   if(stack.length) throw sourceError(state,'NATIVE_LAYER_MACRO_NESTED','来源宏嵌在其他宏参数内，不能在不改写其副作用的情况下包裹',{macro:name});
   let slashes=0;for(let i=start-1;i>=0&&text[i]==='\\';i--)slashes++;
   if(slashes%2) throw sourceError(state,'NATIVE_LAYER_MACRO_ESCAPED','来源宏使用转义形式，当前宿主双宏引擎的来源语义不能唯一确认',{macro:name});
   const tail=match[3].trim();
   if(match[1]||tail&&(!['greeting','charfirstmessage'].includes(name)||!/^::\s*-?\d+\s*$/.test(tail)))
    throw sourceError(state,'NATIVE_LAYER_MACRO_FORM','来源宏使用尚未验证的原生参数或标志形式',{macro:name});
   ranges.push({start,end,kind});
  }
  for(const range of ranges.sort((a,b)=>b.start-a.start)) {
   text=text.slice(0,range.start)+pendingSource(state,text.slice(range.start,range.end),range.kind)+text.slice(range.end);
   state.report.sourceMacros++;
  }
  return text;
 }
 // Extensions are expanded by the host after AFTER_COMBINE. Delimiters are
 // therefore finalized only after that single native expansion, before tokens
 // are counted. A macro-generated closing tag is encoded as source data too.
 function resolvePending(state, text, depth=0) {
  if (typeof text !== 'string' || !state.pending.length) return text;
  if (depth>32) throw sourceError(state,'NATIVE_LAYER_BOUNDARY_NESTING','原生资料边界递归过深');
  for (const boundary of state.pending) {
   let at=0;
   while ((at=text.indexOf(boundary.start,at))!==-1) {
    const begin=at+boundary.start.length, end=text.indexOf(boundary.end,begin);
    if(end===-1) throw sourceError(state,'NATIVE_LAYER_BOUNDARY_MISSING','原生资料展开后缺少结束边界');
    const body=text.slice(begin,end);
    if(body.includes(boundary.start))
     throw sourceError(state,'NATIVE_LAYER_BOUNDARY_NESTING','原生资料宏自嵌套，无法唯一还原');
    const wrapped=wrapNativeSource(resolvePending(state,body,depth+1),boundary.kind);
    text=text.slice(0,at)+wrapped+text.slice(end+boundary.end.length);
    at+=wrapped.length;
    state.report.expandedExtensions++;
   }
   if(text.includes(boundary.end))
    throw sourceError(state,'NATIVE_LAYER_BOUNDARY_MISSING','原生资料展开后缺少起始边界');
  }
  return text;
 }
 function invoke(state, code, callback, ...args) {
  try {return callback(...args);}
  catch(error) {
   if(state.error) throw state.error;
   throw sourceError(state,code,String(error?.message??error),{causeCode:error?.code??null});
  }
 }
 function prepareProjection(prompt, original = null) {
  const state = current;
  if (!activeManager(state, this)) {
   // A different preset may use the UI's shared tokenizer. Its preparation
   // must not inherit an earlier Tisya manager's example/message ownership.
   if (isObject(this.tokenHandler)) handlers.delete(this.tokenHandler);
   return originalPrepare.call(this, prompt, original);
  }
  check(state);
  if (!isObject(this.tokenHandler))
   throw sourceError(state, 'NATIVE_LAYER_TOKENS', '宿主缺少本轮提示词计数器');
  handlers.set(this.tokenHandler, {state, manager:this});
  if (!state.managers.has(this)) {
   state.managers.add(this);
   state.report.managers++;
  }
  const owned = isObject(prompt) ? prepared.get(prompt) : null;
  if (owned && prompt.content !== owned.wrapped)
   throw sourceError(state, 'NATIVE_LAYER_CHANGED', '已包裹的原生资料被其他装配器改写');
  let input = owned ? {...prompt, content:owned.raw} : prompt;
  let presetProjection = null;
  // getPromptCollection passes the actual stored object for an enabled entry.
  // Its disabled-main replacement is a clone with empty content: identity is
  // essential here, otherwise compiling it would turn a disabled prompt on.
  const stored = this.serviceSettings?.prompts?.find(p => p === prompt);
  if (typeof preparePreset === 'function' && original === null && stored
   && !stored.marker && !stored.extension && !MARKERS[stored.identifier]) {
   presetProjection = invoke(state, 'NATIVE_LAYER_PRESET_CALLBACK', preparePreset, prompt, this);
   check(state);
   if (presetProjection != null) {
    if (typeof presetProjection !== 'object' || typeof presetProjection.then === 'function'
     || typeof presetProjection.content !== 'string'
     || presetProjection.finish != null && typeof presetProjection.finish !== 'function')
     throw sourceError(state, 'NATIVE_LAYER_PRESET_CALLBACK', '预设资料投影必须同步返回文本与可选 finish');
    input = {...input, content:presetProjection.content};
   }
  }
  if(!MARKERS[prompt?.identifier] && !(typeof original==='string'&&['main','jailbreak'].includes(prompt?.identifier))) {
   const content=frameNativeMacroTokens(state,input?.content);
   if(content!==input?.content) input={...input,content};
  }
  const result = originalPrepare.call(this, input, original);
  check(state);
  if (!isObject(result) || result === input || typeof result.then === 'function')
   throw sourceError(state, 'NATIVE_LAYER_PROMPT_API', '宿主 preparePrompt 未返回独立的同步 Prompt');
  result.content = resolvePending(state,result.content);
  if (presetProjection) {
   const text = presetProjection.finish
    ? invoke(state,'NATIVE_LAYER_PRESET_CALLBACK',presetProjection.finish,result.content) : result.content;
   check(state);
   if (typeof text !== 'string')
    throw sourceError(state, 'NATIVE_LAYER_PRESET_CALLBACK', '预设 finish 必须同步返回文本');
   result.content = text;
   state.report.presetProjections++;
  }
  let kind = MARKERS[result.identifier] ?? owned?.kind;
  let prefix = owned?.prefix ?? '';
  // The host supplies the original argument only for an effective card
  // main/PHI override. Never activate a disabled override ourselves.
  if (typeof original === 'string' && ['main','jailbreak'].includes(result.identifier)) {
   kind = result.identifier === 'main' ? '角色卡系统资料' : '角色卡历史后资料';
   // Native override resolution has already expanded both values. Keep the
   // upper preset outside, while retaining the actual card result in full,
   // including a card's native {{original}} interpolation inside its data.
   prefix = original;
  }
  if (!kind) return result;
  if (typeof result.content !== 'string')
   throw sourceError(state, 'NATIVE_LAYER_CONTENT', '原生资料 Prompt 不是文本', {identifier:result.identifier});
  if (!result.content.trim()) return result;
  const raw = result.content;
  result.content = (prefix ? prefix + '\n\n' : '') + wrapNativeSource(raw, kind);
  prepared.set(result, {raw, wrapped:result.content, kind, prefix});
  count(state, kind, raw, result.identifier);
  return result;
 }
 async function createProjection(role, content, identifier, tokenHandler) {
  const binding = isObject(tokenHandler) ? handlers.get(tokenHandler) : null;
  const state = current;
  if (!state?.open || state.phase !== 'assembly' || binding?.state !== state)
   return originalCreate.call(this, role, content, identifier, tokenHandler);
  check(state);
  if (isManagerActive(binding.manager) !== true)
   throw sourceError(state, 'NATIVE_LAYER_MANAGER', '示例所属的当前预设已变化');
  const example = /^dialogueExamples \d+-\d+$/.test(String(identifier));
  if (example && typeof content !== 'string')
   throw sourceError(state, 'NATIVE_LAYER_EXAMPLE', '原生示例不是文本');
  const resolved = resolvePending(state,content);
  let framed = example ? wrapNativeSource(resolved, '角色卡与世界书示例') : resolved;
  if (typeof prepareMessage === 'function') {
   framed = invoke(state,'NATIVE_LAYER_MESSAGE_CALLBACK',prepareMessage,{role,content:framed,identifier,manager:binding.manager});
   if (typeof framed !== 'string' && !Array.isArray(framed) && framed !== null)
    throw sourceError(state, 'NATIVE_LAYER_MESSAGE_CALLBACK', '原生消息投影必须同步返回文本或原生内容数组');
  }
  const result = await originalCreate.call(this, role, framed, identifier, tokenHandler);
  check(state);
  messageOwners.set(result, {state,manager:binding.manager});
  state.report.ownedMessages++;
  if (example && framed !== content) {
   count(state, '角色卡与世界书示例', content, identifier);
   state.report.examples++;
  }
  return result;
 }
 function getChatProjection(...args) {
  const state = current;
  if (!state?.open || state.phase !== 'assembly') return originalGetChat.apply(this, args);
  const messages = this.getMessages?.();
  if (!messages || typeof messages.flatten !== 'function')
   throw sourceError(state, 'NATIVE_LAYER_COMPLETION_API', '宿主最终消息缺少可核验的原生集合');
  const owners = messages.flatten().map(message => messageOwners.get(message)).filter(Boolean);
  if (!owners.length) return originalGetChat.apply(this, args);
  check(state);
  if (owners.some(owner => owner.state !== state))
   throw sourceError(state, 'NATIVE_LAYER_COMPLETION_STALE', '最终消息包含其他生成轮次的原生消息');
  const manager = owners[0].manager;
  if (owners.some(owner => owner.manager !== manager))
   throw sourceError(state, 'NATIVE_LAYER_COMPLETION_MIXED', '最终消息混入多个原生预设装配器');
  if (isManagerActive(manager) !== true)
   throw sourceError(state, 'NATIVE_LAYER_MANAGER', '最终消息所属预设已变化');
  const raw = originalGetChat.apply(this, args);
  if (!Array.isArray(raw))
   throw sourceError(state, 'NATIVE_LAYER_COMPLETION_API', '宿主最终消息不是数组');
  const serialized=JSON.stringify(raw);
  if(state.pending.some(boundary=>serialized.includes(boundary.start.split('\n')[1])
   ||serialized.includes(boundary.end.split('\n')[1])))
   throw sourceError(state,'NATIVE_LAYER_BOUNDARY_UNRESOLVED','最终消息残留未完成的原生资料边界');
  const result = typeof finalizeMessages === 'function'
   ? invoke(state,'NATIVE_LAYER_FINALIZE_CALLBACK',finalizeMessages,copy(raw), {manager, completion:this}) : raw;
  check(state);
  if (!Array.isArray(result))
   throw sourceError(state, 'NATIVE_LAYER_FINALIZE_CALLBACK', '最终层级投影必须同步返回消息数组');
  state.report.finalizations++;
  return result;
 }
 if (typeof originalPrepare === 'function') {
  managerPrototype.preparePrompt = prepareProjection;
  installed.prepare = true;
 }
 if (typeof originalCreate === 'function') {
  Message.createAsync = createProjection;
  installed.message = true;
 }
 if (typeof originalGetChat === 'function') {
  completionPrototype.getChat = getChatProjection;
  installed.finalize = true;
 }

 function cleanup(state) {
  for (const entry of state?.changes ?? []) {
   if (entry.container[entry.key] === entry.target && entry.target.value === entry.wrapped) {
    entry.target.value = entry.original;
    state.report.cleanup.restored.push(entry.key);
   } else state.report.cleanup.preservedLaterChanges.push(entry.key);
  }
  if (state) state.changes = [];
 }
 function end() {
  if (!current) return last ? copy(last) : {status:'idle'};
  const state = current;
  cleanup(state);
  state.open = false;
  state.report.status = state.error ? 'blocked' : 'complete';
  last = copy(state.report);
  current = null;
  return copy(last);
 }
 function begin({type = 'normal', dryRun = false, scope:capturedScope = scope()} = {}) {
  if (current) end();
  if (disposed) throw sourceError(null, 'NATIVE_LAYER_DISPOSED', '原生资料适配器已释放');
  const c = context();
  const missing = EVENTS.filter(name => !c?.eventTypes?.[name]);
  if (!installed.prepare || managerPrototype.preparePrompt !== prepareProjection) missing.push('PromptManager.preparePrompt');
  if (!installed.message || Message.createAsync !== createProjection) missing.push('Message.createAsync');
  if (typeof finalizeMessages === 'function'
   && (!installed.finalize || completionPrototype.getChat !== getChatProjection)) missing.push('ChatCompletion.getChat');
  if (!isObject(c?.extensionPrompts) || Array.isArray(c.extensionPrompts)) missing.push('context.extensionPrompts');
  if (typeof capturedScope !== 'string' || !capturedScope) missing.push('generation scope');
  const state = {
   id:++serial, scope:capturedScope, type, phase:'prepare', open:true, error:null,
   managers:new WeakSet(), changes:[], pending:[], baseline:null, activated:[],
   report:{status:'preparing', generation:serial, scope:capturedScope, type, dryRun:Boolean(dryRun),
    capabilities:{ready:missing.length === 0, missing, markerProjection:installed.prepare,
     exampleBeforeBudget:installed.message, finalMessageProjection:installed.finalize, events:EVENTS.slice()},
    managers:0, examples:0, presetProjections:0, ownedMessages:0, finalizations:0,expandedExtensions:0,sourceMacros:0,
    sources:{}, projections:[], extensions:[],
    worldInfo:{candidateEntries:0, activatedEntries:0, entriesLoaded:0, activationEvents:0},
    authorsNote:{status:'not-needed'}, afterCombine:false,
    cleanup:{restored:[],preservedLaterChanges:[]}, errors:[]},
  };
  current = state;
  if (missing.length && !dryRun && !['quiet','impersonate'].includes(type))
   throw sourceError(state, 'NATIVE_LAYER_CAPABILITY', '宿主缺少完整原生资料接入能力', {missing});
  if (dryRun || ['quiet','impersonate'].includes(type)) {
   state.report.status = 'passthrough';
   state.phase = 'passthrough';
  }
  return {status:state.error ? 'unsupported' : state.phase === 'passthrough' ? 'passthrough' : 'ready',
   ...copy(state.report.capabilities)};
 }
 function entriesLoaded(data) {
  const state = current;
  if (!state || state.phase === 'passthrough') return;
  check(state);
  const groups = ['globalLore','characterLore','chatLore','personaLore'];
  if (!groups.every(name => Array.isArray(data?.[name])))
   throw sourceError(state, 'NATIVE_LAYER_LORE_API', '宿主未提供完整世界书来源集合');
  const note = context()?.extensionPrompts?.[NOTE];
  const value = note?.value;
  if (note && typeof value !== 'string')
   throw sourceError(state, 'NATIVE_LAYER_NOTE_API', '原生作者笔记不是文本');
  if (state.baseline && state.baseline.value !== (value ?? ''))
   throw sourceError(state, 'NATIVE_LAYER_NOTE_STALE', '世界书载入期间作者笔记基线已变化');
  state.baseline ??= {present:!!note, value:value ?? ''};
  state.report.worldInfo.entriesLoaded++;
  state.report.worldInfo.candidateEntries = groups.reduce((n, name) => n + data[name].length, 0);
 }
 function activated(entries) {
  const state = current;
  if (!state || state.phase === 'passthrough') return;
  check(state);
  if (!Array.isArray(entries))
   throw sourceError(state, 'NATIVE_LAYER_ACTIVATION_API', '宿主激活世界书事件格式不符');
  state.activated = entries.map(entry => ({
   world:String(entry.world ?? ''), uid:entry.uid ?? null, position:Number(entry.position),
   depth:entry.depth, role:entry.role, outletName:entry.outletName,
  }));
  state.report.worldInfo.activationEvents++;
  state.report.worldInfo.activatedEntries = entries.length;
 }
 function planChange(state, changes, container, key, kind, framed) {
  const target = container[key];
  if (!target || typeof target.value !== 'string')
   throw sourceError(state, 'NATIVE_LAYER_EXTENSION_API', '原生扩展提示格式不符', {key});
  const descriptor = Object.getOwnPropertyDescriptor(target, 'value');
  if (!descriptor || descriptor.writable !== true)
   throw sourceError(state, 'NATIVE_LAYER_EXTENSION_WRITE', '原生扩展提示不是可恢复的临时值', {key});
  const original = target.value;
  const wrapped = framed ?? pendingSource(state, original, kind);
  if (wrapped === original) return;
  changes.push({container, key, target, original, wrapped, kind});
 }
 function planAuthorsNote(state, changes, extensions) {
  if (!state.activated.some(entry => [2,3].includes(entry.position))) return;
  const policy = getAuthorsNotePolicy();
  if (policy?.enabled === false) {
   state.report.authorsNote = {status:'native-disabled'};
   return;
  }
  if (policy?.enabled !== true)
   throw sourceError(state, 'NATIVE_LAYER_NOTE_POLICY', '原生作者笔记启用状态未确认');
  if (!state.baseline?.present || typeof extensions[NOTE]?.value !== 'string')
   throw sourceError(state, 'NATIVE_LAYER_NOTE_BASELINE', '缺少本轮原生作者笔记基线');
  const before = policy.personaBefore ?? '', after = policy.personaAfter ?? '';
  if (typeof before !== 'string' || typeof after !== 'string')
   throw sourceError(state, 'NATIVE_LAYER_NOTE_POLICY', '用户人设笔记位置未提供原生文本');
  let value = extensions[NOTE].value;
  const prefix = before ? before + '\n' : '', suffix = after ? '\n' + after : '';
  if (prefix && !value.startsWith(prefix) || suffix && !value.endsWith(suffix))
   throw sourceError(state, 'NATIVE_LAYER_NOTE_PERSONA', '作者笔记的人设外侧与原生配置不符');
  value = value.slice(prefix.length, suffix ? -suffix.length : undefined);
  const original = state.baseline.value;
  let framed;
  if (!original) {
   framed = pendingSource(state, value, '世界书作者笔记资料');
  } else {
   const positions = occurrences(value, original);
   if (positions.length !== 1)
    throw sourceError(state, 'NATIVE_LAYER_NOTE_AMBIGUOUS', '作者笔记基线不能唯一定位，未猜测来源', {matches:positions.length});
   const at = positions[0];
   framed = pendingSource(state,value.slice(0, at), '世界书前置作者笔记资料')
    + original + pendingSource(state,value.slice(at + original.length), '世界书后置作者笔记资料');
  }
  state.report.authorsNote = {status:framed === value ? 'no-emitted-additions' : 'projected',
   baselineCharacters:original.length, beforePersona:!!before, afterPersona:!!after};
  planChange(state, changes, extensions, NOTE, '世界书作者笔记资料', prefix + framed + suffix);
 }
 function afterCombine(event = {}) {
  const state = current;
  if (!state || state.phase === 'passthrough' || event.dryRun) return;
  check(state);
  if (state.report.afterCombine) return audit();
  const extensions = context()?.extensionPrompts;
  if (!isObject(extensions) || Array.isArray(extensions))
   throw sourceError(state, 'NATIVE_LAYER_EXTENSION_API', '本轮原生扩展提示不可读');
  if (!state.report.worldInfo.entriesLoaded)
   throw sourceError(state, 'NATIVE_LAYER_SCAN_MISSING', '本轮世界书来源扫描尚未完成');
  const changes = [];
  for (const key of Object.keys(extensions)) {
   const kind = extensionKind(key);
   if (kind && extensions[key]?.value) planChange(state, changes, extensions, key, kind);
  }
  planAuthorsNote(state, changes, extensions);
  check(state);
  try {
   for (const entry of changes) {
    if (entry.container[entry.key] !== entry.target || entry.target.value !== entry.original)
     throw sourceError(state, 'NATIVE_LAYER_EXTENSION_STALE', '原生提示在包裹前变化', {key:entry.key});
    entry.target.value = entry.wrapped;
    state.changes.push(entry);
    state.report.extensions.push({key:entry.key, kind:entry.kind,
     position:entry.target.position, depth:entry.target.depth, role:entry.target.role,
     characters:entry.original.length});
   }
  } catch (error) {
   cleanup(state);
   if (!state.error) sourceError(state, 'NATIVE_LAYER_EXTENSION_WRITE', error.message);
   throw state.error;
  }
  state.phase = 'assembly';
  state.report.afterCombine = true;
  state.report.status = 'assembling';
  return audit();
 }
 function assertReady() {
  const state = current;
  if (!state) throw sourceError(null, 'NATIVE_LAYER_MISSING', '本轮原生资料适配尚未开始');
  if (state.phase === 'passthrough') return audit();
  check(state);
  if (!state.report.afterCombine || !state.report.managers)
   throw sourceError(state, 'NATIVE_LAYER_ASSEMBLY_MISSING', '本轮没有完成已确认的宿主资料装配');
  if (managerPrototype.preparePrompt !== prepareProjection || Message.createAsync !== createProjection)
   throw sourceError(state, 'NATIVE_LAYER_HOOK_CHANGED', '宿主资料接入方法在生成期间变化');
  if (typeof finalizeMessages === 'function'
   && (!installed.finalize || completionPrototype.getChat !== getChatProjection || !state.report.finalizations))
   throw sourceError(state, 'NATIVE_LAYER_FINALIZE_MISSING', '本轮最终原生消息层级投影没有完成');
  for (const entry of state.changes) {
   if (entry.container[entry.key] !== entry.target || entry.target.value !== entry.wrapped)
    throw sourceError(state, 'NATIVE_LAYER_EXTENSION_CHANGED', '临时原生资料已被其他装配器修改', {key:entry.key});
  }
  state.report.status = 'validated';
  return audit();
 }
 function audit() {
  return copy(current?.report ?? last ?? {status:'idle'});
 }
 function dispose() {
  const result = end();
  if (installed.prepare && managerPrototype.preparePrompt === prepareProjection)
   managerPrototype.preparePrompt = originalPrepare;
  if (installed.message && Message.createAsync === createProjection)
   Message.createAsync = originalCreate;
  if (installed.finalize && completionPrototype.getChat === getChatProjection)
   completionPrototype.getChat = originalGetChat;
  disposed = true;
  return result;
 }
 return {begin, entriesLoaded, activated, afterCombine, end, assertReady, audit, dispose};
}
