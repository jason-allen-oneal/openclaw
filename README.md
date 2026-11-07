# Android SMS carrier-lookup recovery — PR #194422

Candidate: `6e7249c5248b08d8be1ff58e650c5a16868c9dff`.
Production repair: `b91eb225fc4657ec31dc6943ee709b2377a2e0be`.

**Result: production-boundary tests and native sender diagnostic pass; recipient delivery remains unproven.** This evidence does not claim Samsung/Optus carrier validation or successful end-to-end SMS receipt.

## What is proved

- The production SMS sender falls back only when Android's message divider throws `SecurityException`. Normal platform division, SEND_SMS permission handling, and send-time errors remain intact. Fallback respects whole-message GSM encoding, extension septets and UTF-16 surrogate boundaries. It reserves space for non-EMS page markers using 153 GSM septets or 66 UTF-16 units.
- The preserved red result fails at the production send boundary before the repair. The candidate's focused JVM run passes 100 tests: 4 send-boundary tests and 96 SMS-manager tests. These ran before the production commit; their source is unchanged at the final candidate.
- [The native sender diagnostic](native-run-3/sender.txt) passes after an actual framework Binder phone-state denial, then makes three production `SmsHandler` submissions. The fixture installs a context-bound `TelephonyManager` singleton and EMS cache **only in the app process** to exercise the denial. This is deliberate fault injection, not the stock Samsung/Optus environment. The telephony service and SMS implementation were not mocked or patched. Submission acceptance is not delivery.
- [Final APK and instrumentation APK build](legacy-final-build.log) passes on clean candidate `6e7249c`; [artifact hashes](final-artifact-manifest.json) identify those builds. Android lint and focused Kotlin lint also passed; retained logs identify their actual earlier/final scope. No unsupported mutation/CRAP/duplication score is claimed for Kotlin.

## Provenance and limitations

The original native diagnostic's [manifest](native-run-3/summary.json) records HEAD `b91eb225fc4` plus the then-uncommitted fixture hash `c1f6ad6b398ea29b31578283c062bf9f1d0a87f62f501932a0c4846c4b096648`. That fixture was subsequently committed as `ea7346c8f56` and is included as [sender-diagnostic-fixture.kt](sender-diagnostic-fixture.kt). It is unchanged-production diagnostic evidence, **not an exact-final-head native run**. Follow-up native controls ran at `d9b05a54a02`; final `6e7249c` only broadens the fixture's accepted test destination ranges. No production code changed across these fixture commits.

## Failed recipient checks retained

- [Original recipient](native-run-3/recipient.txt): timed out after 60 seconds. The instrumentation command's process exit 0 is not counted as test success.
- [Normal short-message control](native-run-routing-control-2/summary.json): sender passed, recipient timed out. This control had no carrier-denial injection.
- [Repeated control with explicit sender modem port](native-run-routing-control-3/summary.json): same failure. A transparent loopback TCP adapter forwarded bytes unchanged and captured exactly `REM0AT+REMOTESMS=\r`, with an **empty PDU**. See [capture hashes](modem-forward.jsonl) and [adapter](modem-forward.py). No SMS/PDU or inbox row was invented, modified, or injected.
- [Legacy backend attempt](legacy-attempt-status.json): emulator accepted the supported backend flag, but the API35 guest had no SIM/operator and repeatedly attempted modem port -1. No SMS was submitted through that failed setup.
- Earlier fixture-precondition, build setup and signature mismatch failures are also retained. See [routing investigation](ROUTING-PROOF.md). Upstream source analysis explains the observed backend failure but is not an attestation of exact installed-binary source.

Both task emulators and the adapter were stopped, and hidden-API policies restored to `null`. No physical phone, paid SMS, or live Gateway was used.

## Review and export

Independent native code review covered the production change and both subsequent fixture adjustments; no actionable findings remained. This is not a claim that local ClawSweeper or the autoreview CLI ran successfully. Hosted review and CI belong to the PR's exact pushed head.

[Export manifest](EXPORT-MANIFEST.json) lists original and public-copy hashes. Public exports replace private local paths with placeholders and omit process properties from XML; radio files are labeled bounded excerpts. Full original raw files and downloaded upstream source remain local. No keys, APKs, AVD disks, or unrelated logs are published.
