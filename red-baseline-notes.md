# Supplemental baseline regression captures

This supplement contains preserved earlier archive test outputs and a subsequent exact-source baseline run of the final reconciliation regression. The new reconciliation run closes the earlier final-fixture red-evidence gap. Invalid earlier fixture failures remain visible and are not counted as product evidence.

## Exact final reconciliation regression: valid baseline failure

On 2026-10-23 at 00:55:27 UTC, the unchanged final reconciliation test ran against an independent checkout of upstream baseline `a8ead196291935d24c44a4f40b67397d88c70256`. The only tracked modification was that test copied byte-for-byte from candidate `699ff2529067bea705e86005baf0c418906fbf03`.

- Baseline Git tree: `9b2f76b50e0a7c6f512930154ddd7ba084a39426`.
- Candidate Git tree: `d82010aed49c3e5f291948a28bc5017edce615f4`.
- Final test Git blob: `9f9768735e4ee931503a5f0a76f6e1e1808e7cc7`.
- Final test SHA-256: `1475002b85131f36966af5d6b8b2c3664b63698f5c5f8cae80ca5d928c35fccd`.

The selected case reached the real reconciliation worker's plan/acknowledgment gate, installed fake timers before admission, advanced 180,000 ms, and failed at the intended assertion: **`expected "terminate" to be called once, but got 0 times`**, line 441. There was no worker-factory recursion or timer-capture lookup in this fixture. Baseline production source has no reconciliation task timeout. The fixture's `finally` restored real timers, released its gate, and joined cleanup; the maintained wrapper exited normally with test failure code 1 and no surviving task processes.

Result: **1 failed, 8 skipped**; selected case 2.468 seconds; full command 98.78 seconds including 66.95 seconds of worker compilation. The launcher and worker compiler used Node 24.22.1. The maintained wrapper selected its pinned OpenClaw Bun fork `openclaw-v1.4.4-20261019-ef37c31de3-webkit-a2976f02e6` (Bun 1.4.4) for Vitest. This is focused regression evidence; native-I/O and shipped-Gateway evidence remain separate.

```sh
/runtime/node-v24.22.1/bin/node scripts/test-projects.mts \
  src/config/sessions/session-transcript-reconcile-pool.test.ts \
  --maxWorkers=1 \
  -t 'joins transcript lease settlement before closing an agent \(task-timeout\)'
```

Artifacts:

- [Full failing output](reconcile-red-final.log), [source/command receipt](reconcile-red-final.receipt.json), [exact fixture](reconcile-red-final.fixture.ts), and [only tracked overlay](reconcile-red-final.overlay.patch).
- [Workspace dependency directory manifest](reconcile-red-workspace-dependencies.txt). Installed dependencies were copied into the independent baseline tree, including workspace links; candidate source, dependencies, build output, and Git refs were not changed. Package manifests, lockfile, runner scripts, test configuration, and workspace packages are identical between the baseline and candidate.
- [First setup failure](reconcile-red-setup-v1.receipt.json): the shallow candidate did not contain the baseline tree; no test started. Recovery fetched the exact public upstream baseline into the independent clone.
- [Second setup failure](reconcile-red-setup-v2.log) and [receipt](reconcile-red-setup-v2.receipt.json): root dependencies alone omitted workspace links, so config loading could not resolve `@solidjs/vite-plugin`; no test ran. Recovery copied the existing 189 workspace dependency directories without reinstalling or changing versions. [Setup command output](reconcile-red-setup.log) is retained.

The new final-fixture baseline run supersedes the reconciliation evidence gap described in the historical captures below. The existing candidate pass remains [deadline-green-v2.log](deadline-green-v2.log); the committed test is unchanged between the initial candidate and final diagnostic-copy head.

## Recorded failures and their meaning

| Capture | Observed result | What can be concluded |
| --- | --- | --- |
| [admission-red.log](admission-red.log) | Admission regression failed because `overflowError` was `undefined`; the four existing cancellation/settlement cases passed. | The tested queue did not reject excess admission. This early fixture expected uppercase `OVERLOADED`; the final error code and assertion use lowercase `overloaded`. The observed absence of any error supports the missing-bound diagnosis, but this is not an exact-final-fixture red run. |
| [archive-deadline-red.log](archive-deadline-red.log) | Both one-shot and scoped cases failed with `Archive operation has no settlement deadline`; 18 unrelated cases were skipped. | These cases reached the actual archive worker flush hold, observed no termination or successor progress, and then found no deadline callback. They did not fail with the earlier worker-factory recursion. This proves the missing deadline in that captured fixture; the baseline cannot reach the subsequent termination, physical-exit, staging-cleanup, or retry assertions. |
| [lifetimes-red-v2.log](lifetimes-red-v2.log) | Four failures: lowercase admission rejection absent; two archive worker-factory recursion failures; reconciliation deadline capture absent. | The lowercase admission assertion independently corroborates missing rejection. The two recursion failures are setup failures and are **not** bug evidence. The reconciliation failure is **not** accepted red evidence, as explained below. The mixed run must not be represented as four valid failing regressions. |

