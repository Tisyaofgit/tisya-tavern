W24 / V3 preference confirmation and projection

Entry: service.mjs
Tests: node --test w24/implementation/preferences/preferences.test.mjs

Production cross-session assembly: shared-store.mjs and SHARED_STORE.txt.
The single-store facade below remains useful for pure/local tests. Production uses
P as the sole confirmed bank and B only for drafts, through the shared-store facade.

This module calls the existing W9 validateRow and preferenceMatches functions.
It uses the V3 registry already supplied by the runner in state.baseView.registry.
The W9 checkout remains read-only. No legacy UI has been patched.

Storage additions
  preferenceDrafts: existing runner drafts, with status pending/accepted/rejected
  preferenceRows: one confirmed row per source + canonical preference group
  preferenceHistory: append-only before/after confirmation, toggle and rejection records

Existing draft contract
  {id, requestKey, status, contributions:[{key,source,group}],
   changes:[{id,before,after}], contextSource}
  after.preferenceSource names the exact authorized feedback source.
  after.preferenceConfirmed is false until confirmation.
  key = source + NUL + preferenceGroup(after.values).

Retraction by a later feedback source
  contributions continue to identify the ORIGINAL source/group.
  mutations:[{id,feedbackSource,evidence,reason}] identifies the NEW request.
  Existing contributions may change only values.启用 and values.修订原因.
  The original source, score, source excerpt, scope and instruction are immutable.
  Confirmation history stores the mutation's new feedback source/excerpt separately.
  A feedbackSource + row ID mutation is applied once, even if a later user action
  re-enables the row before an old request is replayed.

Pure state transitions do not change the store revision:
  confirmPreferenceDraft(state,id,{enabled,now})
  rejectPreferenceDraft(state,id,{reason,now})
  setPreferenceContributionEnabled(state,id,enabled,{reason,expectedRowRevision,now})

Each transition returns an independent state copy. Row revisions increment on toggles;
original signed score, source and evidence remain in the row and before/after history.
Repeated confirmation or an unchanged activation is an idempotent no-op.
Confirmation checks the actual current row against the draft before-image.

Projection:
  projectPreferences(state,{
    enabled:true,
    context:{chatId,characterId,characters:[{avatar}]},
    world:{key}, persona:{id}, binding,
    activeSourceKeys:[...exact retained keys]
  })
  -> {rows,groups,hardConstraints}

Only confirmed, enabled, retained and scope-matching rows enter projection.
Scope matching uses actual host IDs through the existing preferenceMatches function.
An explicit global scope persists across source selection while retaining its other
scope restrictions. feedback:<id> persists independently of the rerolled candidate.
Other feedback must remain in activeSourceKeys.

groups preserve each source's signed score and expose encourage >= 0, avoid <= 0,
and net. A neutral score remains attributable. 必须/禁止 enter hardConstraints and
never add to, subtract from, or disappear through a net score.
With enabled:false all three lists are empty; no confirmation is permitted.

Runner integration:
  - Import preferenceGroup for candidate deduplication.
  - Merge projectPreferences(...).rows into the view after removing other preferences
    copies; include groups and hardConstraints in model material when needed.
  - Pass the current real identities and active source keys on every projection.
  - Keep preferenceRows outside story commits so rerolling prose cannot erase an
    independently confirmed advanced feedback contribution.

Explicit host/UI facade:
  createPreferenceService({storage,isEnabled,getProjectionOptions})
  storage.read() -> entire runner state
  storage.compareAndWrite(expectedRevision,next) -> durable compare-and-write
  methods: confirm(id,options), reject(id,options),
           setEnabled(rowId,boolean,options), project(options), list()
  Mutation options may carry expectedRevision for a stale UI guard.
  setEnabled also accepts expectedRowRevision and requires a reason.
  The facade increments store revision, awaits CAS, and verifies the readback.
  It performs no automatic retry and never substitutes a successful-looking receipt.

The public facade is callable now. Connecting its controls to an application UI is
a separate host integration step; this module does not claim that integration.

W25 explicit user revisions:
- revisePreferenceContribution(state,id,completeValues,{reason,expectedRowRevision}) replaces one confirmed row version, preserves immutable source/origin/access identity, and records complete before/after history. The shared facade requires an operationId and persists a receipt for acknowledgement recovery.
- This manual action may correct scores, scope and evidence; model-generated existing-contribution updates remain activation/reason-only.
- Host-owned preferenceIdentityGroups preserve every historical source-group identity. Renaming/regrouping a contribution cannot free its old feedback group for a duplicate import; current projection uses only the latest values and never sums historical revisions.
- preferenceBankReceipts are read-only ephemeral overlay metadata used to distinguish committed P work from pending B acknowledgements even after another session edits the row. They are never persisted in B.
