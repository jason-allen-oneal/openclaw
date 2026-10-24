# Candidate on current Gateway: independent native evidence audit

Audited 2026-10-24 UTC from completed local native records and the subsequently copied `candidate-current-ef99274` remote records. This audit performed no tests, builds, runtime actions, Git operations, or public writes. Only this report was written. Times below are UTC on 2026-10-24.

## Conclusion and attribution

**The observed current-Gateway scenario succeeds:** the repaired native app accepts and retains 732 chat and provider-catalog rows, shows a real loader-failure warning, clears both owners' warning state after successful recovery, and produces no sustained catalog follow-up traffic. Two actual fixed-response inference turns complete and persist their replies while both native sockets remain connected. All 15 sampled readiness probes during that connection window succeed.

This is **candidate Android consuming the already-fixed current catalog owner/protocol**, not an APK-only repair of official Gateway 2026.9.6. The completed candidate-on-legacy negative result remains valid and must stay published beside this result. In particular, this run does not turn the legacy timeout/churn result into a success, prove the original 3.2 GiB admission symptom, or prove low Gateway memory usage.

The production Android APK is source `ef99274a2dd58ed20164a67d072d05c328a1cfc7`, SHA256 `713ddbdd3ee824e9cd82ab20df3b0b114bdb9fe1810627ba31c70263b6fd22b0`. Only its observation instrumentation changed from the legacy comparison; the installed instrumentation SHA256 is `0ba6ef0ee2001d57820a9bb58f025464c327d224ce4c6ff771a83bcec88215b5`. `installed-identity.json` verifies both installed artifacts against their built identities.

The remote terminal identity is version `2026.10.5`, commit `a7f5cc2f35fb2e0254207492149d52d3923c0cbc`, build ID `2026.10.5-a7f5cc2f35fb-2026-10-23T00-59-33.148Z`, launcher SHA256 `2e42a44b3bf441ba8b7fed85ccdd3efa54d8962bb0607cd00d88e86f67ab0e51`, Node SHA256 `e32e2d16081cf644f88392934288086e7662529d0d43277c34f7aad2207cfafb`. These match `current-gateway-source-binding.md`. That separate read-only audit establishes identical catalog-owner source trees across the candidate's base, reused Gateway, and Android candidate; it is not a complete emitted-binary hash attestation. Existing upstream passive-read separation, provider-failure retry backoff, and event semantics must not be attributed to this Android patch.

## Measurement boundaries and request ownership

The first native socket opens at **00:38:52.445**; the operator socket closes at **00:41:19.128**, a 146.683-second connection window. The native recorder reports 140.358 seconds of bounded ready-state observation, then normal observation shutdown. Neither number is a pure-idle duration.

The seed receipt records 64 successful providers, seed-client exit 0, no synthetic follow-ups, and publication at 00:37:15.520, **96.925 seconds before native connection**. The raw provider ledger also contains a second completed 64-load batch before native connection, with its last return at 00:37:23.939. All 128 pre-native loads succeeded; their last return precedes native connection by 88.506 seconds. Do not silently call this exactly cache-age-matched to baseline (162.677 seconds from its recorded seed publication) or candidate-on-legacy (26.582 seconds).

The proxy forwards original WebSocket bytes and does not manufacture events or warnings. Request ownership is inferred from the same source/parameter mapping used in the baseline audit: omitted view is NodeRuntime general inventory; `provider-config` is its provider owner; session-scoped `configured` is ChatController. Counts below are recomputed from raw `native-wire.jsonl`, not copied from the summary.

