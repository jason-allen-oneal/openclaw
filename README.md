# Archive and reconciliation worker lifetime evidence — issue 176080

Candidate source: [699ff2529067bea705e86005baf0c418906fbf03](https://github.com/openclaw/openclaw/commit/699ff2529067bea705e86005baf0c418906fbf03). Baseline source: `a8ead196291935d24c44a4f40b67397d88c70256`.

## Scope

Synthetic state, isolated loopback Gateway, Linux x86_64, Node 24.22.1. No production service, configuration, or data changed. The maintained `qaRuntime` build passed on the exact candidate in 173 seconds. Source/tree and changed-file hashes are recorded in `candidate-source-v3.json`; build and driver receipts identify the source head and instrumentation hashes.

The driver launches the shipped `openclaw.mjs gateway`, waits for `/readyz`, then uses authenticated WebSocket RPCs. Native fault injection targets only this isolated Gateway's archive staging file or reconciliation worker thread. Instrumentation observes Worker creation, dispatch, termination requests, and physical exit; it does not replace the worker implementation, lower the 180000ms deadline, or bypass ownership settlement.

## Baseline archive behavior

The built baseline creates and injects two sessions through actual Gateway RPCs. The first archive is held in native fsync for 185.019698366 seconds. Both delete RPCs remain pending, with no termination request. After release, both RPCs succeed and both archive files preserve their respective payloads; SQLite `quick_check` is `ok`. Captures are `baseline-rpc.jsonl`, `baseline-native.jsonl`, `baseline-workers.jsonl`, and `baseline-archive-integrity.json`.

## Candidate archive native-I/O proof

The exact-head shipped Gateway held archive fsync for 185.018498085 seconds. A retirement request occurred 179373ms after the native-hold observation (the original 180000ms task budget). Measured from worker dispatch, retirement was requested at 180002ms. At the held checkpoint, both delete RPCs remained pending, the native thread and staging file still existed, and no successor archive worker had started.

After native release, the timed-out request failed, its staging file was removed, and the queued request succeeded. Retrying the first deletion also succeeded. Both published archives match the exact original canonical events, the failed source transcript was unchanged before retry, unrelated retained history remained readable, and SQLite `quick_check` returned `ok`. The driver and Gateway both exited 0, with no forced shutdown.

See `candidate-archive/archive-integrity.json`, `held.json`, `rpc.jsonl`, `native.jsonl`, and `workers.jsonl` for raw ordering and integrity evidence.

## Candidate reconciliation native-I/O proof

The retained candidate state was reused after clean shutdown. Only the derived transcript index was marked for rebuild; canonical transcript rows were recorded before restart. The shipped Gateway's actual startup reconciliation worker entered the targeted native SQLite read hold for 185.038354669 seconds.

A retirement request occurred 178840ms after the native-hold observation. Measured from worker dispatch, retirement was requested at exactly 180000ms. At the held checkpoint, the native thread was still present, its durable read lease remained, no release task had run, and canonical rows were unchanged. After native release, the physical exit was observed and the lease-release task began 2ms later. `chat.history` then recovered the retained conversation and rebuilt the derived index. Canonical transcript rows stayed identical and SQLite `quick_check` returned `ok`.

The driver and Gateway both exited 0, with no forced shutdown. See `candidate-reconcile/reconcile-integrity.json`, `before.json`, `held.json`, `after-release.json`, `after-retry.json`, `rpc.jsonl`, and `workers.jsonl`. The first prelaunch attempt hit the previous socket's TIME_WAIT state; no Gateway was launched in that attempt. Its diagnostic is preserved and the successful replay uses a fresh isolated port.

## Focused regressions and independent review

The original focused checks cover bounded admission and cancelled-queue accounting, one-shot and scoped archive termination, physical-exit ordering, staging cleanup, retry, and reconciliation lease settlement. The initial 34-case run passed 33 cases, including both real archive termination tests, but its new reconciliation fixture incorrectly captured an exact timer delay. A second timer-range fixture was also invalid. Both failures remain disclosed. The final committed fixture installs fake timers before admission and advances the real pool deadline; it passes with its termination and lease-order assertions unchanged (`deadline-green-v2.log`).

The exact final reconciliation regression also ran unchanged against independently pinned baseline a8ead196. It reached the real worker gate and failed because advancing 180000ms produced zero termination calls instead of one (1 failed, 8 skipped; no fixture/setup failure). Exact source/tree/test hashes, command/runtime identity, the full failing output, and all earlier limitations are recorded in `red-baseline-notes.md`. Earlier recursion failures and invalid timer captures are not counted as bug evidence.

Core typecheck, type-aware lint, and formatting passed. Canonical independent Codex review was scoped-clean for P0–P2 (`autoreview-v3.md`). The only follow-up production change from 02d3792 to 699ff252 updates three user-facing error messages to explain retry/recovery; error codes, deadlines, admission limits, and settlement behavior are unchanged.

## Operational decision and limits

The PR uses the existing archive FIFO, scoped archive worker, and reconciliation WorkerTaskPool. It does not change schemas, transcript bytes, retention, configuration, final archive-publication rules, or process restart policy. Temporary-file cleanup targets only exact worker-reported staging paths after physical exit.

A JavaScript timeout requests Worker retirement; it cannot interrupt a permanently blocked kernel syscall. Custody remains held until physical exit, and a permanently blocked process may still require its external supervisor/operator to restart it.

Upstream maintainer acceptance of the newly enforced 180000ms active-task budget and 128-outstanding-request archive cap remains a separate decision. The cap reuses `DEFAULT_WORKER_PENDING_TASKS = 128` from the existing worker runtime. Applying that admission bound and a three-minute budget here can reject overload and retire slow healthy work. This evidence does not claim contributor authority to accept that tradeoff on upstream's behalf. The original issue's broader memory-growth cause is not established or claimed solved.

## Integrity and failed attempts

`candidate-evidence-manifest.json` records raw and published SHA256 values. Publication sanitizes task home paths and terminal ANSI sequences; timestamps, native process/thread IDs, outcome ordering, hashes, and assertions remain intact. The synthetic local token is test-only. Failed prerequisites and fixture limitations are retained and distinguished from successful behavior proof. Final-head CI and ClawSweeper's semantic verdict must be checked independently on the PR.
