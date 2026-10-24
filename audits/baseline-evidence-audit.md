# Native baseline evidence audit

Read-only reconciliation of existing evidence, 2026-10-24 UTC. No tests, builds, runtime launches, source changes, or public writes. This report is the only audit artifact written.

## What actually completed

- Baseline Android source `dbac7730a12c90e95143f23e556199ab642e639e` ran against official Gateway 2026.9.6 / `eb377ac59e6c9fd6c7705028034812becf00271b`. Installed app/test APK hashes match the saved build artifacts.
- Observation-only instrumentation passed one test and completed its bounded capture. That verifies the observation harness, **not** product correctness.
- The native app was the sole metadata-event-driven follow-up reader; the seed client exited before native capture. No events were injected.
- The native capture/app/logcat stopped. The interrupted outer command's proxy and tunnel were separately reconciled as gone. Remote cleanup confirms the seed, sampler, Gateway, and inference server are gone, Gateway exit 0, and ports 20094/20095 free. The emulator is not covered by these shutdown claims.
- The independently initiated agent turn completed and its final reply was verified in persisted history. It did **not** overlap the connected native app's actual agent execution (details below).

Sources: `baseline-idle-ready/{installed-identity.json,native.receipt.json,reconciled-cleanup.json,idle-turn/action-receipt.json}` and `legacy-native-20261023-2012/{identity.json,seed-receipt.json,cleanup-receipt.json,inference-close.json}`.

## Measurement boundaries and native request ownership

All times are 2026-10-24 UTC. The 105.162-second observation starts at native-ready **00:11:42.486**; it is not a 105-second pure-idle phase. The explicit `natural-idle` phase runs **00:12:13.187–00:13:16.060 = 62.873 seconds**. The operator socket closes at **00:13:29.346**.

Request ownership is inferred from the exact request shape and the saved baseline source: `NodeRuntime.kt:6421` sends general inventory, `:6450`/`:8536` send provider-config inventory, and `ChatController.kt:4766` sends session-scoped configured inventory. These are three native owners, not 51 ChatController requests.

| Native owner / `models.list` shape | Setup requests | Natural-idle requests | Turn-labelled requests | Total requests |
| --- | ---: | ---: | ---: | ---: |
| NodeRuntime general / `{}` | 10 | 24 | 4 | 38 |
| NodeRuntime provider settings / `view=provider-config` | 10 | 24 | 4 | 38 |
| ChatController / `view=configured`, session and agent | 9 | 3 | 4 | 16 |
| **Total** | **29** | **51** | **12** | **92** |

The natural-idle window also contains 26 `chat.metadata`, 23 `models.authStatus`, two `health`, and ancillary native requests. It receives 23 natural `chat.metadata.changed` events, two `health` events, four ticks, and one host-stats event. Its aggregate catalog request rate is 0.811/s, not the original reporter's exact approximately 2 Hz workload.

Every one of the **51 idle-origin catalog requests** received a successful 732-row response. All 732 rows were marked available; no missing-auth rows were represented. Response latency by owner:

| Owner | Responses | Minimum | Median | Maximum |
| --- | ---: | ---: | ---: | ---: |
| General inventory | 24 | 2.277 s | 4.698 s | 5.736 s |
| Provider configuration | 24 | 1.455 s | 4.0325 s | 5.251 s |
| Chat configured inventory | 3 | 3.383 s | 4.135 s | 4.398 s |

Across all phases, the proxy records 91 successful catalog responses with the same model-identity hash and 732 available rows; overall latency is 1.418/3.989/5.736 seconds (min/median/max). **Only 90 were observed before native operator disconnection**: one general-inventory reply arrived 247 ms after the socket closed. Two catalog requests were unresolved at closure; that later reply resolves one in the proxy ledger, while one provider-config reply remains unobserved. Do not equate 91 proxy responses with 91 app-delivered/accepted replies.

Source: independently recalculated from `baseline-idle-ready/native-wire.jsonl` (phase marker timestamps, request IDs, request params, responses, and socket-close ledgers).

## What the app accepted and displayed

- The observation-only sampler records one unchanged chat state: resumed activity, **chat catalog rows 0**, and **chat error/warning null**. It polls every 100 ms and records only state changes.
- The saved baseline APK contains a diagnostic log immediately after ChatController accepts its catalog; no `catalog accepted` diagnostic appears in the captured logcat. This supports no observed ChatController acceptance, despite successful upstream rows. It does not prove that NodeRuntime's separate general/provider catalogs stayed empty: those states were not sampled.
- There were **zero `refreshFailed` responses**, no provider loader failures, and no visible catalog-refresh warning in this baseline. This is not a native warning/recovery test.
- Visually inspected both `native-phase-natural-idle.png` (00:12:13) and `native-phase-idle-agent-turn.png` (00:13:16): app **Overview** shows Online, not Chat. Thus the explicit idle interval is not proven to be Chat-open. Visually inspected `native-final.png`: Chat displays **“Chat not ready / Use Refresh chat to check Gateway health.”** Chat is shown only by the end screenshot; its exact navigation entry time is not established here. These screenshots do not show a populated catalog, a refresh-warning banner, or a successful native agent reply. A candidate explicitly kept on Chat has a different observed navigation state and is not a strictly matched UI-state A/B.

