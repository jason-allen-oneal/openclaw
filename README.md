# Whole-Gateway SIGKILL with a live native hook — issue 111370

**No reproducible live-helper leak in this tested boundary.** This is negative reproduction evidence, not a new fix, a closed issue, a Platinum verdict, or proof that every historical deployment is fixed.

- Issue: https://github.com/openclaw/openclaw/issues/111370
- Executed 2026-10-23 00:07–00:08UTC, using the task's upstream-main snapshot `a8ead196291935d24c44a4f40b67397d88c70256`.
- Built launcher/Gateway/plugin runtime; build-info identifies OpenClaw 2026.10.5, built 2026-10-22 02:50:42UTC. This is the task baseline, **not a claim about the latest upstream main at publication**.
- Native runtime actually executed: bundled `codex-cli 0.162.1`, verified from both live `/proc/<pid>/exe` paths before the kill. It was not the old global Codex 0.142.3 installation.
- Linux x86_64, kernel 7.1.5+kali-amd64, Node 24.22.1; ordinary isolated host process, not a memory-capped Docker container.

## The previously missing boundary was reached

The shipped `openclaw.mjs gateway run` started with isolated HOME, config, state, Codex home, workspace and loopback port. It accepted actual `sessions.create` and `chat.send` WebSocket RPCs. The production Codex harness started real native app-servers; an HTTP Responses fixture returned a native `exec_command` tool call. A temporary plugin held that call's `before_tool_call` policy callback for 60 seconds, keeping the **real generated `openclaw-hooks` helper** alive long enough to observe it.

The observer confirmed a sleeping helper with nonzero RSS, a native Codex parent and the actual Gateway's callback marker. It then sent **SIGKILL only to the whole Gateway PID 171413**, not to Codex, the helper, or their process groups. The Gateway's exit event recorded SIGKILL. The helper's session/process group differed from the Gateway's, so killing the Gateway group was not substituted for the requested failure.

