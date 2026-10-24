import { HostAdapterError } from './worldbook-adapter.mjs';

export const IDENTITY_NAMESPACE = 'tisya_w24';
export const MESSAGE_MARKER = 'tisya_w24_floor';
const copy = value => value == null ? value : structuredClone(value);
const fail = (code, message) => { throw new HostAdapterError(code, message); };

/** Metadata is authoritative; the top-level message marker follows insertions and survives swipe.extra replacement. */
export function createFloorIdentityManager({ getContext, getStableChatId, saveChat, readMetadata, uuid = () => globalThis.crypto.randomUUID() }) {
  for (const [name, fn] of Object.entries({ getContext, getStableChatId, saveChat, readMetadata })) if (typeof fn !== 'function') fail('HOST_DEPENDENCY', `${name} is required`);
  let tail = Promise.resolve();
  const serial = work => { const result = tail.then(work); tail = result.catch(() => {}); return result; };
  async function assertActive(ctx, stableId) {
    const live = getContext();
    if (live.chat !== ctx.chat || live.chatMetadata !== ctx.chatMetadata || await getStableChatId() !== stableId) fail('CHAT_CHANGED', 'Active chat changed during identity operation');
  }
  async function persist(ctx, state, previousState, previousMarkers) {
    try {
      await assertActive(ctx, state.branchId);
      ctx.chatMetadata[IDENTITY_NAMESPACE] = state;
      await saveChat(ctx);
      await assertActive(ctx, state.branchId);
      const actual = await readMetadata();
      if (JSON.stringify(actual?.[IDENTITY_NAMESPACE]) !== JSON.stringify(state)) fail('IDENTITY_READBACK', 'Floor identity metadata readback differs');
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
  async function capture() {
    const ctx = getContext();
    if (!Array.isArray(ctx?.chat) || !ctx.chatMetadata) fail('HOST_CONTEXT', 'Chat and metadata are required');
    const stableId = await getStableChatId();
    if (typeof stableId !== 'string' || stableId.length === 0) fail('CHAT_IDENTITY', 'Native stable chat ID is unavailable');
    await assertActive(ctx, stableId);
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
    if (JSON.stringify(previousState) !== JSON.stringify(state) || previousMarkers.some(([message, before]) => JSON.stringify(before) !== JSON.stringify(message[MESSAGE_MARKER]))) await persist(ctx, state, previousState, previousMarkers);
    return { ctx, state };
  }
  const identityAt = (state, floor) => {
    if (!Number.isInteger(floor) || !state.order[floor]) fail('FLOOR_NOT_FOUND', 'Requested floor is absent');
    return { chatId: state.chatId, branchId: state.branchId, messageId: state.order[floor] };
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
    recordInvalidation: change => serial(async () => {
      const { ctx, state } = await capture(), previousState = copy(state);
      if (change.identity && (change.identity.chatId !== state.chatId || change.identity.branchId !== state.branchId)) fail('CHAT_CHANGED', 'Invalidation belongs to another branch');
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
      await persist(ctx, state, previousState, []);
      return event;
    }),
    completeInvalidation: ({ id, receipt }) => serial(async () => {
      const { ctx, state } = await capture(), previousState = copy(state);
      const event = state.invalidations.find(item => item.id === id);
      if (!event || event.status !== 'pending') fail('INVALIDATION_STATE', 'No pending invalidation matches the completion');
      if (!receipt || !Array.isArray(receipt.activeSourceKeys) || !Array.isArray(receipt.invalidatedSourceKeys)) fail('INVALIDATION_RECEIPT', 'Source-chain invalidation receipt is incomplete');
      event.receipt = copy(receipt); event.status = 'applied';
      await persist(ctx, state, previousState, []);
      return copy(event.receipt);
    }),
    /** Explicit native regenerate handoff. Rebind only the intended replacement, never an unrelated append. */
    bindReplacement: ({ identity, floor }) => serial(async () => {
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
