# W24 original body store

This module stores complete numbered narrative bodies in one dedicated, disabled worldbook A. It does not own story facts, state variables, preferences, or MVU updates. The memory adapter is a test fixture. The host adapter and archive runner live in their own implementation directories.

## Identity and replacement

The host supplies `{chatId, branchId, messageId}`. `messageId` is a persistent logical-message token, not its visible floor index. Insertions and floor renumbering retain this token. Ordinary and advanced rerolls of that logical message retain it too. A fork has a different `branchId`.

`entryId` is `original:` plus SHA-256 over the UTF-16LE representation of the JSON array `[bookId, chatId, branchId, messageId]`. The same logical message in the same branch always resolves to the same entry. Raw prose is not duplicated into another canonical database by this module.

Two versions have separate purposes:

| Field | Changes when |
| --- | --- |
| `version` | Any persisted record update, including display-floor metadata |
| `revision` | Body changes, host `sourceRevision` changes, deletion, or restoration |

The host keeps `sourceRevision` stable for repeated saves of the same message generation. A reroll supplies a new generation token even if its text happens to match. Repeated identical saves do not increment `revision` or `version`. An identical `operationId` retry returns the previous receipt; reusing that operation for different data is rejected.

Deletion tombstones the source entry. It does not delete story-history facts or their references. References to deleted sources return `SOURCE_DELETED`; references to replaced generations return `STALE_REFERENCE`, including after restoring a deleted entry. Neither error is repaired by silently pointing old paragraph numbers at new prose.

## Numbering and exact text

Only numbered bodies are accepted. Paragraph numbers run from `1` through `N`, once each. Both `1 text` and a number on its own line followed by text are supported. There is no legacy fallback, automatic numbering, trimming, line-ending conversion, or normalization.

Offsets use JavaScript UTF-16 code units. Hashes use SHA-256 of UTF-16LE code units; this preserves distinctions involving CRLF, LF, Unicode normalization, astral characters, and lone surrogates. Blank margins and paragraph separators may contain horizontal Unicode whitespace. Fenced blocks retain their internal blank lines and number-looking text. An unnumbered additional paragraph outside a fence is rejected.

The complete body remains byte-for-code-unit identical as a JavaScript string. A paragraph excerpt excludes its numeric marker and separator blank lines, retaining the paragraph's content and internal line breaks. Every excerpt includes source offsets. Nonconsecutive selections must be strictly ascending, for example `[1,3]`, and return complete paragraphs in source order.

## Adapter

```js
import { createOriginalStore } from './original-store.mjs';

const originals = createOriginalStore({ adapter, bookId: 'Tisya-W24-originals-A' });
```

Required asynchronous methods:

```js
adapter.read({ bookId, id }); // canonical entry or null
adapter.create({ bookId, id, expectedVersion: 0, entry }); // {id, version}
adapter.update({ bookId, id, expectedVersion, entry });    // {id, version}
adapter.list({ bookId, scope: {chatId, branchId} });       // canonical entries
```

The adapter declares `capabilities.uniqueIds: true` plus one of:

```js
{ conditionalWrites: true }
// Or, for a host without native atomic conditional updates:
{ conditionalWrites: false,
  managedSingleWriter: true,
  consistencyScope: 'single-controller' }
```

The managed writer serializes mutations, freshly checks stored version/content before writing, and directly reads back the result. That capability does not promise cross-window atomic CAS. `originals.writeGuarantee` reports `conditional-writes` or `managed-single-writer`. The module also serializes its own instance's operations and verifies write receipts and complete readback. A mismatch fails explicitly; it does not fabricate rollback or silently retry.

Canonical entries contain `id`, `bookId`, `version`, `content`, disabled-injection flags, and `original` metadata. A host may place the metadata in its native worldbook extension fields and reconstruct this canonical object on reads. The native worldbook entry's effective flags must remain disabled as well:

```js
{ disable: true, constant: false, key: [], keysecondary: [], probability: 0 }
```

`original` contains `schema: 'tisya.original/1'`, identity, `revision`, `hash`, `format: 'numbered'`, paragraph offsets, `sourceRevision`, optional `displayFloor`, `deleted`, and `lastMutation`. An enabled entry, mismatched hash, malformed index, or wrong scope causes a hard failure.

## Save and freeze an archive source

```js
const receipt = await originals.put({
  identity: {chatId, branchId, messageId},
  content: exactBody,
  sourceRevision: generationToken,
  operationId: saveOperationToken,
  expectedVersion: 0, // current metadata.version for updates
  displayFloor: visibleFloor,
});

const source = {
  entryId: receipt.entryId,
  revision: receipt.revision,
  hash: receipt.hash,
  paragraphs: [],
};
```

Freeze `source` in the archive task before sending its raw body to API A. Every binding and evidence read rechecks that frozen revision and hash. If the user rerolls during processing, binding fails as stale and the host must rebuild the task from the current generation.

API A supplies only paragraph numbers:

```json
{
  "changes": [{
    "table": "events",
    "id": "new:evt",
    "values": {"名称": "修伞进展", "原文段号": [1, 3]},
    "evidence": [1, 3]
  }]
}
```

The host binds the transient event selection:

```js
const bound = await originals.bindArchiveParagraphs({proposal, source, scope});
// events.values.原文段号 is removed.
// events.values.原文引用 = {entryId, revision, hash, paragraphs: [1,3]}.
```

`selectionField` and `referenceField` are configurable for the final registry. The model cannot supply the persistent reference, a hash, or `events.values.原文段落`. Empty `原文段号: []` is omitted. Input objects are not mutated.

Evidence for the temporary ledger validator is resolved separately:

```js
const evidence = await originals.resolveEvidence({source, scope, paragraphs: change.evidence});
// evidence.reference: persistent reference only
// evidence.selected: [{number, text, span:{start,end}}, ...]
// evidence.envelope: {text,start,end}, the exact minimal contiguous source span
```

For `[1,3]`, the envelope includes paragraph 2 and the intervening delimiters. It is only a temporary contiguous validator input; the reference and selected excerpts still identify paragraphs 1 and 3. The runner must persist `reference`, not `selected`, `envelope`, or copied original text. Empty evidence selections are rejected.

## Access and tool reads

`metadata({entryId,scope})` and `listMetadata({scope})` return no original prose. Deleted entries require `includeDeleted: true`.

Raw reads require an explicit task or tool purpose:

```js
await originals.read({entryId, scope, purpose: 'archive-task'}); // whole body
await originals.read({entryId, scope, purpose: 'tool-read', paragraphs: [1,3]});
const reference = await originals.reference({entryId, scope, paragraphs: [1,3]});
await originals.resolveReference({reference, scope, purpose: 'tool-read'});
await originals.remove({entryId, scope, operationId, expectedVersion});
```

`narrative-context` and all other read purposes are rejected. The ordinary narrative assembler receives summaries and current facts from its own tables; it must not pass archive-task bodies, transient evidence envelopes, or source metadata expansion into the narrative prompt. This module does not register or masquerade as a real model tool; the host wires the approved read operation into its actual tool interface.

## Verification

```sh
node --test --test-reporter=tap w24/implementation/originals/original-store.test.mjs
```

The tests exercise exact offsets, numbering rejection, replacement, stale references, branch isolation, idempotency, readback failures, disabled injection, frozen evidence binding, and the declared writer guarantees. These module tests do not demonstrate native TauriTavern 2.4.0 cross-window atomicity, an Android installation, or an MVU transaction. Those integration results belong to the host and runner validation.