No wrapper replaced the Gateway, Codex executable, helper entrypoint, hook deadline or process cleanup. The maintained [native-hook-pressure QA test](https://github.com/openclaw/openclaw/blob/a8ead196291935d24c44a4f40b67397d88c70256/extensions/qa-lab/src/codex-native-hook-pressure.e2e.test.ts) supplied the synthetic-provider/native-tool pattern. The proof did not enable a runtime-force flag or hosted-Gateway lifeline. It used normal configured Codex selection, workspace-write sandboxing and bundled native code.

## Observations

All times are observed offsets after Gateway SIGKILL; disappearance is bounded by sampling, not an exact exit timestamp.

| Process | PID | PPID before kill | RSS before kill(KiB) | Last live(ms) | First absent(ms) |
|---|---:|---:|---:|---:|---:|
| Generated native hook |175570|174177|112792|199|226|
| Active Codex app-server |174177|174165|351808|280|307|
| Catalog/probe Codex app-server |173415|173387|283532|199|253|

The probe app-server had one transient zero-RSS zombie sample between its last live and absent observations. The helper and active app-server had no zombie samples. This was not treated as live retained memory.

145 process snapshots cover the next 19.990 seconds, beyond the production 9-second relay deadline. At the end **no recorded process remained live and no recorded zombie remained**. A subsequent narrow `/proc` rescan also found no helper/app-server belonging to this isolated fixture. **`cleanupSignals: []`**: the observer did not terminate any descendant during or after the measured window. No Gateway restart/startup sweep was used to make the processes disappear.

The parent boundary is materially stronger than the previous issue comment's app-server-only kill. It does not replace that complementary proof.

## Deadline and existing lifecycle explanation

The default generated Codex command-hook timeout is 10 seconds; the existing OpenClaw relay generator reserves a 1-second margin and passes 9 seconds to the helper. This fixture supplied no timeout override. The 9-second value is established by the pinned generated-runtime/source constants, not by a captured pre-title argv string: the helper had already set its process title to `openclaw-hooks` when the policy callback was observed.

Existing owners already have the necessary cleanup paths:

- [OpenClaw native hook generation](https://github.com/openclaw/openclaw/blob/a8ead196291935d24c44a4f40b67397d88c70256/extensions/codex/src/app-server/native-hook-relay.ts#L610) installs synchronous finite hooks; [POSIX command generation](https://github.com/openclaw/openclaw/blob/a8ead196291935d24c44a4f40b67397d88c70256/src/agents/harness/native-hook-relay-command.ts#L134) replaces the shell with the helper using `exec`.
- [OpenClaw relay CLI](https://github.com/openclaw/openclaw/blob/a8ead196291935d24c44a4f40b67397d88c70256/src/cli/native-hook-relay-cli.ts#L85) establishes the deadline before stdin and carries it through native relay/Gateway invocation.
- Personally inspected exact `rust-v0.162.1` tag, commit `092d3acd6bec3e3a14bdc7e7a2810ab628ab759d`: [stdio transport](https://github.com/openai/codex/blob/092d3acd6bec3e3a14bdc7e7a2810ab628ab759d/codex-rs/app-server-transport/src/transport/stdio.rs#L133) observes EOF and closes the connection; the [single-client processor](https://github.com/openai/codex/blob/092d3acd6bec3e3a14bdc7e7a2810ab628ab759d/codex-rs/app-server/src/lib.rs#L1182) exits its message loop and [shuts down threads](https://github.com/openai/codex/blob/092d3acd6bec3e3a14bdc7e7a2810ab628ab759d/codex-rs/app-server/src/lib.rs#L1340).
- [Codex command runner](https://github.com/openai/codex/blob/092d3acd6bec3e3a14bdc7e7a2810ab628ab759d/codex-rs/hooks/src/engine/command_runner.rs#L253) owns its hook via `ProcessTreeGuard`, whose drop kills the Unix process group. Its finite timeout covers sending stdin and waiting for output.
- OpenClaw's existing [durable app-server registration/reaper](https://github.com/openclaw/openclaw/blob/a8ead196291935d24c44a4f40b67397d88c70256/extensions/codex/src/app-server/transport-process-registration.ts) supplies restart recovery; no restart was performed here, so that sweep is not credited for this measured cleanup.

The fast disappearance is consistent with pipe-EOF/native-thread cleanup. This proof did not instrument which cleanup instruction won, so it does not claim to distinguish that path from relay transport failure or another existing native owner. It does show that no new parent watcher/sweeper is justified by this reproduction.

## Scope and remaining uncertainty

Covered: one real live native helper, whole-Gateway SIGKILL, two native app-servers, nonzero pre-kill RSS, identity-stable PID/PPID/state/RSS observations beyond the relay deadline, no observer cleanup and no restart.

Not covered: actual cgroup OOM, the original 2026.6.11 dependency pair, memory pressure with 17–65 concurrent helpers, three repeated crash bursts, a non-reaping container PID 1, macOS/ARM64, or an external paid model inference call. The deterministic model transport is explicit fault-fixture input, not live-provider evidence. No conclusion about those untested variants is implied.

## Reproduce and inspect

With a built checkout at the identified baseline and its pinned dependencies:

```sh
PROOF_BUILD_ROOT=/path/to/built/openclaw \
PROOF_ARTIFACT_ROOT=/path/to/new/isolated/proof-run \
node gateway-crash.mjs
```

The driver uses only Node builtins. It binds its own loopback ports and writes only the selected proof directory. The callback stall is deliberate instrumentation. A 400/404 rejection of attempted Responses WebSocket upgrades is captured before native HTTP fallback; that fallback reached the actual hook. Gateway readiness took 18.104 seconds and the kill occurred 49.564 seconds after driver start.

- `receipt.json`: complete run outcome and zero cleanup-signal list.
- `processes.jsonl`: timestamped raw process observations, with only path sanitization.
- `events.jsonl`, `gateway.log`, `policy.jsonl`: real RPCs, native process identity and policy boundary.
- `runtime-identity.json`: build metadata, relevant artifact/native executable hashes and precise process timing bounds.
- `gateway-crash.mjs`: executed driver; `config.json`: synthetic fixture config.
- `SHA256SUMS`: hashes of the published sanitized files.

Publication sanitization replaces the absolute build/proof home paths with `/openclaw` and `/proof/run`, the remaining operator home with `/home/operator`, and redacts host PATH. It does not alter PIDs, start ticks, offsets, states, RSS values, verdicts, or the synthetic fixture inputs. Original local artifacts are retained separately. No real credentials, user messages, production state or home data were used/published.
