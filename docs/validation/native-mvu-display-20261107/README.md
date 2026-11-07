# Matrix native MVU display and lifecycle validation

Recovered the interrupted display changes on top of `f8b91c60d2ccc051754763a5ef2f7718793550b6`. The matrix display projection now passes the normalized reading copy through the existing native status-marker adapters. A status marker in the native update component or appended by MVU reaches the original display rule once. The raw reply and native update payload are unchanged. Duplicate detection inspects the `extra` element rather than matching a marker literal inside a JSON string.

Validation on 2026-11-07:

- Ten focused tests passed, including three recovered display cases: appended marker; punctuation aliases and historical mixed placement; literal marker and malformed-update rejection. The complete build checks and Node suite passed **1423/1423**.
- Actual Linux TauriTavern 2.4.0, TavernHelper and unmodified upstream MagVarUpdate `d03b7dc8a6ebf9bd611c7e2dc91f3b35462deebc` ran in an isolated profile. Responses came from a deterministic loopback fixture, not an external provider.
- Native cancel closed a pending HTTP request. A subsequently supplied late response was not consumed; native count stayed at 1. A new request contained exactly one current-state block and one native rule; the original MVU writer incremented 1 to 2 once.
- The real native status iframe showed count 2, false and an empty string. Source text and the XML update remained intact. The Linux fixture's generic sans-serif font lacked some CJK glyphs; DOM text and counts were correct. This is not Android visual acceptance.
- Native editing changed delta 1 to delta 2, but the pinned upstream script does not listen for MESSAGE_EDITED and did not automatically recompute. Its original **Reprocess variables** action recomputed from prior floor 1 to 3. This is a verified upstream behavior boundary; the adapter did not become a second writer.
- Deleting that last reply through the native confirmation restored the branch to 9 messages/count 1; the main chat remained 9 messages/count 3, with its two swipe candidates intact. A full process restart preserved both states. The branch's next 41-message request used count 1, one rule and the saved zero/false generation settings; native execution produced count 2.

Raw requests, responses, DOM commands, failures and runtime data remain in the private same-point checkpoint. This directory contains only implementation validation. Earlier interrupted sessions without normal-close receipts are retained as interrupted evidence, not relabeled as clean shutdowns. The current tests do not establish all MVU lifecycle cases, real-provider behavior or Android compatibility.
