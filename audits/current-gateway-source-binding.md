# Current Gateway source binding for native Android proof

Read-only source/provenance reconciliation, 2026-10-24 UTC. No builds, tests, runtime actions, or active-capture inspection. This identifies the smallest useful **source-owner** closure, not a whole-distribution binary inventory.

## Three identities must stay distinct

| Role | Exact commit |
| --- | --- |
| Android candidate's upstream base | `a8ead196291935d24c44a4f40b67397d88c70256` |
| Reused current Gateway build | `a7f5cc2f35fb2e0254207492149d52d3923c0cbc` |
| Repaired Android source | `ef99274a2dd58ed20164a67d072d05c328a1cfc7` |

The reused Gateway is **not** built from the Android candidate commit. It is valid source-equivalent catalog-owner evidence because the relevant trees are byte-identical across all three commits, independently checked with local Git objects and the current working files.

### Minimal whole-owner tree equality

These Git tree object IDs are identical at all three commits:

| Owner subtree | Git tree SHA-1 |
| --- | --- |
| `src/agents` | `176a47a65357c00401b487f7329c84258179fd1e` |
| `src/gateway` | `ebdcaccc3e5696c46f6f08559389426c910be5ec` |

The complete base→Gateway diff has only seven paths: three reply-dispatch production files (`src/auto-reply/dispatch-dispatcher.ts`, `src/auto-reply/reply/dispatch-from-config.lifecycle.ts`, `src/auto-reply/reply/dispatch-from-config.prepare-context.ts`), three reply-dispatch test files, and one Vitest worker-path list. No catalog, provider-discovery, Gateway, or shared utility source changed. This verifies the earlier README's “delivery ownership/tests only” statement rather than merely repeating it.

The complete base→Android-candidate diff has only five Android files: `GatewayModelCatalog.kt`, `NodeRuntime.kt`, `chat/ChatController.kt`, and their two owning test files. Thus neither the candidate nor reused Gateway adds a new catalog producer fix.

## Focused SHA256 owner closure

Every hash below was calculated from the file's **committed bytes at each of the three commits**, then checked equal to the current Android checkout's corresponding file. All eight comparisons pass. Prefixes are full paths relative to the repository.

| Source file | SHA256 | Necessary role |
| --- | --- | --- |
| `src/agents/prepared-model-runtime.catalog-access.ts` | `2265bfd44d7d9dec5e352e806fbb2c12fb596ceacf3ed27010b5bb6c9e13f55a` | Passive catalog read, separate expiry renewal, failure recording, and retry-owner wiring. |
| `src/agents/prepared-model-runtime.discovery-retry.ts` | `815762c40d14cb813253090de3d4516551a7aa14fd9e56d7661bcce01310b8c2` | Saved-row-preserving 30 s exponential failure backoff, capped at 30 minutes, one owner timer. |
| `src/agents/prepared-model-runtime.full-catalog.ts` | `8580f35b575968b543044c52afee1fcaa71531b74309a8425deef8380ae49c9f` | Exposes the actual catalog-access methods on the published owner; avoids proving an unused helper only. |
| `src/agents/prepared-model-runtime.publication-events.ts` | `a986e7db54b6ce6a81965320805c4c37566c2c6e46023a615cf1fb231bcc88d9` | Pending/status versus completed publication/failure; live `refreshFailed` on retained inventory. |
| `src/gateway/server-methods/chat-metadata-facts.ts` | `bed518a64c26482a48dbe4e7538f6fa705dea20a3bf4ce86675701c31c025f8c` | Metadata reads the passive owner, tracks failure visibility, excludes pending-only progress from catalog generation identity. |
| `src/gateway/server-methods/chat-metadata-runtime.ts` | `2e3d99f8d3fd50a213a336a3b898654f6dd6ffe138f44febf14057dc19e2c7da` | Emits `modelCatalogStatusChanged` for unchanged settlement; actual catalog/failure changes use `modelCatalogChanged`. |
| `src/gateway/server-chat-metadata-lifecycle.ts` | `039de457c06b75da9d42881312b5bf25b9ff74337b4e48a1e092538104c8a60e` | Status-only pending activity invalidates shared reads without broadcasting another model-change event; real settlement/failure reaches metadata refresh. |
| `src/agents/models-config.providers.implicit.ts` | `d3dcbdf0535caa055d94065d1960a5713b5153e5895c8a6945ca13a8c4d9f7bb` | Actual provider-discovery admission uses concurrency 4. |

