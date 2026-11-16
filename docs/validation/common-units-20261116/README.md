# Common unit registration — archive.5

The previous release rejected an 18-year age quantity because `岁` had no registered unit. The shared form codec now registers named common units and aliases in the same candidate transaction, without creating conversion ratios or guessing calendar rules. Existing exact definitions take priority; scoped duplicates remain explicit. Unknown units can be defined in the model-facing `M_UNITS` form and referenced in either order within the same reply. Only schema-declared `allow_global` fields accept `GLOBAL`.

The normal-turn form protocol is v2. The existing journal protocol selection retains the pre-unit v1 decoder for unchanged accepted descendants; edited replies use v2. No existing archive is rewritten on read.

## Browser reproduction

Build `tests/browser-common-units.mjs` with esbuild (`bundle`, browser platform, ESM, Chrome 110 target), copy `tests/browser-common-units.html` as `index.html` and `engine/catalog.json` beside its `common-units.bundle.js`, then serve that directory with the managed preview service. The fixture uses production host/review services with isolated IndexedDB and synthetic replies.

1. Generate age 18 岁, duration 2 小时 and distance 3 米. Before confirmation there are zero unit rows.
2. Open the review panel and confirm: three quantities and three definitions persist.
3. Generate the explicit custom unit 灵息 and a 3 灵息 quantity; confirm both together.
4. Reload: four definitions and four quantities remain. The new field help is visible.

Node regression coverage includes alias reuse, explicit definition priority, ambiguity, world isolation, global references, invalid draft rollback/retry, provenance, reroll and accepted-v1 replay. Browser evidence is a synthetic harness, not a real SillyTavern/TauriTavern host or Android device. External model compliance was not tested.
