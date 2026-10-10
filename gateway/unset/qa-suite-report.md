# OpenClaw QA Scenario Suite

- Started: 2026-10-10T20:59:32.549Z
- Finished: 2026-10-10T21:00:58.463Z
- Duration ms: 85914
- Passed: 1
- Failed: 0
- Skipped: 0


## Scenarios

### Built Gateway DM completion fallback unset

- Status: pass
- Steps:
  - [x] proves terminal-reply channel behavior including restart recovery
    - Details:

```text
{
  "verdicts": [
    {
      "case": "fallback",
      "conversationId": "terminal-fallback-8ea192c5",
      "runId": "20bc0758-6be2-4594-993d-4dfb59239317",
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
      "runId": "20bc0758-6be2-4594-993d-4dfb59239317",
      "receiptKeys": []
    }
  ]
}
```


## Notes

- Runs against qa-channel + qa-lab bus + real gateway child + mock-openai provider.
- Scenarios run serially in one gateway worker.
- Scheduling scenarios verify stored schedules and execution behavior through the Gateway.
