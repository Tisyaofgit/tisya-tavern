# Common unit registration — archive.5

The previous release rejected an 18-year age quantity because `岁` had no registered unit. The shared form codec now registers named common units and aliases in the same candidate transaction, without creating conversion ratios or guessing calendar rules. Existing exact definitions take priority; scoped duplicates remain explicit. Unknown units can be defined in the model-facing `M_UNITS` form and referenced in either order within the same reply. Only schema-declared `allow_global` fields accept `GLOBAL`.

The catalog now contains 135 canonical units and 312 exact names/aliases across time, length, mass, area, volume, count, ratio, score, temperature and currency. Seasons and quarters, age-counting labels, and ambiguous currency names remain distinct. Container counts do not imply capacity. Existing world definitions still take priority.

The normal-turn form protocol is v2. The existing journal protocol selection retains the pre-unit v1 decoder for unchanged accepted descendants; edited replies use v2. No existing archive is rewritten on read.

## Browser reproduction

Build `tests/browser-common-units.mjs` with esbuild (`bundle`, browser platform, ESM, Chrome 110 target), copy `tests/browser-common-units.html` as `index.html` and `engine/catalog.json` beside its `common-units.bundle.js`, then serve that directory with the managed preview service. The fixture uses production host/review services with isolated IndexedDB and synthetic replies.

1. Generate age 18 岁, duration 2 小时 and distance 3 米. Before confirmation there are zero unit rows.
2. Open the review panel and confirm: three quantities and three definitions persist.
3. Generate 3 厘米, 2 分钟, 3 个月, 4 季 and 5 季度; confirm eight definitions and eight quantities.
4. Generate the explicit custom unit 灵息 and a 3 灵息 quantity; confirm both together.
5. Reload CU-4 / archive.5: nine definitions and nine quantities remain, including the exact values above. The new field help is visible.

Node regression coverage checks all 312 aliases through the production form parser and transaction, plus alias reuse, explicit definition priority, ambiguity, world isolation, global references, invalid draft rollback/retry, provenance, reroll and accepted-v1 replay. Browser evidence is a synthetic harness, not a real SillyTavern/TauriTavern host or Android device. External model compliance was not tested.
