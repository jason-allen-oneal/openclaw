# Native Android catalog-event proof for PR #181112

Product head: `5fb773cb7daba27233488e8384471273d52fbb78`.
Run: 2026-10-23 00:41:32–00:42:24 UTC. Both the host scenario and Android instrumentation exited successfully; the instrumentation reported `OK (1 test)`.

The installed APK is the production app built from this exact head. Its SHA-256 matched the built artifact; the separate instrumentation APK only launches the real activity, observes the existing MainViewModel, and invokes the existing refresh action in the final supplemental phase. The app uses its actual NodeRuntime, ChatController, WebSocket transport, and an isolated built OpenClaw Gateway with two configured synthetic models. There is no replacement ChatController or scripted RPC response implementation.

A trace proxy transparently forwards the real Gateway responses and injects declared `chat.metadata.changed` notifications. The warning phases set `refreshFailed=true` on the real model response; they do not replace the catalog. Request counts below identify the changed chat owner: `chat.metadata` and `models.list` carrying the session key. The raw trace and results retain independent settings-owner traffic as well.

| Phase | Events | chat.metadata | Session models.list | Observed result |
| --- | ---: | ---: | ---: | --- |
| Settled idle | 0 | 0 | 0 | Two accepted model rows |
| Usage only | 10 | 0 | 0 | Two rows retained |
| Another agent | 3 | 0 | 0 | Two rows retained |
| Selected-agent catalog change | 1 | 1 | 1 | Refresh preserved |
| Selected-agent authentication change | 1 | 1 | 1 | Refresh preserved |
| Commands change | 1 | 1 | 1 | Refresh preserved |
| Model selection change | 1 | 1 | 1 | Refresh preserved |
| Legacy unflagged notification | 1 | 1 | 1 | Full refresh preserved |
| Catalog refresh failure status | 1 | 1 | 1 | Warning set; two rows retained |
| Catalog status recovery | 1 | 1 | 1 | Warning cleared; two rows retained |
| Second refresh failure | 1 | 1 | 1 | Warning set again |
| Existing manual refresh action | 0 | 1 | 1 | Warning cleared; two rows retained |

The other-agent phase also produced six global/provider-settings `models.list` requests, plus three auth-status reads. These belong to NodeRuntime's separate settings owner when no chat agent is selected on the Overview screen; this PR changes the chat owner. They are intentionally retained in the evidence and are not claimed to be suppressed. The observation reads the live activity's chat model state; it does not claim a successful tap into the Chat screen. The final refresh phase invokes the existing ViewModel refresh action, rather than asserting a physical tap on the Refresh button.

## Evidence files

- `native-wire.jsonl`: actual per-frame request/response trace and injected notifications for this run only; no connect credentials or response payloads are logged.
- `native-results.json`: all per-phase totals, chat-owner counts, independent settings counts, request parameters and observed state transitions.
- `native-observations.json`: live activity model-count and warning observations.
- `native-receipt.json` and `native-instrumentation.log`: exact product head and terminal outcomes.
- `installed-apk-identity.json`, `instrumentation-apk-identity.json`, `candidate-source.json`: app, test APK, and source identities.
- `CatalogRefreshProofTest.kt` and `native-driver.py`: the observer and host phase assertions. The driver is a redacted review copy; SDK and trace-proxy locations are placeholders.

Only the synthetic session identifier and run phase prefix were normalized. Endpoint locations and private setup artifacts are omitted; request directions, methods, flags, counts, timestamps, and outcomes remain intact.

## Scope and earlier failures

This demonstrates the focused event-filter invariant on the exact candidate APK. The full idle loop and memory pressure from issue #179075 are not reproduced or claimed fixed. Earlier 732-model attempts exceeded client deadlines while this eight-CPU host had a load around 44; reducing the declared synthetic catalog to two models allowed the event-filter proof to run. No throughput or large-catalog performance claim is made. An initial small-catalog attempt used an overly broad counter and failed on the separate settings reads listed above; the final trace retains those reads while asserting the intended chat-owner boundary. A host-side attempt to start a second UI automation service conflicted with the running Android instrumentation; the passing run uses only the existing instrumentation owner.

The committed controller regression fails on baseline `a8ead196291935d24c44a4f40b67397d88c70256` for the unwanted requests; the final candidate has 99 passing focused tests. That baseline result is a controller-level regression, not a native Android before/after replay.

## Separate reported-version diagnostic

A later [reported-version baseline capture](reported-version-baseline/README.md) uses the issue's Android source and official Gateway 2026.9.6. It records startup plus 120 seconds idle, three catalog requests, two metadata requests, no metadata-change events, and a transient request-timeout warning that clears naturally. It does not reproduce the sustained loop and is not a broader fix claim or candidate differential. The positive event-filter evidence above remains unchanged.
