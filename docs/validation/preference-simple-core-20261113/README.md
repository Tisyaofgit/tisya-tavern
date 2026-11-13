# Preference editor and simple character sources

The preference editor uses the existing configuration/form owners for full-text overrides, custom choices, JSON package previews, user preferences and assistant drafts. Missing preset text remains a visible error for the affected editor/export; it must not abort unrelated configuration navigation. Shell fixtures await the real asynchronous configuration readiness.

The identity page restores a simple core-character source editor: name and complete prose, with the common save/cancel footer. Existing entries keep their book and UID; structured definitions cannot be overwritten as prose. The existing book gateway checks the captured source and full book, serializes writes, reads back the result, and retries an uncertain write without duplicating a new entry. Current chat form records and unrelated book entries remain unchanged. Optional conversion uses the existing assistant extraction route.

Validation: production services with DOM, in-memory book and database fixtures cover create/edit/reopen, cancellation, external edits, cross-chat rejection, typed-entry protection, uncertain-write retry, missing-preset navigation, formal preference consumption and package conflicts. These are local tests, not live model, native-host or Android acceptance. Original failures are retained privately with the work checkpoint.

Release checks also cover replacing a multiple-choice group that includes a custom item: only that group's selected custom directives are removed when its full-text override is used, and other groups sharing the prompt slot remain intact. Imports detect IDs already owned by another selection and preserve that record; choosing a separate copy creates a new identity. The original failures and the corrected-fixture failure are retained with the private checkpoint.


## Direct prose character adoption

A saved prose character now offers the same “预览使用此人物” entry as a typed definition. The user reviews the complete text, confirms adoption and saves through the existing story configuration owner. The stored selection contains book, UID, name and a semantic source digest; source prose remains in its original worldbook. No model call or fabricated dossier/skill/stat fields is required. Typed imports continue through their existing form service.

The identity slot reads the selected source before generation and rechecks it at final payload acceptance. Edited/deleted sources require explicit re-adoption. Whole-library exclusion stays enabled, so unselected characters do not leak into the request. Existing forms, balances, persona wishes and unrelated book metadata are preserved.

Seven production-service/DOM fixture tests cover exact prose, UID 0, preview without writes, confirmation, persistence acknowledgement failure/retry, cold host/view reopening, final request uniqueness, source edits/deletion, async chat changes, cancellation and metadata normalization. The unchanged implementation's retained complete regression reports 2,588 passes; this resume independently passed 52 targeted tests and the extension build/version checks. Browser launch was attempted again but failed before page creation at `process_singleton_posix.cc:297`, with `socket() failed: Operation not permitted (1)`. No real-browser layout, model, native-host or Android acceptance is claimed. Evidence and exact continuation instructions are in `../prose-character-adoption-20261113/`.
