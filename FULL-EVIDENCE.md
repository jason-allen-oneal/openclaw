# Retained session archive retirement — issue 186088

Executed candidate: `bf1debacae768ac8da1a8ee496f99fc1b53323fe`. After ClawSweeper's exact-head Gold review of `983ac6b`, recovery inventory now runs through the existing Gateway-owned worker instead of synchronously on the request thread. A separate correction fixes the CI browser test's ResizeObserver/animation-start race. **45 focused tests, 7 split-diff browser tests, and all 9 real-Gateway/browser scenarios passed.** Static checks and independent source review passed. Remote CI and a new durable hosted verdict remain separate gates.

The original CLI/stable-upgrade proof is reused only for unchanged CLI behavior. Fresh, successful Gateway-to-browser evidence is in `gateway-worker-proof.json`. No maintainer acceptance of the changed retention contract is claimed.

Runtime-proof baseline: `2dee5c7f729b5bf80193e8463c91b785ecc56ea1` (core `1f15e9310fe23792e8283ff287781c2079e94cf9`), based on `f964859d9f2bd045420271b95f6523df70285bd4`.

This is contributor-captured behavioral evidence, not a trusted CI receipt or a ClawSweeper verdict. Tests ran before the commits; the complete changed-file hashes were verified unchanged before committing. The stable-proof fingerprint independently matches every final changed source file. Source: https://github.com/jason-allen-oneal/openclaw/tree/2dee5c7f729b5bf80193e8463c91b785ecc56ea1

## Contract

Ordinary cleanup remains conservative. Exact manifested paths, a complete retained group, independent current-byte archive/raw-manifest backups, and separate `--accept-history-loss` consent are required. Existing maintenance custody and durable disposal handle interruption/replay. Original import evidence is retained separately from explicit history relinquishment. Read-only UI shows retained reasons/logical sizes; it adds no delete control.

## Results

| Boundary | Observed result | Bundle |
| --- | --- | --- |
| Real built Gateway → browser | 9/9 scenarios: empty, retained and malformed-manifest fixtures at 400/820/1280 px. Actual WebSocket RPC, 127 served JS/CSS assets byte-matched to the build; two archives and their manifest unchanged. All final scans were honestly partial/time-limited; malformed cases also report unreadable-manifest. Scope and console findings below | gateway-worker-proof.json |
| Gateway request-thread boundary | The pre-fix real-ledger request performed 9 main-thread SQL preparations; the worker correction passed all 45 focused tests. Existing owner, scan bounds and cancellation retained | gateway-worker-proof.json |
| Split-diff test lifecycle | Deterministic unsettled-height red proof; ResizeObserver/frame synchronization repair; all 7 browser tests passed with existing geometry assertions intact | gateway-worker-proof.json |
| Normal built `pnpm openclaw` | Build passed; both issue reasons refused under ordinary `--yes`; explicit dry-run wrote no state bytes; consent retired 2 files/320 bytes; replay removed 0 and changed no state bytes; active SQLite bytes/rows and all 10 backup file hashes unchanged | normal-launcher.json |
| Official 2026.10.9 state → candidate | Shipped CLI emitted real v3 receipts, 3 archives, 1 session/3 events. Doctor upgraded agent schema 25→38, preserving existing session/event content and original archive/receipt bytes. Normal built Doctor completed exit 0. Genuine interrupted claim resumed; 3 files retired; replay removed 0 with no persisted-byte change; all 11 backup files unchanged | stable-upgrade.json |
| Older reader | Stable cleanup marked pending/disposed v5 unreadable and removed nothing. Restore refused at the newer shared-state schema guard. Separately, the exact shipped manifest-reader export admitted its v3 receipt and rejected actual pending/disposed v5 receipts without writing any of them | stable-upgrade.json |
| Regression/UI | 228 distinct regression tests + 5 browser tests passed. The 57-test final correction rerun replaces earlier covered cases; it is not an additional 57 unique tests. Before/after screenshots are attached directly to the PR | checks-and-review.json |
| Static/contracts | Core/UI typechecks, scoped lint, formatting, generated JS/Swift/Kotlin protocol checks and test-line ratchet passed | checks-and-review.json |
| Review | Independent source reviews found shared-owner and pending-live-claim defects; red→green tests and bounded final review verified both corrections. Separate CLI autoreview could not authenticate; no report or clean autoreview verdict is claimed | checks-and-review.json |
| Mutation/complexity | Three selected backup-comparison mutations killed. An initial survivor prompted a same-size changed-backup regression. Duplication/complexity measured; coverage/CRAP unmeasured because compiled-worker LCOV was empty | quality-tools.json |

## CI follow-up

