# Candidate on legacy Gateway: independent evidence audit

Reconciled 2026-10-24 UTC from completed `candidate-legacy-idle` native artifacts and `candidate-legacy-ef99274` Gateway artifacts. No runtime, emulator, or product-source activity was performed for this audit.

## Outcome

The candidate APK **does not establish a full fix on official Gateway 2026.9.6**. Natural catalog traffic continues, the sampled chat catalog remains empty, readiness probes time out, and the overlapping agent turn never reaches inference before its bounded wait expires. It is aborted and terminally settled. These are completed negative/limiting results, not a reason to blindly repeat the same run.

Current-Gateway compatibility, real provider warning/recovery, and successful overlapping native/inference operation remain separate required proof. Do not attribute already-upstream Gateway producer repairs to this APK.

## Identity and measurement boundaries

- Installed app source: `ef99274a2dd58ed20164a67d072d05c328a1cfc7`.
- App SHA256: `713ddbdd3ee824e9cd82ab20df3b0b114bdb9fe1810627ba31c70263b6fd22b0`.
- Instrumentation used by this run: `1a3631ed5c3b3cfcac8e0db47530449c5b07bdd19031f19fc53fcc4ee2f97ba8`. It samples chat only; the later provider-observation APK was **not** used here.
- Gateway: same official 2026.9.6 distribution as baseline. Seed client completed all 64 loaders and exited, with no injected event or synthetic follow-up reader.
- First native socket opens **26.582 s after seed publication**, versus baseline's 162.677 s. This is not an exactly matched cache-age A/B.
- Native observation lasts 125.452 s, but explicit pure-idle phase is **00:34:21.239–00:35:06.251 UTC = 45.012 s**. Turn-labelled phase then lasts 63.110 s until operator closure at **00:36:09.361**.

## Native owner traffic and successful response facts

Ownership uses the same exact parameter shapes/source mapping as `baseline-evidence-audit.md`.

| Owner / `models.list` view | Setup requests | Idle requests | Turn-labelled requests | Total requests |
| --- | ---: | ---: | ---: | ---: |
| NodeRuntime general / omitted | 9 | 17 | 22 | 48 |
| NodeRuntime provider / `provider-config` | 9 | 17 | 22 | 48 |
| ChatController / `configured` | 1 | 0 | 11 | 12 |
| **Total** | **19** | **34** | **55** | **108** |

- All 34 idle-origin catalog requests receive successful 732-row responses. General latency is 3.172/5.470/8.659 s (min/median/max); provider-config latency is 3.501/5.572/9.362 s.
- Idle receives 17 natural legacy `chat.metadata.changed` events and four ticks; the app also sends 18 `chat.metadata`, 17 `models.authStatus`, two `health`, and ancillary requests. Idle catalog rate is 0.755/s across general/provider owners.
- Across the whole capture: 105 successful catalog responses, 732 available rows each, one unchanged model-identity hash; latency 1.630/4.425/9.362 s. Only **103** catalog responses arrive before operator closure; two are late proxy observations. Five catalog requests are unresolved when the operator socket closes, three remain without a recorded response afterward.
- No proxy-observed RPC response has `ok=false`; no catalog response reports `refreshFailed`. The Gateway later logs an unrelated node-event dispatch error after native disconnection. Successful RPC rows do not imply app acceptance or healthy readiness.
- The reduced ChatController idle request count is **not** a populated-catalog success: its sampled catalog remains zero. An exact performance benefit cannot be inferred from unequal idle duration, cache age, navigation state, and active-turn placement.

## UI and app acceptance

- `native-observations.json` remains one unchanged state: activity resumed, **chat catalog rows 0**, **chat error null**. This run cannot observe the provider catalog/error/refreshing state.
- Inspected `native-phase-natural-idle.png`: Overview, with “Needs attention.”
- Inspected `chat-entry.png` (saved at 00:34:23.878, about 2.6 s into idle) and `native-phase-idle-agent-turn.png`: Chat is open, green connection indicator, “Ready when you are.” This is actual candidate Chat-open evidence; baseline had Overview at both corresponding idle-boundary screenshots.
- Inspected `native-final.png`: red connection indicator and “Chat not ready / Use Refresh chat to check Gateway health.” The UI's initial readiness text is not evidence of catalog acceptance or an actual completed assistant reply.

## Real overlapping turn: failed, then safely settled

The action begins at 00:35:06.314 UTC; `chat.send` is issued at **00:35:16.962** and acknowledged started at 00:35:19.472 while the native app remains connected. The first `agent.wait` reaches the host's 35-second timeout. The driver sends `chat.abort` at 00:35:54.475; it is acknowledged aborted at 00:35:59.251. A second wait confirms terminal **error**, ended 00:35:59.207, stop reason `rpc`; the action finishes at 00:36:05.263 with **no pending methods**.

The inference ledger is empty and its close receipt reports **zero requests, zero completions**. No persisted assistant reply is verified. Gateway logs show reply setup reaching a pre-resolver milestone after 38.896 s; this is not a successful inference. All abort/settlement operations precede native socket closure.

Source: `candidate-legacy-idle/idle-turn/action-receipt.json`; `candidate-legacy-ef99274/{inference-requests.jsonl,inference-close.json,gateway.log}`. No private prompt or response content is included here.

## Gateway resources and availability

| Window | Sampled RSS first → last | Highest sampled RSS | Readiness evidence |
| --- | --- | ---: | --- |
| 45.012 s idle | 1251.3 → 1764.1 MiB | 1764.1 MiB | Three probes; all time out |
| Turn-labelled native window | 1785.0 → 1715.3 MiB | 2003.9 MiB | Five probes; all time out |
| Entire native socket window | 772.8 → 1715.3 MiB | 2003.9 MiB | One ready reply, nine timeouts |
| Whole recorded Gateway run | 58.5 → 1942.1 MiB | 2003.9 MiB | Ten ready replies, nine timeouts, two startup refusals |

- Recorded kernel RSS high-water mark is **2015.8 MiB**. Readiness timeouts are approximately three seconds. No observed response says `ready=false`; that does not turn timeouts into healthy availability or prove a specific memory-pressure admission rejection.
- Idle cumulative CPU rises by 5973 ticks across the sampled 43.015 s. Tick-frequency metadata is not saved, so no exact percentage is asserted. Gateway logs independently show liveness warnings, event-loop utilization 1, and delays above three seconds.
- All 128 provider loads (64 seed + 64 renewal) complete successfully; zero provider failures. Discovery continues after app disconnection. Remote parent-stop occurs about 25.9 s after operator closure, so this is not a long post-client quiet-window settlement experiment.
- A lower maximum than baseline does not establish repair: windows, cache ages, app navigation, and inference outcomes differ, and both show degraded resource/availability behavior.

## Cleanup and next proof

Native instrumentation completed normally, then both app packages/logcat stopped. Local capture, proxy, and SSH tunnel exit 0 with gone-process receipts; reverse forwarding is removed. Remote seed/sampler/Gateway/inference all have gone-process receipts, Gateway exits 0, and ports 20094/20095 are free. No failed turn or run is left pending by these receipts.

The parent-owned current-Gateway run should use the new provider-observation identity, verify actual chat/provider catalog acceptance, explicitly admit a real scoped nonselected-provider failure and recovery, observe both warning display and clearing, then complete a real agent reply before native shutdown with time-aligned resource/readiness evidence. Neither this negative legacy result nor an unexercised failure arm can substitute for that proof.
