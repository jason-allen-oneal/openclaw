# PR 188378 PostgreSQL CI triage

## Exact failure and attribution

- PR head: `983ac6b5bfc091fe6130d1f6eb87ccd75207f046`.
- CI tested synthetic merge `86b026077132dfac229edb112a5d287acc8559f6` against base `7a9ac29d82bd12e11d17d2d44ac7dc1cf4e9caff`, **not the bare PR head**.
- [PostgreSQL 2/3 job](https://github.com/openclaw/openclaw/actions/runs/41067152082/job/124102719670) failed in `src/infra/database-engine/archive-restore.postgres.test.ts`: `whole-archive PostgreSQL restore > publishes recovered PostgreSQL and SQLite selection from a captured config alias last`.
- Failure: `ConfigMutationConflictError: included config target changed since last load`, `retryable: false`. It fails during `createBackupArchive`, before restore, via `backup-shared.ts:610` -> `readConfigFileSnapshotForWriteFromContext` -> `captureConfigRootWriteTarget` -> `captureConfigFileWritePathProof:124`.
- The fixture deliberately makes `openclaw.json` a file symlink to an external config with `$include`. The new read-for-write guard incorrectly used the parent-only publication target, while the path-proof comparison fully resolved the file symlink. This deterministic mismatch rejects a read needed for backup.
- The PR does not edit the test, config snapshot/path-proof owner, or backup discovery owner. The infra Vitest batch had 246 passing tests and this one failing; PostgreSQL 1/3 and 3/3 passed.
- Main `f80ab2ad1c1a0d01ce5a73c39959c27daf425248` [job 124089262163](https://github.com/openclaw/openclaw/actions/runs/41063477930/job/124089262163) has the **identical test, error and complete stack**. `receipt.json` records programmatic timestamp-normalized stack equality. The CI classifier originally said pre-existing by job-name only; direct log comparison now establishes exact inherited failure.

## Existing upstream resolution

- Introduced by [#155538](https://github.com/openclaw/openclaw/pull/155538), merge `2f330ca69ff45bbd62922bbb797a2987a2c23878` at 13:13 UTC. That change intentionally preserves config-file symlink rejection for **writes**; that contract must not be weakened.
- Already fixed upstream by [34a4e118](https://github.com/openclaw/openclaw/commit/34a4e118dc1d69e925c5b2574c5597f3ce09e38a) at 14:05 UTC. It binds snapshot reads to their resolved read target, retains alias identity proof, and keeps writer publication rejection unchanged. The commit message names this exact PostgreSQL failing test and reports all four archive-restore cases passing, plus config/SQLite backup proof. Those are upstream-reported results, not new executions in this triage.
- Fresh GitHub source verification at main `66004e076d4dcfb7e6d1ff14c1a894a03f475908` confirms the corrected reader. Compare API confirms main is 10 commits ahead of the fix, zero behind. No PR is associated with the direct fix commit.
- Latest stable is `v2026.10.9`, published October 29 at 15:54 UTC. This October 30 fix is **merged upstream, not shipped in the latest stable**.
- Recommendation: do not write a bespoke local config patch. The next substantive PR-head update should receive a fresh synthetic merge containing the already-fixed main; verify the checkout SHA and corrected source in that CI run. If local ancestry integration is needed to reproduce this named failing gate, use an isolated integration with current main, preserving active work. No rebase/merge is warranted solely because main advanced.

## Separate Android cancellation

[android-test-third-party job 124102719738](https://github.com/openclaw/openclaw/actions/runs/41067152082/job/124102719738) exceeded its 20-minute job budget. This is not supersession or PostgreSQL matrix fail-fast. It reached `:app:testThirdPartyDebugUnitTest` at 14:07:44 UTC on Temurin 21.0.12.1, `forks=1`, and produced no further test output before cancellation at 14:17:22. Android test-report upload was skipped; no corresponding third-party report artifact exists. A particular hanging or failing test is **not established**.

The runner was `blacksmith-8vcpu-ubuntu-2404`, but the workflow chooses `CI_RUNNER_BACKEND=github` for fork PRs, so the existing Android build's Blacksmith-only parallel-fork branch was not used. This is an observed setup difference, not proof of causation. Current Android history retains existing resource limits; no exact timeout fix was found in targeted issue/PR searches. Do not remove tests, weaken limits, or rerun merely for green.

## Bounded reproduction plan (not executed)

The shared worktree is in active compilation; no source, dependency or generated output was written by this triage.

1. On a separate qualified Linux environment, provision the same digest-pinned PostgreSQL 17 image and `unaccent`, `pg_trgm`, `vector` extensions, then preserve original shard order with `node scripts/test-database-conformance.mjs --engine postgres --connection <disposable-dsn> --shard 2/3` on the tested merge/base and corrected integration. It takes roughly 18–22 minutes in the observed jobs, outside this 10-minute triage.
2. For focused owner confirmation after shard attribution, run the normal conformance wrapper with explicit file override: `node scripts/test-database-conformance.mjs --engine postgres --connection <disposable-dsn> -- src/infra/database-engine/archive-restore.postgres.test.ts --maxWorkers=1`. Do not use raw Vitest or shared module caches.
3. For Android, qualify a separate Linux/JDK21 Android SDK host and replay the existing `:app:testThirdPartyDebugUnitTest` task with the same fork-PR CI settings. Collect per-test progress plus a bounded JVM thread dump before timeout, distinguishing slow work from a stuck test or infrastructure dependency. Preserve reports on timeout. This is a diagnostic replay for a concrete missing cause, not a green-chasing CI rerun.

## Artifacts

Raw completed job logs were fetched once each (the first PostgreSQL CLI output attempt rejected ANSI sequences; the successful fetch was then ANSI-stripped locally). Excerpts, source blob comparisons, exact signatures and SHA-256 hashes are retained here. No source or GitHub mutation, rerun, ref update, merge, deployment, local test or observer process was performed.
