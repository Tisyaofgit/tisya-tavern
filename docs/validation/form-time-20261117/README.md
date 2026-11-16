# Narrative time form save repair · archive.7

A condition start time such as `当晚` previously rejected the complete turn unless it had an `原文：` prefix. Time fields now accept plain source text through the existing owned `M_WORLD_TIME` record codec. The original text is retained with unknown precision; no date components, calendar, or timer execution are inferred. Existing names keep reference/ownership validation, exact stored times cannot be downgraded, and invalid explicit selectors still fail. Model field hints and the review editor explain the accepted input.

Both cells and archive use the same decoder. New reply protocol v3 enables narrative time text; v2 retains common units and its former time rules, while v1/legacy retain their earlier decoders. Stored sources are not migrated. Review edits preserve source evidence and the original chat reply. Confirmation remains atomic.

Validation: 80 targeted checks; final `npm test` 2793/2793 with 18 build checks, no failures/cancellations/skips. The browser fixture uses production review UI, host services and isolated IndexedDB. Editing, confirmation, page reload and reroll were exercised, with 390px layout and scroll checks. See the JSON reports and exact source manifest.

The received screenshot shows the error but not the failing field value. The synthetic reproduction matches the reported failure; it does not identify every possible device cause. Installed Tavern, real model output and Android remain unverified. No private character card, chat, screenshot or project blueprint is included here.
