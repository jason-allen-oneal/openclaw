# OpenClaw QA Scenario Suite

- Started: 2026-10-10T20:58:23.106Z
- Finished: 2026-10-10T21:00:13.980Z
- Duration ms: 110874
- Passed: 1
- Failed: 0
- Skipped: 0


## Scenarios

### Built Gateway DM completion fallback false

- Status: pass
- Steps:
  - [x] proves terminal-reply channel behavior including restart recovery
    - Details:

```text
{
  "verdicts": [
    {
      "case": "fallback",
      "conversationId": "terminal-fallback-6136939c",
      "runId": "e29f6ad8-1686-4638-bc39-eaf8ceaf8c9d",
      "deliveryStatus": "pending",
      "inputDisposition": "fallback",
      "representation": "exact terminal text",
      "restart": false,
      "fallback": true,
      "expectedTerminalSendCount": 0,
      "actualTerminalSendCount": 0,
      "capturedTerminalPayloads": [],
      "auxiliaryChannelEvents": [
        "Worker started.",
        "Worker started.",
        "Protocol note: acknowledged. Continue with the QA scenario plan and report worked, failed, and blocked items."
      ],
      "silenceTokenLeaked": false,
      "internalMetadataLeak": false,
      "pass": true
    }
  ],
  "directFallbackProofs": [
    {
      "case": "fallback",
      "runId": "e29f6ad8-1686-4638-bc39-eaf8ceaf8c9d",
      "receiptKeys": []
    }
  ]
}
```


## Notes

- Runs against qa-channel + qa-lab bus + real gateway child + mock-openai provider.
- Scenarios run serially in one gateway worker.
- Scheduling scenarios verify stored schedules and execution behavior through the Gateway.
