# Legacy history send repair · archive.8

Old messages containing ordinary HTML were incorrectly routed to the reply-envelope reader. An HTML greeting earlier in the selected history caused TISHA_OUTPUT_REPLY and blocked request preparation even when the latest reply was confirmed.

History now selects the strict envelope reader by known protocol markers, including configured and historical aliases. Unstructured legacy text is preserved byte-for-byte as inert source material. Markdown examples, HTML attributes, comments and script/style source do not create protocol boundaries. Valid indented roots retain their original routing. Recognized malformed envelopes and invalid numbered bodies still fail, with the original history floor and message identity in the error. Stored chat, accepted facts and history-window settings are not rewritten.

The existing production before/historyInput/payloadReady services were exercised with and without the host history interceptor, as well as swipe/regenerate/continue. Source edits and chat switches still invalidate preparation. See verification.json for the final full-suite result and source-manifest.json for the exact files.

Real cloud-browser checks reproduce the old error, then exercise input, preparation, reload, malformed-history rejection and correction using the final repair. IndexedDB and chat are isolated synthetic fixtures; no model request is sent. The 390px iframe has a 375px content viewport and scrolls without horizontal overflow.

The received device error does not reveal the complete offending history or its floor. This reproduction establishes a matching code defect, not the unique cause of every possible device failure. Installed Tavern, external model output and Android remain unverified. No private conversation, card, screenshot or project blueprint is part of this change.
