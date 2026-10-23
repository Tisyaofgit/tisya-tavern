# Table intake window 9 — first integration slice

Base: local e598a0a08d8f3acb3ab690bdab7db3fb21f6b2ba, equivalent remote f9aa59aaac2214ea5db99a340c6ffa626c60772c. Candidate only; main and user devices untouched.

Complete plan contract fields now validate before projection and reach narrative materials: goal, beats (proposal/basis/condition), pendingChoices, due, clues, constraints. Both legacy and dossier layouts share one renderer; English uses NarrativeAgenda. Candidate plans do not become historical facts or grant character knowledge. Invalid plan lists clear stale preview and fail visibly. Earlier archive/offstage operations in prepare are not rolled back; this change does not make the whole prepare call atomic.

Validation: generated extension rebuilt (218 local modules, 3,261,113 bytes); npm test 1,409 passed, 0 failed, 0 skipped. The neutral-intake-e2e.mjs reproducer uses actual parser, commit validation and book gateway with an in-memory host; fresh service reload retains seven rows, 0/false, dossier/history placement, and a pending preference draft not yet injected. Run node ui-evidence/table-intake-w9/neutral-intake-e2e.mjs from repository root. No live model, external user book, Android or APK verification.

Outstanding: nested explicit undefined/negative-zero persistence can silently change through JSON storage; dynamic seven-category/scenario preferences; unified maintenance/narrative calls; per-source worldbook replacement; native history pruning and residual state projection; task acceptance/state presentation. See the three audit reports. Existing simple-sheet model I/O was already wired before this slice; internal typed JS and JSON persistence remain internal.

Private story corpus and derived character dossiers are intentionally absent from this source repository. They are separate user document deliverables. No raw story screenshots, credentials or API requests were made.
