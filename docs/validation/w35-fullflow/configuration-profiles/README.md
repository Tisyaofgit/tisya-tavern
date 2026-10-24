# W35 configuration profiles and recovery

Status: source candidate, not published. Local verification completed 2026-10-24 18:49 UTC. Native TT verification belongs to the separate full-flow run.

## Reproduced cause

- There was no named configuration-profile bank or manual profile-save action. `configuration-book.mjs` saved current settings through the existing book authority, and `workbench.mjs` listed every immutable recovery revision. Twenty-one ordinary current-setting changes could produce 20+ visible recovery entries.
- Configuration initialization controls were inside an existing global-core block. Loading the books page waited for `books.options` (current story/player identity) before presenting the global-core recovery controls. A story-identity error could hide the route needed to prepare global configuration.
- `before-tests.tap` preserves the missing-manual-profile failure against the pre-change service. No user library, card or chat content is included.

## Candidate behavior

- `configurationProfiles` is a private configuration domain in the same global-core authority. Each named profile has a stable ID, a user-entered name and a reference to an already persisted immutable configuration revision. No second settings cache or provider layer is introduced.
- Changing current settings continues to persist the running configuration. It does not create or overwrite a named profile. Explicit **另存为新方案** creates one; **更新所选方案** preserves its ID and replaces only its saved reference/name. Existing automatic recovery records are retained in a collapsed section.
- Selecting a profile or entering its name does not write anything. **核对并应用所选方案** uses the existing diff/restore flow and requires its normal explicit apply action. Applying a profile preserves the named-profile bank, current story bindings, custom tags and unrelated domains.
- Failed profile writes retain the old saved profiles plus the retryable draft. Existing operation receipts make retry idempotent. A name clash asks the user to update the existing profile or choose a different name; it does not silently overwrite.
- **游玩偏好 → 管理偏好方案** reaches the profile controls after the current automatic save finishes. The route passes the existing suspension guard without keeping a busy lock around navigation.
- Global-core selection/creation remains visible even if current story/player options fail to load. Missing configuration explicitly offers **载入或建立基点内配置** and a retry. These controls do not create a new worldbook as a side effect of a read failure.

## Source ownership

This slice changed `v3/configuration-book.mjs`, `config/panel.js`, two local lines in `index.js`, and local configuration/recovery sections of `v3/workbench.mjs`. Other agents also changed workbench for streaming, schema review and diagnostics; preserve their edits. The books/host/archive/schema implementations were not changed by this slice.

## Verification

- `after-tests.tap`: 59/59 passed across configuration storage, workbench UI, preference-entry UI and the new profile UI suite.
- `profile-ui-tests.tap`: 4/4 passed after adding actual current-preference autosave before profile navigation and selecting the newly saved profile.
- Storage regression includes 21 automatic edits, explicit profile save/update, restoration without deleting profiles/history, cold restart, failed write preserving originals and retry creating exactly one saved revision.
- UI regression includes no writes on selection/name edits, explicit update vs new profile, visible failure/retry, story-identity failure preserving the configuration-recovery entry, and no worldbook creation on hydration retry.
- Syntax checks passed for the modified modules. Product bundles need the normal integration rebuild by the root agent.
