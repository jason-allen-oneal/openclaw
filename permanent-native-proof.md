# Permanent native-worker recovery — issue176080 / PR181098

Final PR head: `f7fc36d9144901b9f371253c85bf230bd0315b2d`. Runtime build: `ca6b3dff7d9473f03f49e89b9eca39bdf7bd8a9b`, integrated with main `936b57750cf99dbef410e224412a99a91f0d3f46`.

The only difference between the built candidate and final head is five test-fixture lines isolating native systemd capability on non-Linux test hosts. All production code, dependencies and runtime build inputs are byte-identical; [the Git/source binding](permanent-native/runtime-proof-final-head-binding.json) records this without relabeling the build. Frozen dependency installation and the maintained `qaRuntime` build passed with Node24.22.1.

## Result

Both full-production-budget, permanently unreleased native faults passed through the shipped `openclaw.mjs gateway` entrypoint and authenticated WebSocket RPCs. Neither run released its injected native syscall to obtain recovery. These close the earlier finite-hold proof's missing permanent-wedge recovery path.

| Real operation | Before recovery | Recovery and integrity result |
|---|---|---|
| Archive staging fsync | At183seconds the native thread, staging artifact and FIFO custody remained; active and queued deletes were pending, with one retirement request and no successor worker | Existing service lifecycle replaced PID607121 with609540. Both deletes succeeded after retry, both archives exactly matched canonical events, failed-source and unrelated history were preserved, SQLite quick_check was ok |
| Startup reconciliation SQLite pread | Real180000ms retirement fired; at183seconds the native thread and durable database lease remained, with no cleanup worker and canonical rows unchanged | Existing service lifecycle replaced the faulted PID607370 with609696. The old durable lease was reclaimed only after physical process death, real successor reconciliation and chat.history rebuilt the dirty index, canonical rows stayed identical, SQLite quick_check was ok |

Archive proof: [integrity](permanent-native/permanent-archive-v3/archive-integrity.json), [held custody](permanent-native/permanent-archive-v3/held.json), [native syscall](permanent-native/permanent-archive-v3/native.jsonl), [worker trace](permanent-native/permanent-archive-v3/workers.jsonl), [RPC trace](permanent-native/permanent-archive-v3/rpc.jsonl), [receipt](permanent-native/permanent-archive-v3/receipt.json).

Reconciliation proof: [integrity](permanent-native/permanent-reconcile-v3/reconcile-integrity.json), [held custody](permanent-native/permanent-reconcile-v3/held.json), [native syscall](permanent-native/permanent-reconcile-v3/native-reconcile.jsonl), [worker trace](permanent-native/permanent-reconcile-v3/workers.jsonl), [RPC trace](permanent-native/permanent-reconcile-v3/rpc.jsonl), [receipt](permanent-native/permanent-reconcile-v3/receipt.json).

The retained reconciliation fixture initially exited78 during its older client-credential migration, then the task service restarted and reached authenticated readiness before the fault verdict. That startup failure is preserved in its log/journal. Recovery is specifically measured from the later faulted PID607370, not the initial PID607123. Both final drivers exited0; task-only services were stopped and runtime enablement removed afterward.

## Implementation and scope

Archive admission uses the existing128-claim bound. Active work requests retirement after180000ms. Timers do not release FIFO/database custody or start overlapping replacements. If native settlement still has not completed after the existing5000ms retirement grace, the existing Gateway recovery owner verifies its current native service and Node command, then requests forced fresh-process recovery through the existing shutdown and hard-exit machinery. A required fresh process cannot fall back to an in-process restart. Native settlement during verification cancels recovery; concurrent requests coalesce.

Service capability is prepared before server workers start. This avoids lazy native libc detection calling Node's diagnostic-report API after a worker is stuck: that API waits for the stuck worker. Actual service and executable verification still occurs at recovery time. Unmanaged, external-supervisor, embedded, disabled-respawn, or unavailable-native-service instances remain report-only. No new supervisor, pool, configuration option, schema or retention owner is introduced.

Whole-process death leaves the held staging artifact unreferenced; archive publication and retries remain exact. This is disclosed crash behavior, not a claim that an orphan cleanup policy was added. The underlying cause of the incident's memory growth is not established by this availability repair.

## Red evidence and diagnostic failures

The prior699ff build held a real archive fsync unreleased for210seconds while the same Gateway and worker remained alive and both deletes stayed pending: [baseline](permanent-native/permanent-archive-baseline/held.json). The older finite185second archive/reconciliation controls and baseline-red committed regression remain documented in [finite-hold-proof.md](finite-hold-proof.md); they are supporting prior-head evidence.

Initial permanent-recovery attempts failed and are retained. Version1 used linked-only task units, so positive native-service verification was missing. Version2 used positively verified runtime-enabled services but exposed the real lazy-native-initialization deadlock. GDB showed the main thread waiting inside Node WriteNodeReport/GetNodeReport while the archive worker remained inside fsync. A logging-only JS observer identified proc-safe/systemd native initialization as the caller. [Diagnosis](permanent-native/permanent-native-diagnosis.md), [native backtrace](permanent-native/diagnostic-archive-stage-v1/native-backtrace.log), and all raw failed attempts are included.

Diagnostic runs explicitly shortened the timeout to3000ms to locate the stall. One had a fixture-only undefined identifier; the corrected early-capability diagnostic restarted successfully. These runs are not the green proof. Final v3 runs use unmodified production180000ms/5000ms budgets and observational worker instrumentation, with no prewarm hook, report override or built-code patch.

## Checks and review

103 focused cases passed:48 recovery/respawn,30 archive/reconciliation,19 import-closure,5 Gateway recovery and1 real physical hard-exit case. The two hook cache-invalidation cases and their type leaf passed after the minimal fixture migration required by main. Core types, scoped type-aware lint and formatting passed. The final portable Gateway fixture then passed its five cases again. [Validation](permanent-native/native-preparation-validation-final.json), [final fixture validation](permanent-native/recovery-cli-portability-validation.json), and raw logs/receipts preserve source identities. A post-test wrapper tried to read MERGE_HEAD after the merge commit; its metadata failure is disclosed separately from the four-shard passing test result.

The independent seven-pass Codex P0–P2 review found one stale-index defect: the index lacked the early native-capability fix already present in the reviewed working tree. It confirmed the working-tree fix addressed the deadlock and found no further working-tree defect. Staging the exact reviewed bytes resolved that finding before commit; [review](permanent-native/autoreview-permanent-v2.md) and [blob-equality resolution](permanent-native/autoreview-permanent-v2-resolution.json) are retained. The earlier recovery review and finite-hold proof remain historical evidence.

## Operational decision and evidence handling

The contributor recommends the bounded recovery behavior, but upstream acceptance of fixed limits and automatic escalation remains a maintainer decision. These can reject overload or retire slow healthy work. The evidence does not fabricate owner approval or establish the PR's final ClawSweeper/CI verdict.

All runs used isolated synthetic state, loopback ports, and task-specific service units. Production configuration and services were untouched. Publication normalizes task-local paths, removes ANSI sequences and the irrelevant configured-model label; timestamps, process/thread identity, canonical content, ordering and hashes are preserved. [Publication manifest](permanent-native/publication-manifest.json) records raw and published hashes. Source code for the fault injectors, observers and drivers is included. No private account setup or credentials are included; the visible fixture token is synthetic.
