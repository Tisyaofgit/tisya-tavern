import { HostAdapterError } from './worldbook-adapter.mjs';
import { sameJsonValue } from './json-value.mjs';

export const IDENTITY_NAMESPACE = 'tisya_w24';
export const MESSAGE_MARKER = 'tisya_w24_floor';
const copy = value => value == null ? value : structuredClone(value);
const fail = (code, message) => { throw new HostAdapterError(code, message); };
// Rebuilding a controller around the same working metadata is not a disk
// reload and must not erase an uncertain preparation result.
const unknownPreparations = new WeakMap();

/** Metadata is authoritative; the top-level message marker follows insertions and survives swipe.extra replacement. */
export function createFloorIdentityManager({ getContext, getStableChatId, saveChat, savePreparation = saveChat, saveCompletion = saveChat, readMetadata, captureSaveReadback = null, captureCompletionReadback = null, uuid = () => globalThis.crypto.randomUUID() }) {
  for (const [name, fn] of Object.entries({ getContext, getStableChatId, saveChat, savePreparation, saveCompletion, readMetadata })) if (typeof fn !== 'function') fail('HOST_DEPENDENCY', `${name} is required`);
  if (captureSaveReadback !== null && typeof captureSaveReadback !== 'function') fail('HOST_DEPENDENCY', 'captureSaveReadback must be a function');
  if (captureCompletionReadback !== null && typeof captureCompletionReadback !== 'function') fail('HOST_DEPENDENCY', 'captureCompletionReadback must be a function');
  let tail = Promise.resolve();
  const serial = work => { const result = tail.then(work); tail = result.catch(() => {}); return result; };
  function assertPreparationKnown() {
    const metadata = getContext()?.chatMetadata;
    const preparationOutcomeUnknown = metadata && typeof metadata === 'object' ? unknownPreparations.get(metadata) : null;
    if (!preparationOutcomeUnknown) return;
    const error = new HostAdapterError('INVALIDATION_OUTCOME_UNKNOWN', 'A preparation save has an unknown outcome; reload the native chat from disk before continuing', copy(preparationOutcomeUnknown));
    error.recovery = 'reload-required';
    throw error;
  }
  function assertContext(ctx) {
    const live = getContext();
    if (live.chat !== ctx.chat || live.chatMetadata !== ctx.chatMetadata) fail('CHAT_CHANGED', 'Active chat changed during identity operation');
  }
  async function assertActive(ctx, stableId) {
    assertContext(ctx);
    const actual = await getStableChatId();
    assertContext(ctx);
    if (actual !== stableId) fail('CHAT_CHANGED', 'Active chat changed during identity operation');
  }
  async function persist(ctx, state, previousState, previousMarkers, save = saveChat, verifyAdditionalMetadata = null) {
    try {
      // capture already read the stable ID; no asynchronous work intervenes.
      assertContext(ctx);
      ctx.chatMetadata[IDENTITY_NAMESPACE] = state;
      const verifySaveMetadata = captureSaveReadback?.(ctx) ?? null;
      if (verifySaveMetadata !== null && typeof verifySaveMetadata !== 'function') fail('HOST_DEPENDENCY', 'captureSaveReadback must return a synchronous validator');
      await save(ctx);
      const [, actual] = await Promise.all([assertActive(ctx, state.branchId), readMetadata()]);
      assertContext(ctx);
      if (!sameJsonValue(actual?.[IDENTITY_NAMESPACE], state)) fail('IDENTITY_READBACK', 'Floor identity metadata readback differs');
      if (verifySaveMetadata) verifySaveMetadata(actual);
      if (verifyAdditionalMetadata) verifyAdditionalMetadata(actual);
    } catch (error) {
      if (getContext().chatMetadata === ctx.chatMetadata) {
        if (previousState === undefined) delete ctx.chatMetadata[IDENTITY_NAMESPACE]; else ctx.chatMetadata[IDENTITY_NAMESPACE] = previousState;
        for (const [message, marker] of previousMarkers) {
          if (marker === undefined) delete message[MESSAGE_MARKER]; else message[MESSAGE_MARKER] = marker;
        }
      }
      throw error;
    }
  }
  async function capture({persistChanges = true} = {}) {
    assertPreparationKnown();
    const ctx = getContext();
    if (!Array.isArray(ctx?.chat) || !ctx.chatMetadata) fail('HOST_CONTEXT', 'Chat and metadata are required');
    const stableId = await getStableChatId();
    if (typeof stableId !== 'string' || stableId.length === 0) fail('CHAT_IDENTITY', 'Native stable chat ID is unavailable');
    assertContext(ctx);
    const previousState = copy(ctx.chatMetadata[IDENTITY_NAMESPACE]);
    const previousMarkers = ctx.chat.map(message => [message, copy(message[MESSAGE_MARKER])]);
    const old = previousState?.schema === 'tisya.floor-identities/1' ? previousState : null;
    const forked = Boolean(old && old.branchId !== stableId);
    const state = old && !forked ? copy(old) : {
      schema: 'tisya.floor-identities/1', chatId: old?.chatId ?? stableId, branchId: stableId,
      parentBranchId: forked ? old.branchId : null, order: [], rows: {}, tombstones: {}, feedback: {}, invalidations: [],
    };
    const seen = new Set(), order = [];
    for (let index = 0; index < ctx.chat.length; index++) {
      const message = ctx.chat[index], marker = message[MESSAGE_MARKER];
      let id = marker && (marker.branchId === stableId || (forked && marker.branchId === old.branchId)) ? marker.id : null;
      if (typeof id !== 'string' || !id || seen.has(id) || state.tombstones[id]) id = `floor:${uuid()}`;
      seen.add(id); order.push(id);
      message[MESSAGE_MARKER] = { branchId: stableId, id };
      state.rows[id] = { id, floor: index, role: message.is_user ? 'user' : message.is_system ? 'system' : 'assistant' };
    }
    for (const [id, row] of Object.entries(state.rows)) if (!seen.has(id)) {
      state.tombstones[id] = { ...row, deleted: true };
      delete state.rows[id];
    }
    state.order = order;
    if (persistChanges && (!sameJsonValue(previousState, state) || previousMarkers.some(([message, before]) => !sameJsonValue(before, message[MESSAGE_MARKER])))) await persist(ctx, state, previousState, previousMarkers);
    return { ctx, state, previousState, previousMarkers };
  }
  const identityAt = (state, floor) => {
    if (!Number.isInteger(floor) || !state.order[floor]) fail('FLOOR_NOT_FOUND', 'Requested floor is absent');
    return { chatId: state.chatId, branchId: state.branchId, messageId: state.order[floor] };
  };
  const persistPreparation = async (ctx, state, previousState, previousMarkers) => {
    // Only preparation offers a metadata-only save: no native invalidation has
    // run yet. Reconciled markers, inserted floors or role/order repairs still
    // require the real chat payload. Other identity mutations keep saveChat.
    const nativeMessagesChanged = previousMarkers.some(([message, before]) => !sameJsonValue(before, message[MESSAGE_MARKER]))
      || !sameJsonValue(previousState?.order, state.order) || !sameJsonValue(previousState?.rows, state.rows);
    const metadata = ctx.chatMetadata;
    let attempted = false;
    try {
      return await persist(ctx, state, previousState, previousMarkers, saved => {
        attempted = true;
        return savePreparation(saved, {nativeMessagesChanged});
      });
    } catch (error) {
      // Rolling back the working copy cannot undo a possibly committed native
      // write. Do not let another capture overwrite that unresolved intent.
      if (attempted) {
        const preparationOutcomeUnknown = {recovery: 'reload-required', operation: 'advanced-reroll-preparation', branchId: state.branchId,
          pendingInvalidationIds: state.invalidations.filter(event => event.status !== 'applied').map(event => event.id)};
        unknownPreparations.set(metadata, preparationOutcomeUnknown);
        if (error && typeof error === 'object') try {
          error.recovery = 'reload-required';
          error.details = {...error.details, ...copy(preparationOutcomeUnknown)};
        } catch {} // Keep the original exception even if the host froze it.
      }
      throw error;
    }
  };
  return Object.freeze({
    sync: () => serial(async () => { const { state } = await capture(); return copy(state); }),
    resolve: floor => serial(async () => { const { state } = await capture(); return identityAt(state, floor); }),
    asyncNativeStableId: getStableChatId,
    recordFeedback: ({ floor, requestId, userRequest, candidateRevision }) => serial(async () => {
      if (typeof requestId !== 'string' || !requestId || typeof userRequest !== 'string' || !userRequest.trim() || !Number.isInteger(candidateRevision) || candidateRevision < 1) fail('REROLL_REQUEST', 'Reroll requires requestId, instruction and positive candidate revision');
      const { ctx, state } = await capture(), identity = identityAt(state, floor);
      if (state.rows[identity.messageId].role !== 'assistant') fail('REROLL_TARGET', 'Advanced reroll must target an assistant floor');
      const previousState = copy(state), known = state.feedback[requestId];
      const payload = { targetMessageId: identity.messageId, replacedRevision: candidateRevision, instruction: userRequest };
      if (known && Object.keys(payload).some(key => payload[key] !== known[key])) fail('FEEDBACK_ID_REUSE', 'Request ID was already used for different feedback');
      const feedback = known ?? { id: uuid(), ...payload };
      if (!known) { state.feedback[requestId] = feedback; await persist(ctx, state, previousState, []); }
      return { identity, advancedReroll: copy(feedback) };
    }),
    /** Persist feedback and the pending invalidation together, before any source/native effect. */
    prepareAdvancedReroll: ({ floor, requestId, userRequest, candidateRevision }) => serial(async () => {
      if (typeof requestId !== 'string' || !requestId || typeof userRequest !== 'string' || !userRequest.trim() || !Number.isInteger(candidateRevision) || candidateRevision < 1) fail('REROLL_REQUEST', 'Reroll requires requestId, instruction and positive candidate revision');
      const { ctx, state, previousState, previousMarkers } = await capture({persistChanges: false});
      let committed = false;
      try {
        const identity = identityAt(state, floor);
        if (state.rows[identity.messageId].role !== 'assistant') fail('REROLL_TARGET', 'Advanced reroll must target an assistant floor');
        if (state.invalidations.some(event => event.status !== 'applied')) fail('INVALIDATION_OUTCOME_UNKNOWN', 'A prior invalidation has no durable completion receipt; verify its effects before continuing');
        const known = state.feedback[requestId];
        const payload = { targetMessageId: identity.messageId, replacedRevision: candidateRevision, instruction: userRequest };
        if (known && Object.keys(payload).some(key => payload[key] !== known[key])) fail('FEEDBACK_ID_REUSE', 'Request ID was already used for different feedback');
        const feedback = known ?? { id: uuid(), ...payload };
        const existing = state.invalidations.find(event => event.feedbackId === feedback.id && event.reason === 'advanced-reroll');
        if (existing) {
          if (!sameJsonValue(existing.identity, identity) || existing.fromFloor !== floor || existing.replacedRevision !== candidateRevision) fail('FEEDBACK_ID_REUSE', 'Request ID was already invalidated for another candidate');
          // An applied request is reusable, but unrelated inserted/repaired
          // markers still require their own real save before returning it.
          if (!sameJsonValue(previousState, state) || previousMarkers.some(([message, before]) => !sameJsonValue(before, message[MESSAGE_MARKER]))) {
            await persistPreparation(ctx, state, previousState, previousMarkers);
            committed = true;
          }
          return { identity, advancedReroll: copy(feedback), event: copy(existing) };
        }
        state.feedback[requestId] = feedback;
        const event = { id: `invalidation:${uuid()}`, reason: 'advanced-reroll', identity: copy(identity), fromFloor: floor,
          replacedRevision: candidateRevision, feedbackId: feedback.id, branchId: state.branchId, status: 'pending' };
        state.invalidations.push(event);
        // This save includes any marker reconciliation from capture. Neither a
        // save return value nor an unverified local state is a pending receipt.
        await persistPreparation(ctx, state, previousState, previousMarkers);
        committed = true;
        return { identity, advancedReroll: copy(feedback), event: copy(event) };
      } finally {
        if (!committed && getContext().chat === ctx.chat && getContext().chatMetadata === ctx.chatMetadata) for (const [message, marker] of previousMarkers) {
          if (marker === undefined) delete message[MESSAGE_MARKER]; else message[MESSAGE_MARKER] = marker;
        }
      }
    }),
    recordInvalidation: change => serial(async () => {
      const { ctx, state, previousState, previousMarkers } = await capture({persistChanges: false});
      let committed = false;
      try {
      if (change.identity && (change.identity.chatId !== state.chatId || change.identity.branchId !== state.branchId)) fail('CHAT_CHANGED', 'Invalidation belongs to another branch');
      if (change.reason === 'delete' && change.identity && !state.tombstones[change.identity.messageId]) fail('DELETE_READBACK', 'Deleted logical floor is still active');
      if (state.invalidations.some(event => event.status !== 'applied')) fail('INVALIDATION_OUTCOME_UNKNOWN', 'A prior invalidation has no durable completion receipt; verify its effects before continuing');
      if (change.feedbackId) {
        const existing = state.invalidations.find(event => event.feedbackId === change.feedbackId && event.reason === change.reason);
        if (existing) {
          if (existing.status !== 'applied') fail('INVALIDATION_OUTCOME_UNKNOWN', 'An earlier invalidation has no durable completion receipt; verify its effects before recovery');
          return copy(existing);
        }
      }
      const event = { id: `invalidation:${uuid()}`, ...copy(change), branchId: state.branchId, status: 'pending' };
      state.invalidations.push(event);
      await persist(ctx, state, previousState, previousMarkers);
      committed = true;
      return event;
      } finally {
        if (!committed && getContext().chat === ctx.chat && getContext().chatMetadata === ctx.chatMetadata) for (const [message, marker] of previousMarkers) {
          if (marker === undefined) delete message[MESSAGE_MARKER]; else message[MESSAGE_MARKER] = marker;
        }
      }
    }),
    completeInvalidation: ({ id, receipt }) => serial(async () => {
      const { ctx, state } = await capture(), previousState = copy(state);
      const event = state.invalidations.find(item => item.id === id);
      if (!event || event.status !== 'pending') fail('INVALIDATION_STATE', 'No pending invalidation matches the completion');
      if (!receipt || !Array.isArray(receipt.activeSourceKeys) || !Array.isArray(receipt.invalidatedSourceKeys)) fail('INVALIDATION_RECEIPT', 'Source-chain invalidation receipt is incomplete');
      event.receipt = copy(receipt); event.status = 'applied';
      // The pending record already persisted the native deletion and markers.
      // Hosts may commit this metadata-only completion without rewriting prose.
      // An explicit host validator can check other namespaces against this same
      // fresh readback. Save return values are never accepted as disk evidence.
      const verifyAdditionalMetadata = captureCompletionReadback?.(ctx) ?? null;
      if (verifyAdditionalMetadata !== null && typeof verifyAdditionalMetadata !== 'function') fail('HOST_DEPENDENCY', 'captureCompletionReadback must return a synchronous validator');
      await persist(ctx, state, previousState, [], saveCompletion, verifyAdditionalMetadata);
      return copy(event.receipt);
    }),
    /** Explicit native regenerate handoff. Rebind only the intended replacement, never an unrelated append. */
    bindReplacement: ({ identity, floor }) => serial(async () => {
      assertPreparationKnown();
      const ctx = getContext(), stableId = await getStableChatId();
      const state = copy(ctx.chatMetadata?.[IDENTITY_NAMESPACE]);
      if (!state || identity.branchId !== stableId || identity.chatId !== state.chatId || state.branchId !== stableId) fail('CHAT_CHANGED', 'Replacement belongs to another branch');
      if (!ctx.chat[floor] || ctx.chat[floor].is_user || ctx.chat[floor].is_system || !state.rows[identity.messageId] && !state.tombstones[identity.messageId]) fail('REPLACEMENT_IDENTITY', 'No matching assistant floor to replace');
      if (ctx.chat.some((message, index) => index !== floor && message[MESSAGE_MARKER]?.id === identity.messageId)) fail('REPLACEMENT_IDENTITY', 'Logical floor remains elsewhere');
      const previousState = copy(state), previousMarkers = [[ctx.chat[floor], copy(ctx.chat[floor][MESSAGE_MARKER])]];
      const displaced = ctx.chat[floor][MESSAGE_MARKER]?.id;
      if (displaced && displaced !== identity.messageId && state.rows[displaced]) { state.tombstones[displaced] = { ...state.rows[displaced], deleted: true }; delete state.rows[displaced]; }
      ctx.chat[floor][MESSAGE_MARKER] = { branchId: stableId, id: identity.messageId };
      delete state.tombstones[identity.messageId];
      state.rows[identity.messageId] = { id: identity.messageId, floor, role: 'assistant' };
      state.order[floor] = identity.messageId;
      await persist(ctx, state, previousState, previousMarkers);
      return copy(identity);
    }),
  });
}

export function browserFloorIdentityDependencies(hostWindow = window) {
  const api = () => hostWindow.__TAURITAVERN__?.api?.chat;
  return {
    getContext: () => hostWindow.SillyTavern.getContext(),
    getStableChatId: () => api().current.handle().stableId(),
    saveChat: ctx => ctx.saveChat(),
    readMetadata: () => api().current.handle().metadata.get(),
  };
}
