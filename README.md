# OpenClaw #181098: permanent native recovery, forced-death cooldown and stable upgrade

Final source and runtime build: `989b30680025e029885e77e6aeefb3c1cc7626a5`.

The real Gateway evidence now covers the previously missing permanent-worker recovery, the forced-death successor cooldown, and an upgrade from official stable `2026.10.6`. All scenarios use isolated synthetic state and authenticated public Gateway RPCs. No native fault is released to obtain a passing recovery.

## Results

| Boundary | Before | Final candidate |
| --- | --- | --- |
| Permanently stuck native archive | Earlier 699 ff baseline stayed wedged after 210 seconds | Real fsync stays blocked; custody remains through 180 s retirement and 5 s grace; native service replaces 629111 with 632652; both archive retries match exact canonical rows |
| Recovery cooldown after SIGKILL | Production-identical ca 6 baseline kills 619868, recovers 622296, then kills 622296 again 225.2 s after the first death and queues another service restart | Native planned-restart record is durable while 629111 is still alive; after physical death,632652 holds a second native fsync for 205.125 s without restarting; logs explicitly report the five-minute cooldown; native custody and canonical rows remain intact |
| Permanently stuck reconciliation | Prior finite/permanent baselines retained the stalled operation | Real startup SQLite pread remains blocked; lease stays until physical death;629566→632844; dirty derived index rebuilds, retained history is readable, canonical rows unchanged, SQLite quick_check=ok |
| Stable upgrade | Official npm 2026.10.6 creates 2 conversations/4 canonical rows and chosen settings, then exits 0 | Candidate Doctor succeeds; original settings and every original JSON/compressed transcript byte remain; authenticated history works; a third conversation adds 2 rows; fresh candidate restart retains all 3 conversations/6 rows; both candidate exits 0 |

## Review the primary artifacts

- [Exact final build receipt](cooldown-upgrade/candidate-build-v7.receipt.json) and [build log](cooldown-upgrade/candidate-build-v7.log). Clean source, Node24.22.1, qaRuntime build162.14s; dependencies unchanged from the preceding frozen install.
- [Baseline second-recovery failure](cooldown-upgrade/native-baseline/cooldown-successor.json), [driver assertion](cooldown-upgrade/native-baseline/driver.log), [service receipt](cooldown-upgrade/native-baseline/receipt.json).
- [Durable native-recovery row observed before SIGKILL](cooldown-upgrade/native-archive/durable-native-recovery-before-kill.json), [archive integrity](cooldown-upgrade/native-archive/archive-integrity.json), [successor cooldown](cooldown-upgrade/native-archive/cooldown-successor.json), [Gateway log](cooldown-upgrade/native-archive/gateway.log), [passing receipt](cooldown-upgrade/native-archive/receipt.json).
- [Final reconciliation integrity](cooldown-upgrade/native-reconcile/reconcile-integrity.json), [held lease/native-thread observation](cooldown-upgrade/native-reconcile/held.json), [passing receipt](cooldown-upgrade/native-reconcile/receipt.json).
- [Official stable package identity and SHA512/SHA1 verification](cooldown-upgrade/stable-install/install.receipt.json), [stable seed receipt](cooldown-upgrade/stable-upgrade/stable-seed.receipt.json), [original canonical rows](cooldown-upgrade/stable-upgrade/stable-canonical-before.json), [upgrade/restart receipt](cooldown-upgrade/stable-upgrade/upgrade-v2.receipt.json), [final settings/history/integrity](cooldown-upgrade/stable-upgrade/candidate-restart-v2-integrity.json).
- [Artifact hashes and egress substitutions](cooldown-upgrade/artifact-manifest.json). Drivers, native interposers, worker observer, complete logs and receipts are alongside the results.

## Repair and local validation

The final repair uses the existing boot-lifecycle owner. An accepted native-worker fresh-process restart records `planned_restart` and awaits that existing completion before shutdown watchdogs or native teardown. The existing consumed boot ID prevents later generic timeout callbacks overwriting the native reason. No new schema, configuration or second persistence owner is added; existing best-effort history-write policy remains.

The focused regression fails before the repair because close starts before recording. All6 Gateway runtime-unavailable cases pass after it (new case39ms; full command154.744s including114s compiled-worker preparation). Scoped type-aware core lint, the config-cli type leaf, formatting and diff checks pass. [Independent P0–P2 delta review](cooldown-upgrade/autoreview-cooldown-v1.md) is scoped-clean; its stated context/execution limitations are retained. Prior custody, retirement, FIFO, import-closure and service-recovery checks remain in [the earlier proof](permanent-native-proof.md); current CI is a separate final-head gate.

Main integration was required by an actual merge conflict. The sole conflict was the same upstream hook fixture repair; exact current-main bytes were retained. The final cooldown delta adds 10 production lines and 48 test lines. The complete PR remains one native-settlement recovery change: splitting off permanent recovery or cooldown would leave the linked availability failure unresolved.

## Failed attempts and limits

- The first upgrade verification rejected SQLite's null-prototype row objects against JSON-parsed ordinary objects despite identical fields. Doctor and the Gateway boot had succeeded. The original failed receipt/log remain; v 2 normalizes serialized row representations and reuses that successful Doctor run, then verifies all original bytes/settings and another clean restart. No product code or expected data was changed for this correction.
- An initial real-database CLI unit fixture failed admission under that suite's external-I/O mocks and never established a product verdict. The replacement focused ordering regression has a real before/after failure; the shipped-Gateway two-wedge scenario independently proves disk persistence across forced death.
- The generic lint wrapper timed out preparing unrelated plugin SDK declarations. The supported core lint tsconfig completed successfully on the two changed core files; all failed and passing receipts are retained.
- Reconciliation fixture preflight initially restarted after client-credential migration, before the injected native fault. The readiness guard and actual fault PID distinguish that setup restart from the subsequent demonstrated recovery; both are present in logs.
- Whole-process death may leave an unreferenced archive staging file. Native custody is never released early, and no orphan-cleanup policy is added. After cooldown proof, task-only service cleanup kills the intentionally held worker; cleanup is after the verdict and never releases either injected fault.
- All state, prompts, tokens and conversation contents are synthetic. Task paths and tokens are consistently replaced at egress, and irrelevant configured-model labels are redacted. No user credentials, private endpoints, raw reviewer prompts or live operator state are published.
- This is an availability repair; the original incident's separate memory-growth mechanism is not asserted. Fixed 128-claim admission,180 s retirement and 5 s escalation are justified by existing limits and the reporter's recovery request, but upstream owner acceptance remains outstanding. Proof publication does not claim that decision, a passing ClawSweeper verdict, or final CI completion.

Earlier evidence: [finite native holds](finite-hold-proof.md), [permanent native recovery and its diagnostics](permanent-native-proof.md).
