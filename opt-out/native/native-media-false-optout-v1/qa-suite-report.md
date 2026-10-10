# OpenClaw QA Scenario Suite

- Started: 2026-10-10T22:02:45.210Z
- Finished: 2026-10-10T22:05:08.811Z
- Duration ms: 143601
- Passed: 1
- Failed: 0
- Skipped: 0


## Scenarios

### Built native media fallback false

- Status: pass
- Steps:
  - [x] native media delivery boundary
    - Details:

```text
{
  "pass": true,
  "sourceSha": "a1dcdd90a282d2d636eec9151a47a833be89a1af",
  "mode": "false",
  "kind": "media",
  "runId": "6eefb820-adeb-4c9f-b3a3-327e45c1fff3",
  "childSessionKey": "agent:qa:subagent:62ee2f12-b482-401f-891c-52711a644667",
  "requesterSessionKey": "agent:qa:main",
  "execution": {
    "status": "terminal",
    "endedAt": 1791669869267,
    "outcome": {
      "status": "ok"
    }
  },
  "delivery": {
    "status": "suspended",
    "disposition": "permanent_failure"
  },
  "receiptKeys": [],
  "mediaCount": 0,
  "receivedPngByteEquality": [],
  "expectedPngBytes": 103,
  "failureNoticeCount": 0,
  "acknowledgmentTimes": [
    1791669867280
  ],
  "kickoffAt": 1791669831615,
  "terminalObservedAt": 1791669869967,
  "finishedObservationAt": 1791669899987,
  "postTerminalObservationMs": 30020,
  "childEndedAt": 1791669869267,
  "ordinaryOutbound": [
    {
      "id": "994b2341-0f3a-444f-933d-6945b5fc94ba",
      "text": "Worker started.",
      "timestamp": 1791669867280
    },
    {
      "id": "77051d7c-cee7-411c-b20d-2c9e206f8bb6",
      "text": "Protocol note: acknowledged. Continue with the QA scenario plan and report worked, failed, and blocked items.",
      "timestamp": 1791669874695
    }
  ],
  "providerFaultCaveat": null
}
```


## Notes

- Runs against qa-channel + qa-lab bus + real gateway child + mock-openai provider.
- Scenarios run serially in one gateway worker.
- Scheduling scenarios verify stored schedules and execution behavior through the Gateway.
