# Pipe category colon compatibility

The fixed-column reader accepts ASCII `:` and fullwidth `：` after a registered category. It preserves cell text, escaping, category validation, column limits, object references, evidence and atomic archival validation. Missing object identities or malformed common columns remain errors; this patch does not fabricate references or treat pending records as saved.

Neutral regression fixtures cover all four blocks, mixed literal colons, unknown categories, missing delimiters, excess columns, and complete reply parsing through archival batch preparation. No private user narrative is included.

The publication description should identify the preset as heavyweight: approximately 13,000 tokens for the full-feature preset alone (author estimate), plus character cards, worldbooks and conversation history. Actual token counts depend on tokenizer and configuration.

Built runtime is included. This is a parser compatibility hotfix to onepass.16-candidate.1, not completion of the remaining candidate features. No live model or Android validation was performed for this patch.
