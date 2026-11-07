# Native continuation and finalization validation

Verified on Linux TauriTavern 2.4.0 with the original MagVarUpdate script
and deterministic local HTTP responses. External model providers and Android
were not tested.

## Finalization race

Before the change, the visible send button could accept a click after the
native generating flag became false while `generateFromChatInput` still held
its mutex. The second invocation returned without producing an HTTP request.
The draft remained present, but there was no explanation for the failed click.

`generation-idle-guard.js` now follows the native idle promise, leaves active
generation guidance intact, and reports a finalization notice if the user
clicks send in this interval. It preserves the draft and requires a deliberate
new send after completion. It also supplies the existing UI operation guard.
The listener returns synchronously to avoid waiting on its own generation.

The native regression observed zero early HTTP requests, the explicit notice,
an unchanged draft, and a successful deliberate follow-up request. Original
mutex traces and both request/response pairs are retained privately. This is a
reproduced cause of the same-session send symptom; it does not prove the cause
of every older timeout or the ChatGPT conversation interruption.

## Generation modes

Both native continuation modes were exercised with a deliberately incomplete
assistant response and a completion containing one variable delta:

- Nudge continuation sent the configured multiline nudge as a system message.
- Prefill continuation ended the request with the incomplete assistant message
  and omitted the nudge.
- Both retained the same message count, preserved the original prefix and
  configured postfix exactly, and increased the variable counter exactly once.
- Incomplete responses preserved the previous variable state.
- Empty ordinary input inserted the configured fallback user message once and
  increased the variable counter once.

The original generation configuration was restored. A separate cold launch
recovered all 37 messages, counter 13, boolean false and empty string. A real
next HTTP request then completed with 39 messages and counter 14. Installed
runtime and source bytes were checked equal before that request.

## Automated checks and retained failures

The recovered final `npm test` log passed all build consistency checks and
1432 tests. A first run failed because the shell integration fixture omitted
the new module; the fixture was fixed to use the real module. The original
failure and successful 6-test focused rerun remain available. Three direct
guard regressions cover draft preservation, native active-generation/dry-run
behavior, stale idle promises, and disposal.

An initial mode harness read variables before asynchronous restoration was
complete. It now waits for actual variable availability and flushes the native
idle/save path before shutdown. The original failed trace is retained; it is
not classified as lost user data.

The successful 1432-test run belongs to the interrupted segment. This recovery
segment verified its log and unchanged implementation, then added the cold
launch and next-request checks; it did not rerun the full suite.

Remaining provider-specific parameters, tools, media, search, groups, and
uncovered lifecycle combinations are still pending. Continuation prefill
coverage does not establish provider-specific `assistant_prefill` coverage.
