# Observer runtime-recovery execution evidence

Candidate: `4a3d068ce40884d5e70b37b6840bf3303e7b98dc` (#196340).

## Observed

- A real PluginInstance replacement reservation plus the model-runtime drain gate caused two actual `PreparedModelRuntimeOwnerNotPublishedError` refusals with `admissionBlocked: true` from production admission.
- While blocked, no provider HTTP request or assessment broadcast occurred.
- After releasing replacement admission, the same observer run called a real loopback OpenAI-compatible HTTP endpoint, accepted the synthetic response, broadcast the recovered digest, and persisted it through the default SQLite writer. A separate worker read confirmed the durable digest.
- With replacement blocked again, terminal completion encountered one actual typed refusal. The terminal owner persisted health `done` for the same run, did not loop or dispatch another HTTP request, and disposal completed.
- The exact candidate production files were unchanged. One targeted proof test passed; receipt and full captured observations accompany this index.

## Scope and limitations

This is a production-owner fault-injection integration proof, not an installed/full Gateway plugin-reload or live-provider claim. A pass-through spy on `defaultCompleteModel` enters a real retained PluginInstance consumer scope, then calls the original completion function. That context is deliberately injected; errors, utility completion, isolated completion, runtime admission, HTTP transport, observer scheduling, default session reader/writer, and SQLite readback are real. The HTTP endpoint emits a synthetic model response. Only observer broadcast delivery is captured by an in-process callback; no UI/WebSocket rendering is claimed.

An earlier plain caller-held drain probe did not reproduce the error: observer work intentionally detaches its caller async context, waited through the drain, then recovered. It must not be called regression proof. The injected scope models a refusal originating within completion work, without asserting this is the source of any particular production incident.

## Reproduce

On the exact candidate and its installed dependencies, copy `driver.test.ts` to `src/gateway/session-observer-runtime-proof.test.ts`, then run the command in `receipt.json`. The driver uses isolated OpenClaw test state, a local loopback server and no external credential or service. It is a proof artifact, not a proposed new shipped test.

## Failed attempts retained locally

A preliminary standalone probe used the wrong cleanup export; the behavior observation alone was not a passing run. The first Vitest fixture lacked isolated state. Two later attempts exhausted the 120-second case budget while cold worker compilation ran. Moving fixture initialization to its own bounded setup phase separated compiler preparation from the 120-second scenario budget. The SQLite extension first lacked prepared runtime config; awaiting the supported runtime config reader repaired that prerequisite. The final recorded run passed with normal cleanup. No failed attempt is counted as success.
