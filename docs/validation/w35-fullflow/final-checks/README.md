# W35 fixed candidate validation

Runtime source is unchanged from the 606-file native installation freeze.

- All 15 production build checks completed.
- Full legacy suite: 1471 passed, 0 failed.
- First complete V3 suite: 514 passed, 2 failed. Both failures concern outdated UI test selectors: a hidden progress status region precedes the notice, and automatic restore records are now labelled records rather than named profiles.
- Test selectors now target the actual notice and restore record. Both affected test files: 15 passed, 0 failed; application expectations and save guards were not weakened.
- The final V3 command reported exit 0, but its captured file lacks a complete summary; do not use that incomplete log as independent proof of the full count.
- Native Linux initialization request was fully read, received a budget-bounded internal-agent response, parsed and explicitly saved through the UI. Only seven core definitions were saved; full 104-source structured coverage, opening, three A/B rounds, archive/world/preference completion and Android are still unverified.
- No production release.

First failures, interrupted runs and subsequent targeted results are retained with distinct filenames. Private source text, native conversations and request/response captures are outside this public repository and belong to the private testbed package.
