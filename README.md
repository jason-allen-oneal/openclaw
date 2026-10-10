# PR 168630 — opt-out runtime evidence

Candidate: `a1dcdd90a282d2d636eec9151a47a833be89a1af`. Unset/true preserves eligible automatic DM completion fallback; explicit false disables it in the shared owner. No platform-specific account or service is a prerequisite.

## Observed behavior

| Execution boundary | Actual result | Records |
|---|---|---|
| Built Gateway, native child, real portable HTTP channel | 6/6 canonical media/failure cases passed. Unset/true: one exact child/run-correlated direct mirror and the expected PNG/failure notice. False: zero direct mirrors or fallback payloads after at least 30 seconds following native terminal execution. | [Matrix report](opt-out/native-matrix-report.md), [cross-checked verification](opt-out/native-matrix-verification.json), individual canonical summaries/receiver diagnostics under `opt-out/native/` |
| Built shared owner, two arbitrary plugin IDs, real HTTP receiver | 20 cases passed; 8 allowed POSTs. Exact payload/result checks; false, retired source, revoked authority after async preparation, cancellation and conflicting requester identity produce zero POSTs. Authority controls use unset/default-enabled configuration. | [Actual requests/results](opt-out/owner-transport-observations.json), [terminal receipt](opt-out/owner-transport-receipt.json) |
| Actual published stable → candidate upgrade | Published-stable Gateway creates persisted session/history; Doctor migrates agent SQLite v24→v25 and state SQLite v19→v20. Initial candidate boot times out under concurrent workload. After native boots finish, the same migrated state continues within the unchanged readiness bound; candidate reads/writes that same session and retains history/settings. New flag remains absent. | [Combined verification](opt-out/upgrade-combined-verification.json), [initial failed receipt](opt-out/upgrade/initial/receipt.json), [continuation trace](opt-out/upgrade/continuation/upgrade-trace.json), [continuation receipt](opt-out/upgrade/continuation/receipt.json), [provenance](opt-out/upgrade/continuation/provenance.json) |

## Reproduction and identity

The committed build command is `OPENCLAW_BUILD_PRIVATE_QA=1 OPENCLAW_RUN_NODE_SKIP_DTS_BUILD=1 pnpm build`. Actual Gateway entry is `node <candidate>/dist/index.js`; the scripts drive its real native sessions, provider HTTP and portable channel HTTP. [Build bindings](opt-out/build-bindings.mjs) require a clean expected commit, compiled opt-out guard and SHA-256 hashes of the executable owner, entry point, registry, scenario and unchanged scripted-provider source. Each command retains its actual exit and canonical QA status; top-level suite dispatch success is not used as a pass verdict.

Portable drivers: [native matrix](opt-out/native-matrix.mts), [HTTP owner](opt-out/owner-transport.mjs), [upgrade](opt-out/upgrade.mjs), [retained-state continuation](opt-out/upgrade-resume.mjs). Set `OPENCLAW_PROOF_EXPECTED_SHA` to the full candidate SHA. Native commands enumerate `unset false true` × `media failure`; executed YAML, transcripts and terminal receipts are retained per case. Received PNG is byte-for-byte equal to the 103-byte input, with exact native mirror keys, source account/conversation and post-ack chronology checked.

Set `OPENCLAW_PROOF_REPO_ROOT` to the clean candidate checkout before running a driver. The upgrade driver also accepts `OPENCLAW_PROOF_STABLE_ROOT` (the extracted published 2026.9.9 `package` directory, with dependencies installed) and `OPENCLAW_PROOF_STABLE_TARBALL` (the original `openclaw-2026.9.9.tgz` matching the pinned provenance hash). Use a fresh proof directory; original output paths refuse reuse. Continuation is recovery-only and requires the original failed attempt's private state, not the redacted public records. Public driver copies preserve executable loopback constants; only default machine paths and the two stable-path environment controls are adapted for portability. Original executed-file hashes remain in the original-hash map; no rerun of adapted copies is claimed.

[Local verification](opt-out/local-verification.json): 206 tests/5 files passed, wrapper wall time 98.90s. The old opt-in guard deliberately fails both unset HTTP transport cases; fixed owner passes. Independent native source review found no actionable P0–P2 defects. Canonical autoreview helper is unavailable due to API DNS failure, not a clean verdict. Initial typo/refusal and both build logs are retained; a precommit build was superseded by the committed build to bind the correct commit identity. [Exact-head CI](https://github.com/openclaw/openclaw/actions/runs/38089073787) passed the required type/lint gates. The duplicate local changed-check sweep was [stopped as redundant](opt-out/changed-check-cancellation.json), not credited as passed.

## Limits

- Real built CLI/Gateway and localhost transport, not an installed candidate public package or live external provider/channel. QA fixtures are repository-staged (`usePackagedPlugins:false`), with the maintained scripted OpenAI-compatible provider unchanged.
- Failure injection is real provider HTTP503 after a native read; the same matcher also affects parent post-spawn continuation. Ordinary sanitized provider-error traffic remains in diagnostics and is not credited as a direct failure notice.
- False/failure absence is bounded to the recorded post-terminal observation window; a captured pending delivery is not called permanently suspended. The shared-owner refusal itself is exercised separately.
- Native direct cases check source account/conversation; private-parent isolation is a separate unchanged owner, not a claim made by this matrix. No operator live configuration or communications account was changed.
- Upgrade retains the original timeout as a failure. Stable and Doctor are not rerun; exact pre-continuation state is preserved privately. Serialized continuation is a controlled resource-contention diagnosis, not a product startup repair or proof under arbitrary concurrent workload. The lane proves shipped-stable state retention through Doctor and the built candidate, not candidate public-package installation.
- Build output includes the existing Control UI startup gzip budget warning; the build exits 0. No frontend source change is part of this revision.

## Integrity

[SHA256SUMS](opt-out/SHA256SUMS) hashes public redacted artifacts. [Original hashes](opt-out/original-artifact-sha256.json) bind private unredacted inputs; local paths, endpoints and synthetic Gateway credentials are redacted. Root files outside `opt-out/` are historical prior-head evidence and do not establish the new default.
