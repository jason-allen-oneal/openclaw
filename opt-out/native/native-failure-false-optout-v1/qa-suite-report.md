# OpenClaw QA Scenario Suite

- Started: 2026-10-10T22:03:59.543Z
- Finished: 2026-10-10T22:06:22.254Z
- Duration ms: 142711
- Passed: 1
- Failed: 0
- Skipped: 0


## Scenarios

### Built native failure fallback false

- Status: pass
- Steps:
  - [x] native failure delivery boundary
    - Details:

```text
{
  "pass": true,
  "sourceSha": "a1dcdd90a282d2d636eec9151a47a833be89a1af",
  "mode": "false",
  "kind": "failure",
  "runId": "a102c7b2-9cf2-4f62-91ea-0bfd423049eb",
  "childSessionKey": "agent:qa:subagent:de00d332-16a3-48c4-b9ae-06fb751bb11b",
  "requesterSessionKey": "agent:qa:main",
  "execution": {
    "status": "terminal",
    "endedAt": 1791669942549,
    "outcome": {
      "status": "error"
    }
  },
  "delivery": {
    "status": "pending"
  },
  "receiptKeys": [],
  "mediaCount": 0,
  "receivedPngByteEquality": [],
  "expectedPngBytes": 103,
  "failureNoticeCount": 0,
  "acknowledgmentTimes": [],
  "kickoffAt": 1791669899011,
  "terminalObservedAt": 1791669943089,
  "finishedObservationAt": 1791669973091,
  "postTerminalObservationMs": 30002,
  "childEndedAt": 1791669942549,
  "ordinaryOutbound": [
    {
      "id": "07d8a013-abc6-48c7-8133-9a7fcfc8b697",
      "text": "The AI service is temporarily overloaded. Please try again in a moment.",
      "isError": true,
      "timestamp": 1791669940796
    }
  ],
  "providerFaultCaveat": "HTTP503 matcher also applies to parent post-spawn continuation; failure of requester handoff is intentional"
}
```


## Notes

- Runs against qa-channel + qa-lab bus + real gateway child + mock-openai provider.
- Scenarios run serially in one gateway worker.
- Scheduling scenarios verify stored schedules and execution behavior through the Gateway.
