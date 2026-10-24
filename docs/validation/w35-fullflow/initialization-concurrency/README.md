# W35 host initialization concurrency

The actual Linux W34 audit reported `V3_BUSY` on the first “建立并接续” click after an origin book had been saved. Retrying succeeded; no model request ran. That observation prompted this independent product-code investigation. The test below reproduces a lifecycle defect capable of producing that symptom; it does not establish that it was the sole cause of the Linux occurrence.

`host.initialize()` assigned `session` before awaiting the first source-index persistence, but subsequent calls checked `session` before checking `initializing`. A concurrent `getSession()` could therefore return a session while the first initialization was still saving. The UI could finish its read, but the next mutation still failed `assertIdle()` with `V3_BUSY`. `inspect().busy` also omitted initialization even though the actual `busy()` and idle guard included it.

The minimal host change waits for `initializing` before returning a cached session and includes initialization in observable busy state. It retains the mutation guard and the existing `finally` cleanup. No time-based unlocking or blanket retry was added.

Evidence:

- `before.tap`: the concurrent reader incorrectly returned while the first save was deliberately pending; the regression failed.
- `after.tap`: the concurrent reader stayed pending, busy was visible, mutations remained blocked until persistence completed, and the guard cleared afterward; 1/1 passed.
- `retry-before.tap`: a second regression exposed a separate source-index failure/retry issue after the scan optimization. A failed save left the in-memory index changed; retry treated it as unchanged and returned without restoring the persisted index. The source-chain owner fixed conditional persistence to roll back only the fields still owned by the failed write, and to update `current` only after successful persistence.
- `../flow-driver/source-persistence-retry-after.tap`: the two initialization cases, eight legacy-source cases, and two deletion-performance cases pass together (12/12). Every concurrent reader observes initialization failure, busy clears, and the next successful initialization has the same source index in memory and persisted metadata.

The harness uses the production host and the extracted TT frontend persistence modules with simulated native storage. It does not make external model calls or inspect user storage. The actual Linux build-and-bind interaction still needs a W35 replay.

## Idle workbench timer

The earlier shell timeout while a native save was held pending was separately traced to the W35 workbench's unconditional one-second interval. The application had already deleted the floor and closed the old panel; Happy DOM could never finish `whenAsyncComplete()` after opening the workbench. The timer now starts only for a running design task and stops when that task ends. This also removes needless idle workbench wakeups in the product.

`menu-timer-after.tap`: both originally stalled shell cases plus the four performance/lock cases pass (6/6). `streaming-timer-after.tap`: the original streaming suite still passes 18/18, including recovery, cancellation, and real history-count progress. `passive-and-unmanaged.tap`: 9 passive-session and unmanaged-delete cases pass. Native-save exclusion was not weakened. The original timeout and trace remain in `../deletion-performance/`.

```sh
node --experimental-vm-modules --test --test-reporter=tap tests/v3/host-tests/initialization-concurrency.test.mjs
```
