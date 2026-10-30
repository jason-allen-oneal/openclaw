# Storage compatibility proof — PR #188378

This index points to executed, sanitized artifacts extracted from the original proof bundles. It is an alternate access path for the evidence the reviewer could not retrieve from Gist, not a new execution or a claim of maintainer acceptance.

## Read these raw artifacts first

| Boundary | Executed result | Primary artifacts |
| --- | --- | --- |
| Official old writer | Published `2026.10.9` CLI imported synthetic legacy JSON/JSONL: **1 session, 3 transcript events, 3 archives**, genuine manifest **v3**. | [Import output](artifacts/stable-upgrade/stable-upgrade/run/02-stable-import-with-shipped-internal-deps.stdout), [emitted v3 receipt](artifacts/stable-upgrade/stable-upgrade/run/stable-emitted-manifest.json), [package integrity](artifacts/stable-upgrade/stable-upgrade/package-verification.json), [shipped dependency integrity](artifacts/stable-upgrade/stable-upgrade/internal-dependency-verification.json) |
| Candidate reads old state | Candidate inspection found **1 SQLite session, 3 events, zero issues** before repair. | [Pre-upgrade candidate inspection](artifacts/stable-upgrade/stable-upgrade/run/04b-candidate-inspect-stable-state-private-root.stdout) |
| Doctor migration | Agent schema **25 → 38**; all pre-existing transcript fields and session identity preserved. All three archive files and original v3 receipt retained byte-for-byte against their backup. | [Before rows/hash/integrity](artifacts/stable-upgrade/stable-upgrade/run/03-stable-sqlite-before.stdout), [after rows/hash/integrity](artifacts/stable-upgrade/stable-upgrade/run/09b-upgraded-sqlite-after-normal-doctor.stdout), [Doctor output](artifacts/stable-upgrade/stable-upgrade/run/08c-normal-launcher-doctor-upgrade.stdout), [assertion code](artifacts/stable-upgrade/stable-upgrade/finish.py) |
| Interrupted retirement | Actual retirement owner interrupted before second claim. **v5 pending-disposal** receipt persisted for all three selected files; one file had been claimed. No files removed at the checkpoint. | [Interruption code](artifacts/stable-upgrade/stable-upgrade/interrupt.mts), [checkpoint output](artifacts/stable-upgrade/stable-upgrade/run/11-interrupt-before-second-claim.stdout), [pending receipt](artifacts/stable-upgrade/stable-upgrade/run/candidate-pending-manifest.json) |
| Resume and replay | Normal built launcher resumed: **3 files / 980 bytes** retired. Replay: **0 files / 0 bytes**, all persisted state-file bytes unchanged. Post-upgrade active database stayed **684,032 bytes** with identical hash/rows; **11 backup files** unchanged across resume/replay. | [Resume](artifacts/stable-upgrade/stable-upgrade/run/13-candidate-retirement-resume.stdout), [replay](artifacts/stable-upgrade/stable-upgrade/run/14-candidate-retirement-replay.stdout), [disposed receipt](artifacts/stable-upgrade/stable-upgrade/run/candidate-disposed-manifest.json), [final rows/hash](artifacts/stable-upgrade/stable-upgrade/run/16-final-sqlite.stdout), [execution assertions](artifacts/stable-upgrade/stable-upgrade/continue.py) |
| Old CLI with new state | On separate copies of **both pending and disposed** state, stable cleanup exited **1**, classified the v5 receipt unreadable, and removed zero files. Stable restore exited **2** at the newer shared-state-schema guard. Receipt, archive/claim and active DB bytes unchanged; no sources restored. | [Pending probe results](artifacts/stable-upgrade/stable-upgrade/run/12-pending-compatibility-summary.json), [disposed probe results](artifacts/stable-upgrade/stable-upgrade/run/15-disposed-compatibility-summary.json), [copy isolation and hash assertions](artifacts/stable-upgrade/stable-upgrade/compatibility.py) |
| Old manifest reader, independently | Exact shipped reader accepted its own **v3** receipt and rejected **both v5** receipts; all three input hashes unchanged. This reaches the receipt boundary without the CLI's earlier state-schema guard. | [Direct reader script](artifacts/stable-upgrade/stable-upgrade/shipped-reader.mjs), [three-case result](artifacts/stable-upgrade/stable-upgrade/shipped-reader-result.json) |

The v5 receipts preserve each v3 move's original artifact record in `retirement.previousArtifact`, with the raw backup manifest's hash. Inspect the three receipts side by side: changed current bytes are recorded separately from original import evidence. The appended transcript is **651 bytes**, while its preserved original artifact record remains **496 bytes**. That difference is intentional evidence preservation, not a claim the appended history reached SQLite.

## Commands, provenance and reproducibility

[Exact argv and exit codes](artifacts/stable-upgrade/stable-upgrade/run/commands.json) identify each operation. The owning commands were:

```text
node <official-package>/openclaw.mjs doctor --session-sqlite import --session-sqlite-all-agents --yes --json
pnpm --silent openclaw doctor --fix --yes --non-interactive
pnpm --silent openclaw update cleanup --json --retire-session-archive <file> ... --archive-backup <directory> --dry-run
pnpm --silent openclaw update cleanup --json --retire-session-archive <file> ... --archive-backup <directory> --accept-history-loss --yes
```

