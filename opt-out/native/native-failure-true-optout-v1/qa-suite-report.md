# OpenClaw QA Scenario Suite

- Started: 2026-10-10T22:06:38.714Z
- Finished: 2026-10-10T22:09:50.427Z
- Duration ms: 191713
- Passed: 1
- Failed: 0
- Skipped: 0


## Scenarios

### Built native failure fallback true

- Status: pass
- Steps:
  - [x] native failure delivery boundary
    - Details:

```text
{
  "pass": true,
  "sourceSha": "a1dcdd90a282d2d636eec9151a47a833be89a1af",
  "mode": "true",
  "kind": "failure",
  "runId": "79bbe0ab-0114-47ff-9961-277f8d888634",
  "childSessionKey": "agent:qa:subagent:a89c2be9-1e01-4db9-9818-a7956eaa5b10",
  "requesterSessionKey": "agent:qa:main",
  "execution": {
    "status": "terminal",
    "endedAt": 1791670114122,
    "outcome": {
      "status": "error"
    }
  },
  "delivery": {
    "status": "delivered",
    "disposition": "delivered"
  },
  "receiptKeys": [
    "announce:v1:agent:qa:subagent:a89c2be9-1e01-4db9-9818-a7956eaa5b10:79bbe0ab-0114-47ff-9961-277f8d888634:text-direct"
  ],
  "mediaCount": 0,
  "receivedPngByteEquality": [],
  "expectedPngBytes": 103,
  "failureNoticeCount": 1,
  "acknowledgmentTimes": [],
  "kickoffAt": 1791670080911,
  "terminalObservedAt": 1791670114900,
  "finishedObservationAt": 1791670184034,
  "postTerminalObservationMs": 69134,
  "childEndedAt": 1791670114122,
  "ordinaryOutbound": [
    {
      "id": "dc0e44ed-91fb-4eec-818d-f311a09131b4",
      "text": "The AI service is temporarily overloaded. Please try again in a moment.",
      "isError": true,
      "timestamp": 1791670112914
    }
  ],
  "providerFaultCaveat": "HTTP503 matcher also applies to parent post-spawn continuation; failure of requester handoff is intentional"
}
```


## Notes

- Runs against qa-channel + qa-lab bus + real gateway child + mock-openai provider.
- Scenarios run serially in one gateway worker.
- Scheduling scenarios verify stored schedules and execution behavior through the Gateway.