Sources: `baseline-idle-ready/{native-observations.json,native-logcat.private.log,baseline-apk-inputs/diagnostic-observation.patch,driver-snapshot/CatalogRefreshProofTest.kt,native-phase-natural-idle.png,native-phase-idle-agent-turn.png,native-final.png}`. Private payloads and credentials were not extracted into this audit.

## The real agent turn did not overlap native execution

| Boundary | UTC |
| --- | --- |
| Host marks `idle-agent-turn` phase | 00:13:16.060 |
| Action driver begins | 00:13:16.171 |
| `sessions.create` request begins | 00:13:26.766 |
| Native operator socket closes | **00:13:29.346** |
| `chat.send` begins | **00:13:31.304** |
| Fixed-response inference request completes | **00:13:35.078** |
| Persisted final reply verified | 00:13:35.314 |

Thus the turn label and session-creation request overlap capture, but the actual chat send/inference/reply occur after the native app has disconnected. The successful turn is valid isolated Gateway inference/persistence evidence, not evidence of native responsiveness during an active turn. It used one local fixed-response inference request, not paid provider inference.

## Gateway resource and availability evidence

`legacy-native-20261023-2012/sampler.log` contains 332 process samples and 67 readiness attempts. The sample cadence is affected by the readiness probe's three-second timeout; these are observed point samples, not continuous peak/latency guarantees.

| Interval | RSS first → last sample | Highest sampled RSS | Readiness evidence |
| --- | --- | ---: | --- |
| Explicit 62.873 s natural-idle phase | 1342.3 → 1949.8 MiB | 2034.0 MiB | All five probes timed out at approximately 3 s |
| Native socket lifetime | 749.0 → 1959.1 MiB | 2042.9 MiB | One ready response, eight probe timeouts |
| Whole recorded Gateway lifetime | 63.7 → 923.6 MiB | 2147.5 MiB | 57 ready responses, eight timeouts, two startup connection refusals |

- The kernel's recorded high-water RSS (`VmHWM`) reaches **2247.7 MiB**, higher than the sampler's point-sample maximum.
- During the idle phase, cumulative process CPU grows by 8144 ticks over the sampled 61.019-second span. No tick-frequency metadata is saved, so this audit does not convert that to an exact CPU percentage. No idle readiness response supplies a CPU-core ratio. The Gateway log independently reports high event-loop utilization and a liveness warning during capture.
- No readiness response says `ready=false`, but eight timeouts mean readiness cannot be called continuously healthy. A timeout is not proof of a specific admission-control rejection.
- RSS falls after app disconnection and later readiness probes succeed. This baseline-only decay is not proof that the Android repair fixed memory growth. There is no observed reproduction of the reporter's 3.2 GiB admission closure.
- All 64 seed loaders succeeded. Another 64 succeeded during/after the native run, with no provider errors; 24 loads start in the idle phase and 26 after app disconnection. Last provider return is 00:14:08.068, 38.722 s after native closure. A client stop or empty request ledger therefore does not imply immediately settled Gateway discovery.
- Full seed publication was 00:08:52.000, **162.677 s before the first native socket opens**. All 30-second-TTL inventory was already expired when the app connected. Preserve/report seed-to-connect aging in the same-Gateway comparison; do not silently claim identical cache age if the candidate connects earlier.

## Relation to the completed diagnostics

`normal-ttl-feedback` is already complete and must not be rerun unchanged. Its healthy legacy/current comparison measures 71 versus six RPCs respectively; it is a synthetic observer experiment, not this native capture. The legacy warning run is a genuine provider failure with continued Gateway-owned churn and a failed settlement gate. The current warning attempt never admitted the failed loader and is inconclusive.

`gateway-warning-owner-audit.md` identifies upstream fixes already present in current source: passive catalog observation, backed-off failed-provider retry, and status-versus-change metadata. No duplicate Gateway patch is justified by this native baseline. Android native validation must separately isolate Android changes on the same legacy Gateway and current-protocol compatibility on current Gateway.

## Exact remaining native proof

1. **Do not rerun this baseline unchanged.** Complete the already-owned candidate-on-legacy capture using the exact built candidate identity and the same Gateway/provider fixture. Count the three owners separately, record seed/cache age and phase boundaries, require actual chat catalog acceptance, and report any remaining Gateway producer churn without attributing an upgrade to Android.
2. **Keep the candidate app connected through a full real agent turn:** begin send early enough, observe inference and persisted final reply before capture shutdown, and verify native UI/catalog remains usable. The existing baseline turn is not concurrent proof.
3. **Exercise an actual current-Gateway failure/recovery:** after successful seed, explicitly refresh one nonselected scoped provider to admit the armed loader; verify terminal loader failure, successful RPC with retained rows and `refreshFailed`, natural protocol metadata, and native warning display. Disarm and refresh/retry the same provider, then verify actual success, native warning clearance, retained rows, and settled traffic. Do not inject event flags or count an unexecuted arm as a failure.
4. **Verify provider-screen warning clearance on the native UI** as well as ChatController state; the baseline observer samples only chat state. Observe status-only settlement without losing successful in-flight responses or creating health-driven loops.
5. **Compare resources and availability honestly:** capture time-aligned RSS/CPU/readiness/admission indicators for candidate idle and active windows. Require terminal cleanup receipts. State limits when the original memory-pressure/admission symptom is not reproduced; passing RPCs alone are insufficient.

Parent owns runtime/candidate continuation. This audit intentionally starts no duplicate work.
