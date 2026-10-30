# Catalog request admission fixture repair

## Change

One scenario-local fixture property advertises `tools.catalog` and `tools.effective` while retaining the existing Team-scale methods. The existing tool response and all rendered-content/request-count assertions remain intact. No production permission guard, shared default fixture, retry, timeout, or expectation changed.

## Exact failure and source boundary

- Candidate: `bf1debacae768ac8da1a8ee496f99fc1b53323fe`.
- CI synthetic merge: `8a6aa8065917aac12527fcf273ce7baa13218223`.
- Upstream admission commit: `60740d98bdf397f033f2a071775bcd7bc588644b` ([PR #188371](https://github.com/openclaw/openclaw/pull/188371)).
- [Failed CI job](https://github.com/openclaw/openclaw/actions/runs/41072160281/job/124119679070): initial tool chip never appeared before the test could exercise refresh/churn behavior.

The old candidate lacks the new admission checks. For meaningful local proof, the two exact CI-merge versions of `agents-page-state.ts` and `tools.ts` were overlaid on the candidate. Both versions are also byte-identical to those files at the upstream admission commit. Hashes are in `overlay-receipt.json`. This reproduces the relevant merged behavior, not the entire merged repository tree.

## Red → green

Both runs used the normal repository wrapper and the complete existing three-case E2E file:

```sh
node scripts/run-vitest.mjs run --config test/vitest/vitest.ui-e2e.config.ts --configLoader runner ui/src/e2e/catalog-request-admission.e2e.test.ts --maxWorkers=1
```

- **Red:** 2 passed, 1 failed, exit 1; 36.309 seconds wrapper wall time. Exact same initial-chip locator timed out at line 130. Local default timeout was 10 seconds; hosted CI used 30 seconds. This is the original missing-advertisement failure, not a compiler/setup failure.
- **Green:** 3 passed, exit 0; 27.052 seconds wrapper wall time, 25.00 seconds Vitest total (including production UI build). The inventory test itself took 2.340 seconds. Source hashes stayed fixed throughout the run. Existing unrelated-churn, catalog-invalidation and discovered-tool assertions all executed.

The old candidate-only 3/3 pass retained in `../catalog-admission-initial-replay.log` is not substituted for the merged-behavior reproduction above.

## Restoration / limits

Both production overlays were restored byte-for-byte after the terminal green receipt. Only the five-line formatted test fixture change remains in Git status. The wrapper built its own temporary Control UI bundle; the canonical UI index hash is unchanged. No dependency changes, commit, push, remote rerun, PR comment, or live-data mutation was performed.

This is browser-boundary proof against the existing synthetic Gateway fixture, not real-Gateway proof. Final synthetic-merge CI remains required. The public timeout diagnostic's legacy agent host properties are inconclusive about selected-agent state; they are not used to attribute this failure.

No extra complexity/duplication/mutation tooling was run for this fixture-data repair. The existing failing/then-passing user-flow test is the meaningful negative control.

## Static checks / retained tooling attempts

Final scoped type-aware lint (`--tsconfig tsconfig.ui.json`), format, diff whitespace and test-line ratchet all passed. The array was formatter-wrapped after green; no tokens or assertions changed, so the passing behavior proof is reused. `fixture-change-receipt.json` pins executed and final source hashes.

The first format check correctly reported the overlong added line. An initial lint command without an explicit UI tsconfig selected unrelated plugin package-boundary preparation; it was intentionally interrupted after 114.744 seconds and its exit-1 receipt/log retained. All its child processes exited. The corrected UI-scoped lint ran successfully; no policy bypass flag was used.
