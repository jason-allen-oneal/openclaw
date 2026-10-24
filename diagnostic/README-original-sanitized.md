# Normal-TTL multi-provider feedback diagnostic — executed comparison

This diagnostic is designed to test whether normal successful discovery across many configured providers can age earlier inventory before the complete catalog publication, then feed legacy metadata-driven reads. It is not an established reproduction of issue179075, not a native Android test, and not accepted PR proof.

## Fixture

- Exact official Gateway2026.9.6 package on GATEWAY_HOST; its build identity, entry hash and Node24 binary hash are recorded per case.
- One public external provider plugin exports64 provider definitions,732 configured models (28×12 +36×11), and static synthetic API-key credentials. The selected agent model is available. The healthy cases omit the report's three missing-auth rows. The warning variant below adds an actual non-selected-provider discovery failure; it does not establish the original warning source.
- `models.mode=merge` admits dynamic discovery. The previous reported-version baseline used replace mode, which bypasses implicit discovery, so its732-row acceptance does not test this path.
- The official SDK default30-second TTL is used by omitting `ttlMs`. Normal-load case delays500ms **inside** each cache loader; no post-cache delay or tiny TTL is introduced. Fast-load control uses0ms delay with the same64 providers.
- The500ms loader delay models supported provider work; it does not contact a real provider endpoint. No model inference occurs.
- One explicit full discovery seed is outside measurement. The observer waits until all64 actual provider calls complete and a natural metadata publication follows; the seed RPC's5-second foreground return is not treated as full discovery completion.
- Immediately after full publication, one ordinary models.list read starts measurement. No expiry sleep or injected event is used. Only natural legacy metadata events cause the five-RPC follow-up bundle.
- Measurement ends at45seconds or30 follow-up bundles; then reads stop and a5-second quiet interval with no outstanding provider/RPC work is required. Settlement is capped65seconds, total observer180seconds. Gateway cleanup and terminal receipts are mandatory.

## Run on GATEWAY_HOST only after inspecting scripts and checking no previous case/process exists

Copy these three drivers into a task-owned directory on GATEWAY_HOST, then run one selected case:

```text
python3 run.py --case normal-load
python3 run.py --case fast-load-control
```

The driver refuses to overwrite an existing case. Ports are20094 and20096;20095 is a synthetic unused provider URL. Config, HOME, workspace, temporary storage, logs and state are isolated under the case directory. Results must be read before any retry. Python AST and Node syntax checks passed locally; no runtime was launched while preparing these scripts.

## Primary-source leads

- [Issue161379](https://github.com/openclaw/openclaw/issues/161379): reported same Gateway2026.9.6 exactsource, sevenagents, OpenAI60second cacheTTL, about13seconds per-agent capture cost, and a90second renewal round. This independently establishes normal-TTL aging as a reported historical production mechanism, not the cause of Android179075.
- [Original reporter A/B follow-up](https://github.com/openclaw/openclaw/issues/161379#issuecomment-5973161770): continuous loop on2026.9.6, absent on tested main/9.8; existing capture-reuse fixes removed the amplifier in that workload.
- [Independent production follow-up](https://github.com/openclaw/openclaw/issues/161379#issuecomment-5979806241): same9.6→9.8 improvement on another host.
- [Later10.3 report](https://github.com/openclaw/openclaw/issues/161379#issuecomment-6152284822): different user says their TTL repair remains required. Do not claim general resolution from earlier follow-ups.
- [Issue170458](https://github.com/openclaw/openclaw/issues/170458): **same author, NOVA-Openclaw, as Android179075** reports malformed retained cost data on2026.9.6 and catalog rebuild/heap symptoms. Named providers include ollama,venice,moonshot,xai,xiaomi and SQLite plugin-model-catalog records. Their partial-cost correction stopped their validation-error loop but not all heap growth. This is a concrete additional fixture lead, not proof that the later Android incident has the same cause.

No Gateway product source, PR comments, production configuration or public evidence was changed for this diagnostic. Android owner regressions/repairs are tracked separately.


## Executed results — October 23, 2026

All three cases recorded observer exit0, Gateway exit0, processGone=true, no pending tracked work and at least five seconds of settled quiet. Raw case directories and `summary.json` are local, not published PR proof.

| Gateway / workload | Follow-up batches | Measured RPCs | Loader concurrency | Seed loader span | Settlement after reads stop |
| --- | ---: | ---: | ---: | ---: | ---: |
| Official2026.9.6, fast control | 0 | 1 | 1 | see raw | 5.013s |
| Official2026.9.6, normal500msload | 14 | 71 | 1 | 32.222s | 37.294s |
| Current catalog source, normal500msload | 1 | 6 | 4 | 8.047s | 5.027s |

All measured RPCs succeeded and model responses retained732rows. The legacy normal case published five already-expired providers, then performed35 further cache loads and21 additional metadata events after follow-up reads stopped while outstanding RPCs settled. Longest measured response47.117s. This is a concrete default-TTL natural feedback mechanism, not the reporter's exact2Hz/fast-response/memory-pressure incident. No native Android ran in these cases.

Current diagnostic reused the existing GATEWAY_HOST Gateway build at a7f5cc2f (delivery PR), whose only source delta from Android's base a8ead196 is reply-dispatch ownership/tests. Android5fb773cb changes only Android files. Catalog-access SHA2562265bfd44d7d9dec5e352e806fbb2c12fb596ceacf3ed27010b5bb6c9e13f55a and metadata-lifecycle SHA256039de457c06b75da9d42881312b5bf25b9ff74337b4e48a1e092538104c8a60e match. This is current-owner diagnostic evidence, not a final candidate Android proof. Current `models-config.providers.implicit.ts` already bounds concurrent provider hooks at4; legacy ran serially. No new Gateway patch is justified by this comparison alone.

### Executed warning cases

`normal-load-warning` actually failed the next cache loader for naturally expired non-selected provider `api-01`, after all 64 successful seed completions and natural publication. It recorded 14 follow-up batches / 71 measured RPCs in 45 seconds, including 40 successful `refreshFailed` replies with all 732 configured rows retained. No measured RPC failed. Natural metadata continued after the client stopped and tracked RPC/provider work drained. The observer **failed** its 65-second settled-quiet gate (`observerExit=1`, no five-second quiet interval); Gateway exit was 0 and its process was gone. This is positive evidence of continued producer churn, not a passing settlement test.

`current-normal-load-warning` did not exercise the fault: the ordinary read served cached inventory and never admitted the armed provider loader. Its observer correctly exited 1 on the warning precondition (no injected terminal failure or warning reply), despite quiet traffic and clean Gateway cleanup. It is **inconclusive for current warning recovery**, not proof the warning is fixed. A separately labeled explicit provider refresh is needed to admit real current failure; native execution is being prepared under `native-natural/`.

All five diagnostic Gateways are stopped. Do not rerun a completed case unchanged.
