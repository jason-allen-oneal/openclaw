# PR #143781 — verification evidence

Evidence for the generated-catalog credential-storage and explicit Doctor migration repair. **Local verification is complete within the boundaries below; hosted CI/review are separate gates.** No merge is requested.

## Source identity

- Current candidate: `4382a3109df1849e0fb0a6350c5f279d080756f8`.
- Implementation/reviewed commit: `ae73bd7e38f7f62ab85dddedcaab5c9c7ed5f421`.
- Base: `e6b866d3adb8d19ca878d493e4a0d21f1e9c3974`.
- Reviewed/tested diff SHA-256: `22ab33fe59883d89734a9e0abec88de64a0a9eb9a0a9e876c2dbb077f01fe7d3`.
- [Final exact-head build receipt](runtime/candidate-build-final.receipt.json), [build log](runtime/candidate-build-final.log), [final runtime bindings](runtime/candidate-final-continued-bindings.json).

The 167 focused tests and AutoReview ran on the frozen diff before the implementation commit. [Commit binding](provenance/candidate-source-binding.json) proves byte equality. The only subsequent source change is a test-fixture non-null assertion; [emitted test JavaScript is identical](runtime/test-type-fix-equivalence.json), and its [type check](runtime/ci-doctor-test-types-fixed.receipt.json) and [lint](runtime/ci-doctor-test-lint-fixed.receipt.json) pass. No production source changed. The [final source/artifact binding](runtime/final-source-binding.json) verifies **19 launchers and changed-owner bundles are byte-identical across the two builds**; final build-info correctly names the new head. Old receipts retain their actual source identities.

## Local checks

| Check | Observed result | Receipt | Output |
| --- | --- | --- | --- |
| Focused regression/compatibility suites | **167 passed**, 12 files, four test shards; exit 0; 324.46 s | [receipt](checks/focused-final.receipt.json) | [complete log](checks/focused-final.log) |
| Targeted lint of all changed TypeScript files | Exit 0; 81.32 s | [receipt](checks/targeted-lint-final.receipt.json) | [empty log](checks/targeted-lint-final.log) |
| Core TypeScript check | Exit 0; 34.81 s | [receipt](checks/core-types-final.receipt.json) | [empty log](checks/core-types-final.log) |
| Changed-page MDX | Two files passed; exit 0; 1.61 s | [receipt](checks/docs-mdx-final.receipt.json) | [log](checks/docs-mdx-final.log) |
| Documentation route links | 15,760 checked, zero broken; exit 0; 49.26 s | [receipt](checks/docs-route-links-final.receipt.json) | [log](checks/docs-route-links-final.log) |
| Documentation fragment/anchor audit | **Exit 1**; five existing broken anchors; 64.00 s | [receipt](checks/docs-links-final.receipt.json) | [complete failures](checks/docs-links-final.log) |

The five failing anchors' nine source/target files are unchanged from the base, with hashes recorded in [docs-anchor-baseline.json](checks/docs-anchor-baseline.json). The changed-page link passed this audit. ClawHub documentation fragments were not checked because the separate ClawHub checkout was unavailable. The anchor audit is not claimed green.

The test command and exact test files are in the focused receipt. Coverage includes generated publication, canonical/authored compatibility, legacy preservation, pending-sidecar retry convergence, confirmation-time source/auth races, configured-agent scope, and logout cleanup. Mixed PostgreSQL conformance was not executed locally; its changed fixture was included in lint and core type checks. This is focused coverage, not the full repository test suite.

## Deliberately failing audit regressions

These are intermediate-draft regressions discovered during independent implementation review, not failures attributed to unchanged `main` or to the final candidate.

| Regression | Observed pre-fix failure | Evidence |
| --- | --- | --- |
| Pending sidecar migration | Cleanup touched the retained plugin's credentials before the sidecar claim could retire, breaking byte-equality recovery convergence | [receipt](regressions/audit-regressions-red.receipt.json), [complete log](regressions/audit-regressions-red.log) |
| Config source changed while confirmation was pending | Both root-file and included-file changes allowed deletion of a generated header whose authored authority no longer existed | [receipt](regressions/config-data-loss-red.receipt.json), [complete log](regressions/config-data-loss-red.log) |

The combined audit command stopped at its first failing shard: its log demonstrates **one sidecar regression**, not all three named cases. The separate config-data-loss command demonstrates **two config regressions**. All three named tests subsequently passed in the focused final run above.

To reproduce the pre-fix behavior, use a disposable checkout at the candidate commit with the repository's normal dependencies and a non-root user (the sidecar case exercises real directory permissions). The two source-restore patches reconstruct the exact saved pre-fix production files; their before/after hashes are in the source fingerprints. They intentionally do not revert the regression tests.

