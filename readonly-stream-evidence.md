# Custom API readonly-stream contract verification

Base: `openclaw/openclaw@f107fd67bfee9b290311317e120c54509b19554b`. Candidate file hashes and selected sanitized receipts appear below. This is local candidate evidence, not hosted CI or remote-head acceptance.

## Failure and fix

The public `StreamFn` contract allows synchronous streams exposing only `result()` and an async iterator. The old adapter cast such a stream to the full producer contract; actual `createLlmRuntime().stream()` / `.completeSimple()` dispatch then threw at `source.push.bind`. A producer-contract guard now preserves full synchronous streams and bridges readonly streams through the existing retained-owner path.

A regression prevents bridging existing SDK streams unnecessarily: producer completion must remain the original promise, and decorated result repair stays lazy. An earlier executed unconditional-bridge mutation failed that regression.

Independent review also caught a readonly-result defect in the reused asynchronous bridge: a terminal event settled its result before a separately repaired source result was returned. The final bridge exposes the existing retained consumer promise through `result()`, independently of terminal-event producer completion. It preserves source result repairs and converts final-result rejection into an error message even after a successful terminal event. No new lifecycle owner or API was introduced.

## Executed checks

- Original 10-test regression suite on upstream implementation: 3 failures / 7 passes at the intended binding boundary (historical base evidence).
- Expanded 11-test suite before the readonly-result repair: 3 failures / 8 passes, demonstrating discarded repaired results for sync and async factories and a hidden final-result rejection.
- Final formatted candidate: 11/11 passes, 4.022 seconds wall.
- Existing loopback provider-affinity suite: 8/8 passes.
- Existing host-scope stream suite: 17/17 passes.
- Existing embedded request/compaction suite: 20/20 passes.
- Combined final sibling execution: 136.871 seconds wall including compiled-worker preparation.
- Repository-targeted lint passed in 262.124 seconds including SDK declaration preparation; final agents-root test typecheck passed in 4.517 seconds; formatter and diff whitespace passed.
- Fresh Node diagnostic coverage: 25/25 lines, 26/26 statements, 7/7 functions, 10/11 branches for the adapter. CRAP scores: adapter 5.4, producer guard 5.0, registration 2.0. Scoped duplication comparison found no candidates >=0.8.

All model responses and credentials used by these tests are synthetic; the affinity test uses a loopback HTTP server. No live external inference, Gateway activation, hosted CI or hosted reviewer success is claimed. Local automated review was unavailable due authentication. Fresh independent re-review passed with no blocking findings: the reviewer separately executed sync/async repaired-result and post-terminal rejection diagnostics, confirming the prior finding is resolved on the manifest's exact source hashes. The 128-line regression allocation is confined to this change and leaves the shared baseline untouched. Production delta is +25/-7 lines; test delta +129/-1. A formatting failure and previous review/verification attempts are retained separately, not relabeled as passes. No exhaustive automated mutation score is claimed.

## Published-source binding

Remote candidate head: `556ae2ab2ca052acab4f58ea1e0da98c910fa825`. The first topic commit has real upstream parent `f107fd67bfee9b290311317e120c54509b19554b`; no synthetic local history was published. All three files fetched from the immutable remote head match the independently reviewed local bytes exactly. These local tests ran before publication on those bytes; this is source-equivalent local proof, not a claim that a local synthetic commit equals the remote Git head. Current upstream `d921a2bfcc4e0aeeec199381b73403d51cced607` still has the original affected implementation/tests. Hosted CI and hosted review are separate pending observations.

```json
{
  "upstreamBase": "f107fd67bfee9b290311317e120c54509b19554b",
  "remoteHead": "556ae2ab2ca052acab4f58ea1e0da98c910fa825",
  "files": {
    "src/agents/custom-api-registry.ts": "400c9c10fc3a020b7129f544856758e4dd1e00c8d38e0894bffa27b5de05d63a",
    "src/agents/custom-api-registry.test.ts": "7319b3b6869d2106985c74cf90fe2581e52dbae73a4f0335716ae0e0dce967cb",
    "config/test-lines-allocations/custom-readonly-stream-contract.txt": "52821dd30aba99490861b3768c11371bb4adc9fe120b4b0ca54412a7f0aa3b77"
  },
  "patchSha256": "806db3ce3689f68680bbb2a710d0e76d7042b9f7885c0fe94813da6fcd53f850"
}
```

## Selected execution receipts

Working-directory paths are omitted. Commands are repository-relative. Earlier adverse runs remain identified separately from final passes.

### verified-red-base

```json
{
  "command": [
    "node",
    "scripts/run-vitest.mjs",
    "src/agents/custom-api-registry.test.ts",
    "--maxWorkers=1"
  ],
  "exitCode": 1,
  "wallSeconds": 3.005,
  "upstreamBase": "f107fd67bfee9b290311317e120c54509b19554b",
  "candidateRestored": true,
  "candidateSourceSha256": "10b39bf5f95ba3e94e961d397e5344a32c5b66c8ac16615c71faeec0cde808b3"
}
```

### readonly-result-red

```json
{
  "command": [
    "node",
    "scripts/run-vitest.mjs",
    "src/agents/custom-api-registry.test.ts",
    "--maxWorkers=1"
  ],
  "exitCode": 1,
  "wallSeconds": 4.945,
  "finishedUnix": 1793687060.3426661
}
```

### readonly-result-green

```json
{
  "command": [
    "node",
    "scripts/run-vitest.mjs",
    "src/agents/custom-api-registry.test.ts",
    "--maxWorkers=1"
  ],
  "exitCode": 0,
  "wallSeconds": 4.622,
  "finishedUnix": 1793687072.632262
}
```

### result-verified-focused

