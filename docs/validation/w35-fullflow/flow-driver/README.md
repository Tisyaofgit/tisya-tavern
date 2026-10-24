# W35 agent-assisted full-flow validation drivers

These files do not change product code. No prerecorded model answer is included.
The agent must inspect each complete captured message set and author its response
before the next request is emitted. Preserve failed responses and begin a new run
when code or source material changes.

## Preferred: actual native host + loopback API

`agent-api-server.mjs NEW_OUTPUT_DIR [8095] [UTC_DEADLINE]` starts an
OpenAI-compatible local endpoint at `http://127.0.0.1:8095/v1` with model
`tisya-agent-assisted`. It supports model listing and streaming/nonstreaming
completion responses. Bind is loopback only; headers and credentials are not logged.
Configure the native host's custom connection to this endpoint. This proves only
the specific host actually run. Linux native is not Android evidence.

## Component fallback

`node --experimental-vm-modules assisted-flow.mjs SCENARIO.json NEW_OUTPUT_DIR`

Scenario keys:

- `cardPath`: real JSON card source.
- `persona`: exact `name` and `description` from the user-supplied persona.
- `turns`: exactly three user RP inputs.
- Optional `opening`: chosen actual opening; otherwise card `first_mes`.
- Optional `books`: map from original bound-book names to JSON files.
- Optional `worldInfo`, `preflightMode`, `deadline` (UTC, does not reset window).

This fallback uses actual application composition, workbench buttons, request
assembly, parsers, validators, writers and extracted TauriTavern 2.4.0 native
functions. Happy DOM and native storage remain fixtures. Origin/core/archive are
precreated through the product manager, so a successful run does not prove the
whole native first-install/binding UI. The extracted saveReply VM receives the
scenario name, avoiding the older harness's hard-coded “阿绫” identity.

The sequence is UI automatic initialization, save, opening, save, reopen, three
normal native generation interceptions (A then B), explicit history import of the
third delivered assistant floor, preference-page opening, and final reopen. The
third-floor import is needed because ordinary A archives prior delivered replies
at the next send; this does not manufacture a fourth RP turn.

## Response protocol and evidence

Each request writes `NNN-kind.request.json`, `.messages.txt` and `.delivery.json`.
After reading the full request, create matching `.response.json` atomically:

```json
{
  "producer": "agent identity and generation method",
  "requestSha256": "exact SHA from delivery.json",
  "content": "the model text response"
}
```

For auxiliary tables, `sheet` containing the actual structured answer may replace
`content`; it is formatted with the same production formatter. Never fill a generic
empty proposal merely to get green output. Include relevant sourced object,
state, memory, world and preference changes, and assess semantic completeness.

The SHA binds the reply to its request, not to proof that the agent read it.
`modelReadVerified:false` in the initial receipt is deliberate. Record full-input
reading evidence separately according to the project context-audit rule.
Responses are sent as SSE chunks after authored completion; this exercises the
stream consumer but is not a claim about token-by-token model production timing.

The component driver snapshots UI, chat, metadata, every native worldbook, all
commits, projected rows, preference drafts and progress after every atomic step.
Failures stop dependent work and preserve the first raw failure. Successful
reopen proves the simulated native-store readback, not physical mobile storage.

## Driver smoke observation

`smoke-run/` used a neutral tiny card and a deliberately expired deadline. It
reached the first assembled initialization request (55,434 characters), then
stopped with `WINDOW_DEADLINE` without receiving or accepting any response. This
proves module setup and request capture only; it is not a content-flow success.
