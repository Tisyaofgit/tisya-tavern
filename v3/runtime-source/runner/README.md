# W24 preflight runner

This is the new V3-only preflight candidate. It uses the recovered repository's real simple-sheet codec, schema validation, ledger commit preparation and original MVU bridge. It does not restore the missing W22 product source or modify the old plugin UI.

## Public API

```js
import {createInitialState,createPreflightRunner} from './preflight-runner.mjs';

const initial = createInitialState({registry, rows});
const runner = createPreflightRunner({
  storage,                 // read(); compareAndWrite(expectedRevision,next)
  requestA,                // one invocation; returns grouped simple-sheet text
  bindArchiveParagraphs: args => originals.bindArchiveParagraphs(args),
  resolveEvidence: args => originals.resolveEvidence(args),
  native: {runtime: Mvu, eventSource, context},
  query,                   // (method,arguments,{input,view}) -> actual query receipt
  writerB,                 // writes the complete reply to its actual host message
  acceptWriterOutput,      // saves numbered body to A and returns original metadata
  guard,                   // synchronous live-context guard
  sourceGuard,             // async frozen full-message/branch/version guard
});
const delivered = await runner.run(input);
```

`run` returns `{snapshot, output, deliveryReceipt, reused:false}` after the writer's committed message has been saved to worldbook A. Repeating the same request returns `{snapshot, output:null, deliveryReceipt, reused:true}` without calling either model again. A changed input cannot reuse its request key.

The store owns a revision, immutable base view, commit journal, request journal, native intents and preference drafts. `compareAndWrite` must enforce the expected revision and make a durable write; the runner verifies full readback. A managed host writer can serialize one controller and check versions. That does not imply database-level atomicity across tabs. The actual host adapter must declare its concurrency boundary.

## Input

```js
{
  requestKey: 'request:unique',
  generationType: 'normal', // normal | swipe | advanced-reroll
  activeSourceKeys: ['user:0', 'assistant:candidate:1', 'user:2'],
  currentSourceKey: 'user:2', // optional; if supplied, retain it in the chain
  identity: {chatId, branchId, messageId},
  originalScope: {chatId, branchId},
  archiveSources: [{
    archiveSource: {key, text, floor, messageId, revision},
    originalReference: {entryId, revision, hash, paragraphs: []},
    sourceFreeze, // the host sourceGuard's frozen full-message identity
    userSources: [{key: 'user:0', text: 'Authorized preceding input'}],
    nativeBridge: {enabled: true, writer: 'native-mvu', index, nativeOwned: false},
    nativeState: {before: {stat_data: {}}, index, snapshotIndex},
  }],
  preferenceSources: [{key: 'user:2', text: 'Authorized creative feedback'}],
  preferencesEnabled: true,
  preferenceProjectionOptions: {context, world, persona, binding},
  worldWindow: null, // or the validated source-timed ready window
  queryCatalog: ['list_archive','describe_fields','search_archive','read_archive'],
  playerObjects: [],
  onstageObjects: [],
}
```

The caller supplies exact retained source keys. Source revisions are distinct from stable logical-message IDs. The host owns the floor-to-message binding and its index convention. `nativeState.index` and `snapshotIndex` are the actual MVU message indices.

For advanced rerolls add:

```js
advancedReroll: {
  id: stableFeedbackId,
  targetMessageId: logicalMessageId,
  replacedRevision: oldRevision,
  instruction: userRequest,
}
```

The runner authorizes that exact user request as `feedback:<id>`. It never treats the discarded candidate as creative feedback. The current instruction belongs to the request scope; only explicit continuing preferences become candidate contributions. The replacement candidate is excluded from `archiveSources`. Reprojection removes commits whose source, request context or dependency no longer belongs to the retained chain. MVU baselines must come from the retained predecessor state, not an old replacement candidate.