```json
{
  "command": [
    "node",
    "scripts/run-vitest.mjs",
    "src/agents/custom-api-registry.test.ts",
    "--maxWorkers=1"
  ],
  "exitCode": 0,
  "wallSeconds": 4.022,
  "finishedUnix": 1793687410.7975767
}
```

### result-final-siblings

```json
{
  "command": [
    "node",
    "scripts/run-vitest.mjs",
    "src/agents/provider-session-affinity.test.ts",
    "packages/ai/src/stream.host-scope.test.ts",
    "src/agents/embedded-agent-runner/run/chatgpt-v2-compaction.test.ts",
    "--maxWorkers=1"
  ],
  "exitCode": 0,
  "wallSeconds": 136.871,
  "finishedUnix": 1793687283.3059635
}
```

### result-final-lint

```json
{
  "command": [
    "node",
    "scripts/run-oxlint.mjs",
    "--tsconfig",
    "src/agents/tsconfig.json",
    "src/agents/custom-api-registry.ts",
    "src/agents/custom-api-registry.test.ts"
  ],
  "exitCode": 0,
  "wallSeconds": 262.124,
  "finishedUnix": 1793687367.8527575
}
```

### result-verified-types

```json
{
  "command": [
    "node",
    "scripts/run-tsgo.mjs",
    "-p",
    "test/tsconfig/tsconfig.core.test.agents-root.json",
    "--incremental"
  ],
  "exitCode": 0,
  "wallSeconds": 4.517,
  "finishedUnix": 1793687415.3144767
}
```

### result-verified-format

```json
{
  "command": [
    "node",
    "scripts/run-format.mts",
    "--check",
    "src/agents/custom-api-registry.ts",
    "src/agents/custom-api-registry.test.ts"
  ],
  "exitCode": 0,
  "wallSeconds": 0.103,
  "finishedUnix": 1793687415.417957
}
```

### result-verified-diff

```json
{
  "command": [
    "git",
    "diff",
    "--check"
  ],
  "exitCode": 0,
  "wallSeconds": 0.028,
  "finishedUnix": 1793687415.4460838
}
```

## Focused final runtime observations

```text
[test] starting test/vitest/vitest.agents-core.config.ts

 RUN  v5.0.5 <isolated-checkout>

stderr | unknown test
[sqlite-test-lifecycle] src/agents/custom-api-registry.test.ts: retiring openclaw.agentDatabaseReaders

 ✓ |agents-core| src/agents/custom-api-registry.test.ts > ensureCustomApiRegistered > registers a custom api provider once 42ms
 ✓ |agents-core| src/agents/custom-api-registry.test.ts > ensureCustomApiRegistered > delegates both stream entrypoints to the provided stream function 3ms
 ✓ |agents-core| src/agents/custom-api-registry.test.ts > ensureCustomApiRegistered > preserves producer completion and lazy decorated results for synchronous SDK streams 4ms
 ✓ |agents-core| src/agents/custom-api-registry.test.ts > ensureCustomApiRegistered > adapts async stream factories to the synchronous provider contract 3ms
 ✓ |agents-core| src/agents/custom-api-registry.test.ts > ensureCustomApiRegistered > accepts sync read-only streams through the LLM runtime 6ms
 ✓ |agents-core| src/agents/custom-api-registry.test.ts > ensureCustomApiRegistered > accepts async read-only streams through the LLM runtime 3ms
 ✓ |agents-core| src/agents/custom-api-registry.test.ts > ensureCustomApiRegistered > preserves read-only abort events and passes the caller's cancellation signal 3ms
 ✓ |agents-core| src/agents/custom-api-registry.test.ts > ensureCustomApiRegistered > converts read-only iterator failures into terminal runtime errors 9ms
 ✓ |agents-core| src/agents/custom-api-registry.test.ts > ensureCustomApiRegistered > reports read-only result failures even after a successful terminal event 6ms
 ✓ |agents-core| src/agents/custom-api-registry.test.ts > ensureCustomApiRegistered > converts async stream factory failures into terminal stream errors 4ms
 ✓ |agents-core| src/agents/custom-api-registry.test.ts > ensureCustomApiRegistered > keeps plugin api providers when refreshing built-ins 3ms

 Test Files  1 passed (1)
      Tests  11 passed (11)
   Start at  01:30:09
   Duration  1.20s (worker 42%, transform 21%, setup 14%, import 13%, tests 9%)

[test] passed 1 Vitest shard in 3.14s
```

## Independent review

# Independent re-review — 2026-11-03

Verdict: **no blocking findings; prior P2 resolved**.

Executed real `createLlmRuntime()` dispatch against the frozen revised source:

- Sync and async readonly streams return the repaired source-result identity.
- Repeated `result()` calls return the same result; source `result()` runs once.
- Producer completion remains the original terminal-event message.
- Result rejection after `done` becomes the existing normalized error response.
- Full synchronous producer streams retain the unchanged identity-preserving
  fast path. Existing owner retention is reused, without a new lifecycle owner.

Exact reviewed SHA256:

| File | Hash |
| --- | --- |
| src/agents/custom-api-registry.ts | 400c9c10fc3a020b7129f544856758e4dd1e00c8d38e0894bffa27b5de05d63a |
| src/agents/custom-api-registry.test.ts | 7319b3b6869d2106985c74cf90fe2581e52dbae73a4f0335716ae0e0dce967cb |
| config/test-lines-allocations/custom-readonly-stream-contract.txt | 52821dd30aba99490861b3768c11371bb4adc9fe120b4b0ca54412a7f0aa3b77 |

The reviewer independently executed the three-case diagnostic, not the worker's
broader checks. No source edits or publication. Final check receipts separately
show 11/11 focused and 45/45 sibling passes plus lint/types/format. Published-head
reconciliation, CI and hosted review remain separate gates.

