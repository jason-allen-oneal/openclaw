Regression introduced by #193098.

## What Problem This Solves

Fixes: an explicitly authorized owner's setup request is rejected after the agent reads a network result, such as looking up a GitHub profile before assigning its role.

## User Impact

An explicit owner with current administrator authority can continue the same request after a network lookup, without avoiding the lookup or sending another prompt. Revoked authority, insufficient scopes, explicit tool policy, and taint restrictions on inherited non-owner authority remain enforced. Network content remains marked untrusted.

## Why This Change Was Made

The retained-operator continuation change added an unconditional taint veto to the general owner-tool guard. That also revoked ordinary explicit-owner eligibility, although the requester's identity and permissions had not changed. Confine the taint veto to callers without explicit owner attribution, while retaining the existing current-authority and administrator checks. Use the same condition in the error selection so taint no longer masks a different owner-authority failure.

This replaces the earlier guidance-only candidate: those description/documentation edits have been removed. No new setting, grant, approval flow, or alternate role-assignment mechanism is introduced.

## Evidence

- Incident evidence records `senderIsOwner: true` and `trigger: user` for both the network lookup and subsequent rejected setup call.
- The regression uses actual outer-tool construction and taint observation, mocking only final Gateway I/O. On the base: 3 failures / 14 passes. Explicit owners were rejected after lookup, pre-existing taint falsely reported a non-owner turn, and taint masked revocation. With the fix: all 31 retained-owner and prompt-stability checks pass, including those failures, owner policy denial/narrow authority, and retained non-owner controls. Taint remains set after successful delegation.
- Green test run: 199.76s Vitest / 205.22s wrapper, largely compilation. The changed regression file adds 52 lines, with a matching allocation; no duplicate fixture or production framework was added.
- Production core TypeScript check (`pnpm tsgo:core`), targeted type-aware core lint, formatting, line-growth checks, `git diff --check`, and commit hooks passed. Prior production-head CI run [42343084587](https://github.com/openclaw/openclaw/actions/runs/42343084587) completed with three failures; attribution is recorded below. The gate is not passing.
- Independent native P0–P3 review of the complete runtime/regression candidate against `06a5df2659599e96ecfa184f84a22d48abfb89fb`: no actionable production/test findings. Reviewed patch SHA-256: `59ebcc60c7b3285dde26d1dd7bf609099b235e65cdfa91d3b456fb9bbefb364f`. This is a narrative independent assessment, not an autoreview-helper machine result; earlier helper attempts failed before review.
- Earlier live attempts (historical; superseded by the successful OAuth trace below): the corrected isolated Gateway test started, but the local test environment’s outbound proxy rejected the API destination before inference or any tool call (`status: error`, no tool calls, no saved mapping). Earlier attempts failed during isolated-auth staging/startup; an interim candidate was deliberately stopped to repair two proof-oracle defects. The experimental fixture also assumed API-key authentication; environment-variable presence did not establish a usable API credential, and at that time no supported OAuth-backed live run had been demonstrated. The proxy refusal is an observed failure, not evidence that changing network policy alone would make the fixture usable. None of those failed attempts is counted as success, and the experimental fixture is not included in the PR. The reproduced and repaired contract is the actual outer-tool authority/delegation boundary; those attempts did not verify a model-driven end-to-end role write. The successful native-OAuth run below now supplies that evidence.


### Prior-head CI attribution

Tested head: `bbe4e8c663d4031bfd162b60a0bac9faa1d67b4a`; frozen base: `f231ad6693d808e8da6008ca2643058072ebbb3a`; tested merge: `47325a26274641d55f12345ec01488c86e04ae8a`. The exact base-to-merge diff at that run contained only the original three changed files. The subsequent integration-test addition is not covered by this run.

- **Architecture:** `madge-import-cycles` reports `control-ui-static.ts` ↔ `server-control-ui-root.ts`. Neither file nor production import edges change here. Upstream [#194496](https://github.com/openclaw/openclaw/pull/194496) merged a repair after this run’s frozen base. The failed run is retained, not relabeled green.
- **UI E2E:** `gateway-fresh-visit.http.e2e.test.ts` expected the old app-bundle failure heading at line 204. The test and production UI are unchanged by this PR. Separate [#194504](https://github.com/openclaw/openclaw/pull/194504) addresses the stale expectation; it is open, not a shipped fix.
- **Test-line ratchet:** the merge reported 6,558,578 lines, a 6,558,571 ceiling, and +52 lines. This PR adds exactly 52 test lines and 52 allocated lines. Thus its frozen base already has 6,558,526 lines against a 6,558,519 ceiling: seven inherited lines of debt. No extra budget or test deletion is being used to hide that deficit.

[ClawSweeper re-review](https://github.com/openclaw/openclaw/pull/194472#issuecomment-6702670509) reviewed production head `bbe4e8c663d4031bfd162b60a0bac9faa1d67b4a`. It found no discrete introduced correctness defect and recommends the explicit-owner exemption, subject to final-effect authority proof and current-head security approval. The subsequent test-only addition addresses the deterministic authority-chain gap described below. The real-model lookup → delegated assignment → persisted readback trace is now supplied below. Enforced current-head maintainer security approval remains outstanding.

### Joined delegated-write proof (synthetic inference)

The new integration regression exercises real outer-tool construction and the owner wrapper, in-process Gateway dispatch, `openclaw.chat`, delegated approval, the setup engine/proposal tool, config validation, and disk persistence. Inference/auth ownership uses the existing synthetic fixture and an explicitly admitted test source grant; no API key or live model request is used. A wrapper around real config validation pauses after its genuine result, before persistence, without substituting a validation result or a write.

- **Active explicit owner after a network observation:** the mapping for `fixture-contributor` is persisted and read back from the disposable config file. Taint remains set.
- **Original source grant revoked during delegation:** abort the admitted owner's grant after real config validation, release the paused handler, and join settlement. Original file bytes remain identical and the role mapping is absent.
- **Tainted non-owner:** rejected before Gateway dispatch or inference; original file bytes remain unchanged.

Command: `pnpm test src/gateway/server-methods/system-agent-owner-write.integration.test.ts --maxWorkers=1` — **3 passed**, 100.56s wall / 93.78s Vitest / 11.639s case execution (cold compilation dominates). CI seconds are not yet available. The 231-line test uses existing fixtures and has a matching separate test-line allocation. This composition is needed because the previous outer-tool tests mock dispatch and the writer tests supply only a synthetic authority callback. No production API or test-only hook was added. The fixture starts with a source receipt for the same grant, so this proves composed source-chain revocation rather than independently proving that the outer guard is the sole supplier of that receipt. Gateway-methods test typecheck, targeted repository lint, formatting, and diff checks passed.

This is deterministic final-effect integration evidence, **not** a real-model recording, live GitHub lookup, or proof of a person's subsequent login. Earlier failed live attempts remain documented above. The final integration test was also replayed with only `src/security/dangerous-tools.ts` restored to its pre-fix `ac0c596b119` bytes: **2 failed / 1 passed**, both explicit-owner cases failing with `Owner-level tools cannot run on a tainted turn.` Baseline wall time was 96.02s. The fixed guard was restored byte-for-byte afterward. This isolates the guard change; it is not a claim that a full old checkout or live model was exercised.

Independent native review of this addition found one P2 test-lifecycle issue: bind the deferred wait to test cancellation. Addressed with the existing `withinTest` helper and Vitest’s context-aware table API; no production behavior changed. After that repair, all three controls, the Gateway-methods test typecheck, targeted lint, formatting, and the test-line budget pass. Final test-file SHA-256: `10f8c839d0a8030e2dd4e648bf4037593da8bc1cbfc137b2e0d76472b2f2c36d`.

Sanitized terminal summary:

```text
Fixed guard: active owner saved mapping and readback matched — PASS
Fixed guard: source owner revoked after real validation; unchanged config — PASS
Fixed guard: tainted non-owner; no Gateway dispatch — PASS
Tests: 3 passed
Original guard: active owner — Owner-level tools cannot run on a tainted turn.
Original guard: revoked-owner scenario — Owner-level tools cannot run on a tainted turn.
Original guard: tainted non-owner — PASS
Tests: 2 failed | 1 passed
```


### Real-agent OAuth proof — completed November 7, 2026

Tested unchanged published head `37b5e053951bd8e60f187ff508a93d9787d070b0`. The ordinary `pnpm dev` build and `pnpm dev gateway run` launched a separate loopback Gateway with disposable config, workspace, roles and sessions. Actual model inference used the Codex runtime and the existing native ChatGPT OAuth login (`appServer.transport: stdio`, `homeScope: user`); no API key, credential copy, synthetic inference, tool mock or production Gateway change was used. A new native thread was created, not a resumed live thread.

The shipped Gateway client's normal token handshake explicitly requested and received `operator.admin` (plus read/write/approvals). Through the public Gateway WebSocket API, `sessions.create` made a Full Access session and `chat.send` submitted the request: fetch GitHub's public `octocat` profile, then use `openclaw` to preassign that login to the existing contributor role. The model selected and executed the lookup and both setup calls. Tool and provenance evidence was retrieved using `chat.history`, not reconstructed from assistant prose.

Sanitized recorded sequence (UTC):

```text
2026-11-07T07:03:26.824Z web_fetch: HTTP 200; resultContentSource=network
2026-11-07T07:03:33.253Z openclaw call: turnTainted=true
2026-11-07T07:04:14.919Z openclaw result: done: config.set
2026-11-07T07:04:17.687Z openclaw call: turnTainted=true
2026-11-07T07:04:28.468Z openclaw result: readback confirms octocat = contributor
2026-11-07T07:04:31.121Z agent.wait: status=ok; rerouted=false
```

The first `openclaw` result reported:

```text
[openclaw] running: config.set
Updated gateway.roles.assignments.byGithubLogin.octocat. Change will apply without restarting the gateway.
[openclaw] done: config.set
```

The model then requested a separate read-only setup-tool verification. Its result confirmed the saved `octocat = contributor` mapping and unchanged existing mapping, role definitions and default role. Independent disk readback found:

```json
{"existing-fixture":"contributor","octocat":"contributor"}
```

The complete post-write config equals the original config plus this mapping, passed through the existing `stampConfigWriteMetadata` function. This matters: the minimal fixture also acquired the normal selected-model allowlist and migration/version metadata on first write. Those automatic additions are disclosed, not hidden under a claim that only one JSON field changed. Every other authored setting is preserved. Both delegated calls retained `turnTainted: true`; the public lookup remained `resultContentSource: network`. The sole recorded `exec` item was native Code Mode wrapping `tools.web_fetch`, not a shell command or file mutation. There was no extra user prompt, auth fallback, live-account role assignment, external message, or production restart.

Post-run artifact checks:

```text
PASS: HTTP 200 lookup precedes both tainted OpenClaw delegations
PASS: delegated config.set, setup readback and independent disk readback agree
PASS: complete config matches requested change plus canonical write migrations
PASS: no shell/file mutation shortcut; terminal status ok and no reroute
PASS: isolated Gateway shutdown completed cleanly
```

Earlier failures remain part of the evidence: the API-only experiment never reached inference; the first OAuth run did reach real inference but generic `gateway call chat.send` requested only `operator.write` and correctly failed owner authorization. No mapping was saved by that run. The successful run used the same production candidate with properly admitted administrator scope, not a sender-flag override or an authorization bypass.

This closes the requested live lookup → delegated assignment → persisted readback evidence gap. It does not claim subsequent GitHub login, deployment, passing CI, or maintainer security approval. Current-head approval remains separate. No code changed in collecting this proof.
