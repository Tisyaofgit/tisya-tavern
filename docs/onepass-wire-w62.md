# One-pass 5: wire guidance and action cards

The reported `TISYA_ONEPASS_TASK_LABEL` is reproducible: the two task rows begin with `明确要求|…` instead of `偏好：明确要求|…`. The reader now accepts this unambiguous omission for `明确要求` and `候选` only, with exactly four nonempty cells. It does not rewrite the original reply, infer a label, or fill missing cells. Projection revision `onepass-w62.1` invalidates the old error projection while preserving view state.

The sample's machine blocks are syntactically readable. Its habit and event rows have the correct 21 and 18 columns. Archival validation is a separate issue: names are not snapshot aliases, `[A,B]` is not a pipe-wire list, description/variable updates require existing record IDs, field paths must be registered, and the submitted list must include variable rows. The user's actual snapshot was not supplied, so no object IDs, owners, old values or basis were guessed. `验证状态` is free text; `已验证` is not an invalid enum.

English instructions now distinguish all of these cases, including record ID versus owner ID and `state.值` versus an invented property path. Empty lists remain `[]`, nonempty lists use `、`, and unresolved bindings remain pending. Every registered column remains in the skeleton. Fixed labels, enums, the eleven blocks, two public think blocks, all 62 preset entry metadata/dividers, user writing constraints, configuration switches and native archival ownership remain unchanged. The seven creative stages retain character/world/scene consistency and player authority; literary questions retain prose, individual appeal, interaction wit, paragraph design, setup, echo and payoff.

The built-in `Tisya` payload is regenerated from these same sources and carries a new content revision. Update the extension on `trial/reply6`, then fully restart; an already-selected managed `Tisya` updates through the existing native PresetManager path. An explicitly selected differently named preset remains selected. No clearing of chat, regeneration of history or automatic archival replay is performed.

Machine syntax diagnostics now show the block, line, expected and actual column counts alongside readable prose. Semantic failures continue to prevent the entire archival batch from writing; there is no partial success or name-to-ID guess.

## Action display

Action cards show the parsed type, original action text and a smaller `可能影响` line underneath. A subtle separator and gold type chip sit on the existing green surface. The whole card remains one button; only `row.text` goes to the selected append/replace/send path. The legacy `source` field remains evidence and is never relabeled as a forecast. Absent type/possibility is not invented. Content uses text nodes, including the small-print line.

## Validation

- Full repository checks: 1276 passed, no failures, skips or cancellations.
- Neutral structural reproductions cover the missing prefix, wrong labels/columns, unknown references, bracket lists, new IDs used for updates, invented paths, omitted variable IDs and a successful equivalent batch. Existing archival/save/reopen/idempotence tests remain passing.
- Skeleton columns match the registered full schema; original UserPreferences remains byte-identical. Native request tests inspect the final serialized payload and reject missing instructions or mismatched snapshots.
- Real local Chromium 133 checks both message and reader surfaces at 320, 360, 430 and 900 pixels: all types present, small text below the action, no horizontal overflow, card click passes action text only, and control images decode. Script: `tools/check-actions-browser.cjs` with `PLAYWRIGHT_MODULE` and `TISYA_CHROMIUM` set to local installations.
- Token comparison uses `cl100k_base` and `o200k_base` on identical default configurations, excluding history, materials and provider framing. The format section is approximately 49% and 37% smaller respectively. These are tokenizer-specific measurements, not a claim about the user's provider.

No new external-model, installed TauriTavern or Android run was performed. Browser checks use production modules/styles and a neutral fixture, not the user's story.