| Phase | Host boundary / duration | General | Provider | Chat | Total catalog requests |
| --- | --- | ---: | ---: | ---: | ---: |
| Native setup | Before 00:39:19.968 | 1 | 1 | 1 | 3 |
| Natural idle | 00:39:19.968–00:40:04.986; 45.018 s | 0 | 0 | 1 | 1 |
| Healthy agent turn | 00:40:04.986–00:40:09.528; 4.542 s | 0 | 0 | 0 | 0 |
| Warning establishment | 00:40:09.528–00:40:15.880; 6.352 s | 1 | 1 | 1 | 3 |
| Warning observation | 00:40:15.880–00:40:20.887; 5.007 s | 0 | 0 | 0 | 0 |
| Warning agent turn | 00:40:20.887–00:40:21.912; 1.025 s | 0 | 0 | 0 | 0 |
| Recovery establishment | 00:40:21.912–00:40:27.007; 5.095 s | 1 | 1 | 1 | 3 |
| Recovered idle | 00:40:27.007–00:41:19.128; 52.121 s | 0 | 0 | 0 | 0 |
| **Total** | | **3** | **3** | **4** | **10** |

All ten catalog requests resolve successfully before native closure, with **732 available rows**, one unchanged model-identity SHA256 (`7145fd9af1ae3a8d3f01fe8c762c0f3034dc9ac0c5acb64f2129d08be9dfd462`), and no unresolved catalog request. Their recorded latencies range from 57 to 1437 ms. Exactly the three warning-establishment catalog responses have `refreshFailed=true`; recovery responses clear it. The general owner's responses are verified, but its accepted state is not separately sampled by instrumentation.

Across all methods, 68 native requests have 68 responses and both closing sockets have empty unresolved lists. One `talk.catalog` response is retryable `UNAVAILABLE` while warming; two later responses succeed. Thus “every RPC succeeds” would be false, although every model-catalog RPC succeeds. The five native `health` responses succeed in 6–35 ms.

Recovered idle has no `models.list`, `chat.metadata`, or `models.authStatus` requests, despite four tick events, an unrelated usage-only metadata event, two routine native health requests, and other routine activity. Natural idle has only one configured-catalog read near its beginning and no metadata-change event. This proves bounded quiescence, not an unlimited-soak guarantee.

## Failure, recovery, and actual accepted native state

The nonselected fixture provider is `api-01`; inference uses `api-00/model-0`. The host explicitly calls scoped `models.list` with `refresh:true` to admit the armed loader. This is a **real provider-loader exception in a synthetic local provider fixture**, not an external production-provider outage and not an injected metadata/RPC warning.

- Warning loader starts at **00:40:11.692**, throws at **00:40:12.193**, and the actual scoped RPC resolves successfully with 12 retained provider rows and `refreshFailed=true` at **00:40:12.963**.
- The native wire receives a natural `chat.metadata.changed` event at **00:40:12.623** with `modelCatalogChanged:true`, `authChanged:true`, `commandsChanged:false`. Three native catalog reads follow, each retaining all 732 available rows while reporting failure.
- The native observation stream records provider warning text and then chat warning text with both catalogs remaining at 732 rows. The settled warning state has provider refreshing false. The host confirms this state before beginning the warning-phase agent turn.
- After disarming the same provider, the scoped recovery loader starts at **00:40:23.217** and returns successfully at **00:40:23.718**. The scoped RPC completes at **00:40:24.413** with 12 rows and no refresh failure.
- A natural recovery event at **00:40:24.123** carries the same changed/auth flags. Both accepted native owner states then clear their warning text, preserve all 732 rows, and settle provider refreshing to false. The host observes the clear state before marking recovered idle.
- There are **no other provider loads during the native window**, and no provider activity after native disconnection through the recorded Gateway shutdown. The complete provider ledger has 130 starts, 129 successful returns, and one error; every started call is terminal.

Instrumentation samples actual `MainViewModel` chat/provider flows; it does not replace their values. State timestamps use the Android clock, whereas wire/action/provider timestamps use host clocks. No clock-offset calibration receipt is present, so subsecond state-to-wire ordering must not be presented as a precisely measured end-to-end latency. The ordered state transitions, host predicate observations, raw wire records, and screenshots agree on the behavior.

