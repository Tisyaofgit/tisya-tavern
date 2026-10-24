# W28 · Global core, configuration and worldbook creation

Base: `03aeed529ea09fc1c6014f5e89497a364a456c4b` (0.3.0-w26.1).
Candidate: 0.3.1-w28.1. User's Android screenshot reports `Physical worldbook already exists` on first setup; user also corrects the core/configuration hierarchy to global, with identities and preferences as children.

## Root cause

TauriTavern v2.4.0, commit `fff9af0333be97697be2313981699ab0ce35c236`, `src-tauri/crates/tt-application/src/services/world_info_service.rs` returns `{"entries":{}}` when the repository returns None. `src/tauri/main/routes/worldinfo-routes.js` wraps those bytes in HTTP 200. The old adapter recognized only HTTP 404 as missing, so creating a UUID-named physical book always rejected the empty default response as an existing file.

The adapter now checks the fresh `/api/settings/get` world_names inventory for empty documents. Missing is null; an existing empty book stays a real document; unavailable or malformed inventory rejects the operation. Nonempty data never becomes missing. This is an identified source-contract defect consistent with the device screenshot, not an assertion of Android repair acceptance.

## Authority and hierarchy

- Global selector: native settings `extension_settings.tisya_v3_global` contains only the chosen core ID and versioned operation receipt. Save uses the host's settings writer and disk readback. No story or persona is required to create/select the core.
- Global core: one global configuration record (owner global/tisya), plus identity references and individual preference namespaces. Names/profile content still come from native persona authority. Config no longer needs a registered preference owner or active archive.
- Configuration: one shared world-settings object; styles, routes, generation settings, interface, tag library and worldbook UI settings apply across identities/chats/branches. Host extension settings are only a runtime cache. Opening a branch does not write a cloned config version.
- Story references: controller, focus, selected lore entries, player/focus object IDs and origin/session references remain under stable archive IDs. They are not copied into unrelated stories. Global configuration restore preserves current story references. Original/core definition pins remain archive material, not a second settings source.
- Preferences: separate identity children, shared across chats using that identity. Runtime leases verify the global selector too; old writers cannot target a new core after switching.
- Existing identity configuration: selected identity's record (or sole unambiguous record) can seed the global record with all registered domains, including custom tags. Original records remain untouched. Ambiguous source identity or missing source-world selection stops with a specific message rather than silently resetting data.

## UI and failure handling

Global core appears first, with nested global configuration and identity/preference controls. Story setup asks only for identity, origin and archive. It saves a newly created origin's ID into the draft before continuing. Retry uses the same creation operation and completed identity; the existing origin survives later failure. Existing-book collisions remain errors and never overwrite data. Global/core configuration is accessible before opening a chat. Old archive bindings do not block the global setup page while configuration is unready.

## Validation

`node --test tests/v3-global-books.test.js`: **13/13 passed** on final candidate. Includes missing-200 vs existing empty book, UUID collision, inventory error, lost create acknowledgement, no-chat global setup/rename, shared config across identities/chats, cold cache recovery, isolated story references, global interface, restore preservation, preference separation, failed-save retry/conflict, prior identity config/custom-tag retention, stale writer rejection, native settings callback readback and actual workbench setup/retry with happy-dom.

Full repository sweep at the 12-test checkpoint: candidate 1451 tests, 1250 pass / 201 fail; unchanged published baseline 1439 tests, 1238 pass / 201 fail. Failure-name sets are identical. These are not a fully passing suite. Detailed comparison is `validation/w28-baseline-comparison.json`. Final additions (source-config preservation and UI identity listing) were then checked by the 13-test targeted suite and rebuilt; no second full-suite pass is claimed.

Build checks: V3 host bundle rebuilt from tracked source with reproducible script; extension bundle contains 226 local modules and 47 native imports; reader verifies 15 modules and settings verifies 33. Git whitespace check passes. Bundle content/installed version must be checked again at publication.

No external model call, actual Android runtime, live user data mutation or full long-session acceptance occurred in this repair. The 201 baseline failures and prior deferred game panels/W22 missing source remain outstanding. User updates the original extension and restarts to validate the actual device.