```sh
# From a disposable checkout at ae73bd7e38f7f62ab85dddedcaab5c9c7ed5f421:
git apply /path/to/evidence/regressions/restore-pre-p2.patch
node scripts/run-vitest.mjs src/agents/plugin-model-catalog.test.ts \
  --maxWorkers=1 --testNamePattern 'retained sidecar can finish migration'
# Expected pre-fix assertion failure. Restore the candidate source afterward:
git apply -R /path/to/evidence/regressions/restore-pre-p2.patch

git apply /path/to/evidence/regressions/restore-pre-p1.patch
node scripts/run-vitest.mjs src/commands/doctor-model-catalog-credentials.test.ts \
  --maxWorkers=1 --testNamePattern 'authored (root|include) source changes'
# Expected two pre-fix data-preservation assertion failures:
git apply -R /path/to/evidence/regressions/restore-pre-p1.patch
```

The commands above are a portable reproduction recipe, not an additional captured run. The actual executed commands, output and timings remain in the receipts/logs.

## Independent review and simplification

Formal AutoReview completed with exit 0 and `scoped-clean`: no accepted/actionable P0–P2 findings in the supplied changed-file scope and source datasets. It was a source review, not an independent executable test environment or whole-repository review. Its own confidence and context limitations are preserved verbatim.

- [Review report](review/autoreview-current-cli.md)
- [Structured review](review/autoreview-current-cli.json)
- [Completion status](review/autoreview-current-cli.status.json)
- [Command/source receipt](review/autoreview-current-cli.receipt.json)
- [Simplification and retained-owner assessment](provenance/simplification.json)

Earlier review attempts were unavailable or incomplete and are not represented as clean reviews. The completed review above covers the identical `ae73` committed diff; `4382` adds only the test-fixture type assertion described above. Broader current-head acceptance is tracked separately on the live PR.

## Published-release upgrade and final-head runtime

One isolated state directory was carried from published stable **2026.10.3**, through actual built launcher Doctor migration, into candidate Gateways. No reseeding or auth-store reset hid failed attempts. The [final boundary summary](runtime/final-stage-summary.json) distinguishes initial migration on `ae73` from final-head execution on `4382`; the changed runtime artifacts are byte-identical as linked above.

| Boundary | Observation | Evidence |
| --- | --- | --- |
| Published stable | Pinned package integrity; actual Gateway/agent/local CPU model produced `COPPER-FINCH.` and stored the conversation | [package and stable summary](runtime/stable-final-summary.json), [turn](runtime/stable-live-cpu-turn.log), [history](runtime/stable-history-inflight.log) |
| Actual Doctor upgrade | `doctor --fix --non-interactive --yes` exited 0, imported two credentials, cleaned one generated catalog; authored root bytes unchanged | [receipt](runtime/candidate-doctor.receipt.json), [output](runtime/candidate-doctor.log), [before](runtime/candidate-before.json), [after](runtime/candidate-after-doctor.json) |
| Canonical and recovered auth | Actual Gateway requests used canonical and newly recovered credentials; both recalled the release conversation | [canonical](runtime/candidate-continued-canonical-turn.log), [recovered](runtime/candidate-continued-recovered-turn.log), [receiver excerpts](runtime/inference-excerpts.json) |
| Supported logout | Named isolated CLI profile removed canonical and imported manual credentials; only recovered profile remained | [canonical](runtime/candidate-tail-logout-canonical.receipt.json), [manual](runtime/candidate-tail-logout-manual.receipt.json), [state](runtime/candidate-tail-after-logout.json) |
| Final-head restart and continuity | Real Gateway on `4382` used recovered auth and again replied `COPPER-FINCH.` from retained history | [result](runtime/candidate-final-continued-result.json), [turn](runtime/candidate-final-continued-retained-recovered-turn.log), [history](runtime/candidate-final-continued-final-history.log), [final state](runtime/candidate-final-continued-final-state.json) |
| Final-head revocation | Configured loopback route sent **no Authorization header**; protected receiver rejected with 401; **zero upstream inference**; removed profile did not return | [result](runtime/candidate-final-continued-result.json), [terminal refusal](runtime/candidate-final-continued-logged-out-local-refusal.log), receiver `cpu-7` |
| Authored-file registry compatibility | Built ModelRegistry + real LLM SDK inference with empty in-memory auth used the unchanged authored key; response `ROOT-AUTH-OK` | [result/bindings](runtime/authored-registry-live.json), [receipt](runtime/authored-registry-live.receipt.json), receiver `cpu-5` |

### Important boundary qualifications

