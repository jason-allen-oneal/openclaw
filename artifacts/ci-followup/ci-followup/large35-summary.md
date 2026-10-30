# PR #188378: compact-large-35 failure correction

Head with CI failure: `2dee5c7f729b5bf80193e8463c91b785ecc56ea1`.
Job: `checks-node-changed-compact-large-35`; inner failed shard: `agentic-gateway-methods-hosted-3`.

The original shard ran 41 tests in two files: 39 passed and two failed. Both failures were the exact diagnostic payload assertion in `update-effective-channel.test.ts` for slow `update.status` requests. The new recovery metadata phase correctly reports `recovery: 0` when recovery enumeration was not requested, but this pre-existing consumer assertion omitted the new phase.

Correction: add the exact `recovery: 0` expected field, retaining the exact-once call matcher, elapsed times, logger-failure behavior and every other diagnostic phase assertion. No production behavior, mocks, retries or timeouts changed. The visibility allocation grows by exactly the one justified test line, from 234 to 235.

Original CI red evidence: `large35-red.log`.
Focused verification: `large35-green.log` (original two-file shard plus the recovery-status sibling, maxWorkers=1, repository-owned wrapper, isolated synthetic state). Result: 63/63 passed across 3 files; wrapper wall time 98.04s, Vitest 92.01s including cold compiled graph preparation. The actual local runtime was the repository-pinned Bun fork selected by the Node wrapper, matching the CI lane runtime family. Scoped lint, oxfmt and git diff --check passed.

No new mutation or complexity run: this change is a one-line expected diagnostic-contract update, not production logic. Existing substantive implementation quality evidence remains separate.
