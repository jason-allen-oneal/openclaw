# Stable-state upgrade and older-reader proof — issue #186088

**Result: PASS for the scoped storage/Doctor/cleanup boundaries below.** Not an installed-updater replacement or service-restart proof.

## What actually ran

- Official current release and npm distribution checked: `2026.10.9`, packaged CLI build `8b18b5578f66eab1501cba4cef2310d88bfb9a41`. Published package and its three `@openclaw/*` runtime dependencies were downloaded and checked against npm SHA-512 integrity. Remaining dependencies are read-only links to the prepared candidate dependency install, not a fresh npm installation.
- The shipped packaged CLI imported synthetic legacy JSON/JSONL. It produced a real **v3 manifest**, three archives and a healthy agent SQLite schema **25**, with **one session and three transcript events**. No receipt was fabricated.
- One transcript archive was deliberately appended after import. Ordinary candidate cleanup refused the changed archive, protected unreferenced history, and retained their index dependency.
- The real candidate Doctor migration upgraded agent schema **25 → 38**, preserving every pre-existing transcript field and session identity. Schema 38 adds derived navigation columns. Source Doctor hit its bounded timeout later during unrelated plugin-health checks; the normal built `pnpm --silent openclaw doctor --fix --yes --non-interactive` then completed **exit 0**, including maintenance finish/release. Original archive bytes and original v3 receipt bytes remained exact.
- The normal built candidate launcher preview was read-only. A deterministic progress-callback exception in the **actual retirement owner** stopped before the second claim, producing a genuine pending-disposal v5 receipt and one claimed file. This is an owner-boundary interruption, not an OS crash.
- On a **separate copy** of that pending state at identical absolute paths, shipped stable `update cleanup --yes --json` returned **1**, called the v5 receipt unreadable, and removed zero files. Stable `doctor --session-sqlite restore ...` returned **2** at the newer shared-state schema guard, before restore selection. It offered no retired-source restore. Receipt, pending claim/originals, and active database bytes remained exact.
- The normal candidate launcher resumed and retired **three files**, then replayed with **zero removed files and all persisted state bytes unchanged**. A second separate-copy shipped-stable probe against disposed v5 receipts likewise refused safely, changed no receipt or active database, and restored no source.
- Final normal-launcher Doctor inspection: **one session, zero issues**. Active database after upgrade and after retirement: **684,032 bytes**, SHA-256 `f20c2684afe9432ad813c70ddfc0a47a1c34d8fdc5e9f18154d16aa56188644f`.

## Evidence

- `run/summary.json`, `run/commands.json`: scoped verdict, limitations, actual argv/exit codes.
- `stable-build-info.json`, `package-verification.json`, `internal-dependency-verification.json`, `github-latest.json`, `npm-latest.json`: distribution identity.
- `candidate-source-fingerprint.json`: base plus SHA-256 of every changed/new candidate file at proof time.
- `run/stable-emitted-manifest.json`, `run/candidate-pending-manifest.json`, `run/candidate-disposed-manifest.json`: actual synthetic receipts.
- `run/03-stable-sqlite-before.stdout`, `run/09b-upgraded-sqlite-after-normal-doctor.stdout`, `run/16-final-sqlite.stdout`: raw DB hashes, integrity results and semantic rows.
- `run/08b-*.{stdout,stderr}`: actual migration output and bounded source-path timeout; `run/08c-*.{stdout,stderr}`: completed normal Doctor.
- `run/10-*.stdout`, `run/11-*.stdout`, `run/13-*.stdout`, `run/14-*.stdout`, `run/17-*.stdout`: preview, checkpoint, resume, replay, final inspect.
- `run/12-pending-compatibility-summary.json`, `run/15-disposed-compatibility-summary.json` and matching command logs: older-reader outcomes and byte comparisons.

`export/` contains only proof scripts, metadata, text logs and synthetic receipt/row snapshots. It intentionally excludes state databases, generated client credentials, installed packages and backup binaries.

## Qualifications and retained failed attempts

- Synthetic data, not the original reporter installation; no real model or external channel used. No live Gateway/state touched.
- Stable restore was stopped by the **general newer-state-schema guard**, not a receipt-specific restore test. Cleanup itself demonstrably recognized the v5 receipt as unreadable. This does not promise full downgrade compatibility.
- Stable bootstrap refreshed three plugin skill documentation files inside each copied-state probe. Therefore older-reader **whole-state** immutability is not claimed; archive, receipt and active DB immutability is proven.
- Backup hashes were compared over resume/replay. Initial retirement admission independently checked every selected backup and raw original manifest.
- Initial setup missed an exact shipped internal dependency; fixed by installing that official dependency in the isolated proof package. Initial candidate execution refused a group-writable scratch ancestor; fixed the task root to `0700`. Both failed logs remain.
- Source Doctor reached 100s and 180s bounds. The second migrated the DB before timeout; the normal built launcher completed it. Those timeouts are not reported as successful command exits.
- A harness mistakenly overwrote the early pre-upgrade preview stdout with the later preview while handing it to the interruption script. That duplicate is explicitly named `07-preview-harness-overwrite.stdout`; do not cite it as the original early preview. The later `10-upgraded-retirement-preview.stdout` was independently captured, checked read-only, and used for retirement. The interruption script now reads that file directly.

## Reproduction scaffolding

On a fresh, disposable task root with the candidate already built, the phase scripts are `install-stable.py`, `proof.py`, `upgrade-normal.py`, then `finish.py`. They use fixed `/tmp/openclaw-186088-stable-proof` paths and must not be blindly rerun against the retained completed state. `continue.py` records the original run's resumption after correcting the probe expectation from exit 1 to the actual safe-refusal exit 2; no failing product behavior was hidden.

## Additional shipped-reader probe

The parent separately invoked the exact published manifest-reader export, without passing through the earlier shared-state schema guard. [Script](shipped-reader.mjs) and [result](shipped-reader-result.json): the genuine v3 stable receipt was admitted, while the actual pending and disposed v5 receipts were rejected. All three raw receipt hashes remained unchanged. This read-only probe complements the real CLI refusal; it is not a successful downgrade/restore claim.
