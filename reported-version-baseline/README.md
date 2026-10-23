# Reported-version Android baseline: bounded negative reproduction

This capture does **not** reproduce the sustained idle loop in issue #179075 and does not expand the fix claim for PR #181112. No candidate differential was run because the reported failing baseline did not appear. The earlier positive event-filter proof remains separate and unchanged.

## Versions and observation boundary

- Android source: reported commit `dbac7730a12c90e95143f23e556199ab642e639e`, downloaded as an immutable source tarball. The checked-in version properties say `2026.8.2`; the issue's displayed release version differs. The diagnostic APK explicitly embeds the reported source commit, not an invented release identity.
- APK SHA-256: `c18e61d8e25d4719afb1033130754d09795621e2d2be6bb98018b5bb31c1ef3b`. The only source overlay adds logging for accepted catalog rows and the exception already handled by the metadata failure path. Request, refresh, parser and warning behavior are unchanged. This is a diagnostic APK, not a byte-identical released APK.
- Gateway: official npm `2026.9.6`, build `eb377ac59e6c9fd6c7705028034812becf00271b`, protocol 4. Registry integrity, dependency-lock hash, configuration hash and startup receipts are included. No Gateway source changes or event injection.
- Normal setup-code pairing, operator and node connections, and Overview screen. Separate instrumentation observes the existing activity/ViewModel; it does not tap Refresh or navigate into Chat. A pass-through proxy preserves original frame bytes, text/binary types and event sequence numbers.
- Capture: `2026-10-23T03:20:24Z` through `03:23:06Z`, including pairing/startup and **120.06 seconds idle after the native shell became ready**. Instrumentation and host capture both exited successfully. Counts below include the startup traffic as well as that idle window.

## Observed result

| Observation | Result |
| --- | --- |
| `models.list` requests | 3 total |
| `chat.metadata` requests | 2 total |
| `models.authStatus` requests | 1 total |
| `chat.metadata.changed` events | 0 |
| Injected events or altered replies | 0 |
| Failed RPC replies | 0 |
| Accepted native catalog rows | 732 |
| Final controller refresh warning | Cleared without user action |
| Gateway RSS samples | 650,728–996,984 KiB; 81 samples |

The first `chat.metadata` reply succeeded after **21,308 ms**, exceeding the app's **15,000 ms** request deadline. The diagnostic log captures `GatewayRequestOutcomeUnknown: request timeout`, and the existing controller warning became set. A later health-triggered retry completed metadata in **1,548 ms** and the session catalog in **4,997 ms**. The app accepted all 732 rows and cleared the warning naturally. No parse exception was observed.

The other catalog replies took 5,626 ms and 13,400 ms. These startup response times differ materially from the report's successful 85–1,296 ms replies. This capture establishes a transient timeout explanation in this fixture, not the cause of the reporter's sustained fast-response loop.

The default configured catalog response contains **729 available models and three `available:false` / `missing-auth` models**; the selected model is available. Provider-config and session-scoped configured responses leave those same three rows indeterminate. The complete synthetic model rows are retained in `catalog-responses.jsonl`, including those distinct projections. No availability fields were invented or substituted.

## Why this does not establish the complete fix

The exact reported Gateway broadcasts legacy empty-object metadata events; the current Android patch deliberately preserves refreshes for them. Its source has no periodic usage-notification timer. The isolated run produced no metadata-change events at all. Source tracing also did not establish an autonomous one-second catalog rebuild timer: catalog expiry is checked on reads, and equal auth metadata snapshots do not republish changes.

The report separately describes approximately 55 catalog rebuilds per minute even without clients. Its background caller or repeated config/auth/skills change, correlated with publication events and actual failing response payloads, remains unidentified. Adding 732 synthetic models does not recreate that missing mechanism.

This uses a task emulator and a separate task Gateway host, not the reporter's physical device or Tailscale route. Catalog preflight warmed the Gateway before pairing. The synthetic rows exercise the reported count and default availability split but do not reproduce the reporter's complete private catalog. There is no claim about agent-turn admission recovery or large-catalog throughput.

## Evidence and reproduction

`native-wire.jsonl`, `catalog-responses.jsonl`, `native-observations.json`, `metadata-diagnostic.log`, `gateway-memory.jsonl`, `results.json`, and `native.receipt.json` retain the measured transport, payload, state, timing and terminal outcomes. The screenshot shows the final synthetic Overview screen; the warning transitions are ViewModel observations, not a claim that the Chat warning was visually inspected.

`source.receipt.json`, `build.receipt.json`, `diagnostic-observation.patch`, and the Gateway receipts bind the versions and artifacts. Review copies of the synthetic Gateway configuration/provider and the build, proxy, observer and installation scripts are included with task paths replaced by named placeholders. Build directly from the pinned Android source with the two logging statements, exact declared generator dependencies, JDK 21, an Android 36 task emulator and the supplied separate instrumentation. Pair against an isolated official Gateway with the synthetic catalog, then run the observer without manual refreshes or injected notifications.

The build completed in 451.7 seconds with one Gradle worker. Earlier setup attempts rejected a timestamp format and missing Mermaid build dependencies; both failures remain locally preserved. The baseline debug signing key differed from the earlier candidate fixture, so only the two synthetic task packages were reset before installation. An emulator System UI startup timeout was recorded and dismissed before the app capture. Task-owned Gateway/provider, proxy/tunnel and emulator were stopped after capture; retained evidence and APKs were not deleted.

`sanitization.json` records source artifact hashes and transformations. Only synthetic session identifiers and local task locations were normalized. Catalog model rows remain intact; account-selection projections, setup codes, credentials, auth-status payloads and unrelated logcat are excluded. `SHA256SUMS` covers this published evidence set.
