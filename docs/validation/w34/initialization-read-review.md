# W34 initialization source review

The reported paste-only regression is reproduced by the pre-W34 `generateDesign` path: `mode: extract` requires a nonempty user source and never requests card/worldbook material. W34 restores explicit read-only inspection and automatic material acquisition before the registered `templateInit` task.

The source provider reads complete name, description, personality, scenario, system prompt and post-history instructions; eligible embedded definitions; and the current card's explicitly bound primary/additional worldbooks. It does not read chat/persona/global books merely because they exist. Native user identity, adopted greetings and history are separate stages. Disabled entries, executable templates and identified generated ledger material are not initialization evidence. Their counts remain visible.

Review caught and corrected an overbroad filter: a heading such as `【原点】初始档案` alone is not proof of generated storage. Such headings now supply the existing `archiveRole` classification. Exclusion requires modern storage metadata or a valid legacy journal advertising a generated archive view. A damaged legacy journal reports failure instead of allowing its projections to masquerade as fresh definitions.

Automatic initialization commits only reviewed base objects/facts. An unexpected model `initial` list is validated and shown as held candidates, with an explicit message that it was not saved. The separate opening service rereads the original definitions against the confirmed effective-definition fingerprint; raw native source prose is not copied into a second stored source. Only the exact optional user supplement is retained in the same initialization provenance for that transition.

The effective fingerprint contains normalized card identity, eligible card fields/entries, eligible book entries with source IDs and bound names. It excludes unrelated generated ledger writes and chat identity so the same card definition remains reusable. Full source snapshots still guard the actual read/generate/save operation. Disabling/enabling eligible source entries changes the effective definition.

Explicit `sourceMode: manual` remains a separate user choice. It passes the complete supplied string, performs no native source read, and retains the existing extraction contract even when the automatic provider is unavailable. Native read failures never switch to that path automatically.

Verification: `init-sources.tap`, 17 passing checks (9 existing design regressions and 8 source regressions), no skipped or failed checks. These are service/unit tests with deterministic replies; actual model semantics and Android execution are separate evidence.
