# Native generation settings continuation

The existing candidate commit `893c5cd844bd9fff30dae14eccece400ee626d92` contains generation ownership checks after acknowledged persistence and before final send, plus multiline controls for string settings. All 1,068 source files in the surviving working tree match that commit by Git blob. No product code was changed in this continuation.

## Verified

- Recovered prior tests: 33 targeted tests and 1,429 full-suite tests passed. These are retained original logs, not new full-suite runs.
- Original Linux TauriTavern 2.4.0, Tavern Helper and original MVU script, using a deterministic local HTTP model fixture. Real native execution, not an external model or Android test.
- Prior conflict UI rejected an overwritten context setting, displayed the error and restored the prior saved/native settings. Initial probe's incorrect assumption about the prior values remains in raw evidence.
- All 46 scalar controls were saved into configuration and native settings; this continuation restarted the native process and reopened the actual form. All 46 control values matched saved configuration. Every string control was a textarea.
- Exact multiline new-chat text survived edit, save, process exit, restart, form reopen, and appeared exactly once in the captured final HTTP request. A single newline in `continue_postfix` and multiline `assistant_prefill` survived storage and reopening.
- Prior stream=true A request and cold stream=false B request completed with original MVU count 2 -> 3 -> 4. This continuation's multiline request and restored baseline request completed 4 -> 5 -> 6, with false and empty string unchanged.
- Baseline generation settings were restored. Final HTTP request used temperature=0, frequency_penalty=0, presence_penalty=0, top_p=0.75, max_tokens=768, seed=0 and stream=false. The active test branch has 19 messages and count=6.

## Limits and raw failures

Saving all 46 settings does not establish that all 46 appear as wire parameters. The native host uses settings for provider-specific request fields, message construction or other generation modes. `field-coverage.json` records the exact scope; unobserved modes remain pending. Assistant prefill is stored but did not appear in this custom provider's captured request. No claim is made that top_k/top_a/min_p, verbosity, tools, media, search, image request or other modes were exercised.

The prior same-session B attempt produced no request and timed out; a fresh connection after restart succeeded. The initial attempt remains in private raw evidence, without attributing it to ChatGPT, a clock, skills or a product root cause. The interrupted restore process had no normal close receipt; its state was preserved before starting a new session. All new sessions closed normally.

No external supplier model call, Android acceptance, production data reset, or main-branch release was performed. Remaining work is provider/mode-specific generation coverage and remaining lifecycle boundaries; do not repeat the completed multiline save/cold/request loop.
