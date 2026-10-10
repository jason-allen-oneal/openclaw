# OpenClaw QA Scenario Suite

- Started: 2026-10-10T22:06:05.672Z
- Finished: 2026-10-10T22:08:27.312Z
- Duration ms: 141640
- Passed: 1
- Failed: 0
- Skipped: 0


## Scenarios

### Built native media fallback true

- Status: pass
- Steps:
  - [x] native media delivery boundary
    - Details:

```text
{
  "pass": true,
  "sourceSha": "a1dcdd90a282d2d636eec9151a47a833be89a1af",
  "mode": "true",
  "kind": "media",
  "runId": "6c4a29c5-e90c-4f31-9e67-a92c64877ce9",
  "childSessionKey": "agent:qa:subagent:33aca90e-b4c3-4f7d-889f-53e76ce30172",
  "requesterSessionKey": "agent:qa:main",
  "execution": {
    "status": "terminal",
    "endedAt": 1791670062756,
    "outcome": {
      "status": "ok"
    }
  },
  "delivery": {
    "status": "delivered",
    "disposition": "delivered"
  },
  "receiptKeys": [
    "announce:v1:agent:qa:subagent:33aca90e-b4c3-4f7d-889f-53e76ce30172:6c4a29c5-e90c-4f31-9e67-a92c64877ce9:text-direct"
  ],
  "mediaCount": 1,
  "receivedPngByteEquality": [
    true
  ],
  "expectedPngBytes": 103,
  "failureNoticeCount": 0,
  "acknowledgmentTimes": [
    1791670060371
  ],
  "kickoffAt": 1791670013803,
  "terminalObservedAt": 1791670064162,
  "finishedObservationAt": 1791670099300,
  "postTerminalObservationMs": 35138,
  "childEndedAt": 1791670062756,
  "ordinaryOutbound": [
    {
      "id": "3bbee811-9223-48c3-97d8-0fffde6fc564",
      "text": "Worker started.",
      "timestamp": 1791670060371
    }
  ],
  "providerFaultCaveat": null
}
```


## Notes

- Runs against qa-channel + qa-lab bus + real gateway child + mock-openai provider.
- Scenarios run serially in one gateway worker.
- Scheduling scenarios verify stored schedules and execution behavior through the Gateway.
