# Invalid observer output fallback: executed HTTP proof

PR: https://github.com/openclaw/openclaw/pull/196345

Candidate: `5877ba1411b3a81f00e4df66a9649fd5d05ce0aa`

## Boundary

The real `createSessionObserverCompletion` calls unmodified `defaultPrepareModel` and `defaultCompleteModel`. This exercises utility selection, model fallback classification, isolated-completion preparation/auth/dispatch, and the real HTTP SSE transport. The only synthetic external service is an OpenAI-compatible loopback provider. No internal observer, fallback, auth, or transport operation is mocked. A fetch observer rejects every non-loopback destination before dispatch. Credentials and content are synthetic; no live provider or running Gateway is used.

The primary returns syntactically valid JSON containing invalid `planProgress: null`. The configured recovery model returns a valid digest.

## Candidate: PASS

Command: `node scripts/run-vitest.mjs src/gateway/session-observer-http-proof.test.ts --maxWorkers=1`

Exit 0; 1/1 test passed. Test duration 8.673 seconds; full wrapper wall time 146.97 seconds including cold compilation. The wrapper verified the completed source generation before exiting.

```json
{
  "requests": [
    {
      "path": "/v1/chat/completions",
      "model": "primary",
      "stream": true,
      "hasTools": false,
      "maxTokens": 300,
      "temperature": 0.2
    },
    {
      "path": "/v1/chat/completions",
      "model": "recovery",
      "stream": true,
      "hasTools": false,
      "maxTokens": 300,
      "temperature": 0.2
    }
  ],
  "result": {
    "headline": "Recovered via HTTP fallback",
    "assessment": "Fallback produced a valid assessment.",
    "health": "on-track"
  },
  "activeControllerCleared": true
}
```

## Sensitivity control: expected FAIL

Only `src/gateway/session-observer-completion.ts` was replaced with its parent-commit version. The diff removes the added classifier and restores post-completion parsing; all remaining product code and the exact proof were unchanged.

The same command exited 1 with the expected assertion: actual requests `["primary", "primary"]` instead of `["primary", "recovery"]`. No fallback request was emitted. Test run 1/1 expected failure; wrapper wall time 146.16 seconds including cold compilation. This is an executed regression control, not a setup failure.

```json
{
  "requests": [
    {
      "path": "/v1/chat/completions",
      "model": "primary",
      "stream": true,
      "hasTools": false,
      "maxTokens": 300,
      "temperature": 0.2
    },
    {
      "path": "/v1/chat/completions",
      "model": "primary",
      "stream": true,
      "hasTools": false,
      "maxTokens": 300,
      "temperature": 0.2
    }
  ],
  "result": {
    "error": "session observer returned invalid JSON twice; last rejected output: {\"headline\":\"Invalid optional field\",\"health\":\"on-track\",\"planProgress\":null}"
  },
  "activeControllerCleared": true
}
```

## Restoration and scope

The candidate file was restored byte-for-byte after both wrapper processes settled. Its SHA-256 is `106977d991e226810a164ee4ad1fa8ebac291c78c9d39cedd86aa2ed2c02214f`. The temporary proof file was moved outside the checkout; `git diff --exit-code` and clean `git status --short` verified restoration at the candidate SHA. No product commit, push, PR edit, deployment, or live configuration change was made.

Proof source SHA-256: `f45e17c4ac18d509111836bc5fda0c53b72f0fac44ec6afb90fb345099f70aba`.

Limitations: this verifies the production completion boundary and real loopback transport, not a public provider, full Gateway session lifecycle, or UI rendering. Existing observer lifecycle tests provide the separate scheduling/publication regression coverage. The separate shared-deadline repair is out of scope.

## Published files

`driver.test.ts` is the executed proof (place at `src/gateway/session-observer-http-proof.test.ts`); `green.log` and `red.log` are captured outputs with checkout path redacted and ANSI removed. `receipt.json` distinguishes original and published log hashes. No rerun is implied by sanitization.
