# W32 repair validation

Release: **0.3.3-w32.1**. Source commit `b45c98b0157db691b7d697810c454443395f73a7`, tree `33bcc9ffb1b839fd12133a4567a43dea99b8dfc8` (local `94367910cf6560219010e22b8a8fcc43e4d88f02`).

## Behavior

Opening a bound workbench previously ran original parsing and writes even through `scan(read:false)`. A historical control-tag error could therefore appear without any import task. Passive scans now compute source keys without creating or updating original records. Explicit generation, import, native candidate/edit reconciliation and branch copying retain their appropriate write paths. Native unstructured openings stay character setup. Parsing failures on an explicit generation include the affected chat message and floor. Stored-source integrity checks remain enabled.

The workbench and settings show current installed preset version and selection, plugin version, and this startup's installation/upgrade receipt and backup. Current host state is read separately from the receipt. Prompt version remains `tisya.full.v3-w30`; this release changes runtime behavior, not creative instructions.

## Evidence

- `passive-before.tap`: 5 regressions against the old behavior; 4 fail and empty-chat case passes.
- `passive-after.tap`: intermediate 26/27; explicit deletion mistakenly materialized the removed floor, then corrected.
- `focused-2.tap`: 37/37 source, preset and real application/UI checks pass.
- `npm-final.tap`: first full legacy run 1458/1459; direct opening-candidate navigation failed after adding archival to an excluded opening.
- `candidate-3.tap`: opening exclusion corrected; 1/1 targeted check passes. A new host regression also asserts no originals when switching unstructured openings.
- `npm-final-4.tap` and `npm-exit-4.json`: final command exit 0, 15 build checks; legacy1459/1459 and V3 384/384 (1843 total), zero failed/skipped/cancelled.
- `v3-4.tap`: separate final V3 pass384/384, exit0.
- `source-restoration.json`: 1135 tracked files restored from fixed source commit into a separate directory and compared bytewise and by SHA256.

Metadata snapshots were taken at UTC 2026-10-24T16:05:47.187197+00:00, Beijing 2026-10-25T00:05:47.187197+08:00. The 90-minute window started2026-10-24T15:36:36Z and was not reset.

## Limits

Tests use deterministic replies, extracted native host functions, and simulated UI. No physical Android test or external model-provider call occurred. The user's actual chat and worldbooks were not accessed or modified. The screenshot's exact offending message is unknown; the passive-parse failure path and matching error were reproduced. Mobile confirmation remains pending.