**Important coverage limit:** no native event in this capture has `modelCatalogStatusChanged`. Failure and recovery both use `modelCatalogChanged:true`. A later usage event has all catalog/auth/command change flags false and triggers no catalog requests. Therefore native recovery proves changed-event handling, not independent execution of the status-only branch; that branch requires its separate source/unit-test evidence.

## Screenshots and UI limits

I inspected `native-phase-natural-idle.png`, `native-phase-idle-agent-turn.png`, `native-phase-warning-observation.png`, `native-phase-recovered-idle.png`, and `native-final.png`.

- The first natural-idle boundary screenshot still shows **Overview / Online**. Chat is shown at the healthy-agent-turn boundary, throughout the warning/recovery boundary screenshots, and in the final screenshot. Do not claim the whole first 45-second idle interval is visually proven Chat-open.
- The warning screenshot shows Chat's actual **“Could not refresh models. Tap Refresh to try again.”** banner, a green connection indicator, and the selected fixture model. Recovered and final screenshots show that banner gone and the connection indicator still green.
- **Provider warning establishment/clearance is proved as the actual UI-bound owner state, not as a rendered provider-screen screenshot.** No provider settings page screenshot is in this capture. Neither the general inventory state nor visually rendered lists of all 732 items were separately observed.
- The external agent turns use separate sessions, so these Chat screenshots correctly show the native session's empty-thread “Ready when you are” state. They do not display either independently created turn's answer and do not prove a native UI-submitted turn.

## Real turns completed while native stayed connected

Both action drivers have final receipts, no pending methods, `agent.wait` terminal status `ok`, and persisted exact assistant-reply verification. The matching remote inference ledger records two completed local fixed-response streaming requests. No paid inference is involved.

| Action | `chat.send` begins | Inference completed | Persisted reply verified | Native operator close |
| --- | --- | --- | --- | --- |
| Healthy turn | 00:40:05.464 | 00:40:09.077 | 00:40:09.415 | 00:41:19.128 |
| Warning turn | 00:40:21.144 | 00:40:21.702 | 00:40:21.847 | 00:41:19.128 |

The native wire receives actual session/chat/agent events in both corresponding turn phases; it remains connected without a reconnect. The warning turn occurs after both warning states were observed and before the provider was disarmed. This closes baseline's post-disconnection-turn limitation for **concurrent Gateway inference and native connectivity**. It does not establish manual phone send-button interaction, display of the external reply in the native session, or free-form model quality.

## Gateway resources and availability

Phase windows below use raw host phase markers against `candidate-current-ef99274/sampler.log`. RSS values are point samples, not continuous peaks; each readiness sample represents its measured probe, not continuous availability. CPU-core ratios returned by `/readyz` describe that endpoint's prior sampling interval, not an exact allocation to the short phase containing the probe.

| Window | RSS first → last (MiB) | Highest sampled RSS (MiB) | Readiness |
| --- | --- | ---: | --- |
| Natural idle, 45.018 s | 1642.8 → 1567.4 | 1643.1 | 4/4 HTTP 200, ready true; 3–4 ms |
| Healthy-turn-labelled phase | 1568.7 → 1782.1 | 1782.1 | 1/1 ready; 2 ms |
| Warning establishment | 1914.1 → 1983.1 | 1983.1 | No probe in this short window |
| Warning observation | 1983.2 → 1983.2 | 1983.2 | 1/1 ready; 4 ms |
| Warning-turn-labelled phase | 1987.8 → 1987.8 | 1987.8 | One RSS sample; no readiness probe |
| Recovery establishment | 2006.1 → 2002.5 | 2006.1 | No probe in this short window |
| Recovered idle, 52.121 s | 2013.6 → 1986.5 | 2017.4 | 6/6 ready; 2–3 ms |
| Entire native socket window | 1450.9 → 1986.5 | 2017.4 | **15/15 ready; 1–4 ms**, no timeouts |
| Whole recorded Gateway run | 56.1 → 1414.9 | 2017.4 | 55 ready; 2 initial connection refusals |

