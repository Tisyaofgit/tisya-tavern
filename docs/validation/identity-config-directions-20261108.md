# Identity, wishes, configuration and turn directions — candidate.8

The identity page now exposes one custom wish editor. Existing persona text and the former separate story wish are preserved together until a successful save leaves one canonical source. Clearing the editor withdraws the custom wish. Preset toggles use small boxes on the right, and identity/configuration forms share green and gold styling with wrapping native selectors.

Missing core books are created as data libraries. Creating/selecting a role does not activate a native global worldbook; newly created role entries remain disabled for native scanning. The plugin reads the chosen entry into USER.IDENTITY. Configured library books are excluded from native lore scanning, including unselected rows. Other native worldbooks retain their normal behavior.

Selecting a native persona now applies and saves it immediately. Interrupted identity persistence can be resumed on the same page. Configuration saves prevent concurrent tab changes, while clean navigation initiated by that page remains available.

The native user-message editor includes its attached turn direction. Native save proceeds after the direction is durably saved; errors keep the editor and draft available. Clearing removes that message's direction. Rerolls read its updated attachment and keep the next-turn draft separate. Early generation preparation snapshots the intended direction; binding occurs at final payload time, after the host has appended the user message. Final payload validation rejects changed directions.

## Verification

- Full generated-asset checks and Node suite: **1473 passed, 0 failed**.
- Chromium: 320/390/709px, seven right-side 22px checkboxes, no horizontal overflow; identity save/create/reload/recovery and five configuration tabs.
- Actual Linux TauriTavern/WebKit: automatic empty-library creation; real role-entry creation/readback without activating the new library; native persona A → B → A through the actual identity picker.
- Two requests traversed the actual native generation pipeline to a loopback OpenAI-compatible fixture. Each captured 39 messages. The saved custom wish, selected role text and edited preset marker appeared once each; the selected first-person effect, changed body tag and temperature 0.61 reached the request. The unselected library entry and unsent next-turn draft were absent.
- Native rewrite: the original RP text stayed intact, the attached direction saved, and reroll contained the new direction once and the old direction zero times.
- Actual cold process restart retained the exact configuration, wish, library activation list, selected role and all message/candidate contents. Strict chat-object comparison found six absent-vs-null native transport metadata keys (`native`, `provider_replay`, `prompt_cache` on the final reply and its second swipe); all other fields matched. This is not reported as a byte-identical whole-chat match.

The first actual send exposed the early direction-binding defect described above. The original failure and successful fixed requests are retained in the private project checkpoint, along with test logs and startup failures. The original 97-message recovery archive was used as a read-only source; verification ran on an isolated restored copy and a new test chat. Provider-model calls: **0**. Android device testing: **not performed**.
