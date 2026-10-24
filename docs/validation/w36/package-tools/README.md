# W36 extracted-package persistence tooling

The existing packager now accepts `--package-root` for a previously extracted,
used testbed. It preserves the current application/data/materials, previous
diagnostics, and new session diagnostics. It still checks credentials, removes
screenshots and transient locks, records all payload hashes, and independently
extracts the new archive to compare every payload file. It does not change the
source runtime. Source-workspace packaging remains available through
`--source-root`.

The package input must have no running matching native host. If its runtime has
an active-session marker, that session must be inside this package and have a
`closed.json` receipt. A stopped-but-unconfirmed recovery attempt is not silently
promoted into a valid continuation snapshot. Diagnostic path collisions and
symlink inputs fail explicitly.

Validation: the first new run reported 8/9 passed and exposed an unhandled
collection-root symlink; its captured failure is retained in `first-failure.txt`.
After checking collection roots, 10/10 tests passed (`after-tests.txt`). Coverage
includes a synthetic CLI round trip with modified state and original-source
byte preservation, historical/new diagnostics, screenshot/credential exclusion,
live-host and missing-close rejection, and a relocatable supervisor protocol
smoke. These are infrastructure tests, not actual native full-flow acceptance.

The same test module then passed 12/12 with the localized helper asset service
(`local-assets-tests.txt`). Its two public files are served on loopback only;
exact-path GET succeeds, queries/unlisted paths return 404, write methods return
405, and rejected request text/body is not logged. The wrapper rejects the
reserved-port collision and leaves `--check` free of service startup. A package
provenance marker selects that wrapper from the normal launcher; restore smoke
uses the same launcher and API port 8097 so helper port 8096 remains distinct.
Runtime wrapper/helper launch acceptance is separately recorded by the native
test operator, not inferred from these synthetic checks.

The W35 archive contains 584 of the frozen installation's 606 Tisya files.
The 22 omitted files are 5 prompt-evidence and 17 protocol-evidence artifacts;
the archive records those explicit non-runtime exclusions. All 584 retained
files match the frozen hashes. No image or executable/runtime module is missing.
This was an installation-inventory versus packaging-scope mismatch, not loss of
runtime dependencies. `w35-extension-inventory-comparison.json` records every
omitted path, hash, and original exclusion reason without copying its content.

For complete private installation snapshots, W36 now retains those installed
evidence files too. Screenshot-directory exclusions are scoped to diagnostics,
so a product image under a similarly named asset directory remains included.
Before archiving, `verify_deployed_tisya` compares every actually installed Tisya
file with the staged payload by SHA-256. An omitted file, changed file, or
credential/screenshot filtering conflict fails explicitly. The added regressions
pass together with the prior tool suite: 14/14 (`deployed-payload-tests.txt`).

Read-only `--plan` against the W36 recovery directory confirmed the new layout
can be inventoried. No live or unconfirmed recovery directory was snapshotted.

After a separately confirmed native shutdown, the maintenance command is:

```sh
python3 tools/native-testbed/pack_test_tavern.py \
  --package-root /absolute/path/to/the/used/package \
  --output /new/output/directory/Tisya_W35_TestTavern_Linux_x64.zip \
  --confirm-host-stopped
```

Use a new local output directory, then replace the existing private Library
archive identity only after its verification succeeds. Keep its historical
filename unless an explicit rename is desired; the new snapshot provenance and
continuation evidence identify the actual testing window. The prior verified
archive remains authoritative if the new runtime lacks shutdown evidence.
