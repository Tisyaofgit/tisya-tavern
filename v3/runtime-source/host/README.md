# W24 TauriTavern 2.4.0 host adapter

This directory contains the new protocol host boundary. It does not restore the missing W22 application or claim Android device testing.

## Modules

- `worldbook-adapter.mjs`: worldbook A transport and original-store adapter. Uses the host's `saveWorldInfo(name, data, true)` queue and native UID factory, reads back through `/api/worldinfo/get`. Originals are stored once in `content`; metadata is held separately in `extensions.tisyaOriginal`. Every original remains disabled and has empty trigger keys.
- `table-storage.mjs`: worldbook B private ledger. One disabled entry holds the JSON ledger, including transaction receipts; its required owner metadata rejects another chat or branch. It implements `read()` and `compareAndWrite(expectedRevision, next)` for the runner.
- `floor-identities.mjs`: authoritative mapping in `chat_metadata.tisya_w24`, plus a top-level message marker. The marker survives native `swipe_info.extra` replacement and follows insertion/deletion. Native `api.chat.current.handle().stableId()` separates branches; copied branches retain the logical message ID but receive a distinct branch identity. Deleted IDs become tombstones. A deliberate native regenerate must call `bindReplacement` with its previously captured logical identity.
- `message-bridge.mjs`: reads the complete host message for native MVU ownership, extracts the one numbered body, writes A, and constructs archive task input. A plain new floor can obtain its native baseline from the original bridge’s nearest predecessor lookup; a floor with an original MVU update must supply its own completed snapshot. Its `sourceGuard` freezes branch, logical floor, displayed floor, swipe, full-message hash, and A's revision/hash. It shares native ownership detection with the runner; empty update wrappers do not claim an MVU write.
- `controller.mjs`: explicit normal, swipe generation, advanced reroll, swipe selection and deletion entrypoints. No generation failure gate is implemented through the host EventEmitter. Advanced reroll feedback gets one stable UUID per request ID and binds the target logical message ID and replaced revision. The complete instruction reaches the runner's preference source. Invalidations must return disjoint `activeSourceKeys` and `invalidatedSourceKeys`.
- `host-harness.mjs`: test-only, executes extracted 2.4.0 frontend modules with simulated native storage and Android base64 byte transport. No APK/native code runs.

## Assembly

```js
const transport = await loadBrowserWorldbookTransport(window);
const adapterA = createWorldbookOriginalAdapter({ transport });
const originals = createOriginalStore({ adapter: adapterA, bookId: 'Tisya A' });
const identities = createFloorIdentityManager(browserFloorIdentityDependencies(window));
const storageB = createWorldbookTableStorage({
  transport, bookId: 'Tisya B', owner: {chatId, branchId}, initialState,
});
const bridge = createMessageOriginalBridge({
  originals, identities,
  getContext: () => window.SillyTavern.getContext(),
  nativeRuntime: window.Mvu,
});
const preferenceStorage = createWorldbookPreferenceStorage({
  transport, bookId: 'Tisya P', registry,
});
const storage = createPreferenceOverlayStorage({
  sessionStorage: storageB, preferenceStorage,
});
const runner = createPreflightRunner({
  storage,
  requestA,
  bindArchiveParagraphs: originals.bindArchiveParagraphs,
  resolveEvidence: originals.resolveEvidence,
  sourceGuard: bridge.sourceGuard,
  native,
  query,
  writerB,
  acceptWriterOutput: bridge.acceptWriterOutput({ resolveFloor }),
});
const controller = createHostController({
  identities, run: runner.run, invalidate,
});
```

`resolveFloor({input, result})` returns the host floor into which `writerB` has already committed `result.output`. Acceptance checks the full message readback before saving its body in A. `acceptWriterOutput(null, snapshot, {recovery:true, receipt})` verifies A metadata and the currently selected live candidate without another writer call. Install runner acceptance once; controller's optional `finalize` is for standalone runners and is unnecessary with `acceptWriterOutput`.

Create archive input with `bridge.archiveSource({floor, sourceRevision, operationId, sourceKey})`. Repeated saves of one candidate retain `sourceRevision`; a new reroll candidate gets a new revision key. The returned raw text goes only to the archive task. The runner produces its own projected writer snapshot; do not forward the archive input to `writerB`.

Advanced reroll:

```js
await controller.advancedReroll({
  floor, userRequest, requestId, candidateRevision,
  input: preflightInput,
});
```

`invalidate(event)` must rebuild the retained source chain, remove the replaced candidate and affected successors, and return the new keys (plus refreshed preflight fields as needed). It owns table projection invalidation and explicit native snapshot restoration. Its source-chain/native-restore receipt is persisted by feedback ID; repeated requests reuse it without restoring MVU twice. An incomplete receipt blocks automatic replay. The controller refuses empty/overlapping receipts. The runner classifies the full reroll instruction into one-round directives and enduring preference candidates; no persistence checkbox is required.

## Persistence guarantee

A and B expose `managedSingleWriter:true`, `conditionalWrites:false`, `consistencyScope:'single-controller'`, `crossWindowAtomicity:false`. One controller serializes writes, checks the fresh document against the last observed version/content, and confirms direct disk readback. The native worldbook API has no compare-and-swap parameter. This implementation does not claim atomic exclusion of another app window or arbitrary external editor. Conflicts are surfaced, not silently retried. Failed host saves discard their pending working document so later host flushes cannot accidentally replay them.

## Reproducible host simulation

```sh
node --experimental-vm-modules --test w24/implementation/host/host.test.mjs
```

30 tests passed at this handoff. The suite covers actual 2.4.0 worldbook persistence/routes/byte framing, A/B readback, save failure, external edits, stale creates, branch/swap/insert/delete identity, advanced reroll feedback, source freeze, and output receipt recovery.

The factory `createExtractedHostHarness()` can be imported without running tests. It returns `{worldInfo, fetch, events, calls, logs, sources, disk, failure, putDisk, nativeBoundary}`. Use `createTauriWorldbookTransport({worldInfo:h.worldInfo, fetch:h.fetch})` to run A and B against that host path. Native storage, debounce scheduling, lifecycle registration and host identity are explicit stubs. The cross-module advanced reroll test is `w24/simulation/advanced-reroll.test.mjs`; its A/B responses are declared fixtures, and it exercises A/B/P, the real extracted MVU parser, native snapshot restoration, stable IDs, scored confirmation and idempotent retry. MVU parser execution evidence is separate in `w24/mvu-simulation`.
