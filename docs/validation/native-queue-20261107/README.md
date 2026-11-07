# Native queue liveness guard and fresh cold-start verification

The native queue client previously trusted active-session.json after the supervisor had written closed.json. A command sent to that closed queue waited the full timeout. The new client rejects a closed session before writing any request, stops waiting when its session closes or is replaced, retains uncertain requests, and accepts a received response even if shutdown follows immediately. It never replays a command into a replacement session.

Four subprocess regression tests passed. A check against the actual closed isolated host returned NATIVE_SESSION_CLOSED in 0.030 seconds without enqueuing a command. The patched client is installed in the private host and kept here as tools/native-queue-client.py.

This run rechecked 10 MVU display/state tests. The existing 1423-test full-suite log belongs to the prior recovered implementation; it was not rerun or relabeled. The 1059 tracked files of a64a09d9cd1d3055836bab8ae3c892cac64fb860 matched their Git blobs before this harness change.

Fresh Linux TauriTavern cold starts retained the existing test branch with 11 messages, count=2, enabled=false and text="". Opening the chat and bringing the last message into view produced one 150px original MVU status iframe with those values and the Tisya visual wrapper. No model request was made during these read-only cold-start checks. The pinned original MVU script is unchanged. Real provider and Android validation remain pending.

An initial diagnostic incorrectly waited for the card-local Mvu global before selecting its card. The launcher itself succeeded and closed normally; moving that readiness check after card selection resolved the diagnostic failure. The native GitHub update check still reported its existing network error and did not prevent chat/MVU rendering. Neither failure establishes why a ChatGPT conversation becomes read-only.

The user requested no inherited clock or project workflow. No countdown, reminder or background continuation was started. New evidence and the previously unrecorded MVU lifecycle results are reconciled into the existing project checkpoint.
