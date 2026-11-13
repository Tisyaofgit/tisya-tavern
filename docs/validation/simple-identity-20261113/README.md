# Direct character binding and stable scrolling

Baseline: main `eca60e10c3cd3cedfa15e489982f0aaaffb228ae`. Version: `0.2.0-alpha.31.31.19-onepass.16-candidate.34-prose.2`.

The previous release allowed prose binding but required preview and a separate confirmation. The user reported this unnecessary sequence and a jump to the top after each action. The source dropdown handlers called `draw()`, which emptied the entire scroll container before asynchronous reads completed.

The primary flow now is **Bind → select book and character/custom → edit name and complete prose if desired → Save**. The source controls stay mounted when selections change. Optional extraction and existing structured dossiers remain under collapsed details. Structured source selection prepares an import internally and applies it on Save, preserving stable IDs and progressed values. Structured source JSON itself is not overwritten by the prose editor.

Unchanged prose is referenced without source writes. Editing preserves the entry UID and unknown metadata, updates only explicitly changed name/text, and binds the returned saved source digest in the same action. Custom prose creates and binds one entry. A successful source write followed by failed configuration persistence retains the confirmed source reference; retry binds the same UID instead of creating another entry. Actual edited drafts require Save or Cancel before changing to another source; untouched selections and empty custom placeholders switch directly.

Full redraws used by Save and recovery assemble content off-DOM, replace it once, and restore scroll and expanded optional sections. Focus restoration occurs after the busy/inert state ends, with `preventScroll`.

## Evidence

- `focused.log`: eight final behavior regressions, exit 0. Production services cover exact prose, rename-only preservation, edited/custom one-save binding, cold reopening, final payload uniqueness, partial-save retry, source conflicts, failed reads, stable control identity and scroll/focus restoration. Scroll reset is explicitly simulated at replacement; this is a DOM behavioral test, not a layout engine test.
- `targeted.log`: 163 identity/recovery/shell checks passed. Subsequent small source refinements are covered by the focused run and final full gate; the final full gate is the release authority.
- `full-gate.log` and `full-gate-exit.json`: complete build/test output and actual process exit, plus before/after file integrity. `tested-source-manifest.json` records tested bytes.
- `browser-status.json`: this window's Chromium launch was denied before a page opened. The original tool output was observed but not retained as a raw log. Browser pixels, real Tavern, real model and Android remain unverified.

## Device acceptance

Update the extension, then open User identity. Choose Bind, the existing book, and the character. The editable name and full original text should appear immediately. Save without extra buttons or checkboxes; reopen and send one turn. Repeat with an edited entry and Custom. On a long page, changing book/character and saving must keep the viewport at the current area. Test 360/390/709 px using `tests/browser-prose-identity.html` in an environment that can launch a browser. The harness is isolated from real worldbooks and retains its own fixture in localStorage.

The separate worldbook/style integration and mirror encyclopedia candidates are not merged here. Presets and other unrelated data are unchanged.
