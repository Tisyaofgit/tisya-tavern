import { HostAdapterError } from './worldbook-adapter.mjs';

/** Explicit entrypoints. Host EventEmitter catches throws, so it is not used as a failure gate. */
export function createHostController({ identities, run, invalidate, finalize }) {
  if (!identities || typeof run !== 'function' || typeof invalidate !== 'function') throw new HostAdapterError('HOST_DEPENDENCY', 'Identity manager, runner and invalidator are required');
  let tail = Promise.resolve();
  const serial = action => { const result = tail.then(action); tail = result.catch(() => {}); return result; };
  async function requireSettled() {
    const state = await identities.sync();
    if (state.invalidations.some(event => event.status !== 'applied')) throw new HostAdapterError('INVALIDATION_OUTCOME_UNKNOWN', 'A prior invalidation needs verified recovery before continuing');
  }
  async function deliver(input) {
    const result = await run(input);
    if (typeof finalize !== 'function' || result?.reused === true) return result;
    const originalReceipt = await finalize({ input, result });
    return { ...result, originalReceipt };
  }
  async function invalidateFrom(change) {
    const event = await identities.recordInvalidation(change);
    if (event.status === 'applied') return event.receipt;
    const result = await invalidate(event);
    if (!result || !Array.isArray(result.activeSourceKeys) || !Array.isArray(result.invalidatedSourceKeys)
      || [...result.activeSourceKeys, ...result.invalidatedSourceKeys].some(key => typeof key !== 'string' || !key)
      || result.activeSourceKeys.some(key => result.invalidatedSourceKeys.includes(key))) {
      throw new HostAdapterError('INVALIDATION_RECEIPT', 'Invalidation must return disjoint activeSourceKeys and invalidatedSourceKeys');
    }
    const receipt = { activeSourceKeys: result.activeSourceKeys, invalidatedSourceKeys: result.invalidatedSourceKeys,
      ...(result.nativeRestore === undefined ? {} : { nativeRestore: result.nativeRestore }) };
    return identities.completeInvalidation({ id: event.id, receipt });
  }
  return Object.freeze({
    generate: input => serial(async () => { await requireSettled(); return deliver(input); }),
    swipe: input => serial(async () => { await requireSettled(); return deliver({ ...input, generationType: 'swipe' }); }),
    advancedReroll: ({ floor, userRequest, requestId, candidateRevision, input = {} }) => serial(async () => {
      const { identity, advancedReroll } = await identities.recordFeedback({ floor, userRequest, requestId, candidateRevision });
      const fresh = await invalidateFrom({ reason: 'advanced-reroll', identity, fromFloor: floor, replacedRevision: candidateRevision, feedbackId: advancedReroll.id });
      // run owns writerB; no second narrative writer is called here.
      const archiveSources = input.archiveSources?.filter(source => fresh.activeSourceKeys.includes(source.archiveSource.key));
      return deliver({ ...input, ...fresh, ...(archiveSources ? { archiveSources } : {}), generationType: 'advanced-reroll', identity, advancedReroll });
    }),
    switchSwipe: ({ floor, swipeId, switchNative }) => serial(async () => {
      await requireSettled();
      if (!Number.isInteger(swipeId) || swipeId < 0 || typeof switchNative !== 'function') throw new HostAdapterError('SWIPE_REQUEST', 'A native switch function and valid swipe ID are required');
      const identity = await identities.resolve(floor);
      await switchNative({ floor, swipeId });
      const after = await identities.resolve(floor);
      if (JSON.stringify(identity) !== JSON.stringify(after)) throw new HostAdapterError('FLOOR_CHANGED', 'Swipe changed the logical floor identity');
      const fresh = await invalidateFrom({ reason: 'swipe', identity, fromFloor: floor, swipeId });
      return { identity, ...fresh };
    }),
    deleteFloor: ({ floor, deleteNative }) => serial(async () => {
      await requireSettled();
      if (typeof deleteNative !== 'function') throw new HostAdapterError('DELETE_REQUEST', 'A native deletion function is required');
      const identity = await identities.resolve(floor);
      await deleteNative({ floor });
      const state = await identities.sync();
      if (!state.tombstones[identity.messageId]) throw new HostAdapterError('DELETE_READBACK', 'Deleted logical floor is still active');
      const fresh = await invalidateFrom({ reason: 'delete', identity, fromFloor: floor });
      return { identity, ...fresh };
    }),
  });
}
