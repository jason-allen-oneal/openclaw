# Gateway catalog warning producer audit

Read-only investigation, 2026-10-24 UTC. No source edits, runtime launches, public writes, or test executions. Current checkout: `179075`, base `a8ead196291935d24c44a4f40b67397d88c70256`; Android changes are staged and untouched.

## Conclusion

The saved official-2026.9.6 run demonstrates **Gateway-owned discovery continuing after the client's last response**, not merely Android follow-up traffic. Its concrete producer is a side-effecting `readFullModelCatalog()` getter: metadata publication reads the catalog and thereby schedules expired sibling discovery. Current source already removes that producer, preserves real failure/recovery notifications, and supplies backed-off failed-provider recovery. **Do not add a duplicate Gateway patch.** The remaining Android health/status request-ownership repairs require their own same-Gateway native proof.

This does not establish that the synthetic fixture caused the reporter's exact ~2 Hz loop or 3.2 GiB memory-pressure admission closure. No RSS/admission recovery is proven by these logs.

## Saved runtime facts, independently recalculated

Sources: `normal-ttl-feedback/normal-load-warning/{result.json,wire.jsonl,provider.jsonl,receipt.json}`.

- All 64 seed providers completed; the SDK's default 30-second TTL remained unchanged. Five providers were already expired at natural publication after serial 500 ms loads.
- An actual cache-loader failure was armed for nonselected `api-01`; its `catalog-error` occurred once. The fixture keeps its arm file, but **that failed provider was not repeatedly retried in this run**.
- After the 45-second client-follow-up cap, the last RPC response arrived 4,164 ms later.
- **41 metadata events and 41 successful provider loader starts occurred after the last RPC response.** Metadata median spacing was 1,478.5 ms. The later providers were healthy siblings (`api-03` through `api-53`, with gaps), not repeated `api-01` failure.
- The run failed its 65-second settlement cap; `settlementObserved=false`, observer exit 1. The Gateway then exited cleanly and `processGone=true`.
- An empty client/request ledger or a momentarily empty provider ledger must not be described as Gateway quiescence: fresh provider work kept starting afterward.

## Official 2026.9.6 producer call chain

Inspected the actual installed distribution on GATEWAY_HOST (read-only SSH), under `<LEGACY_GATEWAY_PACKAGE>/dist`:

1. `prepared-model-runtime-DiduNpaE.mjs:479`: `readFullModelCatalog()` calls `refreshExpiredCatalog()` before returning the published catalog.
2. The same bundle around lines 250–260 queues `acquireCatalog({ providerIds, refresh: true }, false)` for expired providers. Scoped providers are processed serially; completed publications call the attempt reporter.
3. `prepared-model-runtime.publication-events-DeixJuix.mjs`: `attempt.published()` emits `catalog-published`, including `refreshStatusChanged` when pending providers settle.
4. `server-chat-metadata-lifecycle-6goWDFc5.mjs`: its publication listener calls `runtime.refresh()` for catalog publication/failure, with `notifyIfUnchanged` for settlement.
5. `chat-metadata-runtime-BTcLjRkR.mjs:54–81`: `captureGenerationFacts()` calls the side-effecting `owner.readFullModelCatalog()` again. Expired siblings can therefore renew without any new client request. Its broadcast payload is legacy `{}`.

**Failure-detail correction:** the old helper `expirePreparedModelCatalogProviders()` (`prepared-model-runtime.full-catalog-BoJAJLrF.mjs:136`) removes a failed provider's `expiresAt`; it does not set an immediately due deadline. The warning exposes visible failure while the producer cycle continues renewing other expired providers. It is incorrect to label this a tight failed-provider retry loop.

## Current source cuts the producer cycle

Relevant current locations (all paths relative to `179075`):

- `src/agents/prepared-model-runtime.catalog-access.ts:690`: `readFullModelCatalog()` now only asserts its owner and returns `published.catalog`.
- Same file `:570`: `refreshExpiredModelCatalog()` is a separate operation. Ordinary acquisition may call it at `:599`; passive metadata observation cannot.
- `src/gateway/server-methods/chat-metadata-facts.ts:62`: metadata captures the published owner and its passive read. It explicitly records `catalogRefreshFailed` as visible metadata, excluding pending-only progress from generation identity.
- `src/gateway/server-chat-metadata-lifecycle.ts:102`: `catalog-status` only invalidates shared read responses. It does not emit a new metadata event. Completed real changes/failure flow through the existing metadata owner at `:113`.
- `src/gateway/server-methods/chat-metadata-runtime.ts:102`: unchanged settled catalogs emit `modelCatalogStatusChanged`; an actual `refreshFailed` transition changes model-catalog facts and emits `modelCatalogChanged` instead. Do not use status-only events as a fake substitute for real failure/recovery publication.
- `src/agents/prepared-model-runtime.discovery-retry.ts:24`: failures keep rows and get 30-second exponential backoff capped at 30 minutes. The owner arms one retry timer at `:65`; success restores ordinary renewal. Failure persistence does not justify suppressing all metadata or all retries.
- `src/agents/models-config.providers.implicit.ts:157`: independent provider hooks are currently admitted with concurrency 4. This also reduces aged-at-publication inventory, but passive-read separation is the direct cycle break.

