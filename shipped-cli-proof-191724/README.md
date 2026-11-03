# Executed shipped-CLI proof: read-only custom streams

PR: https://github.com/openclaw/openclaw/pull/191724  
Reviewed public head: **1613f8f2a6cb38b1468ca2ac5cc9b37d601ec035**  
Scope: real built CLI execution, public provider plugin loading, custom stream adaptation, and returned final text/error. This is not a unit-test or in-process runtime harness.

## Captured outcomes

| Scenario | Installed prior runtime | Built candidate |
| --- | --- | --- |
| Synchronous iterator + result(), no push/end | Exit 1: undefined.bind | Exit 0: **RESULT-REPAIRED** |
| Promise of iterator + result(), no push/end | Exit 0: **TERMINAL-ORIGINAL** (wrong final result) | Exit 0: **RESULT-REPAIRED** |
| Source result rejects after successful terminal event | Not rerun for this proof | Exit 1: **SYNTHETIC-RESULT-ERROR** propagated |

Each factory emits a terminal assistant object containing **TERMINAL-ORIGINAL**. Its independently returned result is a distinct object containing **RESULT-REPAIRED**, or throws the explicit synthetic error. Provider events record that sequence. The returned text above is the actual CLI JSON output, not text inferred from provider-side logs.

- [Canonical assertions](verification.json)
- Sync: [CLI stdout](candidate/sync-repaired/stdout.txt), [provider events](candidate/sync-repaired/provider-events.jsonl), [exit/argv receipt](candidate/sync-repaired/receipt.json), [stderr](candidate/sync-repaired/stderr.txt)
- Async: [CLI stdout](candidate/async-repaired/stdout.txt), [provider events](candidate/async-repaired/provider-events.jsonl), [exit/argv receipt](candidate/async-repaired/receipt.json), [stderr](candidate/async-repaired/stderr.txt)
- Post-terminal rejection: [CLI stdout](candidate/result-error/stdout.txt), [provider events](candidate/result-error/provider-events.jsonl), [exit/argv receipt](candidate/result-error/receipt.json), [stderr](candidate/result-error/stderr.txt)
- Prior sync failure: [CLI stdout](installed-before/sync-repaired/stdout.txt), [events](installed-before/sync-repaired/provider-events.jsonl), [receipt](installed-before/sync-repaired/receipt.json)
- Prior async wrong result: [CLI stdout](installed-before/async-repaired/stdout.txt), [events](installed-before/async-repaired/provider-events.jsonl), [receipt](installed-before/async-repaired/receipt.json)

## Actual execution boundary

The unmodified shipped launcher was invoked as:

```sh
node "$CANDIDATE_CHECKOUT/openclaw.mjs" infer model run --local \
  --model readonly-proof/sync-repaired \
  --prompt 'Return the deterministic fixture response.' --json
```

The other scenarios change only the model suffix to `async-repaired` or `result-error`. The CLI loads [this ordinary synthetic provider](plugin/index.cjs) through plugin configuration. Its public `createStreamFn` supplies the read-only stream. The production CLI path acquires a prepared completion model, executes `completeWithPreparedSimpleCompletionModel`, enters the custom API registry / LLM completion, then serializes the final assistant result.

There are no imports of product internals in the fixture, substituted entrypoints, mocked handlers, registry monkey patches, or product-source instrumentation. The deterministic provider performs no external inference. It is deliberately synthetic, not a real vendor model.

The exposed agent/chat CLI routes reject attribution loss; they were not bypassed. This proof uses the supported local one-shot inference command, with **OPENCLAW_SHELL=exec and OPENCLAW_SUBAGENT_EXEC=1 preserved**. It is CLI proof, **not an agent tool loop or a Gateway deployment**.

## Source and executable identity

