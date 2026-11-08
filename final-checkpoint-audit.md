# PR #188378 final checkpoint audit

## Reviewed candidate

- Base: `3df96dfc805b01d5d16e12040ab519ab67c8d61f`.
- Cached diff SHA-256: `3aeda9e293237e4fce8c1501a0aa7302c52c584d34c34201ac828508ec4cb158` (independently recomputed, default and binary diff identical).
- Index tree: `399629a9da58175c6c589fcd4af3b30da982c404`.
- No unstaged source changes at inspection.

## Source review

No actionable findings in the final integration delta: `recovery-inventory-scan.ts`, the async inventory collector, and the corrected retained-reasons test. This is a targeted independent follow-up to the prior full-snapshot review, not a claim to have repeated that entire review.

The snapshot is now lazy only for budgeted scans, and materialization is explicitly awaited inside `waitForPreparation`. The snapshot owner retains caller cancellation, source identity/admission, work lifetime and cleanup. The scan subtracts awaited preparation time without changing entry, metadata-byte or synchronous elapsed-work limits. The concrete caller invokes preparation once; there is no overlapping timing-accounting use. The test's new `await` preserves its original expected values and archived-payload non-opening assertion.

## Test receipts inspected

- `archive-188378-unit-regressions.log`: 9 manifest tests, 29 CLI tests, and 106 command tests (105 passed plus the missing-await failure).
- `archive-188378-unit-final.log`: all 7 recovery inventory tests passed after the await correction, including the previously failing case. Thus all 144 distinct focused cases have passing receipts; this is not a claim that the original combined run was green.
- `archive-188378-ui-unit-corrected.log`: 16 UI unit tests passed.
- `archive-188378-scan-regression-lazy.log`: the unchanged real-ledger Gateway inventory regression passed 1/1; the other 21 cases were intentionally skipped for this targeted rerun. The retained failed predecessor logs remain part of the evidence.
- Existing entry-limit, metadata-byte-limit and time-limit test assertions remain intact.

These are inspected execution receipts, not a new execution by this reviewer. No build, committed-head runtime, live Gateway/UI, publication, hosted CI, product-policy approval or merge result is credited here.

## Proof-script audit

Separate delegated read-only audit inspected `normal-launcher/proof.py`, `stable-upgrade/proof.py`, `stable-upgrade/finish-current.py`, and supporting local helpers. No blocking harness findings for the intended fresh run. Nothing was executed.

- CLI operations use isolated task-owned HOME, config, state, workspace and temporary directories. Setup, upgrade and fault-injection helpers enforce task paths.
- Assertions cover preserved transcript fields, database integrity/bytes, unchanged backups, explicit dry-run immutability, retirement, replay and older-reader refusal.
- Synthetic fixture generation and callback-based interruption are disclosed.

Execution constraints:

1. `normal-launcher/proof.py:13` and `stable-upgrade/proof.py:11` reuse cached step output by filename without binding it to the candidate identity. Do not reuse completed candidate-step outputs after changing the candidate. At audit time, the stable run contained preparation outputs only, with no candidate-step cache.
2. `stable-upgrade/finish-current.py:13` hashes the launcher and `dist/index.js`, not every runtime chunk. Retain the independent successful exact-head build receipt (or a complete artifact manifest); those two hashes alone do not establish build provenance.

The supported scope is storage/Doctor/cleanup upgrade proof, not package-updater, service-restart, model or channel proof. This audit is not an execution receipt.
