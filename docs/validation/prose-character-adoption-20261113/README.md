# Prose character adoption continuation

Base: `Tisyaofgit/tisya-tavern` main at `aba3858675cd60c204449e8f95e890f1995b646d`, tree `3510e4a6ca242fac41e1429495a991d1ea277dd5`. All 1,799 original blob bytes were verified against that tree. This candidate implements the authorized repair where a saved prose character was blocked by a form-only identity prerequisite.

The identity UI previews and saves a source reference through the existing configuration owner. Configuration reopening retains book, UID and semantic digest. The generation identity slot loads the selected source and checks it again at final acceptance; whole-book exclusion and existing request uniqueness remain in effect. No form record, model extraction or source-book rewrite is performed by adoption. Preset text is unchanged.

## Verification

- `full-regression-resume.log`: inherited full regression, 2,588 passed with no failures or cancellations. The original process exit receipt was not retained; all implementation bytes were checked unchanged after restoring it.
- `restored-targeted.log`: fresh run, 52 passed, exit 0. Covers prose adoption and existing identity recovery, typed identities, template-book projection and prompt layers.
- `node tools/build-extension.mjs --check`: passed. Manifest, package, lockfile, layout and stylesheet versions agree on `0.2.0-alpha.31.31.19-onepass.16-candidate.34-prose.1`.
- `browser-current-launch.log`: Chromium failed before opening any page: `process_singleton_posix.cc:297`, socket operation not permitted. This is a local automated-browser failure, not a diagnosis of the ChatGPT read-only conversation symptom.
- Browser layout/clicks, real Tavern host, real model and Android are unverified. DOM fixtures do not replace them.

## Next exact check

In an environment that can run Chromium, serve this repository root and open `tests/browser-prose-identity.html`. It uses the production identity page and a clearly isolated test worldbook/configuration. At 360, 390 and 709 px, choose 基点书 and 原文旅人; preview, confirm, save, reopen and check the final request. Expect selectedSourceOccurrences = 1, unselectedSourcePresent = false, wholeBookEntries = 0, sourceUnchanged = true and accepted = true. Reload the page to exercise persistent fixture recovery. Then verify the same operation in the real host with the user's character.

W21 worldbook/style-source integration and the earlier alternative candidate `70380aa0f67949d7dbce70a9753fe345eb173be3` remain separate. This source is based directly on the published candidate34 and does not overwrite either parallel work tree. The alternate candidate imports prose into a form; this candidate stores the requested prose reference and keeps typed import behavior. Reconcile those identity edits explicitly before any future combined merge.

`source-manifest.json` lists the exact source, validation evidence and hashes except the manifest itself. Dependency folders and user data are excluded. Candidate save and formal release are separate states; consult the branch receipt in the project checkpoint for the final commit and publication status.
