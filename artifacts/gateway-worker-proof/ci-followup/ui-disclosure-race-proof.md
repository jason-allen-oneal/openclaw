# PR #188378: split-diff browser-test lifecycle repair

## Historical attribution

Candidate: `983ac6b5bfc091fe6130d1f6eb87ccd75207f046`; candidate base: `f964859d9f2bd045420271b95f6523df70285bd4`.

The exact CI failure (`session-diff-panel.browser.test.ts:137`, desktop=false, `expected -625 to be greater than or equal to 40`) already occurred on ancestor main SHA `d67aa608643f6583a6c6102c522043794aafe064`: [job 123946168063](https://github.com/openclaw/openclaw/actions/runs/41020302820/job/123946168063), started October 30 at 07:28 UTC. Its check-run annotations match the path, line, test title and numeric assertion exactly. GitHub compare verifies that ancestor precedes our base by 48 commits.

Six later scheduled-main UI shard-1 jobs passed. Fresh main `34a4e118dc1d69e925c5b2574c5597f3ce09e38a` has the same test, component and owning stylesheet blobs as the ancestor and candidate. Last test/stylesheet change was merged [PR #187572](https://github.com/openclaw/openclaw/pull/187572). No newer source fix found. This does not waive current-head CI.

## Concrete cause and red evidence

`FileDisclosure` observes its content via `createLayoutMeasurement`; ResizeObserver schedules `scheduleLayout`, which publishes its measured height animation on the next animation frame. The old test changed width and immediately polled for an empty animation list. That poll can pass before the pending resize-driven animation exists.

A temporary diagnostic kept the old poll and then delivered two real animation frames before the desktop wide/wrapped geometry assertion. This induced the latent ordering: the probe measured **one active disclosure animation**, shell height **117.578125px**, content height **683px**. The original reachability assertion failed: tail.bottom **761 > viewport.bottom 500**. This is a different animation-phase numeric symptom of the same unsettled-height condition, not a claim to reproduce the exact historical -625 value locally. Six sibling tests passed. No fake dimensions, timer sleeps, retries, disabled motion or weakened assertions were used.

Retained diagnostic: `ui-disclosure-race-red.log` and `ui-disclosure-race-red.png`. Temporary instrumentation was removed.

## Repair and green evidence

Only `ui/src/pages/chat/components/session-diff-panel.browser.test.ts` changed (+8 net lines). Before the existing animation-idle assertion, observe the actual disclosure content (split element for the mobile branch), await ResizeObserver delivery and the subsequent layout frames. Every existing text, alignment, selection, wrapping and reachability assertion remains unchanged. No production code changed.

Command (both red and green):

```sh
pnpm --dir ui test src/pages/chat/components/session-diff-panel.browser.test.ts --maxWorkers=1 --retry=0 --reporter=verbose
```

Final content-target run: **7 passed**, Vitest **5.85s**, desktop case **1212ms**, mobile **561ms**, exit 0. Log: `ui-disclosure-content-green.log`. Initial split-target green run also retained in `ui-disclosure-race-green.log`; final target was tightened to match the production observer.

Checks passed: scoped `oxfmt --check`, `git diff --check`, `scripts/run-oxlint-shards.mts --files-json` for the single test, and test-lines ratchet (6,296,390 lines / ceiling 6,333,318 before formatter collapsed two unchanged lines). No allowance changed. Existing Solid STRICT_READ_UNTRACKED diagnostics in sibling menu tests remain visible in both logs.

One initially mis-scoped lint invocation was terminated before shard execution; the successful invocation used explicit `--files-json`. No commits, pushes, comments, CI reruns, merges or deployments were performed.
