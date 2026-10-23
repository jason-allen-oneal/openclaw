# Delivery recording and canonical reset execution proof

PR: https://github.com/openclaw/openclaw/pull/181105  
Final candidate: `a7f5cc2f35fb2e0254207492149d52d3923c0cbc`  
Baseline executable: `2975dedca83e94d3530fdb339077bfe040d1b560`  
Task base: `a8ead196291935d24c44a4f40b67397d88c70256`

The shipped baseline Gateway fails canonical reset while an accepted command reply is being recorded. The exact final candidate completes the same flow and preserves transcript bytes across a graceful retained-state restart. A separate real-agent/local-model lane passes delivery, reset, and restart on the same final executable. Additional exact-head executions now cover the reported CLI-backed pre-finalization reset and physical session replacement, accepted-originating-channel delivery during physical replacement, and an abrupt process kill after CLI reply acceptance while the HTTP receipt is withheld. The evidence below distinguishes existing durable-before-send behavior from the reset-ordering behavior this patch changes.

## Observed results

| Execution | Physical HTTP sends / durable accepted replies | Canonical reset | Gateway / driver exit |
|---|---|---|---|
| Baseline command control | 1 / 1 | Not requested | Gateway eventually 0 |
| Baseline command held-HTTP overlap | 1 / 1 | Fails `SqliteSessionMutationConflictError` | 0 / 1, intentional red assertion |
| Final command control | 1 / 1 | Not requested | First Gateway 0 |
| Final command overlap | 1 / 1 | Succeeds; reply before reset boundary, absent from new context | 0 / 0 |
| Final command overlap after retained-state restart | 1 / 1 | Succeeds; retained transcript event bytes unchanged | 0 / 0 |
| Final real-model control | 1 / 1 | Not requested | First Gateway 0 |
| Final real-model overlap | 1 / 1 | Succeeds; assistant reply before reset boundary, absent from new context | 0 / 0 |
| Final real-model overlap after retained-state restart | 1 / 1 | Succeeds; retained transcript event bytes unchanged | 0 / 0 |

- Baseline: [receipt](baseline/receipt.json), [command receipt](baseline/command-receipt.json), [Gateway log](baseline/gateway-first.log), [raw lifecycle log](baseline/gateway-runtime.jsonl), [executable identity](baseline/runtime-identity.json).
- Final deterministic command producer: [receipt](candidate/receipt.json), [command receipt](candidate/runtime-command-receipt.json), [first Gateway](candidate/gateway-first.log), [restarted Gateway](candidate/gateway-restart.log), [raw lifecycle log](candidate/gateway-runtime.jsonl), [executable identity](candidate/runtime-identity.json).
- Final actual agent/model producer: [receipt](candidate-real-model/receipt.json), [command receipt](candidate-real-model/runtime-command-receipt.json), [first Gateway](candidate-real-model/gateway-first.log), [restarted Gateway](candidate-real-model/gateway-restart.log), [raw lifecycle log](candidate-real-model/gateway-runtime.jsonl), [executable identity](candidate-real-model/runtime-identity.json), [installed model identity](model-identity.json).

Final build: **148.01 seconds**, exit 0 ([receipt](final-build-command-receipt.json)). Final deterministic runtime: **63.89 seconds**, exit 0. Final real-model runtime: **97.11 seconds**, exit 0. Both final lanes record exactly the same executable/build/owner hashes and final commit in `dist/build-info.json`.

The baseline and deterministic final driver SHA256 are identical: `9b02eed637551d2798f2ef5f8dde20394ff7001bb1f5ba00cd40c099e2e91ede`. The separate model driver SHA256 is `2c977fe85e164747522cc393aa5b1616a875d5d55d1e33bfa33302e941e5dfe5`.

## Reported CLI, physical replacement and abrupt-crash coverage

All new lanes use the same unchanged final source/build identity `a7f5cc2f35fb2e0254207492149d52d3923c0cbc`. No production source, persistence fences, cleanup owners or delivery authorization is replaced by the fixtures.

