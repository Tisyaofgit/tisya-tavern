# Native host test fixtures

These files are deterministic test inputs, not a running Android or Tauri host.
The extracted host sources are TauriTavern 2.4.0 at commit
`fff9af0333be97697be2313981699ab0ce35c236`.
See `extracted/LICENSE` and `extracted/extracted-assets.json`.
`../storage-tests/native-scan-source-lock.json` locks exact source hashes and AST ranges.
MVU reference bundle headers retain their original third-party notices.

Restored V3 tests keep their original assertions; fixture path corrections and
explicitly updated expectations must be reviewed separately from product fixes.
