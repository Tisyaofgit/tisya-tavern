# Configuration, resource references and user identity

Candidate 5 adds 43 groups / 188 original choices. The 8 wish choices live in the existing user identity page; the other 42 groups live in play preferences. Choices retain their original option text and source effect. Source hashes are in `engine/preference-options.json`. Explicit selections replace only the corresponding prompt directives; unset groups inherit the full preset. Story choices override global defaults.

All media use one `[MULTIMEDIA]` declaration and one generated resource table. Every `@rendering{ID[,ID…]}` selects literal IDs from that table. Each entry supplies meaning, type and destination. Registered additions extend the same table; body and extra resolve image, audio and video resources, and hearts resolve one associated expression. Unknown IDs produce visible errors. The original reply remains unchanged.

The existing user identity description is the contractor wish. Wish options, including the opt-in original entry, retain their wording. `user` binds separately to a `【角色】name` entry in a global base book. Opening the page creates nothing. Explicit creation saves the exact entry, verifies it, then binds the current chat. Unbound and generic modes create no character. The old additional wish field remains stored and viewable but is no longer independently injected.

The preset explicitly disables the native persona order entry, avoiding the host fallback that injected it again when the order entry was absent. Confirmed native depth/author-note injections are relocated without editing history or unrelated notes.

Validation: full automated suite plus actual Linux TauriTavern UI save, cold reopen, final native HTTP request to a deterministic local fixture, linked heart/body image loading and action click. The native request contains one multimedia declaration, one original identity wish and one bound role. A 360px settings container has no horizontal overflow. No external model or Android execution was used for these checks.

## Candidate 6 correction

N01 and the manually entered dossier ID are removed from play preferences. That page shows one summary and links to the existing user identity page. Story mode and the selected global base-book entry now drive both the identity slot and original N01 prompt effect; stale legacy fields cannot override an explicit story binding. Selecting a dossier requires a real entry. Ensemble mode clears the binding without deleting the role.

The original persona description field and W00 / W01–W07 controls remain visible when the native persona registry is empty. The original conditional wish base is restored; an empty description with every option off emits an empty wish slot.

The history count control inherits the old saved per-chat value and limits the actual native sending copy through the existing tool-aware limiter. It preserves the current input, grouped tool calls, external material and full saved chat. Native validation with zero history confirms the older prose is absent from the actual local HTTP request.
