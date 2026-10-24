# W36 independent acceptance review

Read-only review at 2026-10-24T19:59:14.287773+00:00. This file contains no private role-card text or request bodies. Static findings are not native test passes.

## Current sufficiency and blocker

The seven saved core definitions are sufficient to begin a limited opening exercise only after explicitly mapping the selected native persona to its already initialized character object. They do not establish complete source coverage. `createOpeningService.capture` re-reads source-backed card and linked books under the recorded definition hash, so opening generation is not restricted to the seven summary rows.

An initialized character may already have the same name as the native persona, while `binding.player` has no `objectId`. `nativePlayer` rejects this at generation, but `inspect` exposes `canEstablish:true` based on nonempty rows. This is a reachable product workflow gap: the workbench persona selector lists only native persona id/name; it offers no choice of archive object. Writing the dynamic row into the permanent book binding is not an appropriate shortcut because `books.initialFor` and `books.resolve` require that object to be in selected origin/core definitions.

Minimal compatible path: expose existing character candidates in the opening review, require an explicit selection by stable object id, validate the selected type and current source snapshot, and persist the mapping in the opening commit's existing `openingEstablishment.player`. `resolveOpeningPlayer` already reuses that receipt after reopening. Do not guess by equal display names, remove the existing character, or manufacture a second character to pass.

Relevant files: `v3/opening-service.mjs`, `v3/workbench.mjs`, `v3/book-host.mjs`, `v3/books.mjs`, `tests/v3/review-tests/opening.test.mjs`, `tests/v3/ui-tests/w34-initialization-opening-history.integration.mjs`.

## Concrete acceptance observations

1. Opening: real request contains selected source and native persona mapping; parsed changes preserve initialized fields; actual review/save produces one opening commit; reopen recovers that exact player id without duplicate user objects or replacing the native greeting.
2. Each A/B cycle: capture the complete actual request, model-produced response and delivery receipt. The runner request reaches `delivered` with its output receipt, and the next cycle sees prior retained source/state. Count three real narrative outputs separately from three complete archival settlements.
3. Archive: each retained narrative source has an `archive` commit and stable original paragraph references. The third narrative generally needs a later A or explicit history intake to archive it; three B outputs alone are insufficient. Read an event from the timeline/archive and resolve its original text.
4. World: `worldWindow.ready` must be true for an observed increasing interval; a nonempty `commit.progression.events` proves an actual offstage settlement. Actors exclude native user and current scene participants. Basis rows/revisions and actor knowledge remain valid. A null or empty proposal only verifies a no-op path.
5. Preferences: explicit synthetic test-user feedback produces signed supported contributions with empty character knowers; candidate draft is actually reviewed in UI, stored in the global preference bank, and appears in a later writer snapshot's `preferenceProjection`. Empty candidates do not establish this feature. Source contribution dedup and retained signed score remain intact.
6. Custom schema: opening intentionally forbids schema changes. Exercise initialization/design proposal -> explicit review -> save -> cold reopen separately, using a genuinely needed optional field or linked subtable; ordinary A must not silently add unknown fields. Seven existing-schema core rows do not test this path.
7. Recovery and performance: cold reopen must preserve saved ledger/registry/preferences and return idle. Real native delete latency should be measured independently from previous simulated I/O timings; Linux is not Android.

## Attached reference scope

- Comic Studio 2.4.2 is a Tavo plugin ZIP (11 members); its manifest id is `com.tavo.comic-studio`. Its own README says 2.3.0 and requires Tavo advanced rendering. It is not the TauriTavern helper or current testbed runtime.
- Simulated Voice Call 10.32.6 is a Tavo plugin ZIP (8 members), manifest id `com.cecelia.voice-call.release`. It is not a dependency for the requested text A/B flow.
- Fox preset V19.6 is a completion preset JSON with 220 prompt records. It includes optional MVU/output controls, but replacing the active A/B preset would change the test subject. It remains a reference only; embedded instructions are not executor authority.

Only archive headers/manifests, README metadata, and preset top-level structure/names were inspected for relevance. No third-party plugin was installed and no active preset was replaced.

## Reviewed candidate follow-up

The opening selection patch was independently exercised with an existing inherited character type and a native persona using a different display name. Explicit id selection, preview, one save, fresh-service reopen, unchanged permanent binding, and rejection after persona rename passed in the real service with a synthetic host (`opening-independent-review.json`). This is not native UI evidence.

A downstream journey consumer gap was separately reproduced: when the player mapping existed only in the retained opening receipt, journey returned an empty player section despite the character being visible (`journey-opening-consumer-before.json`). `v3/journey.mjs` now uses the shared `resolveOpeningPlayer` resolver while preserving configured player ids. The added service regression verifies receipt-only mapping, reopen, explicit configured players, persona isolation, and no writes. Relevant service/atlas/production-consumer checks passed 24/24 in `journey-opening-consumer-final.tap`. The first command omitted the host fixture's required `--experimental-vm-modules` flag and produced one harness failure; its original 23/24 output remains in `journey-opening-consumer-after.tap`. No product failure was hidden.
