# PR #168630 — captured runtime behavior proof

Candidate: **5f290ed0edb1bc9a9bdb2d7db09a9615b2d0b9e2**, clean source checkout. Captured 2026-10-10. See [provenance](provenance.json) for build command, versions, artifact hashes and instrumentation. This is contributor-owned evidence, not a Mantis/ClawSweeper authenticated workflow receipt.

## 1. Real compiled owner + physical transport: before / after

Executed the published latest-stable v2026.9.9 completion owner and the candidate's built `deliverCompletionDirect`, using the real shared outbound `sendMessage` pipeline and a physical HTTP receiver. Two arbitrary registered channel plugins exercise the same shared policy. No mocked `sendMessage`, fetch, owner, or outbound runtime; no Vitest runner. The receiver records POST body, 200 response and receipt ID.

| Owner / setting | Completed-result POSTs, per transport | Failure-notice POSTs, per transport |
| --- | ---: | ---: |
| Published stable / setting absent | 1 | 1 |
| Candidate / setting absent | 0 | 0 |
| Candidate / false | 0 | 0 |
| Candidate / true | 1 | 1 |

Candidate authority controls on both transports: retirement before dispatch, retirement after awaited adapter preparation, cancellation after preparation, conflicting requester agent: **zero POSTs**. Retirement returns terminal `source_owner_changed`, including the wrapped outbound error case.

Captured output, not only a runnable proposal:

- [Stable receiver request/response traces](stable-owner-transport-observations.json), [terminal transcript](stable-owner-transport-transcript.log).
- [Candidate 20 recorded outcomes and receiver traces](owner-transport-observations.json), [terminal transcript](owner-transport-transcript.log).
- [Candidate driver](owner-transport.mjs), [stable driver](stable-owner-transport.mjs). Publication redactions require restoring local placeholders to rerun.

Stable instrumentation adds only one export to its original compiled module; provenance records the original hash and exact added line. The function body and outbound pipeline are unchanged. Standalone transport probes have no native requester session, so their captured transcript-mirror warnings are expected; actual native persistence is separately proved below.

## 2. Built CLI → Gateway → native subagent → channel receiver

Entry: `node <candidate>/dist/index.js gateway run …`. Real inbound QA DM invokes native `sessions_spawn` with `thread:false`, `mode:run`; the parent acknowledges and finishes. The controlled model protocol releases the child only after requester settlement; completion model omits the child result. Worker result is `QA-SUBAGENT-TERMINAL-FALLBACK-OK` plus protected internal metadata.

The Gateway, native registry/store, announcement/completion owner and qa-channel HTTP ingress/outbound transport are real. Only the model provider's responses are scripted. The true run uses packaged built private QA plugins; unset/false use repository-staged QA fixtures with the same built Gateway after fresh packaged bootstrap attempts timed out during update repair. No source behavior patches.

| Setting | Native run ID | Receiver child-result count | Exact persisted direct-fallback receipt count |
| --- | --- | ---: | ---: |
| absent | `20bc0758-6be2-4594-993d-4dfb59239317` | 0 | 0 |
| false | `e29f6ad8-1686-4638-bc39-eaf8ceaf8c9d` | 0 | 0 |
| true | `5665ded2-e3d7-491a-92e3-eca70a7d1565` | 1 | 1 |

Unset/false were observed for **30 seconds after authoritative child execution completion**, including requester/retry activity. This is NOT a claim of zero total channel traffic: normal parent acknowledgments and a generic requester recovery reply were observed and retained. The raw child result, protected metadata and direct-fallback receipt remain absent. Final native delivery in those two cases is `suspended` / `permanent_failure`, not falsely credited as delivered or intentional suppression. True records native delivery `delivered`; its exact mirror key binds child session and run ID to the one received child result.

- [Readable correlated Gateway observations](gateway-observations.json) contains native terminal facts, actual receiver events, planned native tool call and provider-request excerpt.
- [Absent-setting captured evidence](gateway/unset/qa-suite-summary.json), [raw diagnostic](gateway/unset/subagent-terminal-diagnostic.json), [CLI transcript](gateway/unset/command-transcript.log).
- [False captured evidence](gateway/false/qa-suite-summary.json), [raw diagnostic](gateway/false/subagent-terminal-diagnostic.json), [CLI transcript](gateway/false/command-transcript.log).
- [True captured evidence](gateway/true/qa-suite-summary.json), [raw diagnostic](gateway/true/subagent-terminal-diagnostic.json), [CLI transcript](gateway/true/command-transcript.log).
- Each directory retains first-class `qa-evidence.json` and the executed YAML scenario. [Driver](run.mts) derives the focused flow from the repository's maintained `subagent-completion-direct-fallback.yaml`.

## 3. Actual latest-stable upgrade, settings + stored session

Downloaded the published npm `openclaw@2026.9.9` tarball, installed production dependencies, and started that installed Gateway. Through its real RPC API, created `agent:main:upgrade-proof`, injected `QA-STABLE-PERSISTED-HISTORY`, and read it back. Stopped stable. Candidate initially refused schema-24 sessions until repair; ran built candidate `doctor --fix --non-interactive --yes`, then started candidate against the **same config and state directory**.

Candidate `config.get` loaded `messages.responsePrefix = QA-UPGRADE-PRESERVED` and `agents.defaults.timeoutSeconds = 73`. Candidate `chat.history` loaded the same stable session ID `754c81a7-6b24-4db0-92d6-8231bd2cfda6` and stable message; candidate then appended `QA-CANDIDATE-USES-EXISTING-SESSION` through `chat.inject` and read both entries back. Settings and stored data were loaded and used, not only hash-compared.

- [Actual RPC request/result trace and preservation verdict](upgrade-trace.json).
- [Command/RPC transcript](upgrade-transcript.log), [stable Gateway log](upgrade-stable-gateway.log), [candidate repair log](upgrade-repair.log), [candidate Gateway log](upgrade-candidate-gateway.log), [driver](upgrade.mjs).

The published release and source candidate share human version `2026.9.9`; exact candidate SHA, package tarball hash and schema migration distinguish them. The upgrade proof covers retained settings/history and continued use; it does not claim identical old default behavior. The default reversal is deliberate and remains a maintainer policy decision.

## Limits and redaction

No live Telegram/Discord account, external-service delivery, media runtime proof, unbounded silence guarantee, or maintainer acceptance is claimed. The portable HTTP transport replaces the external provider only. This matches ClawSweeper's production-owner/real-transport allowance in `prompts/review-item-pr.md` (public ClawSweeper source `ef832edef590efd84628c44ff1ac9cf9c8f1fa0d`, lines 59–70).

Private absolute paths and isolated loopback endpoints are redacted; run IDs, session correlations, observed payloads, statuses and timing are preserved. [Original captured-byte hashes](original-artifact-sha256.json) and `SHA256SUMS` distinguish originals from publication copies. Failed bootstrap attempts are retained under `attempts/`, not counted as successful runtime proof.
