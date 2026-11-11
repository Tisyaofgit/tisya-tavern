# Native status panel source ownership — candidate.19

The candidate.17 device report showed one connected helper iframe below a
concealed native message source, while the projected public panel count was
one and the matched count was zero. That report did not contain source bytes.
Candidate.18 restored a sole helper frame without proving its public source.
Two isolated regressions demonstrated that this could also reveal an unrelated
source or a reused wrapper whose source had changed. Candidate.19 removes that
fallback.

## Source comparison and repair

The original status rule was compared privately using the official regex
functions, Showdown 2.1.0, and the pinned host formatting function. No card
scripts or variable APIs ran. The public tests use neutral documents.

Primary source references:

- [TauriTavern formatting at 85dc99089e3fcc9d3a0aafc085564bd642895261](https://github.com/Darkatse/TauriTavern/blob/85dc99089e3fcc9d3a0aafc085564bd642895261/src/script.js)
- [Showdown 2.1.0](https://github.com/showdownjs/showdown/blob/2.1.0/dist/showdown.js)

The comparison established two transformations for the supplied template:
Showdown removes spaces on whitespace-only lines, and the host's code-block
formatting followed by DOM parsing decodes HTML entities once. The complete
result then matches the host code source. The supplied template has no helper
macros; macro expansion is not the established explanation for this case.

The matcher accepts the original canonical source and this narrowly derived
host form. It still compares complete strings and requires a unique public
document and a unique matching root. It does not recursively decode entities,
collapse meaningful spacing, guess unknown macro output, or reveal a frame
because it is the only one present. Already formatted public code is also
recognized before completing missing public documents, avoiding duplicates.

The repair changes only ownership and visibility. It leaves the original
source node, iframe, parent, contentWindow, and host runtime in place. Raw
reply/variable/archive siblings remain concealed. The host's own hidden
attribute is respected.

## Diagnostic correction

Visible toolbar order is now evaluated on the actual toolbar before mapping
it to its direct layout ancestor. A hidden toolbar inside a visible header
does not make the actual trailing actions appear misplaced. The separate
DOM-order field retains its observational meaning. Diagnostic collection
still does not read narrative text, URLs, iframe documents, or variables.

## Verification boundary

Targeted Node/HappyDOM tests cover transformed public sources, unrelated and
reused sources, source collisions, duplicate roots, single-pass entity
decoding, meaningful spacing, missing-source completion, fold/reopen identity,
host hiding, and diagnostic order. The complete candidate gate and publication
results are recorded separately against the final source hashes.

The private host-function comparison stubs sanitization/style hooks and disables
generated-Markdown repair; it establishes the specific formatting difference,
not full runtime compatibility. Chromium startup was attempted and failed with
socket EPERM before a page ran. Actual host execution, supplier model calls,
and Android retesting remain unverified in this window.
