# Owner access after network reads — PR #194472 evidence

This is a preservation and verification index, not a new live-model run. The prior published candidate was `37b5e053951bd8e60f187ff508a93d9787d070b0`.

## Existing execution evidence

- [Historical complete PR evidence](historical-pr-body-37b5e05.md) preserves original commands, base failures, attempted live runs, test timings and limitations.
- [Historical real-agent OAuth proof](historical-live-proof-37b5e05.md) records the November 7 shipped-Gateway lookup → tainted delegation → persisted role → independent readback flow at that original head. It is the retained sanitized report; the temporary raw capture directory is not available for this follow-up, and no raw trace has been reconstructed.
- [Accepted review](https://github.com/openclaw/openclaw/pull/194472#issuecomment-6702670509): original head, overall/proof/patch 5/6, no findings. This is historical review evidence for the old reviewed head, not current-head maintainer security approval.

## Proof attribution correction

The integration test's `non-owner` row proves that a non-owner cannot invoke the setup delegation or write a role. `openclaw` is outside the retained non-owner tool set, so that row is gated before the later network observation; its success does not independently prove the taint veto.

The `tainted` and `tainted-later` cases in `agent-tools.retained-owner.test.ts` separately prove the taint restrictions for a retained `gateway` tool, at construction and execution respectively. This distinction addresses [the human review](https://github.com/openclaw/openclaw/pull/194472#pullrequestreview-5815589644).

The integration's active-owner and revoked-owner cases exercise the real outer wrapper, in-process dispatch, delegated approval, setup engine, real config validation and persistence. Revoking the original admitted grant after validation prevents persistence after handler settlement. The fixture pre-supplies a receipt for that same grant: it proves composed source-chain revocation, not that the wrapper is its sole supplier.

## Existing owner semantics and limits

The shared guard change affects owner tools, not only role assignment. Explicit owners without an admitted operator-authority object already bypass the taint-based outer denial; the patch restores consistent behavior when current administrator authority is supplied. The network result remains untrusted and the sticky taint remains set. Operation policy, current authority, scopes, and downstream approvals remain their existing owners' responsibility. This is not proof that model behavior is immune to malicious page instructions.

## CI repair rationale

The original final-head CI run [42348122175](https://github.com/openclaw/openclaw/actions/runs/42348122175) failed the test-line ratchet and first UI E2E shard. Its patch added 283 lines and exactly 283 allocation lines; the frozen merged base carried a 70-line deficit. The UI failure was the stale app-bundle failure heading. [#194504](https://github.com/openclaw/openclaw/pull/194504) is now merged (commit `2e83d371655d90085fc0241baeaa332584a56dd4`), superseding the historical report that it was open. Architecture passed on that final-head run; the earlier architecture failure remains historical.

This follow-up integrates maintained upstream fixes for actual failed checks. It does not increase the shared baseline, add extra allocations, delete useful tests, or change the narrow production fix. Final candidate identities and new check results are recorded separately.

## Candidate verification — November 8, 2026

Candidate `a6e4d16bc6f3e03d44aed5d86f1a28e32e45b44c` merges maintained upstream `e3a09aaba1f45ec3ff2eb4a0db4728286f53068d` into the existing PR branch. No source conflicts or custom repair edits were needed. The complete five-file patch relative to the new base is byte-identical to the old reviewed patch (SHA-256 `2b59c279755bb71a1142af63888d3a799493e083a2895565bd0b0144dee5beab`).

- [Boundary identity](boundary-identity.json): all 19 named owner/regression files are byte-identical to the historical live-proof head. This covers named boundaries, not the entire runtime/dependency closure.
- [Authority tests](authority-tests.json), [complete sanitized output](authority-tests.log): 34 tests passed across the retained-owner/prefix-stability and composed delegated-write suites; 158.46 seconds wall time. Gateway suite: 3 passed, 98.76 seconds Vitest; agent suites: 31 passed, 51.96 seconds Vitest. Cold compilation dominates; completed compiler generation was verified.
- [Test-line ratchet](ratchet.json), [output](ratchet.log): passed, 6,584,716 lines against 6,584,756 ceiling (40 slack), using the exact maintained upstream comparison. No shared-baseline or additional allocation change.
- [Browser regression](ui-regression.json), [complete sanitized output](ui-regression.log): the previously failing unknown-bundle-failure scenario passed against a freshly built production UI; one selected test passed, two unrelated tests were not selected. 134.56 seconds wall time, 17.084 seconds case time, 41.10 seconds UI build. Chromium exited cleanly and the compiler generation was verified.

The checkout's dependency installation completed with the upstream frozen lockfile. The source remained clean after verification. Current-head hosted CI and review must be collected after publication; no merge, deployment or maintainer security approval is claimed. The historical live-model recording was not rerun or upgraded to a new-head execution claim.
