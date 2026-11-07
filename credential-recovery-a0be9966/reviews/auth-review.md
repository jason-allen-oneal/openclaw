# Independent auth-recovery source review — 2026-11-06

## Verdict

**Accepted for the next verification step; no blocking source findings.** This is an independent read-only review of the frozen ten-file recovery delta on `9db22c6cf27118f32f27ee549eb65332ca9958b5`, not an installed-runtime replay, hosted approval, or review of a future main-integration tree.

The two reported regressions are repaired at their existing owners. The recovery path does not use caller-held credential bytes as authority, remove physical current-authority checks, or permit a readable local shadow to be overridden. No product/test files were edited, and no tests, builds, publication, production operation or merge were performed by this reviewer.

## Identity and coverage

All ten working-file SHA-256 values matched the frozen manifest when checked. Saved patch SHA-256 is `f58bf297ee309f8f24084e8dbea32da0a62bce7df3f38a6e86fa6a2c6738ff30`.

Read the changed source and tests, surrounding store read/save/recovery owners, snapshot selection/publication and lifecycle paths, credential publication/uncertainty handling, source-reader capture/disposal, selected OAuth/static-profile callers, mutation lineage, canonical persistence/parser/SecretRef behavior, and the maintained migration/recovery contracts. Reference search found the two production preparation callers in `oauth.ts`, the single snapshot recovery caller in `store.ts`, and the single new local-absence capability caller in the runtime reader. There is no public SDK export of the new snapshot-selection helper.

Applied ub-mode proportionally, root/agent/test repository rules, and the repository review-flow guidance. This native independent pass is not represented as an autoreview or local ClawSweeper execution.

## Owning invariants checked

### Selected-provider migration

`prepareAuthProfileCredentialRead` now carries the selected profile's stored provider and supplied `cfg` into existing `migrationProvider`/`config` options. The same options reach local and inherited reads and the captured-reader migration checks. It does not infer a provider from the profile ID, suppress migration errors, or enable migration deferral. Both static-profile and token-sharing OAuth callers pass their original parameter object, which already contains the config. The maintained setup-binding pair still distinguishes selected-provider migration from unrelated-provider migration.

### Published inherited recovery

The normal physical local read runs first. A readable selected local credential prevents entry to the recovery path; malformed local storage is caught only as `AuthProfileStoreUnreadableError`, leaving migration and unrelated errors intact.

Recovery requires a current snapshot selected from the snapshot owner's own map, a resolved matching shared owner, producer metadata identifying the credential as inherited and persisted rather than external, and a known unchanged per-profile local mutation token. It is excluded for explicit inherited-auth-directory/scoped shared-store modes, whose existing behavior remains separate. The recovered callback compares the current published canonical credential descriptor with the shared physical reader on every use.

The existing physical shared reader still supplies current credentials. Snapshot materializations are compared through `buildPersistedAuthProfileSecretsStore`, preserving canonical SecretRef identity rather than comparing a materialized literal to its reference descriptor. The caller's retained `store` does not become authority.

### Physical local absence and uncertainty

`retainPublishedLocalAbsence` is a narrowly scoped capability bound to the selected local source already captured by the existing reader. It retains source/root identity checks and pending-write denial. It is not supplied to worker mode.

A known malformed committed postimage is distinguished from an unknown native-write outcome. An unknown outcome sets `known:false`; later readable commits preserve that false value. Root uncertainty, source replacement/revocation, a pending local/shared write, a new malformed publication, and a later readable selected local credential all refuse continued use. A known unrelated local repair may preserve the inherited selection when the selected-local lineage and published shared descriptor remain unchanged.

The additional marker stores no credential values and does not create a competing credential store. Existing ordinary physical authority checks retain their prior conservative uncertainty behavior.

### Removal, rotation and lifecycle

Shared removal/rotation changes the physical reader's returned credential; the resolver's existing selected-credential comparison rejects a retained old key. Local shadows are guarded both before recovery admission and after preparation. Source file identity, root admission and snapshot ownership/availability are checked separately. Clearing published snapshots makes the recovered callback unusable; source closure is independently denied by existing authority/resource owners.

## Verification evidence inspected, not rerun

The final v6 receipt records six successful commands, including **65 tests across three files**, production and matching test-shard typechecks, changed owner/test lint, formatting and test-line ratchet. The actual test selection covers recovered inheritance, physical credential authority, and static/delayed-dispatch revocation.

The new seven cases cover unpublished local shadow/unproven unreadable storage; later local shadow, malformed commit, unknown outcome plus subsequent known commit, snapshot retirement, source closure; and canonical shared SecretRef removal. The existing profile-recovery test adds retained-authority validation and rejection after shared removal/replacement.

Earlier v3/v5 evidence covers the broader migration/OAuth/recovery matrix. **145 distinct contracts across the candidate sequence is not 145 tests rerun on final v6.** No fresh CRAP, duplication or mutation score was measured in this review.

The exact 150-LF allocation matches the described 148-line new fixture plus two net existing test lines. Database-worker inventory inclusion is appropriate for the real admitted credential-write boundary used by the new fixture.

## Frozen file identities

| File | SHA-256 |
| --- | --- |
| src/agents/auth-profiles/profiles.test.ts | ebf09d7879907153f90e96e98a8eb217fb58d1b21917afb4df4aef77bb88d0c4 |
| src/agents/auth-profiles/recovered-inheritance.test.ts | 18e7597cc9f46a358aac81e495c37f3d95de643c63f73eb13d9ed10d48808a28 |
| src/agents/auth-profiles/runtime-read.ts | 294bc1d5af938cdf7317c823736ccfef1983a7acc48a37736d2d26430a4b4d96 |
| src/agents/auth-profiles/runtime-read.types.ts | 9b1e57c58612dc3c726f9030fb4cba31cbdb898c53aa42ff0db7906f36fbb46d |
| src/agents/auth-profiles/runtime-snapshot-selection.ts | 8a4367810708c4f51fc964a495c70f192d3ee8246ffb0ba48afee609f7cae829 |
| src/agents/auth-profiles/runtime-snapshots.ts | bcd17d605671033304b41d82ab109c3b69ed0d570c5cb18bf23d3c5f7e40c80f |
| src/agents/auth-profiles/store.ts | 6a91e637cd77644b569e7d0a35979d565bee77f0ccc18d6ce8ca88d75ec2a482 |
| src/state/user-model-account-authority.ts | 11eae044c44c209d295072bfd33ce2c9968a1635f2e49329666b298f5419d681 |
| test/vitest/vitest.database-worker-core-paths.mjs | 6cf6528d672e8a6a3088061a58ccf33615d5dfd301c0d9dd6fde09a6365e257d |
| config/test-lines-allocations/credential-recovery-owner.txt | 6c04dd9be228021b400fa419619f3e4af5702c18de5ba86290aeb817f24ae288 |

## Handoff

The parent may preserve/commit this reviewed recovery delta and integrate current main under the user's current instruction. Reconcile any changed owner/caller input before extending this review to that tree. The four prompt-snapshot files are separately accepted historical work and are outside this ten-file verdict.

The installed zero-post-logout-HTTP proof remains bound to old `9db`. Credential-owner changes require the already planned affected installed replay on the new reviewed commit; source acceptance does not relabel that old package as current proof. Publication still needs current branch/body/evidence reconciliation, required CI and applicable review/security gates. No additional speculative repair or test matrix is requested by this review.
