# W35 streaming independent review

Observed 2026-10-24T18:33–18:41Z. Current product worktree; no Android, desktop host or external provider claim.

The initial focused suite ran 18 tests: 17 passed and 1 failed. `focused.tap` and `focused.exit` preserve the original failure. A new workbench attached to a still-running application left the generate button enabled; progress ownership was incorrectly derived only from the local view's `activeAction`. A completed job also had no path to adopt its retained draft into this replacement view.

The authorized fix changes only local portions of `v3/workbench.mjs`: shared running task state controls the button/stop/leave behavior, completion retrieves the same retained draft with an identity and view guard, an explicit null snapshot clears old progress, and disposal invalidates pending recovery. It preserves minimizing while running, requests no second model call, and does not save streamed fragments automatically. `tests/v3/ui-tests/w35-progress.integration.mjs` adds assertions for replacement-view cancellation visibility, permitted suspend and guarded destructive leave.

`focused-after-1.tap` and `focused-final.tap` both passed 18/18 with zero skips/cancellations. Final command:

```
node --experimental-vm-modules --test --test-concurrency=1 --test-reporter=tap tests/task-streaming.test.js tests/v3/review-tests/design-progress.test.mjs tests/v3/ui-tests/w35-design-progress.integration.mjs tests/v3/ui-tests/w35-progress.integration.mjs
```

Coverage: actual config request preparation and SSE parser with simulated OpenAI/Gemini/Claude/Cohere streams; actual application/workbench with Happy DOM and simulated native persistence; start/stream/count/completion/failure/cancel/reopen. This is not a real supplier request, Linux WebView run or Android run. Full suite and final frozen-source integration remain root-owned.
