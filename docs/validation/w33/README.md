# W33 device feedback repair

Release 0.3.4-w33.1, source e6598c3f858433d88a6909d1ede7d96627fbabdc (local 6249df369134028f53f1e0baa96eea9a355e19fe), tree38ed6a1e275cf25d11cfb5be87fac615802e3d66.

Final npm test: legacy1459 + V3418 =1877 passed, no failed/skipped/cancelled, exit0; all15 build checks. Metadata send tests exercise sorted persisted JSON through actual native interceptor/saveReply, with deterministic A/B. Corrupt metadata still stops before model calls.

UI covers real initialization/history intake, write failure/retry, lossless original persistence, parked intake text, preference visualization, current-bank ownership and stale progress refresh. Unknown pre-W33 candidate ownership is retained and explicitly blocked from automatic reassignment.

Original failed runs remain: npm-final.tap (two failures), v3-full-1.tap (one progress failure), parked-source-before.tap and entry-integration-progress-before.tap. Final full run is npm-final-2.tap with npm-exit-2.json.

The uploaded 2.4.0 APK contains world-info-persistence.js and its dependencies. The actual device build/loading failure remains unknown. This change improves its diagnostic only and retains the verified save/dirty-document cleanup protocol. No Android device or external provider model test was performed; no real user chat/worldbook was accessed.
