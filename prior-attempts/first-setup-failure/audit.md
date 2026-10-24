# Retained legacy native capture audit

Audit scope: `candidate-retained-legacy-native`, Android source `7a5e0bda258ac938456e42cfcb6b4f2b2fa23a30`. Read-only examination of receipts, pinned observation drivers and wire evidence; no runtime, build, test or product changes by this audit.

## Verdict

**The first native attempt is a terminal observation/setup failure, not a passing legacy repair capture. No UI-sent turn was attempted.** It must remain preserved rather than overwritten or described as completed proof. This result alone does not establish a new production-code defect.

## Already completed and reusable

- Source/build/install binding exists: the installed production APK SHA256 is `00b9571a73f47c76ad9094efb849fe9158c46914ba078cc4e64b305ef1fa4958`; instrumentation is `f2448087773bb38ddaf8e96700cfb835aef86bb074038aa734dbb0891ffd6168`. Both equal the built artifacts in the recorded identity. Do not rebuild or reinstall solely because this observation failed.
- All six files listed in `driver-files.json` match their pinned snapshot checksums.
- Pairing/connect succeeded: node bootstrap connect and subsequent operator token connect both returned success, sharing signed device identity/public-key hashes. This supports successful initial pairing, not yet retained pairing through upgrade.
- Four `models.list` requests returned successfully with 732 rows and the same model-identity hash, no `refreshFailed` warning. These comprise two general reads, one provider-config read and one configured chat read. RPC success does **not** establish that all three owners committed/rendered those rows.
- The wire ledger contains 122 records, all labeled `native-setup`: 45 requests, 45 responses, 26 events and 6 connection lifecycle records. It includes 18 natural empty-payload `chat.metadata.changed` events. No injected events are claimed.
- Instrumentation/logcat and task app processes were stopped in the terminal native receipt. The root's later `local.reconciliation.receipt.json` records orphan tunnel/proxy cleanup, capture absent, adb reverse removal and ports19990/19992 free; original wrapper exit remains explicitly unavailable.

## Exact failure and evidence limits

- Instrumentation began at `2026-10-24T01:47:53.124194Z`; terminal capture duration39.226s. `captureComplete=false`, `instrumentationPassed=false`.
- `CatalogRefreshProofTest.kt:47` failed while trying to click the onboarding continuation selected by its polling loop: `Native action was not available: Continue: native tap target was not exposed`. The exact cause of target disappearance is not established by this capture; a stale/transitioned onboarding target is possible, not a proven diagnosis.
- No `native-ready.json` exists and no measured phase began. The Kotlin observer creates its ready/state directory only after requiring the native shell, so no three-owner state sample was collected.
- `native-observations.json` is shell error text, not JSON. `native-ui.png` is shell error text, not a PNG. The artifact pull trusted adb exec-out's return code despite an inner `cat` error. These files must not be used as observed state or screenshot evidence.
- Last catalog request was at `01:48:05.375Z`; operator disconnect was at `01:48:32.163Z`, only26.788s later. The trace therefore does not cover a complete30s legacy hint interval after that request, much less sustained bounded idle behavior.
- There is no `chat.send` request, chat terminal event, `ui-turn-*` directory or send-intent receipt. The sole `chat.history` response succeeded with an empty message list. Native input/rendering and retained user history remain unproven.
- No warning/failure/recovery exercise occurred in this capture. No retained-state Gateway upgrade result is present here. Do not substitute the earlier ef99274 current-Gateway results for exact7a5e0bd/three-owner/retained-upgrade evidence.

## Next missing evidence, in order

1. Preserve this failure and finish root-owned process/state reconciliation. Preserve the same installed APK and pairing; inspect the actual current native screen before addressing onboarding. If rerunning observation, use a new bounded case with explicit retained state, not a fresh pm-clear or an overwrite.
2. Obtain real shell-ready observation of all three catalog owners while natural legacy notifications continue, for enough time to cross the30s hint boundary. Record row retention, request spacing/counts, warning state and a normal terminal observer receipt. Avoid rebuilding unchanged production code/tests.
3. Send one message through the actual app UI; require the matching wire request/ack/run terminal and rendered response, or preserve an explicit failed-turn result. Retain its session/message hashes and UI evidence for the upgrade check.
4. Cleanly stop the legacy keeper, then package-only upgrade its exact retained state/config/workspace and reconnect the same APK/device without setup/bootstrap, app clearing, reinstall or state reseeding. Verify the same signed device identity and session/history through API and UI, followed by successful native send/rendering and bounded idle/failure/recovery observations as required.
5. Collect exact native/local/remote shutdown receipts. Publish only audited successful evidence plus material negative limits; exact-head public CI/reviewer completion gates still follow the newly published source.

The root owns all continuation and any corrective harness changes. This audit performed none of the next steps.