| Boundary | Actual execution and result | Receipt |
|---|---|---|
| CLI before finalization + reset | Registered public CLI backend starts a real Node subprocess that calls existing Ollama qwen3:0.6b, then holds stdout. `sessions.reset` cancels old work before release: no stale external reply and no missing delivered record. | [CLI originating-channel receipt](candidate-cli-origin-crash/receipt.json) |
| CLI before finalization + physical replacement | `sessions.delete(deleteTranscript:false)` followed by `sessions.create` changes the physical session ID. Old CLI output does not escape into the new context. The driver asserts the IDs differ. | [CLI originating-channel receipt](candidate-cli-origin-crash/receipt.json) |
| Reply accepted + physical replacement | Actual model reply already has one canonical assistant row while the receiver holds HTTP200. Deletion returns retryable UNAVAILABLE after its existing15s drain, preserving storage. After delivery settles, deletion/recreation succeeds with a different session ID; old bytes remain durable and new history excludes the reply. Repeated after restart. | [Accepted-origin replacement receipt](candidate-origin-rebind/receipt.json) |
| CLI reply accepted + abrupt process death | Read-only SQLite confirms one canonical assistant row before HTTP acknowledgment. Kill actual Gateway578586 with SIGKILL; release withheld HTTP only after physical exit. Gateway579228 starts from retained state, reads the accepted reply through `chat.history`, preserves all canonical event JSON/compressed bytes and passes SQLite quick_check. A new real CLI reply then delivers/persists successfully. | [CLI crash receipt](candidate-cli-origin-crash/receipt.json), [process log](candidate-cli-origin-crash/gateway-after-sigkill.log) |

The originating-channel plugin uses public `registerChannel` and `dispatchReplyWithBufferedBlockDispatcher`, sets `OriginatingChannel`, and deliberately throws if the direct dispatcher transport is used. Its `sendText` makes real loopback HTTP requests through the existing delivery lifecycle. The CLI plugin uses public `registerCliBackend`; it does not inject a replyResolver or transcript writer. The model backend performs actual inference, and all canonical assertions select assistant rows rather than matching the inbound prompt.

The reporter's invariant is that no externally visible reply lacks a durable canonical record. In these exact reported paths, the CLI/model owner records before send; reset/rebind cancels unfinished CLI work; deletion protects physically active delivery through existing bounded refusal. This patch repairs the remaining reproduced reset/settlement conflict. It adds no historical-append authority, durable outbox or arbitrary raw-database rebinding support. It does not claim coverage of every possible disk failure, OOM, external-channel acknowledgment contract or queue recovery policy.

The final combined CLI/origin/crash execution took117.26s, exit0. Earlier [direct CLI](candidate-cli/receipt.json) and [originating CLI](candidate-cli-origin/receipt.json) runs are retained. The first accepted-rebind fixture failed because Node's execFile error string omitted the structured RPC refusal on stdout; its [receipt](origin-rebind-fixture-v1/receipt.json) and exact original driver are retained. The corrected driver asserts UNAVAILABLE, retryable:true and the storage-preserving refusal, then proves actual replacement. This was a fixture assertion correction, not a product repair or waived result.

Reproduce with the matching public plugins and existing local model endpoint:

```sh
python3 proof/remote-delivery-cli-origin-crash.py runtime
python3 proof/remote-delivery-origin-rebind-v2.py runtime
```

## Production boundary exercised

1. Start built `openclaw.mjs gateway run` with synthetic HOME, state and workspace, claimed loopback ports, and no production state or channel credentials.
2. Load the external proof plugin through its supported manifest/startup activation. It registers a Gateway method and calls public `api.runtime.channel.reply.dispatchReplyWithBufferedBlockDispatcher`.
3. Create a real session using `gateway call sessions.create`, seed using `chat.inject`, then request a reply. The deterministic lane injects a disclosed command-reply resolver so the normal production owner creates the command-reply transcript mirror. It never injects private transcript metadata or imports lifecycle/transcript owners.
4. A physical loopback HTTP receiver accepts the reply and holds HTTP 200. Start canonical `sessions.reset` through CLI/RPC. Observe the existing owner's `session lifecycle queue waiting` diagnostic before releasing HTTP 200. No arbitrary-delay assumption or patched admission hook is used.
5. Await both RPCs. Inspect only the canonical agent SQLite database, read-only. Assert one physical send, one durable reply, successful reset, reply before reset boundary, and absence from new-context `chat.history`.
6. Stop cleanly and restart with retained isolated state/config. Verify control history and every retained transcript event byte, then repeat the overlap. Both clean exits are recorded.

The **real-model lane omits `replyResolver` entirely**. The default agent reply path calls actual Ollama `qwen3:0.6b`, an already installed 751.63M-parameter Q4_K_M model. The synthetic request asks it to emit a marker; all three returned markers came from inference. Model selection has no cloud fallback, tools are denied for this bounded prompt, and a task-owned loopback-only SSH reverse forward connects the remote Gateway to the local Ollama server. The forward was stopped after completion. No model download, production configuration change, or credential copy was needed. The model lane checks assistant rows specifically, so the prompt cannot satisfy its durable-reply assertion. This is a separate sibling-path proof; the deterministic command lane remains the baseline red/green reproduction of the post-delivery mirror race.