Ordinary feedback sources carry host-owned `preferenceOrigin:{chatId}`. The same source and preference group count once across branches of that chat; the same floor label in another chat is independent. UUID-style `feedback:` sources retain their independent identity. Retractions preserve the original contribution's origin and record the new feedback's origin separately.

## Model A and evidence

Model A receives the input plus the real current `view` and derived preference weights. It returns exactly eight roots in order:

`requestKey`, `archiveProposal`, `worldProposal`, `scope`, `preferenceCandidates`, `archiveRequests`, `creativeBrief`, `pending`.

No JSON wrapper, seven-root compatibility route, variable command output or automatic format repair call exists.

Archive changes select body evidence using `evidence:[1,3]`. `events.values.原文段号` optionally selects memorable paragraphs. The host binds both to the frozen original revision. Validation uses the exact smallest continuous source envelope temporarily; durable anchors retain the original paragraph reference, not copied prose.

A fact explicitly defined in an authorized preceding user input instead uses:

```js
evidence: {userSource: 'user:0', excerpt: 'Exact continuous short excerpt'}
```

This source must be listed in that archive item's `userSources` and precede the archived reply in `activeSourceKeys`. The current user request cannot silently become earlier history. User-source evidence remains a source key plus the short excerpt; it is never disguised as a body paragraph number.

## Commit order and recovery

The complete result is parsed and validated against a shadow view before any story writes. The runner then applies source-ordered archive batches, original MVU callbacks, world settlement, preference drafts and local archive reads before calling the writer.

Native writes use `bridgePatch` and `parseNativeTransaction`. The original parser and original callbacks run once. Their actual output supplies the native mappings; rejected requests block dependent delivery. `0`, `false`, `null`, callback adjustments and non-`stat_data` wrapper fields survive. A durable parsed intent allows recovery after native writeback succeeds but table persistence fails, without rerunning random or callback effects. A callback interrupted before its result is durable stays indeterminate and is not automatically replayed. Original-owned variable updates are never applied a second time.

World settlement uses post-archive scene time, exact row revisions, authorized offstage actors, explicit knowledge users, separate access fields and the real ledger. It cannot write native-owned values or overwrite world definitions. The knowledge check conservatively prevents widening restricted premises; public consequences and private motives should be separate records. The model remains responsible for the semantic truth and causal adequacy of the supplied prose.

A new ready world interval is rejected before model A when it overlaps an already retained settlement, even with a different request or source key. Adjacent intervals are allowed. The check runs again before world commit so an interrupted plan cannot repeat time settled by another request. Settlements removed by branch projection do not block the selected branch.

The active writer projection excludes completed/cancelled tasks, timers and activities and resolved/cancelled clues. Their stored rows and history remain available to explicit archive queries. Native values occur once in the writer snapshot. Preference candidates stay outside active preference rows until explicit confirmation through `preferences/service.mjs`.

The complete table registry is supplied to model A only. The writer receives current rows, native values, scope, creative brief and actual query results without filling schemas. Temporary IDs in archive/world references and access lists are resolved to their committed IDs before delivery.

Writer prose is never cached in the request journal. Explicit query payloads can contain requested original passages; only query receipt identities are persisted in the writer journal.

If the writer has already committed a host message but A-saving or final receipt persistence fails, recover its existing original-store receipt:

```js
await runner.recoverWriterOutput({requestKey, receipt});
```

This calls `acceptWriterOutput(null,snapshot,{recovery:true,receipt})`. The host verifies the existing A entry's scope, revision and hash; neither model runs again. A lost model-A response or unknown writer result is reported explicitly instead of being silently regenerated.

## Validation

Run `node --test w24/implementation/runner/runner.test.mjs` from the workspace root. The tests use the real codec, ledger, registry, original-store and MVU bridge. The MVU runtime in these unit tests is an explicit API-contract fixture; the separately maintained `w24/mvu-simulation` runs the extracted real MVU parser. Neither test category claims Android device validation.
