# Thirty-agent catalog and admission diagnostics

Android source remains `7a5e0bda258ac938456e42cfcb6b4f2b2fa23a30`. These are **Gateway RPC diagnostics**, not Android UI runs or a reproduction of the reporter's complete incident. The [accepted exact-head Android and retained-upgrade evidence](https://github.com/jason-allen-oneal/openclaw/blob/b35431ff186b4d9d382fc0bc7499e10719404f78/README.md) remains unchanged.

## Observed results

| Condition | Child processes started | Catalog RPC results | Turns | Peak Gateway RSS |
| --- | ---: | --- | --- | ---: |
| Official 2026.9.6, fresh 30-agent state | 30 | Two successful 732-row responses; later response carries `refreshFailed:true` | 4/4 completed and persisted | 1691 MiB |
| Official 2026.9.6, 30 retained agent databases | 30 | Same successful transport / genuine refresh-failure distinction | 4/4 completed and persisted | 1639 MiB |
| Current producer build, fresh 30-agent state | 2 | Two successful 732-row responses; neither carries a refresh-failure flag | Two startup refusals, then 2/2 post-startup turns completed and persisted | 2605 MiB |

These are actual Gateway-managed processes running a **synthetic Node implementation of the Codex stdio discovery protocol**, not the native Codex executable. The fixture delays `model/list` replies 4500 ms against the actual provider's 2500 ms discovery deadline. Child RSS therefore must not be extrapolated to real Codex. Gateway RSS and summed process-tree RSS are recorded separately in [ANALYSIS.json](ANALYSIS.json). Current Gateway memory did **not** improve relative to these legacy runs.

The configured inference model remains a healthy deterministic loopback provider with 732 configured choices. Each client makes only two `models.list` requests, sends no refresh=true requests or fabricated metadata events, and attempts four ordinary chat turns. No Android client is connected. Legacy emits 62 metadata events in each observed client window; current emits 66. Counts alone do not distinguish legacy unflagged hints from current semantic events.

## What this establishes

- A successful `models.list` transport response can carry a genuine failure flag while returning all 732 models. In this fixture, unrelated native-provider discovery times out while the selected static inference provider works. Successful RPC log lines are insufficient to conclude that the Android warning is a parsing error or false warning.
- Legacy's configured-agent catalog initialization can fan out across 30 provider owners without an Android refresh storm. Current demand-driven ownership starts only two synthetic children for the two catalog reads; both children terminate without sending the deliberately late model reply. This supports existing upstream discovery/retirement fixes, not a new Android memory fix.
- The retained run created 30 idle sessions sequentially through supported `sessions.create`, stopped cleanly, then restarted the same state. The first measured pair uses agents15/16 after observing the fifteenth discovery request. This exercises ordinary turns on retained agents during discovery; four new replies persisted. Slow SQLite queue waits were observed, but no incident-style agent database admission closure was recorded. Legacy post-ready probes included four fresh-state and two retained-state timeouts at the 250 ms probe deadline; they did not all pass.
- The current control's readiness endpoint preceded chat admission: its first two sends were explicitly rejected as unavailable during startup and were not retried. The second pair completed. This is not a four-success comparison or proof that readiness guarantees chat availability.

## Source attribution

Official legacy source is `eb377ac59e6c9fd6c7705028034812becf00271b`. Current runtime is audited build `a7f5cc2f35fb2e0254207492149d52d3923c0cbc`, not the Android commit. Its relevant state/coordinator, Codex extension, and prepared-catalog source has no diff from the Android head; see [source-binding.json](source-binding.json).

Existing fixes include [demand-driven discovery #168387](https://github.com/openclaw/openclaw/pull/168387), [abandoned-discovery retirement #168365](https://github.com/openclaw/openclaw/pull/168365), [pre-entry SQLite contention recovery #162750](https://github.com/openclaw/openclaw/pull/162750), and [lost-native-worker recovery #163258](https://github.com/openclaw/openclaw/pull/163258). The latter two are source-provenance findings, **not failures reproduced by these diagnostics**. See [admission owner audit](admission-owner-audit.md).

## Limits and setup outcomes

**No run reproduced the reported 3.24–3.29 GiB Gateway / persistent admission-closed failure. Its cause and resolution remain unproven.** The original reporter has not supplied the requested first-failure trace. Same-author evidence of approximately 30 agents is a lead, not proof that these synthetic settings match the affected installation.

Legacy first-start config normalization was preserved and verified against the original-hash backup before retained restart. Current schema uses explicit agent ownership, system-agent selection and model-policy allowlist. This is a fresh-state control, not another retained Gateway upgrade. The prior accepted native upgrade remains the upgrade proof.

Setup failures remain in the record: an initial bind check rejected a free port in TIME_WAIT before spawning; two current starts exited78 on obsolete config fields before measurement. The final current config passed the actual CLI validator. None is counted as a completed diagnostic. Initial current trace matching also selected a startup worker-lifecycle summary containing `reason:exit`, not an agent admission failure. Current shutdown logged a busy shared-state WAL checkpoint; both owned roots nevertheless exited0 and no process survived. Clean process cleanup does not erase that warning.

All three measured runs have terminal cleanup receipts with no surviving owned processes and free fixture ports. No locks, database mutation, memory balloon, altered product thresholds, external inference, or real provider credentials were used. The synthetic protocol fixture is not product instrumentation. Observed client windows differ (about90/150/90 seconds); this is not a matched Android A/B effect-size claim.

## Recalculate and verify

Run `python3 analyze.py` to reconstruct the recorded summary, and `sha256sum -c SHA256SUMS` to verify the public files. Public traces are selected and path-sanitized; raw-source/public hashes are mapped separately in `SOURCE-PROVENANCE.json`. Config, databases, caches, signing material and credentials are excluded. Scripts with normalized paths are reference copies, not a claim that those sanitized bytes were executed.