Initial remote CI found one static type-import cycle and two stale exact diagnostic assertions in one shard. The report type now lives in the leaf contract; the diagnostic expectation explicitly includes the new recovery phase. `ci-followup.json` retains the original failures, 63/63 passing affected tests, zero-cycle result, core types/lint/format/test-line results, and independent review. The visibility test allocation is now 235 lines (one more than the original 234). Original proof bundles remain unchanged historical records.

## Commands, raw evidence and reproduction

Each JSON bundle has a `files` map keyed by original artifact-relative path, with original SHA-256 and sanitized-public-text SHA-256. Entries contain complete text unless explicitly marked `contentScope`; the new large runtime-build log is a labelled original-line-range excerpt, accompanied by the full terminal receipt and original log hash. Extract `content` under those paths to reconstruct relative links and scripts. No databases, credentials, backup payload binaries, installation trees, unrelated desktop capture or private conversations are included. Host home/toolchain paths, executable PATH, concrete ephemeral loopback endpoints and incidental model identity are sanitized; synthetic scratch paths are retained. Sanitized scripts require substituting local checkout/artifact/browser paths before execution.

- Normal launcher: `normal-launcher/run-au_ze1k2/commands.json`, `summary.json`, stdout/stderr for every operation; `normal-launcher/proof.py`, `setup.mts`, `snapshot.mjs`; build/help receipt and log. Product operations use the normal launcher, not mocked or substituted handlers. Setup uses a production import API.
- Upgrade: `stable-upgrade/README.md`, `run/commands.json`, `run/summary.json`, integrity/version receipts, actual stable/pending/disposed manifests, before/after semantic SQLite snapshots and both older-reader summaries. `shipped-reader-result.json` is the separate direct-reader probe. Phase scripts contain fixed disposable paths; read their reproduction notes rather than blindly running them against retained state.
- Regression: full 227-test batch preceded the final guard; final 57-test batch includes all 29 retirement cases and adds one unique regression. Full batch wall 281.94 s; final affected batch 65.73 s; compiler/build startup dominates. Per-test times are in logs. CI seconds unavailable before PR CI.
- Test growth is allocated separately: 799 core lines + 234 visibility lines; shared scalar unchanged. Cases cover consent, exact grouping, backup mismatch/alias, shared ownership, partial manifest writes, interruption/retry, live claims, lifecycle discovery and UI invalidation.

## Limits and retained failures

Synthetic isolated data, not the reporter's 22 GB/private installation. The original UI proof used a mocked Gateway; new real-Gateway evidence is recorded separately and does not relabel those historical captures. No live model/channel, installed updater replacement, service restart, or successful downgrade is claimed. The candidate is the normal built source-checkout launcher, not an npm-installed candidate package.

The official stable package and three internal dependencies were downloaded and integrity-verified; remaining dependencies were linked read-only from the prepared candidate installation. The interruption is a progress-callback exception at the actual owner boundary, not an OS kill. Doctor's source path hit time bounds after migration; the normal built Doctor completed afterward. These timeouts remain failures in the logs. A harness-overwritten early preview is explicitly renamed; the independently captured post-upgrade preview is the retirement evidence.

Ordinary cleanup legitimately changes maintenance bookkeeping and may create SQLite sidecars. Only explicit dry-run/replay are claimed wholly byte-preserving. Older stable probes refreshed plugin skill documentation; their complete state was not immutable, but archives/claims, receipts and live database bytes were. No successful restore compatibility is promised.

The three-site mutation result is not whole-file coverage; empty LCOV is not a coverage pass. Autoreview authentication failure and initial fixture/expected-exit failures are retained. ClawSweeper Gold on the preceding head is retained as adverse historical review; it is not final-head acceptance. No current-head CI result is implied without its separate observation.

## Worker and CI correction

The added bundle `gateway-worker-proof.json` retains the exact P2 finding, a real-ledger SQL-boundary red run, 45 passing focused tests, static terminal receipts (including the independent-review result), the successful runtime/UI build receipt and labelled log excerpt, and the browser race red/green proof. The Gateway worker keeps the existing scan budget, engine/owner custody and cancellation; it does not introduce another deletion owner. Worker startup/queueing is not claimed to share the 150 ms scan deadline.

The previous PostgreSQL failure was reproduced on main by exact log signature and fixed upstream in `34a4e118`; the new synthetic merge `8a6aa806` contains that fix. Android's earlier timeout remains documented; a prior same-PR run with identical sources/settings passed, and the bf1deba run now passed all PostgreSQL and Android jobs. Its only direct failure was the catalog E2E fixture described below (aggregate gates also failed). Final-head CI remains required. No remote rerun was requested.

## Successful real-Gateway proof

