# Public native panels in eager chat rendering

Candidate.25 addresses two independently reproduced display failures. The
original message, character regex rules and chat records remain the source of
truth. The extension supplies inert public code to the existing host/helper
renderer; it does not start a second iframe runtime.

## A single tick around a rule replacement

An enabled display rule can replace a marker with a complete fenced HTML
document while leaving one original backtick at each outer edge. The resulting
four-tick fence has mixed provenance even though the complete inner document
and its three-tick fences came from one rule.

The original all-authored check remains. A narrow additional case accepts
exactly one adjacent literal tick at each end of a single, continuous public
rule run containing the complete inner fence and HTML document. It does not
join runs by name, accept literal HTML or JavaScript, normalize arbitrary code
examples, repair incomplete documents, or cross private protocol regions.
Message bytes and regex output bytes are unchanged.

## Eager rendering and native source preparation

The pinned host's managed ownership query follows chat virtualization.
Its controller can be installed while managed ownership is false. The
managed runtime candidate list is therefore not a census of the legacy
helper renderer.

The host activates manifest chat-surface hooks for managed startup, and
content processors cannot be registered after the first projection. Deferred
third-party activation can occur after eager autoload. A late processor
registration is not a reliable eager repair.

The supported synchronous MessageFormatter hooks provide a later registration
point. Source preparation must be restricted to a verified complete original
assistant message, with identity, source and chat scope checked again before
using its public projection. Body fragments, previews, reasoning, user/system
messages and stale or nested formatting calls must not inherit another
message's source ticket. Existing native code and helper runtimes retain
ownership and are not duplicated.

Any recovery of an already rendered eager message is separate from formatting.
It must avoid existing pre/source/runtime nodes, editing and generation, perform
at most one guarded attempt for a message revision, and leave original media,
swipes and extra fields unchanged. A helper render request is not a synthetic
message-update event.

## Pinned primary contracts

- [Host formatting and startup, 85dc99089e3fcc9d3a0aafc085564bd642895261](https://github.com/Darkatse/TauriTavern/blob/85dc99089e3fcc9d3a0aafc085564bd642895261/src/script.js)
- [MessageFormatter hooks at the same host commit](https://github.com/Darkatse/TauriTavern/blob/85dc99089e3fcc9d3a0aafc085564bd642895261/src/scripts/message-formatter.js)
- [Showdown 2.1.0](https://github.com/showdownjs/showdown/blob/2.1.0/dist/showdown.js)
- [DOMPurify 3.4.15](https://github.com/cure53/DOMPurify/tree/3.4.15)

The host's formatter at this commit has seven arguments. An eighth
regexPrepared argument does not skip its regex pass. This compatibility fact
is retained separately; a second pass is not presumed to explain every
reported display failure.

## Verification boundary

Neutral regressions exercise provenance, complete HTML boundaries, inert code
handoff, source tickets, nested and batched formatting, invalidation, existing
runtime preservation, and guarded recovery. Private comparisons use the
provided original reply and original/repaired regex definitions without
executing their scripts.

The fixed host formatter, Showdown and DOMPurify are exercised in a controlled
Node/DOM probe. Style adapters and user settings are declared in the probe;
this is not an actual host session or an Android acceptance result. Full
generation checks, Node-suite results and the exact published source manifest
are recorded separately. Device acceptance remains pending.

