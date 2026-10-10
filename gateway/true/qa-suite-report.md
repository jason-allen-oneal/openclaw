# OpenClaw QA Scenario Suite

- Started: 2026-10-10T20:52:35.276Z
- Finished: 2026-10-10T20:58:20.494Z
- Duration ms: 345218
- Passed: 1
- Failed: 0
- Skipped: 0


## Scenarios

### Built Gateway DM completion fallback true

- Status: pass
- Steps:
  - [x] proves terminal-reply channel behavior including restart recovery
    - Details:

```text
{
  "verdicts": [
    {
      "case": "fallback",
      "conversationId": "terminal-fallback-ce864545",
      "runId": "5665ded2-e3d7-491a-92e3-eca70a7d1565",
      "deliveryStatus": "delivered",
      "inputDisposition": "fallback",
      "representation": "exact terminal text",
      "restart": false,
      "fallback": true,
      "expectedTerminalSendCount": 1,
      "actualTerminalSendCount": 1,
      "capturedTerminalPayloads": [
        "QA-SUBAGENT-TERMINAL-FALLBACK-OK"
      ],
      "auxiliaryChannelEvents": [
        "Worker started.",
        "Worker started."
      ],
      "silenceTokenLeaked": false,
      "internalMetadataLeak": false,
      "pass": true
    }
  ],
  "directFallbackProofs": [
    {
      "case": "fallback",
      "runId": "5665ded2-e3d7-491a-92e3-eca70a7d1565",
      "receiptKeys": [
        "announce:v1:agent:qa:subagent:5e69b989-e3f0-4389-b3ea-9b1a851702b5:5665ded2-e3d7-491a-92e3-eca70a7d1565:text-direct"
      ]
    }
  ]
}
```


## Notes

- Runs against qa-channel + qa-lab bus + real gateway child + mock-openai provider.
- Scenarios run serially in one gateway worker.
- Scheduling scenarios verify stored schedules and execution behavior through the Gateway.
