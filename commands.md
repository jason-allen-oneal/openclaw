# Commands and source identity

Candidate commit: `2afbb2ec0f0bbda0c317e6d6a940d2883fe270e5`. Tracked source was frozen before the final builds.

- Unit validation: `./gradlew :app:testThirdPartyDebugUnitTest --tests ai.openclaw.app.gateway.GatewaySessionReconnectTest.pairingChangedCloseAutomaticallyReauthenticatesWithoutReplayingRejectedEvent --tests 'ai.openclaw.app.gateway.GatewaySessionReconnectTest.retired*' --tests ai.openclaw.app.gateway.GatewaySessionReconnectTest.pairingRequiredFailureNotifiesPauseReconnectProblem --tests ai.openclaw.app.gateway.GatewaySessionInvokeTest.sendNodeEvent_preservesCompletedRpcAsSuccessWhenGatewayReturnsError --console=plain --max-workers=4`. Exit0, six tests passed, zero failures/errors. Cold build14m1s, test time6.425s. This ran before commit on the exact committed test bytes; production Android was unchanged.
- Native compile: `./gradlew :app:compileThirdPartyDebugAndroidTestKotlin --console=plain --max-workers=4`. Exit0, 30s.
- Lint: official ktlint-cli1.8.0, the two changed Kotlin files. Final exit0. Earlier formatting findings and format logs retained.
- Final APK build: `./gradlew :app:assembleThirdPartyDebug :app:assembleThirdPartyDebugAndroidTest -PopenclawBuildCommit=2afbb2ec0f0bbda0c317e6d6a940d2883fe270e5 -PopenclawBuildTimestamp=2026-11-07T04:29:00.000Z --console=plain --max-workers=4`. Timestamp is the fixed minute containing invocation, used consistently across both variants. Actual exit is in android-final-build.exit.
- Final Gateway build: `pnpm build:runtime`. Actual exit is in gateway-final-build.exit.
- Java21, official SDK37.0/buildtools37.0.0, AOSP API35 x86_64 emulator5580/KVM. Setup receipts retain exact environment/package versions.

Kotlin is unsupported by the installed UB metric tools; no CRAP, duplication or mutation score is claimed. Earlier Gateway red/green/mutation evidence remains separate. The new Android test demonstrates the existing client response to the repaired Gateway contract rather than claiming a new Android production defect.
