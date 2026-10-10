# OpenClaw QA Scenario Suite

- Started: 2026-10-10T21:58:28.511Z
- Finished: 2026-10-10T22:02:13.835Z
- Duration ms: 225324
- Passed: 1
- Failed: 0
- Skipped: 0


## Scenarios

### Built native media fallback unset

- Status: pass
- Steps:
  - [x] native media delivery boundary
    - Details:

```text
{
  "pass": true,
  "sourceSha": "a1dcdd90a282d2d636eec9151a47a833be89a1af",
  "mode": "unset",
  "kind": "media",
  "runId": "b49b71f8-816d-4026-8267-6892f996ad70",
  "childSessionKey": "agent:qa:subagent:ad50f9bf-2f86-4f7c-9077-995ede3ca1fb",
  "requesterSessionKey": "agent:qa:main",
  "execution": {
    "status": "terminal",
    "endedAt": 1791669684920,
    "outcome": {
      "status": "ok"
    }
  },
  "delivery": {
    "status": "delivered",
    "disposition": "delivered"
  },
  "receiptKeys": [
    "announce:v1:agent:qa:subagent:ad50f9bf-2f86-4f7c-9077-995ede3ca1fb:b49b71f8-816d-4026-8267-6892f996ad70:text-direct"
  ],
  "mediaCount": 1,
  "receivedPngByteEquality": [
    true
  ],
  "expectedPngBytes": 103,
  "failureNoticeCount": 0,
  "acknowledgmentTimes": [
    1791669680379
  ],
  "kickoffAt": 1791669581458,
  "terminalObservedAt": 1791669687599,
  "finishedObservationAt": 1791669722583,
  "postTerminalObservationMs": 34984,
  "childEndedAt": 1791669684920,
  "ordinaryOutbound": [
    {
      "id": "32f8af06-2837-4b53-8707-d5967c93fa98",
      "text": "Worker started.",
      "timestamp": 1791669680379
    }
  ],
  "providerFaultCaveat": null
}
```


## Notes

- Runs against qa-channel + qa-lab bus + real gateway child + mock-openai provider.
- Scenarios run serially in one gateway worker.
- Scheduling scenarios verify stored schedules and execution behavior through the Gateway.
