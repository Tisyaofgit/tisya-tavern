# Native checkpoint recovery

Use the current stable state file identity from the project blueprint, the exact pinned source tree, and the existing native host package identity. Do not select by timestamp or filename.

The old small snapshot omitted `data/default-user/settings/`. This host stores connection/preset selection, persona state, appearance and layout in separate shards. Copying `settings.json` alone does not restore them.

`tools/checkpoint-native-state.py` now captures every file beneath runtime data/config, excluding only extension dependencies and rebuildable WebKit caches. A current native session must have a normal close receipt. It includes new/unknown setting shards and validates every file and the entire file set.

Restore pinned host and extension dependencies into an empty directory, overlay the saved runtime data/config, verify all manifest hashes, then start the actual native executable. Read back connection and preset selection, story binding, custom tags, stored rows, and rendered replies; capture a subsequent request to check consumption. Byte checks alone do not prove complete runtime restoration.

This batch uses local deterministic responses, not a provider model. The invalid line prefix and action category were authored test-fixture mistakes; original responses remain in the private state evidence. The fixture checks protocol plumbing, not narrative quality or full model compliance.
