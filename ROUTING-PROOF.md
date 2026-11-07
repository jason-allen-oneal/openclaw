# SMS emulator routing investigation — PR 194422

This report was written before publication. References to `framework/`, full radio/emulator logs, and `lane-status.json` are local-only; selected public excerpts and summaries are linked from README.md.

## Final handoff

Final clean source head: `6e7249c5248b08d8be1ff58e650c5a16868c9dff`. This adds only a two-line fixture range correction accepting both legacy console ports and newer modem endpoints; independently reviewed without findings. Exact-head APK/test APK build passed in2m12s. The runtime attempts described below used d9b05 with identical production code. No successful recipient proof exists on either head.

## Exact source and scope

- Committed fixture head: `d9b05a54a020af17c3a226b2ef4f9cd3af8bec0d`; production fix remains `b91eb225fc4657ec31dc6943ee709b2377a2e0be`, unchanged in this lane.
- This follow-up changes only the opt-in Android instrumentation fixture: accept modem-simulator endpoint ports6520–6527, add an ordinary short-message transport control, share the production `SmsHandler` submission loop, and accurately count received messages.
- Independent exact-commit review confirmed no remaining findings. Its single initial finding (the control claimed three received messages although it expects one) was corrected before commit.
- Exact-head APK/test APK build passed in50s with the existing task-local debug certificate; touched Kotlin lint passes. Existing100 JVM tests/production review are prior unchanged-production evidence, not newly rerun here.

## Result: delivery remains unproven

**The ordinary short SMS control fails at the emulator transport, so long-message receipt cannot honestly be claimed.** Both sender runs submit through the normal production `SmsHandler`, without EMS/TelephonyManager injection. The sender instrumentation passes. The recipient instrumentation waits for the complete expected body and fails after60s; process exit0 is not treated as test success.

Installed host emulator:37.2.13. Devices are API35/ranchu, fingerprint `Android/sdk_phone64_x86_64/emu64x:15/AE3A.240806.019/12368160:userdebug/test-keys`.

### Actual routing and transport adapter

Emulator37's Cuttlefish-derived routing only forwards destination last-four digits6520–6527; the prior console-port5582 destination fell through to pretend-success. The recipient's modem guest listener was33195 (live guest selfconnection) and the inferred separate remote-host listener33345 (fd11, immediately following guest-server creation in official source). Successful recipient acceptance remains unproven.

A task-owned Python TCP bridge bound only `127.0.0.1:6521` and copied bytes unchanged to `127.0.0.1:33345`. It never constructed or altered a PDU, sent an `sms send` console command, or inserted inbox rows. `modem-forward.py` is the full adapter; `modem-forward.jsonl` records byte lengths/hashes. The sender connected to the adapter, and the adapter connected to33345; this confirms that these socket paths were exercised, not that a valid remote SMS was delivered.

For each normal short send, the sender radio log contains a nonempty modem-submit PDU and successful RIL acknowledgment, while the adapter captured exactly18bytes:

```
REM0AT+REMOTESMS=
```

The PDU between `=` and CR is empty. No incoming radio SMS PDU was observed on the recipient. Source diagnosis: `PDUParser::CreateRemotePDU` returns empty unless source host ID has four digits; `DeviceConfig::host_id` reads a separate global. Restarting the sender with official `-modem-simulator-port6520` made its **guest** listener6520 but did not fix the emitted empty payload. This option is therefore not a verified routing fix.

### Preserved attempts

- `native-run-routing-control/commands.json`: initial exact-head install failed signature compatibility because default debug-key home differed; no SMS was sent. Rebuilt using the existing task-local debug key; no uninstall or data reset.
- `native-run-routing-control-2/`: ordinary short control, source guest port automatic; sender passes, recipient times out; empty18byte remote payload captured.
- `native-run-routing-control-3/`: same ordinary short control after source guest port6520; same failure and empty payload. `driver.py`, APK hashes, source SHA, fixture hash, summaries, and full instrumentation results are retained.
- Prior `native-run-1`, `native-run-2`, `native-run-3` and original logs remain intact. They include the earlier actual framework Binder-denial fixture and three accepted production submissions, but **not successful recipient readback**.

## Official source references

- [SMS routing and remote send](https://android.googlesource.com/device/google/cuttlefish/+/emu-main-dev/host/commands/modem_simulator/sms_service.cpp)
- [Remote PDU construction](https://android.googlesource.com/device/google/cuttlefish/+/emu-main-dev/host/commands/modem_simulator/pdu_parser.cpp)
- [Emulator host-ID hook](https://android.googlesource.com/platform/external/qemu/+/emu-main-dev/android/third_party/modem-simulator/emulator_config.cpp)
- [Guest and random remote-host listeners](https://android.googlesource.com/platform/external/qemu/+/emu-main-dev/android/third_party/modem-simulator/modem_main.cpp)

Retrieved source files are retained under `framework/`. They explain the observed backend behavior; they are not a claim that the installed binary is byte-identical to the moving source branch.

## Limits

No physical phone, paid SMS, live Gateway, production state, public PR or branch publication was touched. No physical Samsung/Optus carrier proof exists. Sender success only means submission acceptance; no app-level SENT callback was added. Final sender hidden-API policy was checked as `null`; both completed controls restored/retained it. The supported-backend alternative investigation is bounded; the bridge and task emulators are cleaned up before handoff as recorded in lane-status.json.

## Supported legacy-backend alternative

Both emulators were restarted with the official `-feature -ModemSimulator` option. Logs confirm `Feature 'ModemSimulator' (75) is overridden to 'disabled'`. No adapter was running, and the intended destination was the normal legacy console port5582. Both API35 guests booted, but radio service repeatedly logged `opening qemu_modem_port -1!`; SIM/operator properties stayed empty and the modem-port boot property was absent. This is a guest/backend compatibility failure before a meaningful SMS control could run. See `legacy-attempt-status.json`, `legacy-sender-radio.log`, `legacy-recipient-radio.log`, and both `*-legacy-emulator.log` files. No SMS was submitted during this failed legacy setup.

Independent source diagnosis found the relevant modem startup in [main.cpp](https://android.googlesource.com/platform/external/qemu/+/emu-main-dev/android-qemu2-glue/main.cpp#3043): the selected guest port is local, whereas the host-identity hook reads a distinct zero-initialized global. No supported option assigning that global was found. This is corroboration from current upstream source, not an exact-release binary-source attestation.

Next valid proof option: a known legacy-compatible Android system image meeting app minSdk, or a verified upstream emulator repair for remote-modem host identity. Do not rewrite or inject PDUs merely to manufacture receipt.

Cleanup: both task-owned emulators and the transparent bridge were stopped; both guest hidden-API policies were `null`. No phone, live Gateway, external SMS service or public branch was used.