The authoritative receipt is `real-gateway-ui/attempt-nur6b0jd/command.json`: wrapper **exit 0**, unchanged source/build hashes before and after, at the executed head above. One test exercises nine scenarios. `results.json`, nine per-scenario JSON records and RPC transcripts, startup/shutdown logs, before/after archive/manifest hashes, and the immutable `executed-harness` snapshot are included. The actual built `dist/index.js` process serves the actual built Control UI; API responses are not mocked. The fixture uses a separately owned home/config/state/free port, selects Stable to avoid unrelated development-checkout refresh work, and removes inherited NODE_ENV/VITEST/minimal-mode switches before Gateway launch. No product owner guard was weakened.

| Fixture | Widths | Observed inventory | Incomplete reasons |
| --- | --- | --- | --- |
| No recovery archive seeded | 400, 820, 1280 | 0 observed copies / 0 B | time-limit |
| Two retained archives | 400, 820, 1280 | 2 protected copies / 320 B; artifact-metadata-changed and historical-manifest-without-import-proof | time-limit |
| Same archives + malformed manifest | 400, 820, 1280 | 2 protected copies / 320 B; conservative unreadable-recovery-dependencies guidance | time-limit, unreadable-manifest |

**All nine results are partial**, not proof of a complete inventory. The UI displays that limitation rather than presenting the totals as complete. The harness observes real `update.status` requests and responses, verifies no recovery delete control and no `update.run`/`update.recovery.cleanup` RPC, and verifies all 127 fetched JS/CSS assets against the built files.

The two synthetic archives (107 B and 213 B) and their original manifest have identical before/after hashes across retained and malformed scenarios. This new browser proof does **not** establish active SQLite-file byte preservation; that is a separate claim supported only by the earlier CLI proof. The harness initiates no model request. Its constant `externalModelCalls`/`realModelCalls` fields are not measured comprehensive call counters.

All cases have zero browser page exceptions. Each records a Playwright service-worker-block warning and HTTP **401** and **404** console errors (27 messages total); the original run did not capture those response URLs. **No clean-console or all-network-success claim is made.** Raw console records and Gateway logs remain included. A separate passing empty/400 diagnostic adds response URLs: GET `/control-ui-config.json` returned 401 and GET `/api/users/gateway-owner/avatar` returned 404; recovery-status RPC succeeded. These URLs belong to the diagnostic, not retroactively to the original nine cases.

Layout observations establish zero Recovery Storage source-attributed layout shifts, unchanged geometry of the selected visible shell control, and no horizontal document overflow at all three widths. Small whole-page shifts in the existing Update Status row are preserved, not relabelled as zero. Measurements precede the repository screenshot helper's capture step. These are scoped layout checks, not a whole-application responsiveness claim.

### Screenshots from the actual Gateway

[Retained · 400 px](https://github.com/user-attachments/assets/6a1ad3e2-6d52-478e-84f3-42d8ad23a9b4) · [820 px](https://github.com/user-attachments/assets/67a7ebe6-82e5-41d9-9e8b-6d16129b8c26) · [1280 px](https://github.com/user-attachments/assets/37b09787-cb6d-4bc5-b6c1-efc8109621d9) · [Malformed-manifest warning · 400 px crop](https://github.com/user-attachments/assets/e72bb7c6-2093-47a8-b20a-bbfcbbad6316)

![Actual Gateway Recovery Storage, retained archives at 400 px](https://github.com/user-attachments/assets/6a1ad3e2-6d52-478e-84f3-42d8ad23a9b4)

![Actual Gateway Recovery Storage, incomplete inventory warning at 400 px](https://github.com/user-attachments/assets/e72bb7c6-2093-47a8-b20a-bbfcbbad6316)

The six failed harness attempts are retained with commands, process outcomes and logs: an overlong Chromium socket path; asset-body reads invalidated by full navigation; development-checkout refresh blocking setup; inherited NODE_ENV=test suppressing the real Gateway owner (explicitly interrupted after the refusal); an incorrect preview-reason expectation plus overbroad whole-page zero-shift expectation; and an incorrect malformed-manifest reason expectation. The final assertions preserve the real incomplete/conservative semantics. These failures are not product passes and no production budget or owner guard was weakened to make the fixture pass.

## Catalog CI fixture follow-up

The new upstream tool-admission contract requires advertised `tools.catalog` and `tools.effective`. The existing synthetic test supplied inventory responses but advertised neither method. The final correction only adds those two method names to that scenario; production guards and assertions remain unchanged.

The two exact CI-merge admission files were temporarily overlaid for meaningful red→green proof: original fixture 2/3 pass with the same initial-tool timeout, corrected fixture 3/3 pass. Both overlays were restored byte-for-byte. Final scoped type-aware lint, format, whitespace and test-line ratchet passed, plus independent review. This is targeted merged-behavior proof, not a claim of a full local synthetic-merge build. Complete command receipts, final patch, final 160-line red/green log excerpts with full-original hashes and the intentionally interrupted initial lint attempt are included. See `ci-followup/catalog-fixture-repair/README.md` and `publication/final-head-evidence-map.json`.
