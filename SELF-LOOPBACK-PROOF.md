# Exact-head virtual-radio self-loopback proof

Candidate `6e7249c5248b08d8be1ff58e650c5a16868c9dff`, clean worktree. App/test APK hashes match `final-artifact-manifest.json`.

Existing API35 task AVD started with supported `-phone-number 5580`, normal ModemSimulator. Production SmsHandler sends to that same number. The modem local-number path processes the submitted PDU as an incoming message. No console SMS, inserted Inbox row, fabricated/modified PDU, transport adapter, telephony service patch, or source change was used.

- `native-run-self-loopback-control`: normal short sender and receiver each `OK (1 test)`; receiver asserts one complete expected body from Telephony.Sms.Inbox after fresh marker/pre-send timestamp.
- `native-run-self-loopback-denial`: sender verifies actual framework Binder getGroupIdLevel1 permission denial with an explicitly injected app-process EMS cache/context-bound manager, then sends short, long GSM and Unicode through production SmsHandler. Receiver asserts all three complete expected Inbox bodies. Both instrumentation tests `OK (1 test)`.
- Source fixture is unchanged at final candidate. Sender and receiver run sequentially on one device; receiver checks Inbox, not Sent. Radio log corroborates incoming +CMT, UNSOL_RESPONSE_NEW_SMS and completed SMS_RECEIVED broadcasts.

This proves production send -> Android framework/RIL -> virtual modem -> incoming PDU -> Android Inbox/reassembly. It does NOT prove two-device remote transport, physical Samsung/Optus, or carrier delivery. Earlier failed two-emulator attempts remain preserved and relevant limitations.

`self-loopback-inbox.txt` is an optional adb content export that failed shell quoting (`Unsupported argument: LIKE`); it is not receipt evidence. Receipt assertions above ran inside the committed Android fixture and passed. Driver and lifecycle script are retained with recorded hashes.

Cleanup receipt `self-loopback-result.json`: hidden_api_policy null, task emulator stopped, prior task SIM configuration restored. No phone, paid SMS or live Gateway touched.
