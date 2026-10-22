# Session-memory capture evidence — #159826

Candidate: `2975dedca83e94d3530fdb339077bfe040d1b560`. Baseline: `a8ead196291935d24c44a4f40b67397d88c70256`.

## Observed behavior

| Boundary | Observed result |
| --- | --- |
| Baseline shipped CLI / Gateway / WebSocket | Six distinct `chat.inject` markers, six concurrent `sessions.reset` calls and six save-success logs retained only **five** files. Two saves name the same path; `CAPTURE-baseline-2-ONLY` was lost. |
| Exact-head candidate reopens baseline state | Existing six sessions load; all five surviving baseline artifacts remain byte-identical. Six new concurrent reset captures are retained exactly once with matching hashes/session provenance: **11 files** total. |
| Exact-head Gateway restart | Six further concurrent captures succeed: **17 files** total. All prior 11 files remain byte-identical, each retained marker occurs once, and all provenance hashes/session identities match. Both Gateway exits are 0. |
| Interrupted publication and recovery | Baseline-built lock/provenance owners commit provenance without a file, then the process is SIGKILLed. Exact-head built handler reclaims the dead lock, reuses the absent filename and keeps conservative untrusted classification; **6/6 captures** survive. A fresh process adds six more: **12/12**, with earlier hashes and provenance unchanged. |
| Regression | New real-filesystem/SQLite regression fails on baseline (1 of 6 retained); relevant candidate suites pass **19/19**. |

The fixed Gateway cannot recover the baseline's already-overwritten capture. The successful candidate assertions concern retaining all new captures and preserving the five surviving baseline artifacts.

## Shipped entry-point records

- [Baseline request/response and persisted-state receipt](gateway-baseline-receipt.json), [baseline Gateway output](gateway-baseline.log)
- [Exact-head request/response, before/after and restart receipt](gateway-exact-receipt.json)
- [Exact command exit](gateway-exact-command.json), [runtime console](gateway-runtime-output.log)
- [Upgraded Gateway log](gateway-upgraded.log), [restarted Gateway log](gateway-restart.log)
- [Portable Gateway driver](gateway-runtime.mjs)
- [Built entrypoint/production-owner hashes](runtime-identity.json), [build command/exit](build-command.json), [build output](build.log)

Execution uses `node openclaw.mjs gateway run` and real loopback-WebSocket `node openclaw.mjs gateway call` requests. The driver runs with `PROOF_BUILD_ROOT`, `PROOF_SOURCE_ROOT`, `PROOF_ARTIFACT_ROOT`, `PROOF_SOURCE_HEAD`, `PROOF_LABEL`, `PROOF_RESTART=1` and `PROOF_RETAIN_EXISTING=1`; invoke it using `node --import ./scripts/tsx.mjs <driver>` from the candidate checkout. The baseline used the earlier driver before the retained-state options were added; its reset sequence and shipped boundary are unchanged. The source import only claims an isolated test port; hooks, transcript writes, session resets, database and filesystem operations use the built product.

## Interrupted-state records

- [Process exits and retained-bytes/provenance comparison](interrupted-receipt.json)
- [Injected interrupted state](interrupted-state.json)
- [Recovered artifacts](interrupted-recovered.json), [restarted artifacts](interrupted-restarted.json)
- [Recovery output](interrupted-recovered.log), [restart output](interrupted-restarted.log)
- [Portable fault driver](built-interruption.mjs)

This supplementary fault is explicitly injected through real built lock/provenance owners, followed by direct built-hook execution with synthetic captured excerpts. It is not claimed as an observed live Gateway crash. The primary end-to-end proof above uses shipped Gateway commands.

## Checks, scope and limits

[Regression RED](test-red.log), [focused GREEN](test-green.log), [exit/timing summary](focused-checks.json), [committed source hashes](candidate-source.json), [artifact checksums](SHA256SUMS).

Focused command: `node scripts/run-vitest.mjs src/hooks/bundled/session-memory/handler-auto-reset.test.ts src/hooks/bundled/session-memory/handler.test.ts src/hooks/bundled/session-memory/handler-admission.test.ts --maxWorkers=1`. Three files / 19 tests; reported Vitest duration 24.91s, wrapper wall 109.73s including compiled workers. Formatting, scoped type-aware lint (`config/tsconfig/oxlint.core.json`) and core typecheck (`tsconfig.core.json`) passed. Source bytes were verified identical before commit; the exact committed head was then built and exercised above. Broad CI remains on the PR.

There is no model/provider or external channel invocation, no embedding publication, and no network-filesystem/multi-Gateway claim. Synthetic conversation text and real session/filesystem/SQLite owners are used throughout. Public copies replace private checkout/home/artifact roots and host names and strip ANSI coloring; executable loopback constants and synthetic IDs remain. Portable driver copies are provided for reproduction, not falsely presented as separately rerun copies.

The implementation reuses the existing file-lock owner around allocation, provenance reservation and exclusive creation. Transcript capture and optional slug generation stay outside that lock. The sequential filename allocator and existing provenance recovery behavior remain authoritative. No schema, provenance format, configuration, retention policy, or durable filename registry is added; old rows do **not** permanently reserve absent files. The retained-state and absent-file-reuse observations verify that no-migration case instead of adopting the unresolved durable reservation proposed in closed #144146.

Simplification: no new manager, schema or reservation registry. Production +23/-10, regression +69, docs +2/-1; every hunk protects the single capture-retention invariant. The added regression independently checks markers, content hashes, session identities and trusted/untrusted classification.
