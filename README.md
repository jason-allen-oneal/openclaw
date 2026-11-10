# PR #196365 — captured CLI evidence

Local, self-reported execution evidence for [openclaw/openclaw#196365](https://github.com/openclaw/openclaw/pull/196365), not trusted CI attestation.

## Result and scope

The **real built CLI** sends the preservation-aware collision warning for an authored `openclaw` agent, while healthy managed setup no longer receives the false warning. The test captures actual outbound HTTP model requests; the Responses server uses scripted replies. This is **not** live-provider response-quality proof, Gateway `openclaw.chat`/`runSystemAgentTurn` proof, agent migration, or remote-host execution.

| Execution | Outcome | Captured evidence |
| --- | --- | --- |
| Original PR head `1043c1921eac`, first attempt | Fixture failure: healthy planner needed JSON, not plain text; not a semantic verdict | [CLI results](proof-baseline-attempt1/cli-results.json), [requests](proof-baseline-attempt1/model-requests.json), [log](checks/proof-baseline-attempt1.log) |
| Original PR head `1043c1921eac`, corrected fixture | **RED**: both commands exit 0, but healthy request incorrectly includes the collision warning | [summary](proof-baseline-attempt2/result-summary.json), [healthy prompt](proof-baseline-attempt2/healthy-managed-system-prompt.txt), [requests](proof-baseline-attempt2/model-requests.json), [CLI results](proof-baseline-attempt2/cli-results.json), [log](checks/proof-baseline-attempt2.log) |
| Initial capture-only repair | **RED**: binding clone still loses authored-source pairing | [summary](proof-candidate/result-summary.json), [source delta](proof-candidate/source.patch), [requests](proof-candidate/model-requests.json), [log](checks/proof-candidate.log) |
| Final owner-level repair | **GREEN**: genuine collision guidance retained; false healthy warning and migration instruction absent; both commands exit 0 | [summary](proof-candidate-final/result-summary.json), [collision prompt](proof-candidate-final/authored-collision-system-prompt.txt), [healthy prompt](proof-candidate-final/healthy-managed-system-prompt.txt), [requests](proof-candidate-final/model-requests.json), [CLI results](proof-candidate-final/cli-results.json), [log](checks/proof-candidate-final.log) |

Three requests per run: collision agent, setup inference probe, healthy setup planner. Final CLI calls took 9,316 ms and 8,835 ms. The final invocation took 711.17 s including normal runtime preparation (9m46.5s); Vitest took 105.54 s. These are local execution costs, not benchmarks.

## Candidate identity and provenance

- Original PR head: `1043c1921eac76482b2acec98a1668dea7960a6f`.
- Repair committed as `de0f5ff7168ee871967743a79d7dc69e0dd8687e`.
- Base-only reconciliation head: `0ab81856dbaee3b72c099266bc168a881214a551`, with current base `5aa6d59ccaf1afa4cfadcc2284838cd4728f60c8` as a direct parent.
- **The final runtime was built before committing the repair. Its build metadata retains the original head; it is not an exact-commit build of either later SHA.** [Source receipt](proof-candidate-final/source-receipt.json) and [source patch](proof-candidate-final/source.patch) identify the executed working-tree candidate. The changed production sources stayed unchanged throughout the run and match both later commits: [post-commit hash verification](committed-source-verification.json).
- The complete reviewed PR patch is byte-identical after the mechanical base reconciliation. No new runtime run after that reconciliation is claimed.
- [Manifest](manifest.json) distinguishes original executed-file hashes from public redacted-file hashes. Checkout/operator paths, hostname and kernel label are redacted; synthetic temporary test-state paths and loopback addresses remain. No real provider credentials were used. The harness itself is unchanged. Embedded prompt hashes in historical summaries identify original captures; the manifest provides public redacted hashes.

## Reproduction

Copy the [executed harness](setup-helper-cli-prompt.e2e.test.ts) to `test/setup-helper-cli-prompt.e2e.test.ts` in a dependency-ready checkout. Run:

```sh
PROOF_ARTIFACT_DIR="$PWD/.artifacts/setup-helper-cli-proof" pnpm test test/setup-helper-cli-prompt.e2e.test.ts --maxWorkers=1
```

Harness SHA-256: `4b8fa23e1618b508d8990d9a6cc86a0ba649fd6668501da6f9f8d11191384158`.

It invokes `agent --local --agent openclaw --message … --json` for the authored collision and `setup --message …` for healthy setup. The latter intentionally does not use `--json`, which only requests an overview. Both commands use isolated fixture configuration/state and localhost synthetic transport. The harness asserts received requests and preservation guidance, not just process exit or response text. No direct prompt-builder injection is used. It is a local proof artifact, not a new CI test. The published exact harness applies to the corrected baseline and candidate semantic runs; the first baseline attempt used the earlier, incorrect response fixture.

## Regression and review receipts

- Route regression: [red](checks/regression-red.log), [green, 15 tests](checks/regression-green.log).
- Verified binding regression: [red](checks/verified-binding-red.log), [green: 21 binding and 20 runtime-credential tests](checks/verified-binding-green.log).
- [Focused consumers](checks/focused-consumers.log): 113 tests in seven files; [final setup admission](checks/setup-admission-final.log): 27 tests. **149 unique focused tests across nine files**, not the sum of repeated runs; plus one CLI proof test.
- [All six generated prompt outputs current](checks/snapshots-check.log), [test-line ratchet](checks/test-lines-ratchet-final.log).
- Core/services-test typechecks, touched-file lint/format, docs listing and diff whitespace checks completed successfully locally. These are local receipts, not exact-head GitHub CI claims.
- [Independent review](checks/autoreview-v3.md), [structured report](checks/autoreview-v3.json), [terminal status](checks/autoreview-v3-status.json): scoped-clean, P0–P2, no actionable findings. Reviewer did not execute tests. Its note that final CLI proof was pending reflects review timing; that proof finished afterward without source changes.
- Route test wrapper 145.22 s / Vitest 137.96 s, including 119.46 s cold compilation. Binding's isolated Vitest shard 14.29 s; combined binding/runtime wrapper 183.33 s. Existing 43-line allocation preserved; separate 21-line allocation covers the two regressions. No new normal-CI CLI harness cost.
- Optional generated mutation measurement did not reach assertions before a cold compiler timeout: **not measured**, not a mutation pass. Two review-launch attempts before the completed review failed at tool-path/authentication preflight; they were not reviews.

## Remote acceptance

At publication, GitHub reported the final head as conflicting despite its direct base parent, and the CI workflow had not started. The successful context/security workflows do not mean tests passed or the PR was accepted. Consult the live PR for subsequent CI and reviewer state. No merge or deployment is part of this evidence.