The first and seventh SHA256 values also match the previously saved `normal-ttl-feedback/README.md` hashes. The six additional owner hashes close the failure/recovery and status-event mapping without enumerating unrelated build files.

### Concrete implementation boundaries inspected

- `catalog-access.ts:690`: `readFullModelCatalog()` asserts current ownership and returns `published.catalog`; it does not start discovery. Renewal remains explicit at `:570` and acquisition may invoke it at `:599`.
- The same file records failed-provider deadlines at `:131`/`:323`; after acquisition settles it re-arms `createFailedDiscoveryRetry` at `:670`. The helper contains actual capped backoff/timer logic, not a blanket event/retry suppression.
- `full-catalog.ts:381` binds the passive read and `:383` binds separate renewal onto the published owner.
- `chat-metadata-facts.ts:70` uses that published read; `:94` records `catalogRefreshFailed` as visible metadata.
- `chat-metadata-runtime.ts:102` compares catalog facts and adds `modelCatalogStatusChanged` only when catalog facts did not change.
- `server-chat-metadata-lifecycle.ts:102` treats `catalog-status` as shared-read invalidation only; real completed publication/failure flows through `:113`.
- `models-config.providers.implicit.ts:157` invokes provider tasks with `limit: 4`; this reduces seed aging but the passive-read separation is the direct producer-cycle break.

Historical attribution is already established in `../gateway-warning-owner-audit.md`: [#157459](https://github.com/openclaw/openclaw/pull/157459), commit `11d36ebc25833d45898dc0daece0546b613a6b8f`, separates passive observation from renewal; [#167230](https://github.com/openclaw/openclaw/pull/167230), commit `eea11f9739d9936e2e3015d47a52e938e48d40c1`, adds backed-off failed discovery; [#179651](https://github.com/openclaw/openclaw/pull/179651), commit `9144d8b1d5d13e2bda5de5a0f1fda46481d5bda5`, defines unchanged settlement's status flag. This audit verifies the corresponding implementation content in all three local source identities; it does not rerun those regressions or re-fetch PRs.

## Existing build-to-runtime provenance

The reused runtime directory is `<CURRENT_GATEWAY_PACKAGE>` on GATEWAY_HOST.

- `<HOST_PATH>` records successful `scripts/build-all.mts qaRuntime` at exact source `a7f5cc2f…`, exit 0, completed 2026-10-23 01:02:00 UTC.
- Existing `134498-proof/GATEWAY_HOST-final/gateway-cli-candidate/runtime-identity.json` records version `2026.10.5`, commit `a7f5cc2f…`, build timestamp `2026-10-23T00:59:33.148Z`, build ID `2026.10.5-a7f5cc2f35fb-2026-10-23T00-59-33.148Z`.
- Its launcher `openclaw.mjs` SHA256 is `2e42a44b3bf441ba8b7fed85ccdd3efa54d8962bb0607cd00d88e86f67ab0e51`; `dist/build-info.json` SHA256 is `6b276d119aebe5472872dacd3b86d863dedfba2c551093dfdb389fa13bdf0912`.
- Both existing `normal-ttl-feedback/current-normal-load/identity.json` and `current-normal-load-warning/identity.json` record the same build identity and launcher hash. Their runtime-command receipt identifies that same reused directory. Node24.22.1 binary SHA256 is `e32e2d16081cf644f88392934288086e7662529d0d43277c34f7aad2207cfafb`.

**Scope of proof:** this is an exact committed-source equality plus recorded build/runtime identity chain. A launcher hash and build-info record alone do not cryptographically attest every emitted catalog chunk. The historical runtime identity inventories dispatch chunks, not the catalog chunks. Do not describe this focused mapping as a complete reproducible-build or binary-transitive hash attestation. The current native run's terminal `identity.json` must still match the recorded build/launcher when its artifacts arrive; that final run readback is deliberately deferred until parent completion.

The local Android checkout also contains an older `dist` built at `a8ead196…`; it was inspected only to identify its provenance and is **not** the GATEWAY_HOST runtime used for the native proof. Do not substitute its bundle hashes for the remote runtime's.

## Reporting rule

Report the current-Gateway scenario as **candidate Android consuming the already-fixed current catalog owner/protocol**, with the exact differing build commits disclosed. Report candidate-on-legacy as its own completed negative compatibility result. Successful current-Gateway behavior cannot be credited wholly to Android, and existing upstream producer fixes require no duplicate patch.
