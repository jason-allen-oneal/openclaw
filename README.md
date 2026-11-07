# Android inbound backlog recovery proof — PR #194424

Candidate: **`a1cd3d84e0c2deaa7561312ed4845747ac1bb9e0`**. Base: `12026082dc867275fddde9ed27e1d6a22b9848ee`.

## Result

The production Android connection now admits at most **256 frames including the active handler**, **25 MiB per frame**, and **50 MiB retained UTF-8 text**. It closes with code **1013** on overflow, preserves FIFO settlement of admitted replies/issued credentials, and resumes through normal reconnect without replaying requests of unknown outcome. Byte ceilings match the Gateway defaults; the count limit also bounds small-frame overhead.

### Verified behavior

- **Red → green:** the pre-fix regression failed because no overload close occurred. The fixed count, multibyte aggregate-byte and single-frame overflow cases pass; admitted connect credentials persist before the terminal callback, and repeated overflow produces only one terminal callback.
- **95 targeted JVM tests passed:** 57 reconnect tests and 38 invoke tests, zero failures/errors/skips. Suite times: 21.993s and 12.695s. Initial combined tests/APK build wall time: 125s.
- **Native Android / real OkHttp proof passed in 3.01s** on the dedicated API35 AOSP emulator. A blocked handler retained an accepted health response while the peer filled the admission budget. The peer observed close1013 before the handler was released. Readiness and the old request lease were already invalid. After release the accepted response settled, automatic reconnect completed, and **300 replacement health RPCs** succeeded. Exactly **301 health requests** were observed across the two sockets: no replay.
- Both APKs were built with the full candidate SHA; pulled installed APK hashes match the built artifacts. The exact-SHA final build passed in 72s.
- Touched Kotlin passes official ktlint1.8.0; documentation formatting passes. Independent native Codex source review found **no actionable P0–P2 findings** for the exact committed diff hash `f538a4850b0b7a898f611771dd4e71994f00f1303114a1aa5628e14d461cc71c`.

## Scope and limits

Native proof uses the compiled production Android `GatewaySession` and real OkHttp sockets against an **isolated synthetic WebSocket protocol peer**, not a built Gateway, physical phone, carrier or model service. The retained original test scaffold's private-counter assertions were removed; byte reuse is proven by processing beyond its capacity even when handlers throw, and count reuse/recovery by the native replacement RPCs.

An already-running handler can still delay terminal notification and reconnect. Request readiness is retired immediately, and queued events cannot execute their handlers after retirement, but accepted response/token settlement is deliberately not canceled. This bounds retained backlog—not arbitrary handler execution time or total process heap.

The installed UB complexity/duplication/mutation tools do not support Kotlin; no metric or mutation score is claimed. The repository JS/TS test-line ratchet passed with zero counted delta and no increased ceiling; its pre-existing 70-line excess is unchanged.

## Retained unsuccessful attempts

- `red.log`: missing protocol-generator workspace dependencies; fixed with the unchanged frozen lockfile.
- `red-2.log`: missing Mermaid renderer workspace dependency; installed that existing workspace scope.
- `red-3.log` / `red-result.xml`: the intended pre-fix behavior failure, not a setup failure.
- `final-build.log`: abbreviated candidate SHA rejected before build; `final-build-2.log` uses the complete 40-character SHA and succeeds.

Local checkout/SDK/proof paths and the XML hostname were redacted in this copy; original local evidence is retained. Source, compiler/runtime assertions, exits, counts and hashes are unchanged. Fixture processes were stopped and their port was verified closed; the emulator was transferred warm to the separate SMS proof lane.

## Reproduction

The committed `GatewaySessionInboundRecoveryNativeTest` is opt-in. The included `native-driver.mjs` serves the synthetic peer on loopback; `run-native.py <candidate-checkout> <output-directory-name>` checks the clean candidate, installs and hashes its APKs on **emulator-5580**, runs instrumentation, verifies host observations and stops the peer. It requires the already-built exact-SHA debug APK and test APK and an isolated emulator; it never targets a physical phone.

Focused unit command:

```sh
cd apps/android
./gradlew :app:testThirdPartyDebugUnitTest \
  --tests ai.openclaw.app.gateway.GatewaySessionReconnectTest \
  --tests ai.openclaw.app.gateway.GatewaySessionInvokeTest \
  --console=plain --max-workers=2
```