The exact paths and selection of three files are in the argv receipt; placeholders above are only for readability. Stable package build: `8b18b5578f66eab1501cba4cef2310d88bfb9a41`. The package and three shipped `@openclaw/*` dependencies were downloaded and integrity-verified; other dependencies were read-only links to the prepared candidate install, not a fresh full npm installation.

Doctor's source-path run performed the schema migration but later timed out during plugin-health work (**exit 124**, retained). The subsequent normal built launcher completed Doctor **exit 0**. Do not credit the bounded attempt as a successful command. [Full execution summary and qualifications](artifacts/stable-upgrade/stable-upgrade/README.md), [orchestration](artifacts/stable-upgrade/stable-upgrade/proof.py), and [summary receipt](artifacts/stable-upgrade/stable-upgrade/run/summary.json) retain the initial setup failures and a mislabeled early-preview overwrite. The authoritative independent preview is [step 10](artifacts/stable-upgrade/stable-upgrade/run/10-upgraded-retirement-preview.stdout).

## Separate normal-launcher regression

The [normal-launcher argv receipt](artifacts/normal-launcher/normal-launcher/run-au_ze1k2/commands.json) and [summary](artifacts/normal-launcher/normal-launcher/run-au_ze1k2/summary.json) exercise candidate-created state, separately from the shipped-state upgrade:

- Ordinary `--yes` refuses both `historical-import-proof-unavailable` and `artifact-metadata-changed`; [raw refusal](artifacts/normal-launcher/normal-launcher/run-au_ze1k2/03-ordinary-cleanup.stdout).
- Explicit dry-run preserves all persisted state-file bytes; consented application retires **2 files / 320 bytes**; replay removes zero and changes no persisted state-file bytes. [Dry-run](artifacts/normal-launcher/normal-launcher/run-au_ze1k2/04-explicit-dry-run.stdout), [application](artifacts/normal-launcher/normal-launcher/run-au_ze1k2/05-explicit-apply.stdout), [replay](artifacts/normal-launcher/normal-launcher/run-au_ze1k2/06-explicit-second-apply.stdout).
- Active SQLite remains **1 session / 3 events / 667,648 bytes**, hash `1f34a3d4cde60bfa7c0678812817b630f7a190e3a9d9599e7ab7c410c3091352`; ten independent backup files unchanged. [Before](artifacts/normal-launcher/normal-launcher/run-au_ze1k2/01-sqlite-before.stdout), [after](artifacts/normal-launcher/normal-launcher/run-au_ze1k2/07-sqlite-after.stdout), [hash/assertion code](artifacts/normal-launcher/normal-launcher/proof.py).

## Executed revision and current-head reuse

These CLI proofs ran on the working source later committed as **`2dee5c7f729b5bf80193e8463c91b785ecc56ea1`**. All **33/33 file hashes** in the [captured source fingerprint](artifacts/stable-upgrade/stable-upgrade/candidate-source-fingerprint.json) match that commit. They were **not rerun on `440f9f312feeeba735cb942491efd2cd52c40e47`**.

Inspection of `git diff 2dee5c7..440f9f3` establishes the reuse boundary: CLI cleanup registration/implementation, retirement/disposal owner, manifest parser/writer and Doctor migration implementation are unchanged. The only changes in CLI-shared files relocate `RecoveryCleanupReport` to its type owner and add explicit type annotations; no emitted cleanup behavior changed. Other production edits move explicit Gateway inventory reads through its existing worker. Remaining differences are tests and a test-line allocation. Thus the CLI/storage proof is reused for unchanged behavior, not presented as a new exact-head execution.

Gateway/browser behavior has separate execution at **`bf1debacae768ac8da1a8ee496f99fc1b53323fe`**; the [final-head map](artifacts/gateway-worker-proof/publication/final-head-evidence-map.json) records that only the catalog E2E fixture changed afterward. That map's CI/review statuses are historical snapshots, not a current gate verdict.

## Explicit limits and unresolved authority

- This establishes scoped **forward state consumption and safe old-reader refusal**, not a successful downgrade or restore of retired history. Stable restore was blocked by shared schema **36 versus supported 20** before receipt selection. The direct reader probe separately establishes v5 rejection.
- One synthetic SQLite session and three events are not exhaustive compatibility coverage for every schema/backend/history shape. No installed-updater replacement, service restart, full npm-installed candidate, OS-kill interruption, or real model/channel execution was performed by these CLI proofs. An owner-callback exception supplied the interruption.
- Database bytes legitimately changed across Doctor's schema upgrade; their equality claim applies **after upgrade through retirement**. Older probes refreshed three plugin documentation files, so whole-state immutability is not claimed for those probes.
- No scoped corruption or unsafe old-reader acceptance appears in these artifacts. The genuine remaining model-contract issue is that **v5 receipts are intentionally unreadable by the older release**, and explicit retirement relinquishes recovery history that need not be present in live SQLite. Verified independent backups and preserved provenance mitigate loss; they do not make this policy backward-compatible or accepted.
- **Maintainer acceptance of the changed retention contract is not recorded.** Evidence access and technical review cannot substitute for that decision; neither publication of this index nor a passing test asserts it.
