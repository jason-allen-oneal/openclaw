# Independent native fixture v3 review

## Verdict

**No blocking code finding in the reviewed fixture corrections.** The changed legacy host-tool expectation is supported by the source contract as well as unchanged-base execution; it is not merely accepting a previously failing outcome. This accepts the two-file v3 fixture delta for publication after the source owner reconciles the remote head and receipts. It does **not** establish the full done gate or a hosted reviewer rating.

Read-only review; no build, test, dependency, checkout, network, production or PR mutation. Applied local ub-mode and pull-request-verification, repository/test instructions and behavioral/baseline policies. Only this review report was written.

## Exact inputs and settled execution

- Production candidate head: `ee4d7e1fc7da70993b7948b48b9b5b6f1267e765`.
- Genuine baseline: `5756d032d1e7559338a9efaa378c100f6d263439`.
- v2 patch SHA256: `74647dd798d72e5a8cec9e13817336c095d2f8927b34f548d541008cb7d65f24`.
- Reviewed v3 patch SHA256: `08c1cd624fad2c2397d41fdfcbe197cf55047d5885fe9a923b676e1cc2b3214c`.
- Final test SHA256: `b1ea3816ce92c8908af91b1255daa17a3d307dc354f9f76f0895085e56599513`.
- Allocation SHA256: `6a6efa8ca69af8927b00b70595b16536c534dba424fbbbc4f452d1e5eef57c68`.
- `e2e-final-receipt.json` records exit **0**, 252.82 seconds, the above head/overlay, and unchanged source. Settled log reports **6/6 passed**, compiler-wrapper completion recorded. This is local head-plus-overlay evidence, not yet a newly published head's hosted CI.
- v3 format/lint/test-types/budget receipts all exit 0. Actual test is **462 LF** and its separate allocation is exactly **462**. No scalar increase or arbitrary padding.

## Source-backed review

1. **Legacy standalone correction (test lines 231–233, 384–385): accepted.** The fixture explicitly sets `agents.defaults.imageModel.primary = gemini/fixture-vision` (287). `image-tool.helpers.ts:17–19` preserves provider-prefixed model refs; `model-fallback-candidates.ts:135–194` resolves that configured image primary; normal model provider normalization only trims/lowercases (`packages/model-catalog-core/src/provider-id.ts:3`). The image-tool execution request carries that selected provider (model-execution.ts:213–215) to native dispatch or the generic model helper (247–260). Inbound media uses its distinct historical media-alias path. Thus unclaimed inbound `gemini` can mean `google` without rewriting the explicitly configured standalone model into that alias.

   The unchanged-base targeted runtime receipt independently corroborates this: legacy host-tool sends one request to the configured Gemini endpoint, zero to Google, with no native handler. Native candidate v2 does the same. v3 now checks that positive provider/credential outcome and still asserts zero competing-owner requests. It does not suppress the original native-offload bug: baseline native offload calls the Gemini handler but sends the request to Google; candidate native offload sends it to Gemini.

2. **Negative isolation assertions remain independent and strict (358–391).** Both endpoints must have no errors; competing endpoint must have exactly zero requests (including credential-only/discovery traffic), selected endpoint must have exactly one inference, expected model and synthetic owner credential, a nonempty image and SHA, and no wrong credential on any owner request. Native/model-only expected owners were not changed. Model-only and legacy standalone require zero native handler calls; genuine native cases still require matching handler/provider/model and wire/native image digest.

3. **Fixture configuration correction (298): accepted.** Strict `ToolsMediaSchema` owns shared `models` (zod-schema.core.ts:713–722); strict capability schema does not accept image-local `models`. Moving the entry to `tools.media.models` and tagging image capability is the supported configuration shape, not a weakened initializer. All six curly-block edits are behavior-preserving lint fixes.

4. **Lifecycle claim remains narrow.** Host-tool cases use real prepared metadata and the public host-created tool, then call the same retained tool after actual attempt-host closure; refusal and no added endpoint traffic are asserted (392–421). All final receipts record that host capability is no longer active. This proves closed-attempt refusal, **not** plugin-disable/credential revocation, overlapping-generation isolation, or update migration.

## Publication limitations to preserve

- Six scenarios do not establish captured/ambient metadata mismatch in both directions, overlapping lifecycle, plugin/credential revocation, or fresh-installed/latest-stable upgrade behavior. Do not convert host closure into those claims.
- Baseline run covered two selected cases (both failed under the v2 expectations); four cases were skipped. Do not call it a whole-suite baseline run. Preserve original setup, wrapper and expectation failures alongside the green run.
- The six-case runtime costs 252.82 seconds wall time. Carry that measurement and the real-boundary rationale into PR evidence per repository cost policy; no extra repeated run is needed solely for timing.
- Reconcile/publish exactly the reviewed bytes, then verify new-head CI and the actual durable reviewer verdict. Prior published-head CI and this local proof are distinct receipts.
