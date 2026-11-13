# Preference editor and simple character sources

The preference editor uses the existing configuration/form owners for full-text overrides, custom choices, JSON package previews, user preferences and assistant drafts. Missing preset text remains a visible error for the affected editor/export; it must not abort unrelated configuration navigation. Shell fixtures await the real asynchronous configuration readiness.

The identity page restores a simple core-character source editor: name and complete prose, with the common save/cancel footer. Existing entries keep their book and UID; structured definitions cannot be overwritten as prose. The existing book gateway checks the captured source and full book, serializes writes, reads back the result, and retries an uncertain write without duplicating a new entry. Current chat form records and unrelated book entries remain unchanged. Optional conversion uses the existing assistant extraction route.

Validation: production services with DOM, in-memory book and database fixtures cover create/edit/reopen, cancellation, external edits, cross-chat rejection, typed-entry protection, uncertain-write retry, missing-preset navigation, formal preference consumption and package conflicts. These are local tests, not live model, native-host or Android acceptance. Original failures are retained privately with the work checkpoint.
