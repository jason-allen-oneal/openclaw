# Native Android recovery proof — PR 194423

**Candidate:** `2afbb2ec0f0bbda0c317e6d6a940d2883fe270e5`.
**Result:** six focused JVM tests and one native Android instrumentation test passed; both final builds and the isolated Gateway proof driver exited0. This is captured execution, not an unexecuted reproduction plan.

## Observed shipped-client recovery

The API35 x86_64 KVM emulator ran the actual production `DeviceIdentityStore`, encrypted `DeviceAuthStore`, OkHttp WebSocket and `GatewaySession` from the candidate APK. A separate built candidate Gateway used isolated state and public pairing APIs. A transparent loopback recorder forwarded frames unchanged; it did not cause reconnects or fabricate RPC results.

| Boundary | Actual observation |
| --- | --- |
| Initial authorization | Production Android signed identity authenticated after explicit fixture-only initial pairing approval. |
| Replacement | Another authenticated socket for the same synthetic identity published memoryFreeBytes4096. |
| Obsolete request | Old Android socket sent memoryFreeBytes1024 once; Gateway returned UNAVAILABLE / PAIRING_CHANGED. |
| Close ordering | Error response at04:36:57.366Z preceded Gateway close4001 at04:36:57.378Z. |
| No obsolete effect | Operator `node.list` remained connected with memoryFreeBytes4096 after rejection. |
| Native disconnect | Callback observed `ready=false` and `oldLeaseCurrent=false`. |
| Automatic recovery | Second signed Android handshake succeeded at04:36:57.973Z, without another connect/reconnect call or network-change signal. |
| Fresh effect | New Android event with memoryFreeBytes6144 succeeded; operator `node.list` read it back. |
| No replay | Exactly one stale1024 request and one new6144 request were captured through the fresh-event observation boundary. |

Primary records:

- [Canonical scenario summary](native-run-1/summary.json)
- [Actual native JUnit output — 1 test passed, 3.31s](native-run-1/native-junit.log)
- [Complete sanitized wire trace, including operator readbacks](native-run-1/wire-trace.jsonl)
- [Android logcat](native-run-1/native-logcat.log)
- [Actual command exits](native-run-1/command-exits.json)
- [Gateway process log](native-run-1/gateway.log)

## Exact-source and installed-package identity

Source was committed and frozen before both final builds. Gateway build metadata identifies this full candidate SHA; native JUnit asserts the app's embedded `BuildConfig.GIT_COMMIT` equals it. Built APKs were installed only on the dedicated emulator, pulled back and hashed before instrumentation.

- [Gateway entry/owner/helper/driver hashes and build identity](native-run-1/manifest.json)
- [Built versus installed APK hashes](native-run-1/android-manifest.json)
- App SHA256: `91673bb62fd92b59e2c39e10d44de4aa9bf7265fd334e210a24f6956716d0303`
- Test APK SHA256: `018f25e86c7944194e1f04a06685da6f513735c73bcd88a4cee6b75f34a0cede`
- [SDK input hashes](setup-logs/sdk-input-manifest.json) and [native emulator observations](setup-logs/emulator-ready-receipts.json)

## Focused checks and review

- [Reconnect JVM suite:5 passed](unit-results/TEST-ai.openclaw.app.gateway.GatewaySessionReconnectTest.xml): rejection/close→automatic recovery, old-lease invalidation and no replay; three retired-socket isolation cases; pairing-required pause reporting.
- [Completed-transport contract:1 passed](unit-results/TEST-ai.openclaw.app.gateway.GatewaySessionInvokeTest.xml): RPC rejection does not silently change outbox retry/completion semantics.
- JVM execution6.425s total; new lifecycle case0.142s. Cold Gradle build14m1s. No Android production source change was needed.
- Native test compile:30s. Final app/test APK build:4m17s. Final Gateway build:6m53.2s.
- [Commands and limitations](commands.md), [Android build log](android-final-build.log), [Gateway build log](gateway-final-build.log).
- [Independent P0–P2 review record](independent-review.json): one test-fixture null-lease bug was identified and fixed before execution; no other findings. Initial reviewed and resolved hashes are distinguished. The unavailable local autoreview CLI is not claimed as a passing review.
- ktlint1.8.0 passed both changed files. Earlier formatting findings and corrections are retained. Kotlin is unsupported by the installed UB metric tools; no fabricated metric or mutation score is claimed.

## Reproduce

Use a dedicated fresh emulator and candidate source checkout; never a real phone or user profile. The committed native test is opt-in and checks emulator hardware. Install the free official SDK37.0/build-tools37.0.0 and an API35 x86_64 image. Rebuild both APKs and the Gateway from a clean candidate. [contract.md](contract.md) describes fixture endpoints and client metadata; [driver.mjs](driver.mjs) creates only isolated Gateway/proxy/control services; [run-native.py](run-native.py) binds installed package hashes and the JUnit result.

```sh
PAIRING_PROOF_REPO=/path/to/candidate python3 run-native.py new-run dist/message-handler-gSU5j5BZ.mjs
```

The driver requires candidate HEAD to match Gateway build metadata and refuses changed tracked source. The named bundle is the actual owner for this head; rediscover it after a source change. Synthetic tokens and the exported test-only identity remain under private-runtime and must not be published.

## Limits, warnings and cleanup

This proves native Android **session** recovery on an emulator, not a physical phone, full UI rendering, Wi-Fi handover, or the historical incident's unknown initiating race. The tested trigger is deterministic same-identity replacement. Authorization-denial pause is covered by focused JVM tests, not this native success scenario. No model, external channel, user phone, live Gateway, deployment or merge was involved.

Gateway build retains report-only existing UI size-budget warnings; Android debug packaging retains unstripped third-party native symbols. Both commands exited0. No policy was weakened. The final proxy close1006 in the trace occurs after `/finish`, during intentional fixture cleanup, not during the recovery assertion window. Native JUnit also completed its cleanup successfully.

[Cleanup receipt](cleanup-receipt.json): owned Gateway exited0, all three fixture ports closed, emulator5580 stopped. Original captures and private test state remain locally; no prior public evidence was overwritten. [Publication provenance](publication-manifest.json) distinguishes original capture/driver hashes from redacted public-file hashes; no rerun of an adapted public copy is implied. This is contributor-captured evidence, not an authenticated CI attestation. Hosted review, CI and maintainer security approval are separate PR gates.