The kernel RSS high-water mark is **2045.4 MiB**. No native-window probe reports degraded event-loop state, failing readiness, or admission rejection. The separately saved startup readiness record does mark temporary CPU degradation while still ready; this is startup evidence and must not be described as absent from the entire run.

Natural-idle cumulative CPU increases only 34 ticks across its sampled 42.036 seconds; recovered idle increases 213 ticks across 50.041 seconds. Tick-frequency metadata is absent, so no exact CPU percentage is claimed. The native connection window contains 73 process samples; whole-run capture contains 282, with 57 readiness attempts. After native closure, 29 further probes succeed, no provider activity resumes, and sampled RSS declines from 1985.8 to 1414.9 MiB before shutdown.

This supports absence of the sustained producer/consumer loop and healthy sampled availability in the bounded current-Gateway scenario. It **does not** establish that peak memory is low, that Android alone caused the resource difference, or that the reporter's exact 3.2 GiB pressure/admission threshold was reproduced and cured. Baseline and legacy-candidate windows, cache ages, UI state, Gateway versions, and active-turn outcomes are not controlled equivalents.

## Terminal state, provenance gaps, and remaining limits

- `native.receipt.json` records observation completion, instrumentation exit 0, app and test-package force-stop with no remaining PIDs, and logcat termination. Both native socket closes have no unresolved methods. Instrumentation's single passing observation test is **not** the behavioral oracle; the state/wire/action evidence above is.
- `exercise.receipt.json` stops after marking recovered idle and lacks `passed`, `finishedAtMs`, or an outer-driver completion result. Preserve this interrupted-summary provenance gap. Do not manufacture its success marker or rerun completed phase actions merely to obtain one. Raw phase records, complete action receipts, settled observations, and the independently bounded native receipt establish what actually completed.
- `local-reconciliation.receipt.json` records the original capture already gone and exact-command-verified proxy/tunnel shutdown, reverse-forwarding removal, and free local ports. Original wrapper/child exit codes are **unavailable**, not zero.
- The remote cleanup receipt is terminal `finished`: seed/sampler/Gateway/inference processes are gone, Gateway and inference exit 0, and ports 20094/20095 are free. The two inference completions are independently present in the ledger. No copied inference-close or Gateway log is available in this audit set; neither is needed to replace the recorded gone-process/port checks, and no claim based on their unseen contents is made. Emulator shutdown is outside these receipts.
- All six entries in the native `driver-files.json` match the saved snapshot SHA256 values. The action driver hash matches both action receipts and remote runtime identity; its config hash matches the remote identity and local action receipts.
- `current-gateway-source-binding.md`'s previously deferred terminal runtime identity check is now satisfied by the copied current-native remote identity. Its whole-distribution binary-attestation limitation remains.

For stronger claims, the missing evidence would be: a rendered provider-page warning/clear sequence (rather than UI-bound state alone), native UI-submitted/read reply proof, a native status-only settlement event, or a controlled long-duration/admission-pressure experiment. These are **not** secretly established by the observer's exit code or the current result. Preserve `baseline-evidence-audit.md` and `candidate-legacy-evidence-audit.md` unchanged as the documented negative and limiting comparisons.

Primary records: `candidate-current-native/{native-wire.jsonl,native-observations.json,native.receipt.json,exercise.receipt.json,installed-identity.json,driver-files.json,local-reconciliation.receipt.json,driver-snapshot/*,idle-turn/action-receipt.json,warning-turn/action-receipt.json,warning-refresh/action-receipt.json,recovery-refresh/action-receipt.json}` and `candidate-current-ef99274/{identity.json,seed-receipt.json,provider.jsonl,sampler.log,inference-requests.jsonl,cleanup-receipt.json,runtime-ready.json}`.
