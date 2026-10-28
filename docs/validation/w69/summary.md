# One-pass memory archival and paragraph references

The user approved parser compatibility, numbered dialogue without retranscription, and integration with the project's existing V3 archive chain. A clarification explicitly selected the internal V3 chain. No third-party reference is assumed.

- Optional before/after placeholder rows containing only bare `~` are absent records. A candidate or delivered item may carry an extra explanation cell; the readable projection joins it without rewriting the original reply. Substantive malformed columns remain errors.
- Entirely unprovided machine rows create no operations or pending gaps. A named substantive row still requires its actual fields, current basis, valid IDs and permissions. Unknown identities, ambiguous names, nonexistent paths or evidence are never guessed from prose.
- Dialogue-only body paragraphs use the same consecutive numbering sequence. The event `台词` cell accepts `P2、P5`; it stores the references rather than retranscribing the dialogue. The ordered `原文段号` and corresponding `原文段落` arrays retain complete original paragraphs, with `原文来源` bound to the selected source key. Repeated paragraph references are deduplicated; original order is preserved. Old literal dialogue remains readable. Old referenced dialogue retains its original source when another field is updated; replacing its paragraph collection requires explicit rebinding or clearing.
- The one-pass compiler consumes the completed reply's memory/status/vars blocks and actual numbered body, then runs the V3 archive's shared canonical checks for identity collisions, state-value exclusivity, unresolved temporary references, manual locks and later-source protections. Its existing captured history/storage/basis checks and single book write remain. The book gateway materializes the same V3 archive layers/trace and the next-turn snapshot reads the committed rows. No auxiliary model or repair call is added.
- Fixed a verified path lookup bug: `path.shift()` had run inside each `find` predicate, consuming the table name repeatedly. Valid registered descriptive paths outside the first table could be rejected. The table name is now read once before lookup.
- Bumped the reader projection revision so cached old diagnostics are recalculated; collapse/tab preferences and original replies are preserved.

## Validation

Neutral automated tests cover the reported placeholder/annotation shapes, genuine malformed rows, nonexistent paragraph IDs and zero partial writes, exact original/source binding, one copy of dialogue, optional schema upgrade, V3 lock/later-source guards, native book gateway save/readback, V3 memory layer, service reconstruction, duplicate callback, swipe baseline and selected-candidate restoration, and the next assembled snapshot with zero auxiliary calls. Private user story/screenshots are excluded.

The first focused safeguard fixture incorrectly expected the V3 current-state rule to cover historical events; it was corrected to a cognition update. That test then exposed the actual table-path bug, fixed without weakening the assertion. The first full run reported a release-version mismatch; the display and stylesheet versions were aligned before the final run. Verbatim failure excerpts are retained in failure-evidence.txt; complete original local logs remain available.

This is native-gateway adapter/automated integration evidence. No new installed Tauri host, external model or Android run is claimed. It does not write or retroactively import the user's pasted story into their live archive. Existing replies remain unchanged; invalid archival identities/basis still require the actual existing snapshot.

Final fixed-source `npm test`: **1323 passed, zero failures/skips/cancellations** (including build/preset reproducibility). Focused reference/release checks: 6/6. Native book-gateway one-pass save/reopen/swipe/next-snapshot scenario: 1/1. `git diff --check` passed.
