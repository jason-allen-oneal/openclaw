# Archive/reconciliation worker lifetime evidence — issue 176080

Candidate source: [02d3792bd82664b85249ed353f41c833feae97d3](https://github.com/jason-allen-oneal/openclaw/commit/02d3792bd82664b85249ed353f41c833feae97d3).

## Scope and status

This evidence separates actual built-Gateway baseline behavior from focused regression checks. Candidate native-I/O replay, final-head CI, and ClawSweeper assessment remain pending. A JavaScript timeout requests native Worker retirement; it cannot interrupt a permanently blocked OS syscall. FIFO/database custody must remain held until physical exit. No automatic process-restart policy is introduced.

Baseline source: `a8ead196291935d24c44a4f40b67397d88c70256` (OpenClaw `openclaw/openclaw`). Synthetic state only, isolated loopback Gateway, Linux x86_64, Node 24. No production services/configuration/data changed. Built runtime setup completed exit 0; baseline startup reached actual `/readyz` readiness before RPCs.

## Shipped-entrypoint baseline

The driver launches the shipped `openclaw.mjs gateway` with isolated HOME/config/state and uses real authenticated WebSocket `sessions.create`, `chat.inject`, and `sessions.delete` RPCs. `LD_PRELOAD` injects a bounded native fsync hold **only** on the task-owned archive `.jsonl-stage` file. The observer records Worker creation, termination requests, and actual exit; it does not replace the worker or lifecycle behavior. Instrumentation source is attached.

1. Create two distinct sessions and append synthetic payloads through real Gateway RPCs.
2. Delete the first session with transcript archiving and wait for the native fsync entry trace.
3. Queue deletion/archiving of the second session.
4. Hold native I/O for **185.019698366 seconds**. Both caller RPCs remain pending and no termination request occurs. The worker is still physically executing the held syscall.
5. Release the fault. Both actual deletion RPCs succeed; two resulting archive files contain their respective unique payloads. SQLite `quick_check` returns `ok`.

The observation timestamp is 188.489 seconds after the archive Worker creation. This establishes the missing active-work deadline on the original built path, not merely a helper model of the queue.

See `baseline-rpc.jsonl`, `baseline-native.jsonl`, `baseline-workers.jsonl`, and `baseline-archive-integrity.json` for captured data. Paths are sanitized; timestamps, process/thread IDs, archive hashes, and outcomes are preserved.

## Focused regression contracts

- Admission: active + queued archive claims are bounded to the worker runtime's existing limit. Cancelled queued requests must not free a FIFO slot before preceding native work settles. Overflow must not execute.
- Archive deadline: exercise real one-shot and scoped archive Workers with interruptible flush fault, fire the deadline, require actual thread exit before the successor enters, require staging-file removal, retain original transcript, then archive successfully.
- Reconciliation deadline: use the existing WorkerTaskPool task timeout and confirm lease settlement/agent close ordering, rather than treating the timer as physical teardown.

The interruptible unit fault is not a claim that termination interrupts native fsync. Native blocked-I/O custody proof is separately required and remains pending for the candidate.

## Review and limitations

The code uses the existing archive FIFO, scoped archive session, and reconciliation WorkerTaskPool. Exact temporary-file reports are sent before creation; cleanup occurs after Worker exit, without a directory sweep. Final archive publication, database schemas, transcript bytes, retention, configuration, and restart policy remain unchanged.

A permanently blocked native syscall still requires the existing external supervisor/operator to terminate the process. This patch does not release ownership early or spawn replacement work over live native handles. Current-main reconciliation native-read baseline setup did not reach the intended fault boundary; that failed prerequisite is not reported as product evidence.

## Recorded local checks

- Full focused run:33 passed, 1 failed in602.87 seconds, including compiler 310.31 seconds under host load. The failing new reconciliation fixture captured a timer by exact numeric delay; the pool correctly subtracts elapsed time. Both real archive termination/cleanup/retry tests passed.
- First fixture correction remained invalid because unrelated worker pools also own near-three-minute timers. This failed attempt is retained, not counted as passing.
- Final fixture uses the existing test suite's fake-timer technique before task admission and advances the real pool timer. Targeted reconciliation task-timeout case passes with all original worker termination and lease-order assertions (22.26 seconds including wrapper). The other 33 cases had unchanged inputs and are not rerun for another receipt.
- Core typecheck: maintained `node scripts/run-tsgo.mjs -p tsconfig.core.json --incremental --tsBuildInfoFile .artifacts/tsgo-cache/core.tsbuildinfo`, exit 0, 30.86 seconds.
- Canonical independent review: Codex 0.162.1, GPT-6.1 Sol default route, P0–P2, scoped-clean. Initial attempts selected an unavailable CLI path and the old global 0.142.3 CLI, respectively; both failures are retained, not misrepresented as reviews. No host/provider/model change or credential/config mutation was made. Review covers production source; subsequent test-only correction changed timer control, not product behavior.

- Final type-aware lint and formatting passed after restoring the declared `@openclaw/solid-lint` workspace dependency from the local package store. Mechanical lint corrections supplied the explicit Worker MessagePort transfer list and used a void event listener that joins the same cleanup promise; no lifetime behavior changed. Final-head runtime replay remains pending.