The candidate was reconstructed from authenticated upstream archive **f107fd67bfee9b290311317e120c54509b19554b** plus the four hash-verified public PR files. **63,166/63,166 archive entries matched** after the approved replacements, with no missing/mismatched entries or unexpected tracked additions. All four PR files were independently reverified, including the added allocation file.

- [Whole-source comparison](whole-source-provenance.json)
- [Source and remote-file hash binding](source-provenance.json)

Local synthetic build commit: **6e38be3c82910d16841cd81e3ee2f4739690a3b8**. This is intentionally **not** represented as the remote PR Git commit. The build records version 2026.10.10 and that local commit. Node: v24.22.2.

[Before identity](candidate-identity-before.json) and [after identity](candidate-identity-after.json) are identical. They bind the launcher, dist entrypoint, source owner, compiled definition owners (not re-export facades), and AI binder:

| File | SHA-256 |
| --- | --- |
| openclaw.mjs | fca855a910792b669426b4a64e69743e5dd74f7df84f110df7c7e0881b530b3e |
| dist/entry.js | 0831c39898a1cc6f018c52a2f1ecf548f4561db3dcbff2d6f1817402fd46dd69 |
| dist/ai-transport-runtime-host-CeSzmXII.mjs | 2c43a32d8b844f7b89fb133837acc172cd4e73b7ab8cca7af01777642c9a2a6a |
| dist/model-DjubqyF1.mjs | 6828d2ed833ea08998b513b3ac5f7dae11f7f18e1d4be271abce755695e5fef0 |
| packages/ai/dist/event-stream-Bf6cK7-d.mjs | f54898806d5ec6261d4a3430e0906eedd90998e9b735d173669c1726ca4dc28c |

The previous comparison used an existing installed 2026.10.6 runtime, build commit 1b94648c99f5925cf9f220aa35e9175fc52368c1. [Its identity](installed-before-identity.json) is retained. It is not presented as a pristine current-main build.

## Build history and limitations

The first normal `pnpm build:runtime` failed because proxy HTTP403 blocked download of lock-pinned native assets. [Failed build log](build.log) and [receipt](build-receipt.json) remain available. After the exact official archives were supplied and SHA512 reverified, the same normal build succeeded: [retry log](build-retry.log), [receipt](build-retry-receipt.json), [asset integrity receipt](native-asset-download-receipt.json).

The successful build emitted dependency eval/browser-externalization/Vite warnings and a non-fatal chat boot JS budget violation: **1251.3 KiB > 1250.7 KiB**. Build exit 0 is not a claim that those warnings or PR CI gates passed. The separate inherited CI test-budget debt remains tracked in https://github.com/openclaw/openclaw/issues/191738.

This evidence does not establish live-model quality, network transport behavior, Gateway deployment, agent tool continuity, or review acceptance. It proves the changed adapter and independent final-result/error behavior through the actual shipped CLI. No production state or credentials were used or changed. Already-passed focused tests and previous baseline runs were not repeated.

## Replay and publication integrity

Run from this evidence directory against a built candidate:

```sh
python3 capture-identity.py "$CANDIDATE_CHECKOUT" identity-before.json
python3 run-proof.py "$CANDIDATE_CHECKOUT" "$OUTPUT_ROOT" candidate
python3 verify-results.py "$OUTPUT_ROOT"
python3 capture-identity.py "$CANDIDATE_CHECKOUT" identity-after.json
cmp identity-before.json identity-after.json
```

The driver creates isolated home/config/state/workspace per scenario. The configured loopback URL is an unused synthetic placeholder; the custom factory owns completion. The fake configured key is explicitly synthetic. Do not publish generated state directories.

[Publication transformations](publication-transform.json) distinguish original executed bytes from redacted paths. CLI stdout/stderr/provider-event bytes are unchanged. Portable fixture/driver scripts are the actual executed versions, not an unexecuted replacement. [SHA-256 manifest](SHA256SUMS.json) covers the delivered evidence files.

Prepared for independent review; this local bundle has not been published automatically.
