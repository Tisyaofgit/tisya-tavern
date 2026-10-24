# W35 deletion latency and unmanaged-chat boundary

This is an isolated product-code measurement, not device timing. The source chain, identity manager, controller, original store, and worldbook original adapter are production modules. The transport and chat persistence are simulated. No model or user storage is used.

## Measured amplification

`tools/measure-delete-path.mjs` seeds three or 24 assistant replies and deletes the final assistant reply. Each simulated I/O call takes 5 ms. It verifies the deleted original's tombstone, applied invalidation receipt, and retained source count after every run.

| 24 assistant replies | W34 baseline | W35 candidate |
| --- | ---: | ---: |
| Original-book reads for deletion | 51 | 7 |
| Stable-chat identity calls | 204 | 20 |
| Chat saves | 6 | 5 |
| Metadata readbacks | 6 | 5 |
| Total deletion, measured ms | 1487 | 223 |
| Time after native floor removal, ms | 1465 | 202 |
| Unchanged refresh: book reads / stable IDs / saves | 24 / 96 / 1 | 1 / 2 / 0 |

Three replies and 24 replies now cause the same number of deletion I/O calls. The W34 time amplification followed the retained-history size; no fixed 16-second timer was found in this path. Actual Linux/Android timing remains a separate validation.

`baseline.json` was run against `/workspace/scratch/289ae625ecae/restored-checkpoint-w34`. `after.json` used the active candidate. `regression-before.tap` retains the failing performance regression on W34. The candidate's scan batches one identity snapshot and one metadata snapshot, then verifies that messages, text, and selected swipes have not changed. Snapshots are not reused between scans. `index.js` no longer saves the whole chat again after every awaited host deletion has already verified its durable receipts.

## Deleting an unmanaged native chat

The native runtime audit found deletion blocked by missing global configuration and then by a missing archive. `unmanaged-before.tap` reproduces the configuration error before the change. A fixture syntax mistake from the first attempt is separately retained in `unmanaged-fixture-syntax-error.tap`.

`host.deleteFloor` now reads the actual archive binding before requesting generation configuration. Only a confirmed null binding/pointer, with no local pointer and no previous host source index, permits native deletion without a configured archive. The path still verifies the exact removed floor, saves through the identity manager, reads metadata back, and confirms the deleted identity's tombstone. A known binding, damaged binding, local unsaved binding, or old managed source index never falls back. A missing native side effect or failed save is still an error. Existing managed sessions retain their archival invalidation and MVU behavior.

`unmanaged-final.tap`: 3 tests pass, including known/damaged/local bindings and persistence failure.

## Verification and remaining boundary

- `performance-and-lock.tap`: 4 tests pass. This covers bounded I/O, scan races during delayed book reads (text, swipe and message replacement), read-only UI actions, and lock release after errors.
- `shell-delete-safety.tap`: 4 mounted-shell tests pass: failed marker save, failed final save, stop during rollback, and selected native-candidate deletion.
- `deletion-final.tap`: 37 focused host tests pass, with no failures, skips, or cancellations. The last local-pointer guard was then checked by the separate 3/3 `unmanaged-final.tap` run.
- The earlier broad `regression-after.tap` was manually stopped (exit 130) after three passing deletion safety tests because an unrelated generation-options test did not settle.
- `regression-after-focused.tap` and `shell-pending-trace.tap` retain the earlier mounted-shell timeout with chat saving deliberately held forever. Follow-up isolated the cause to the workbench's unconditional interval: Happy DOM could never become idle after the menu opened. The timer now exists only while a design task is running. Both original stalled shell cases pass, together with the four performance/lock cases (6/6), in `../initialization-concurrency/menu-timer-after.tap`. The native save guard remains intact.

Commands:

```sh
TISYA_PERF_ROOT=/workspace/scratch/289ae625ecae/restored-checkpoint-w34 node tools/measure-delete-path.mjs
node tools/measure-delete-path.mjs
node --test --test-reporter=tap tests/v3/host-tests/delete-performance.test.mjs tests/ui-operation.test.js
node --test --test-reporter=tap tests/v3/host-tests/unmanaged-delete.test.mjs
node --experimental-vm-modules --test --test-concurrency=1 --test-reporter=tap tests/v3/host-tests/unmanaged-delete.test.mjs tests/v3/host-tests/delete-performance.test.mjs tests/v3/host-tests/installer.test.mjs tests/v3/host-tests/legacy-source-availability.test.mjs tests/ui-operation.test.js
```
