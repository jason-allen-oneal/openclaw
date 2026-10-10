# OpenClaw QA Scenario Suite

- Started: 2026-10-10T21:58:27.963Z
- Finished: 2026-10-10T22:02:47.138Z
- Duration ms: 259175
- Passed: 1
- Failed: 0
- Skipped: 0


## Scenarios

### Built native failure fallback unset

- Status: pass
- Steps:
  - [x] native failure delivery boundary
    - Details:

```text
{
  "pass": true,
  "sourceSha": "a1dcdd90a282d2d636eec9151a47a833be89a1af",
  "mode": "unset",
  "kind": "failure",
  "runId": "239decb6-55d0-462f-922d-fa16df124b68",
  "childSessionKey": "agent:qa:subagent:6d81eaa7-4980-40f7-ab43-f942f001e9a6",
  "requesterSessionKey": "agent:qa:main",
  "execution": {
    "status": "terminal",
    "endedAt": 1791669685222,
    "outcome": {
      "status": "error"
    }
  },
  "delivery": {
    "status": "delivered",
    "disposition": "delivered"
  },
  "receiptKeys": [
    "announce:v1:agent:qa:subagent:6d81eaa7-4980-40f7-ab43-f942f001e9a6:239decb6-55d0-462f-922d-fa16df124b68:text-direct"
  ],
  "mediaCount": 0,
  "receivedPngByteEquality": [],
  "expectedPngBytes": 103,
  "failureNoticeCount": 1,
  "acknowledgmentTimes": [],
  "kickoffAt": 1791669575652,
  "terminalObservedAt": 1791669686327,
  "finishedObservationAt": 1791669759954,
  "postTerminalObservationMs": 73627,
  "childEndedAt": 1791669685222,
  "ordinaryOutbound": [
    {
      "id": "dee4998b-4829-4a4a-9f74-b4da3922a720",
      "text": "The AI service is temporarily overloaded. Please try again in a moment.",
      "isError": true,
      "timestamp": 1791669679647
    }
  ],
  "providerFaultCaveat": "HTTP503 matcher also applies to parent post-spawn continuation; failure of requester handoff is intentional"
}
```


## Notes

- Runs against qa-channel + qa-lab bus + real gateway child + mock-openai provider.
- Scenarios run serially in one gateway worker.
- Scheduling scenarios verify stored schedules and execution behavior through the Gateway.