The archive deadline fixture waits for its real worker's flush gate before checking for the captured timer. It uses controlled timer invocation and an interruptible worker fault, so it is a focused lifecycle regression, not proof that a JavaScript timeout interrupts a blocked native syscall. The separate shipped-Gateway baseline remains the native-I/O evidence.

## Reconciliation fixture limitation

The reconciliation case in `lifetimes-red-v2.log` searched for an exact timer delay and failed with `Reconciliation task has no settlement deadline`. The later candidate run in [lifetimes-green.log](lifetimes-green.log) failed with the same message even after the product timeout had been added: the pool subtracts elapsed time when scheduling its deadline. That fixture therefore did not discriminate baseline from candidate correctly.

A subsequent range-based timer capture also selected unrelated timers and failed. The final committed regression instead installs fake timers before task admission and advances the real pool timer. Its candidate pass is recorded in [deadline-green-v2.log](deadline-green-v2.log). These historical captures did not establish exact-final reconciliation red-on-base; that gap is now closed by the independently recorded run above. Neither the invalid timer-capture failure nor the earlier native-read setup that failed to reach its fault boundary is credited for doing so.

## Source provenance and scope

The task's retained baseline record identifies upstream [`a8ead196291935d24c44a4f40b67397d88c70256`](https://github.com/openclaw/openclaw/commit/a8ead196291935d24c44a4f40b67397d88c70256). Inspection of that source confirms an archive FIFO with no admission cap, archive worker completion handlers with no task deadline, and reconciliation `pool.run` without `timeoutMs`. This is consistent with the meaningful failures above.

The three red logs do not embed a Git tree digest, complete command receipt, or archived test-source snapshot for their individual invocation. Their baseline attribution relies on the retained task record; the logs alone cannot independently attest the exact source and fixture bytes. Compiler-cache generation IDs and original test output are preserved, but they are not substituted for source digests. No stronger source-identity claim is made.

The three affected committed test files are byte-identical between initial PR head [`02d3792bd82664b85249ed353f41c833feae97d3`](https://github.com/openclaw/openclaw/commit/02d3792bd82664b85249ed353f41c833feae97d3) and diagnostic-copy head [`699ff2529067bea705e86005baf0c418906fbf03`](https://github.com/openclaw/openclaw/commit/699ff2529067bea705e86005baf0c418906fbf03). That confirms the later message-only change did not alter the committed regressions; it does not retroactively identify the earlier uncommitted fixture versions.

## Sanitization and integrity

Only ANSI terminal color/control sequences were removed and the absolute local checkout path was replaced with `/openclaw`. Test names, assertions, failures, skips, durations, compiler IDs, dependency warnings, and existing capture redactions are unchanged. No local home path, credential, IP address, or private endpoint is included. The mixed failed run is retained whole so its invalid cases remain visible.

For the new remote captures, absolute source/runtime/proof locations are normalized to `/openclaw-baseline`, `/openclaw-candidate`, `/runtime`, and `/proof`; ANSI sequences are removed. The exact fixture and overlay need no replacements and remain byte-identical. The receipt's `testLogSha256` identifies the original raw capture; the sanitized published `reconcile-red-final.log` SHA-256 is `131d4f737a8e62d746e403c5ada29bdad576b21fa2723a155f35443293ab7386`.

| File | Sanitized SHA-256 |
| --- | --- |
| `admission-red.log` | `517775dc7a5890c661b2940db6a18f2d675046a990064b2afef31adf86642424` |
| `archive-deadline-red.log` | `ae33238d31fb29b08aeb6e768f532cbb9e4428f7e07da6a2492630ca786a480d` |
| `lifetimes-red-v2.log` | `6c81d7efa9c529a50a32eb51f1f5a6d16d8d9f5d33ae32e8531385343961cceb` |

Original retained capture SHA-256 values, in the same order:

```text
a91b2c8e53e750547182627ed2b8954c30a3cb573afac6df61049b57d619b4ab
e35efd1f007efd18f52f9d2d3374cb38c33be766e272941b7613c1d822c4b422
c8bd7fffabaeebc7858ebea32031aaec213399b8ff3c8167ac430d2dabb3ef9b
```