**Authored-file SDK/registry support is not universal Gateway root-only authentication.** The actual root-only Gateway attempt failed `missing-provider-auth` after its imported profile was removed. Independent analysis found the embedded auth controller resolves configured/canonical auth before registry fallback; nine relevant files are byte-identical to base. [Source comparison](runtime/authored-gateway-boundary.json), [failed attempt](runtime/candidate-tail-authored-root-turn.log). No base Gateway runtime comparison was executed. This storage repair does not introduce a new credential-precedence fallback to change that separate boundary.

**Configured localhost providers have an existing synthetic no-auth policy.** The first final-head negative incorrectly expected zero receiver I/O; it observed a credential-free request and failed that harness assertion. [Failed result](runtime/candidate-final-result.json). The corrected, separately captured check uses a fresh normal CLI session and requires no revoked credential, receiver rejection and zero real inference. It passed; it is not relabeled zero HTTP requests. The successful retained-conversation proof remains on the original release session.

The actual chain is launcher → Gateway → agent → auth-checking loopback HTTP proxy → native Ollama `/api/chat` → real `qwen3:0.6b`, with `num_gpu: 0`. The adapter translates streaming; it does not manufacture assistant output. All credentials are synthetic; no cloud-model spend. The authored root hash remained `cb5acf82f292069232df70ce0b9693be7ffc8f5ad661ee33ec2c46f5d5afa315` throughout.

Complete selected transport observations: [initial requests](runtime/live-proxy.requests.jsonl), [initial responses/native streams](runtime/live-proxy.responses.jsonl), [final requests](runtime/final-live-proxy.requests.jsonl), [final responses/native streams](runtime/final-live-proxy.responses.jsonl). Sequences `cpu-1/2/3` are stable/canonical/recovered; `cpu-4` is the failed zero-I/O expectation; `cpu-5` is the SDK authored request; `cpu-6/7` are final-head recovered/revoked checks. The proxy rejects unauthenticated requests before forwarding, so those rejected sequences have no inference response entry.

### Failed attempts are preserved

- Initial helper failed before model lookup: [receipt](runtime/stable-seed-command.json), [log](runtime/stable-seed.log).
- Initial fixture used obsolete memory-search config: [Gateway log](runtime/stable-gateway.log); corrected isolated config used `memory.search`.
- Initial 4B GPU inference failed with Vulkan `ErrorDeviceLost`: [turn](runtime/stable-live-turn.log), [receiver failure](runtime/gpu-failure.response.json); successful route used installed CPU model.
- First candidate driver waited for obsolete readiness text despite listening; continuation used actual health RPC. First resume compared pre-Doctor config against legitimately migrated config. [Results](runtime/candidate-result.json), [resume](runtime/candidate-resume-result.json), [correction](runtime/candidate-harness-correction.json).
- Unnamed-profile offline logout refused before writes because it detected installed service ownership. A supported named fixture profile isolated service selection; no live service/config change or guard bypass. [Failure](runtime/candidate-continued-logout-canonical.log), [subsequent logout](runtime/candidate-tail-logout-canonical.log).
- Root-only Gateway and local zero-I/O expectation failures are qualified above, not hidden or declared passes.

### Reproduction

[Corrected reproduction instructions](runtime/drivers/reproduction-final.md) distinguish the adapted, **unexecuted** fresh stable setup from actual executed candidate command receipts. Historical driver sources are retained for audit, including their wrong expectations; do not treat every historical driver as a passing turnkey recipe. Use a new isolated state directory, never operator or retained evidence state. Focused regression commands above are independently repeatable with the repository's compiled-worker runner.

## Hosted gates

See the live [PR](https://github.com/openclaw/openclaw/pull/143781) and its current-head checks. At evidence preparation, all completed candidate checks were non-failing; PostgreSQL conformance and aggregate CI were still pending. Fresh ClawSweeper acceptance will be requested against this immutable evidence. Old PR labels/reviews are not asserted as current-head acceptance. This bundle's runtime results do not substitute for hosted gates.

## Sanitization and provenance

Original and public hashes are distinguished: [check/review originals](provenance/original-artifact-hashes.json), [sanitized subset](provenance/public-artifact-hashes.json), [initial runtime snapshot](provenance/runtime-snapshot-manifest.json), [final runtime additions](provenance/final-runtime-manifest.json). The earlier [staging audit](provenance/runtime-staging-audit.json) covers its recorded initial subset, not later additions. The complete published files are bound by `MANIFEST.sha256`.

Absolute host paths, machine/process identifiers, opaque fixture cursors and ANSI escapes are sanitized. Selected receiver records remain complete apart from those documented substitutions. Auth store exports, SQLite databases, package archives, dependencies, review raw streams and private operator-config diagnostics are excluded. All public provider key strings are visibly synthetic. The README and final manifest are publication descriptions, not manufactured execution receipts.
