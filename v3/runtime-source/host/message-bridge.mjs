import { sha256Utf16,parseHistoricalBody } from '../originals/original-store.mjs';
import { HostAdapterError } from './worldbook-adapter.mjs';
import { MESSAGE_MARKER } from './floor-identities.mjs';
import { hasNativeUpdate, bridgeInput } from '../../../tables/native-bridge.js';

const copy = value => value == null ? value : structuredClone(value);
const check = (ok, code, message) => { if (!ok) throw new HostAdapterError(code, message); };
export { hasNativeUpdate };

export function extractNumberedBody(fullMessage) {
  check(typeof fullMessage === 'string', 'REPLY_FORMAT', 'A complete reply string is required');
  const matches = [...fullMessage.matchAll(/<body\b[^>]*>([\s\S]*?)<\/body\s*>/gi)];
  check(matches.length === 1, 'REPLY_FORMAT', 'Reply must contain exactly one body block');
  return matches[0][1];
}

/** Raw text stays in worldbook A and archive task input. This bridge returns no narrative prompt. */
export function createMessageOriginalBridge({ originals, identities, getContext, nativeRuntime = null, digest = sha256Utf16 }) {
  check(originals && identities && typeof getContext === 'function', 'HOST_DEPENDENCY', 'Original store, identity manager and context are required');
  async function existing(identity) {
    const entryId = await originals.entryIdFor(identity);
    try { return await originals.metadata({ entryId, scope: { chatId: identity.chatId, branchId: identity.branchId }, includeDeleted: true }); }
    catch (error) { if (error.code === 'SOURCE_NOT_FOUND') return null; throw error; }
  }
  async function saveFloor({ floor, operationId, sourceRevision, historical = false }) {
    const identity = await identities.resolve(floor), context = getContext(), message = context.chat[floor];
    check(message && !message.is_user && !message.is_system, 'SOURCE_ROLE', 'Only assistant narrative bodies are archived');
    const fullMessage = message.mes, swipeId = message.swipe_id ?? 0;
    const content = historical ? fullMessage : extractNumberedBody(fullMessage), nativeOwned = hasNativeUpdate(fullMessage);
    const previous = await existing(identity);
    const receipt = await originals[historical ? 'putHistory' : 'put']({ identity, content, operationId, sourceRevision, expectedVersion: previous?.version ?? 0, displayFloor: floor });
    check(getContext().chat === context.chat && context.chat[floor] === message && message.mes === fullMessage && (message.swipe_id ?? 0) === swipeId, 'SOURCE_CHANGED', 'Reply changed while original was being saved');
    return { ...receipt, nativeOwned, candidate: { fullMessageHash: await digest(fullMessage), swipeId } };
  }
  async function archiveSource({ floor, sourceRevision, operationId, sourceKey, enableNativeBridge = true, historical = false }) {
    const saved = await saveFloor({ floor, sourceRevision, operationId, historical });
    const context = getContext(), message = context.chat[floor], identity = await identities.resolve(floor);
    const scope = { chatId: identity.chatId, branchId: identity.branchId };
    const reference = { entryId: saved.entryId, revision: saved.revision, hash: saved.hash, paragraphs: [] };
    const source = await originals.read({ entryId: saved.entryId, scope, purpose: 'archive-task', reference });
    const key = sourceKey ?? `original:${saved.entryId}:${saved.revision}`;
    const item = {
      archiveSource: { key, text: source.content, floor, messageId: identity.messageId, revision: saved.revision, ...(historical ? {format:'historical',paragraphs:parseHistoricalBody(source.content).map(p=>({number:p.number,text:source.content.slice(p.contentStart,p.contentEnd)}))} : {}) },
      originalReference: reference,
      sourceFreeze: { identity, fullMessageHash: await digest(message.mes), swipeId: message.swipe_id ?? 0 },
      nativeBridge: { nativeOwned: saved.nativeOwned, enabled: Boolean(!historical && enableNativeBridge && nativeRuntime), writer: nativeRuntime ? 'native-mvu' : null, index: floor },
    };
    if (nativeRuntime && !historical) {
      if (saved.nativeOwned) {
        const before = nativeRuntime.getMvuData({ type: 'message', message_id: floor });
        check(before && typeof before.stat_data === 'object', 'MVU_BASELINE', 'Original MVU owner has not supplied this floor snapshot');
        item.nativeState = { before: copy(before), index: floor, snapshotIndex: floor };
      } else {
        const baseline = bridgeInput(context, nativeRuntime, floor);
        item.nativeState = { before: copy(baseline.data), index: baseline.index, snapshotIndex: baseline.snapshotIndex };
      }
    }
    return item;
  }
  async function sourceGuard(input) {
    check(input && Array.isArray(input.archiveSources), 'SOURCE_FREEZE', 'Archive source list is required');
    const branch = await identities.asyncNativeStableId();
    if (input.originalScope) check(input.originalScope.branchId === branch, 'CHAT_CHANGED', 'Archive request belongs to another branch');
    for (const source of input.archiveSources) {
      const freeze = source.sourceFreeze;
      check(freeze?.identity && freeze.identity.branchId === branch, 'SOURCE_FREEZE', 'Source has no matching frozen branch identity');
      const context = getContext();
      const floor = context.chat.findIndex(message => message[MESSAGE_MARKER]?.branchId === branch && message[MESSAGE_MARKER]?.id === freeze.identity.messageId);
      check(floor >= 0, 'SOURCE_CHANGED', 'Frozen source floor was deleted');
      const message = context.chat[floor];
      check((message.swipe_id ?? 0) === freeze.swipeId && await digest(message.mes) === freeze.fullMessageHash, 'SOURCE_CHANGED', 'Frozen source candidate changed');
      check(source.archiveSource.messageId === freeze.identity.messageId && source.archiveSource.floor === floor, 'SOURCE_CHANGED', 'Frozen source floor position changed');
      check(source.nativeBridge?.nativeOwned === hasNativeUpdate(message.mes), 'MVU_OWNERSHIP', 'Full-message native ownership changed');
      const actual = await originals.read({ entryId: source.originalReference.entryId, scope: input.originalScope, purpose: 'archive-task', reference: source.originalReference });
      check(actual.content === source.archiveSource.text, 'SOURCE_CHANGED', 'Archive task text differs from worldbook A');
    }
  }
  /** resolveFloor verifies that writer output has already been committed to its host message. */
  function finalizer({ resolveFloor }) {
    check(typeof resolveFloor === 'function', 'HOST_DEPENDENCY', 'Output floor resolver is required');
    return async ({ input, result }) => {
      const floor = await resolveFloor({ input, result });
      check(Number.isInteger(floor) && floor >= 0, 'OUTPUT_FLOOR', 'Committed output floor is unavailable');
      const text = typeof result.output === 'string' ? result.output : result.output?.text;
      check(typeof text === 'string' && getContext().chat[floor]?.mes === text, 'OUTPUT_READBACK', 'Committed host message differs from writer output');
      return saveFloor({ floor, operationId: `output:${input.requestKey}`, sourceRevision: `candidate:${input.requestKey}` });
    };
  }
  function acceptWriterOutput({ resolveFloor }) {
    const finalize = finalizer({ resolveFloor });
    return async (output, snapshot, options = {}) => {
      if (options.recovery === true) {
        const receipt = options.receipt;
        check(receipt?.entryId && receipt.identity, 'OUTPUT_RECEIPT', 'Original output receipt is required for recovery');
        const branchId = await identities.asyncNativeStableId();
        check(receipt.identity.branchId === branchId, 'CHAT_CHANGED', 'Output receipt belongs to another branch');
        const current = await originals.metadata({ entryId: receipt.entryId, scope: { chatId: receipt.identity.chatId, branchId } });
        check(['entryId', 'version', 'revision', 'hash'].every(key => current[key] === receipt[key]) && current.deleted === false,
          'OUTPUT_RECEIPT_CHANGED', 'Saved output original differs from its receipt');
        const message = getContext().chat.find(message => message[MESSAGE_MARKER]?.branchId === branchId && message[MESSAGE_MARKER]?.id === receipt.identity.messageId);
        check(message && receipt.candidate && (message.swipe_id ?? 0) === receipt.candidate.swipeId
          && await digest(message.mes) === receipt.candidate.fullMessageHash && await digest(extractNumberedBody(message.mes)) === receipt.hash,
          'OUTPUT_RECEIPT_CHANGED', 'Current host candidate differs from the accepted output');
        return { ...copy(receipt), ...current, nativeOwned: receipt.nativeOwned === true, candidate: copy(receipt.candidate) };
      }
      return finalize({ input: snapshot, result: { output } });
    };
  }
  return Object.freeze({ saveFloor, archiveSource, sourceGuard, finalizer, acceptWriterOutput });
}