The baseline executable was built for the memory-capture PR. `git diff a8ead196291935d24c44a4f40b67397d88c70256 2975dedca83e94d3530fdb339077bfe040d1b560 -- src/auto-reply src/sessions src/gateway` is empty. Relevant delivery/reset owners therefore match the task base. Baseline ran on local Linux x86_64; final candidates ran on a separate Linux x86_64 homelab host, all on Node 24.22.1. CPU/resource conditions are not claimed identical.

## Reproduce

Use a clean candidate checkout and pinned workspace dependencies. Copy the scripts and plugin directories here into a sibling `proof/` directory. The wrappers expect `candidate/` and `runtime/node-v24.22.1-linux-x64/bin/` beside `proof/`; adapt only these task filesystem roots. Runtime output directories must be fresh.

```sh
python3 proof/remote-delivery-final.py build
python3 proof/remote-delivery-final.py runtime
python3 proof/remote-delivery-final.py consumers
# Real local Ollama qwen3:0.6b must be reachable at the configured loopback endpoint:
python3 proof/remote-delivery-model.py runtime
```

Build recipe: `node --import ./scripts/tsx.mjs scripts/build-all.mts qaRuntime`. `capture-runtime-identity.py` rejects a build-info commit mismatch before execution and hashes shipped CLI/owners. Model config uses native `api: ollama`, 16,384-token context and thinking off. `ollama-local` is the documented synthetic local-availability value, not a credential.

## Supporting checks and retained failures

All four affected consumer files pass on the final exact head: **45 tests**, **80.83 seconds** wrapper duration ([log](final-consumers.log), [command receipt](final-consumers-command-receipt.json)). They cover owner settlement (17), tool-authored transcripts, pending final dispatch, and pending final delivery.

The initial consumer run on `8c111e3` exposed raw fixture callers awaiting owner settlement without running the outer dispatcher settlement lifecycle. The first timeout and task-owned termination remain in [original log](fixture-repair/consumers.log) and [receipt](fixture-repair/consumers-command-receipt.json). A partial fixture migration passed 15 and timed out in 2 further completion sites ([log](fixture-repair/owner-fixture-all-v1.log)). The complete migration passed 17/17 even under a stricter 15-second per-test diagnostic bound ([log](fixture-repair/owner-fixture-all-v2.log)). No timeout was increased or assertion weakened.

The final [test-only delta](fixture-repair/final-test-only.diff) completes `settleReplyDispatcher` at genuine delivery completion and cleanup points while preserving intermediate transport-only observations. Production sources are unchanged from `8c111e3`. The prior successful runtime remains separately labeled [prior-head evidence](candidate-prior-head/receipt.json); it is not relabeled as final-head proof. Both final native lanes were rebuilt and replayed after the test-only commit.

Independent Codex review of the fixture migration found a failure-cleanup gap ([initial report](fixture-repair/owner-fixture-review.md)). The fallback was repaired; final review is [scoped-clean P0–P2](fixture-repair/owner-fixture-review-v2.md). Its final unused-assignment lint correction retains the reviewed fallback without storing an unused result. Scoped type-aware lint, format and `git diff --check` pass. Production change had an earlier scoped-clean P0–P2 review.

Final-head [CI 39881320624](https://github.com/openclaw/openclaw/actions/runs/39881320624) completed successfully. The [final CI snapshot](final-ci-snapshot.json) has no failed or pending checks. Prior-head [CI 39877510359](https://github.com/openclaw/openclaw/actions/runs/39877510359) passed, including committed real HTTP/SQLite/reset regression 2/2 and dispatcher 3/3 ([extracted log](ci-exact-head-regressions.txt)); these are labeled prior-head checks, not final-head gate evidence.

## Setup observations and limits

- Initial local plugin activation was absent and returned unknown method; corrected in the external plugin. Interrupted early builds/startups had no terminal verdict. An early observer followed package symlinks recursively and hit ELOOP; corrected to read only canonical agent SQLite before the retained baseline run.
- First remote build failed before compiling because workspace dependency links were omitted during transfer. Matching workspace dependency directories were copied and the subsequent build passed. [Failed setup receipt](build-setup-missing-workspace.receipt.json) is retained, not product evidence.
- No real Discord/external channel, OOM, raw-database rebinding or generalized new outbox/durable-destination policy is claimed. Supported physical replacement and actual abrupt Gateway death are proved in the additional matrix. Both baseline and final deterministic reset overlap contain the accepted reply; the reproduced production difference remains canonical reset failure versus success.
- All users/messages/state are synthetic. Raw logs and receipts are published; SQLite databases and production state/credentials are not. The SHA256 manifest covers retained public files.
