# Direct desire lenses, gaze composition and target aesthetics

The user rejected the repeated boundary paragraphs in W66 and authorized direct rewriting, independent gaze composition, user position preferences and two target-aesthetic selectors. Current One-Pass eleven-block delivery remains unchanged.

## Final behavior

- Viewpoint has two independent selections: female/male desire lens, and user → char / char → user / audience gaze. The actual UI and compiler accept their combinations together.
- user position preference: 主攻, 主受, 可攻可受. These provide an aggressive/initiating, alluring/attracting, or flexible presentation tendency for user. Explicit aesthetic selections determine the concrete image.
- Tone card owns the original story-tone C02 selector and its exact editable wording. C02 is compiled once in StyleResources; other preferences retain their owners and original values.
- Two multi-select lists distinguish other-character aesthetics from user aesthetics: fullness, slimness, strength, maturity, attraction to strength/vulnerability, battle-worn, frailty, cuteness, coldness, sharpness, warmth, brilliance and gloom. Youthful design is separately limited to non-erotic appearance; the single required restriction is front-loaded only when that option is selected.
- Card texts use direct positive instructions for desire, sensory attention, attraction and exchanges. The existing authorization, knowledge and anti-deification rules remain in their original owners. See `docs/prompt-writing-rules.md` for the project writing rule.
- Old direction-card references and the old direction/focus parameters are read compatibly. Opening the page preserves old data. Editing writes the new explicit selections; explicit null and empty aesthetic lists retain their empty meaning.
- Legacy “选文风卡” accepts actual selected three-card resources and rejects a genuinely empty selection. Original whole-style and supplementary resources remain available.

## Validation

`npm test`: 1317 passed, zero failed, including reproducible bundle/preset checks. Added/updated coverage checks both axes, legacy reads, explicit clearing, role/aesthetic validation, backup, actual UI save/reopen, positive card wording, custom story-tone routing, native/controlled actual requests and selected-style compatibility.

Chromium 138 at 320/360/430/900 widths used the real configuration component. The browser selected 女凝 + user→char, 主受, separate other/user aesthetics, saved and verified the stored values. Chinese font registration, zero horizontal overflow, single-execution actions, glow feedback, reduced-motion behavior and zero page errors passed. The neutral mobile capture is `style-360.jpg`; `browser.json` records the viewport/action checks. Browser/server setup first needed the correct JSON module MIME type; that fixture issue was corrected before the passing run.

No paid-model or installed Android observation was performed. These results establish configuration delivery and local UI behavior.

## Publication scope

Native connected interfaces publish the changed blobs, one verified tree/commit and a guarded branch update. No transfer helper or CLI push is used. Private story text and the user's screenshot are excluded. The preset's new revision moves the story tone to its correct owner; refreshing the built-in Tisya preset applies that template change while configured values remain intact.
