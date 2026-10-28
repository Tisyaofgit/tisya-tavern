# W70 — complete forms and reusable life stages

Base: trial/reply6 535df4777a93c89d2cba16963589acce9ee110e8 / tree 4f6cd8d1fb2557d9ecc63ec6a53a8c3d6f8ce87e.
Candidate: onepass.12. Final checks and publication identity are recorded in results.json and the existing project blueprint.

Changes:
- One-pass snapshots now group each saved record once under world, global, objects or timeline. Layer indices reference the complete rows. IDs, revisions, knowledge ACLs and evidence remain intact. Numeric aliases follow the emitted order.
- Saved forms are independent of history/retrieval counts. Removed the plugin's character-budget gates from one-pass and direct form assembly, removed the editing control and default, and hid the retired assistant path. Legacy saved contextChars is ignored. No user record is reset or compressed.
- Final request validation requires the emitted form-reading guide exactly once. Conditional future nodes use the existing timeline/plan contract and plot switch; they are not saved as occurred events.
- Single and grouped core extraction can read an immutable saved time anchor. Historical evidence and stage provenance are preserved, future-only actors are excluded, and saving rejects a changed or forged source basis.
- The actual core UI selects a stage and browses all managed origins. Discovery uses journal identity rather than a book-name prefix. Adaptation selects a fixed core version; button compatibility is preserved.
- Existing AI user creation and source-card initialization are reused. The assistant exposes card initialization and archival work under an explicit task label.

Validation boundaries:
- Automated unit/integration tests, native-worldbook gateway fixtures and happy-dom button interactions; no newly installed Tauri host, actual provider-model or Android test.
- Large-form regression exceeds 40,000 characters with legacy contextChars=2000 and retains the complete tail in both form-send paths.
- History counts 0/1 and retrieval topK=0 are checked separately. Reopen, selected candidate, stale basis, idempotency and withdrawal remain covered.
- No new per-turn model call. Explicit initialization, core extraction and adaptation retain their existing helper tasks.

Still pending in the wider W70 blueprint: dedicated travel/rebirth memory-transfer and arrival workflow, life-range synthesis beyond saved points, full lifeline condition settlement and multiworld end-to-end device acceptance. This change does not claim those are finished.

Reproduce: npm ci --ignore-scripts; npm test.
Targeted: node --test --test-name-pattern=W70 tests/tables.test.js tests/onepass-injection.test.js
Pure stage/context: node --test tests/form-context.test.js tests/core-stages.test.js