## Canonical upstream repairs, verified by GitHub commit patches and PR readback

| Repair | Merged PR / exact commit | Verified contribution |
| --- | --- | --- |
| Separate catalog observation from renewal | [#157459](https://github.com/openclaw/openclaw/pull/157459), `11d36ebc25833d45898dc0daece0546b613a6b8f` (2026-09-24) | Removes renewal from `readFullModelCatalog()`, adds separate `refreshExpiredModelCatalog()`, adds the exact passive-observation regression below. |
| Retry failed discovery off the read path | [#167230](https://github.com/openclaw/openclaw/pull/167230), `eea11f9739d9936e2e3015d47a52e938e48d40c1` (2026-10-08) | Adds `discovery-retry.ts`, backoff deadlines, one owner timer, and recovery tests. |
| Distinguish unchanged settlement from model changes | [#179651](https://github.com/openclaw/openclaw/pull/179651), `9144d8b1d5d13e2bda5de5a0f1fda46481d5bda5` (2026-10-21) | Introduces `modelCatalogStatusChanged` for unchanged catalog settlement. This is the current protocol contract Android must consume correctly. |

The local checkout is shallow, so these attributions came from narrow read-only GitHub commit/PR API queries, not a fabricated local ancestry inference. Exact relevant behavior was also inspected in the current source.

## Existing owning-boundary regressions (reuse, do not duplicate)

- `src/gateway/server-chat-metadata-lifecycle.catalog-renewal.test.ts:149`, **“observes expired published inventory without starting provider discovery”**: expire published inventory, run the real metadata lifecycle refresh/read, and assert zero additional worker acquisitions.
- Same file `:160`, **“publishes only settled visible changes for a renewal (%s)”** (`usage`, `removed`, `failed`): pending discovery does not broadcast/build; settlement broadcasts exactly once; failure remains visible; actual successful recovery clears it and broadcasts again. Assertions at `:220` distinguish status-only settlement from true model/failure change. Final refresh/read at `:256` must add no broadcast.
- `src/agents/prepared-model-runtime.catalog-owner.test.ts:579`, **“retries with backoff without a read or explicit refresh”**: 30-second first retry, 60-second next retry, recovery, and no continued failure retry after success.
- Same file `:597`, **“measures a new failure episode from its own failure”**: an explicit success resets the next episode's timing.

These were inspected, not rerun by this read-only lane.

## Narrow next runtime proof

Use the parent's existing native fixture, with Android as the only follow-up consumer. Do not run the synthetic observer simultaneously.

1. Complete healthy seed/publication. Arm the actual nonselected-provider loader. On current Gateway, issue **one explicit scoped provider refresh** to admit the fault; the saved ordinary cached-read case did not exercise the loader and is not a successful warning test.
2. Observe actual terminal provider failure, successful `refreshFailed` RPCs, retained configured rows, native warning, and actual metadata flags. Count loader starts and metadata events after all foreground RPCs settle. A single scheduled retry at ~30 seconds is expected; subsecond sibling renewal is not.
3. Remove the arm file and explicitly refresh the same provider once; require actual provider success/publication and native warning clearance, retaining the catalog. Alternatively observe the owner's scheduled retry recovery, if the bounded window permits it. Never inject event flags or manufacture a successful payload.
4. Run an actual fixed-response agent turn while connected; verify its persisted final reply. Measure Gateway RSS/CPU/admission independently. Successful readiness/RPC counts alone do not prove memory-pressure recovery.
5. Run legacy baseline/candidate Android against the **same** legacy Gateway to isolate Android changes. Keep the current-Gateway scenario separate as compatibility plus upstream-producer-repair evidence. Do not credit the Android patch for a Gateway upgrade.

Only if this real current-source path still causes unbounded provider work or repeated unchanged publications is another Gateway repair justified. Then extend the existing lifecycle/owner regression with that exact failure sequence rather than introduce a competing cache, event suppression, or synthetic-only test.
