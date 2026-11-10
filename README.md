# Real token-sharing Gateway proof — PR #196344

Candidate **16d08c5bc9b39a67aa539e2da12a646e98421fec**, executed 2026-11-10. No product-source modification, production Gateway update or merge.

## Results

| Required boundary | Executed result | Evidence |
|---|---|---|
| Real grant + Gateway assessment | Supported stable SIWC login acquired a real grant. Candidate Gateway delivered **4 model-written assessments** during a successful 61.8-second turn. | [Gateway receipt](gateway-assessments.json), [terminal output](terminal-output.txt) |
| Latest-stable upgrade | Official npm 2026.11.2 installed and started; same isolated state migrated through canonical Doctor, then exact candidate started. Same profile/account label, utility model, retained session ID/provider/model/runtime and transcript payloads. | [Upgrade receipt](upgrade-receipt.json), [migration/teardown](migration-and-shutdown.txt) |
| Strict explicit limits | Same persisted real grant, maxTokens=37/temperature=0, omitted mode: exact unsupported-limits error, no sentinel native launch. | [Strict receipt](strict-real-control.receipt.json), [driver](strict-real-control.mjs) |
| API-key preservation | Actual managed Codex 0.164.0 sent two physical TLS WebSocket requests preserving 300/0.2 and 37/0, with returned native output. Synthetic API key/receiver. | [Full receipt and wire payloads](api-key-control.receipt.json), [driver](api-key-control.mjs) |
| Terminal/persistence | Fresh sessions.describe and chat.history agree on revision13, health=done, headline=OBSERVER_PROOF_COMPLETE. Stable and candidate Gateway exit0/join results were observed in the execution-tool terminal receipts and transcribed in the operator-recorded build/exit receipt; the included log excerpts alone establish only SIGTERM handling. | [Gateway receipt](gateway-assessments.json), [build/exit receipt](build-receipt.json) |

## Executed product boundary

The external [RPC observer](observe-gateway.mjs) connects to the separately launched **unmodified built Gateway**, creates a normal session, subscribes to messages and observer visibility, submits four harmless sleep steps, and waits for terminal settlement. Gateway owns auth resolution, runtime/model selection, provider calls, observer validation, broadcasting and persistence. No model or transport mocks are injected into this scenario. Main activity uses OpenClaw/Sol; utility selection is Codex/Luna. Four assessment texts in the receipt are actual model output, not local fixtures.

A real supported SIWC authorization was completed with the official stable CLI in a fresh named test profile. No existing production grant was copied. Stable and candidate use that same on-disk profile; credential/database bytes and account identifiers are not published. The strict control loads that actual persisted grant through the built auth SDK, without replacing OAuth resolution.

## Upgrade scope and observed separate failure

Stable and candidate both rejected an **ordinary Codex-primary** turn with `Codex Platform auth requires a prepared API key`. The retained failed session and its transcript survived the package/state upgrade. This is a separate harness-support projection issue, also reported in [#162811](https://github.com/openclaw/openclaw/issues/162811#issuecomment-6152987948); it is **not a red reproduction of this PR's observer sampling guard** and was not patched to obtain this proof. The stable Gateway also made a successful background public-Responses metadata request; it is not claimed that stable made no provider calls.

After the retained-state comparison, a **new** session used an OpenClaw-runtime Sol primary while retaining the same account, public endpoint and Codex-runtime Luna utility. That normal configuration reaches the exact observer path this PR repairs. The artifact does not claim identical ordinary-primary workload red/green across stable and candidate. Real provider request headers/bodies were not intercepted; public endpoint attribution is configuration/source-backed, while model assessments were directly observed through Gateway events.

Canonical Doctor migrated agent schema27→41. No database reseeding, grant replacement, runtime source patch or production-state copy was used. [Readback driver](readback-gateway.mjs) confirms subsequent terminal persistence. An initial readback assertion incorrectly expected an interim model digest to remain after terminal settlement; it failed because revision13 correctly became `done`. That failed assertion is retained, followed by the terminal-state check. Four delivered assessments remain independently evidenced.

## Controls and limitations

The two sampling controls call the **built harness API**, not a public Gateway RPC. The strict control uses the real grant and a launch sentinel; the API-key control uses synthetic credentials/output, normal managed binary resolution and a local physical TLS receiver. It initializes the built plugin-root setter as registration normally does. No completion/transport modules are mocked. Runtime hashes stayed unchanged. Native PID sampling missed thread-owned child launches; post-run census found no control-owned native processes remaining, but no per-PID lifecycle proof is claimed for that control. Prior native synthetic proof remains available [here](https://github.com/jason-allen-oneal/openclaw/tree/5eff9dc8b0576a1b025a69706f22326034c88f58).

These executions do not approve the advisory contract on a feature owner's behalf. That decision remains open.

## Reproduction and setup history

1. Install official `openclaw@2026.11.2` in a task-only package prefix. Set isolated HOME, OPENCLAW_HOME, CODEX_HOME and named profile. Complete supported `models auth login --provider openai --method siwc` personally; do not import ambient Codex credentials.
2. Enable openai/codex, configure Luna utility with Codex runtime, enable Control UI session observer, use a loopback-only Gateway. Start stable, run the RPC driver in `stable` phase. Stop and join stable.
3. Build exact candidate with pinned dependencies and `pnpm build:runtime`. Start same named profile. On schema-upgrade exit78, run canonical `doctor --fix --non-interactive --no-workspace-suggestions` with service repair policy external, then start candidate. Run `candidate` phase for retained-state assertions.
4. Configure Sol/OpenClaw primary, leave Luna/Codex utility and auth unchanged, run `observer` phase. Run readback after settlement. Run strict control with isolated state env. API-key driver takes candidate checkout as its only argument and isolates its synthetic environment itself. Stop/join candidate.

Drivers accept checkout/config/WebSocket URL/output paths as shown in their argument declarations. Published driver copies normalize private filesystem paths to placeholders; loopback literals are preserved for executable address-family/proxy behavior. Stale SSE wording in the API driver/receipt is annotated as WebSocket in this publication projection; [private-source hashes](private-source-hashes.json) preserve executed-byte identity separately. The observer driver gained retained-state checks and an observer phase during execution; its final source is not claimed to be byte-identical to the first stable invocation. All private raw receipts are hash-bound, not published.

Setup failures retained, not counted as passes: stale shared dependency links; sparse checkout missing shared UI assets; canonical build lock recovered only after owners stopped; first Doctor refused writable private-root ancestors; initial duplicate session label; API fixture gpt-5.4 unavailable; unowned explicit wrapper/command; HTTP-only receiver before supported WebSocket capture. Fixes were limited to fixture prerequisites, configuration and external drivers. Product source remains exact-head. Build warnings were nonfatal UI bundle-size warnings.

Public receipts are whitelisted/redacted projections. No account email, access/refresh token, local Gateway token, state database, nonpublic endpoint or full model catalog is included. Public loopback constants are retained, not private network addresses. SHA256SUMS binds published files. A proof pass is not merge approval or deployment.
