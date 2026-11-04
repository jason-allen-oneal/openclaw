# Native isolated built proof — execution handoff

**Final delegated result: all six corrected built-runtime cases passed, terminal
exit 0, wall time 252.82s (Vitest 248.55s); source unchanged.** The real unchanged
base reproduced the inbound defect at the final image/credential receiver.
No publication or production action occurred; parent/source follow-through and
the remaining broader reviewer obligations are still open.

## Identity and scope

Native `exec_command` supplied working default registry access without altering
proxy/authentication settings. Genuine Git acquisition confirmed PR ref
`ee4d7e1fc7da70993b7948b48b9b5b6f1267e765`, tree
`b9ba4f00f1f743b455fc718a4046b12fb3c8911c`; genuine comparison base
`5756d032d1e7559338a9efaa378c100f6d263439`, tree
`0cc4307c6d762aa8a4bd27b8315a7193b668a91f`.

Candidate checkout: `<isolated-candidate>`.
Baseline checkout: `<isolated-baseline>`.
Detailed commands, terminal receipts and logs: `<proof-logs>`.
The published PR was not changed. Every result is on an isolated reviewed-head
checkout plus the specifically identified retained-test overlay, not a claim
that new test bytes are already in the published PR head.

No product source, lockfile, dependency versions, live configuration, browser,
Actions settings, production installation, deployment or merge was changed.

## Completed prerequisites

- Pinned pnpm **12.15.0** frozen-lock install passed, exit 0, **525.23s**.
- Candidate `OPENCLAW_BUILD_PRIVATE_QA=1 pnpm build qaRuntime` passed, exit 0,
  **172.95s**. Product/source overlay remained unchanged throughout the build.
- Genuine baseline uses the identical lockfile; cached frozen install passed,
  exit 0, **4.35s**. Its private-QA build passed, exit 0, **149.48s**.
- Maintained direct planner and full `ci-build-manifest.mjs` both admit the new
  test into `test/vitest/vitest.e2e.config.ts` and a `private-qa` pretest build.
  Full manifest exited 0 in **67.96s**. Final-byte direct-planner recheck also
  passed (`native-planner-final-receipt.json`).
- Final candidate pinned format, targeted lint, E2E typecheck and tracked
  test-line ratchet passed. Ratchet: **6,447,936 / 6,447,936, zero slack**.
  Existing image allocation 248 is untouched; the additional retained fixture
  has exactly **462 literal LF bytes** and exactly 462 credit.

## Evidence-driven fixture corrections

Original frozen 449-line fixture was accepted for first execution, not declared
runtime-correct. Actual pinned checks required six curly blocks and rejected
obsolete `tools.media.image.models`. The latter moved to the supported
`tools.media.models` with `capabilities: ["image"]`; no product schema changed.

Actual execution then distinguished two existing contracts. Inbound media keeps
the unclaimed historical alias `gemini -> google`. Standalone explicit
`imageModel: gemini/fixture-vision` already preserves the configured generic
Gemini endpoint even without a plugin owner. The original new fixture wrongly
expected Google in both cases. Genuine-base and candidate runs both observed
the same standalone behavior, so only that test-table expectation and its
expected absence of native calls changed. Endpoint/credential exclusion, image
presence, captured-owner and retained-host-refusal assertions remain intact.

The final two-file overlay is `native-candidate-v3.patch`. Frozen original
artifacts remain unchanged; historical failures are retained. Parent/source
owner should independently review these small execution-driven corrections
before publication.

## Actual baseline/candidate observations

The first complete candidate observation set had **five passed cases and one
failed fixture expectation**. Native and model-only ownership passed through
both real attachment offload and supported host-created image tools; unclaimed
legacy inbound alias passed. Both successful host-tool cases rejected the same
retained tool after real host closure with **zero extra endpoint requests**.

The genuine unchanged-base run explicitly selected native attachment offload
and the disputed legacy host-tool case. It exited **1** in **160.20s**, both
at final-effect assertions, not setup:

- Native offload: handler named Gemini received `provider: google`; actual image
  and Google synthetic credential went to the Google receiver, Gemini got none.
  The candidate sends that same image only to Gemini with its own credential.
- Legacy standalone: both base and candidate send one image with the Gemini
  synthetic credential to the configured Gemini endpoint, no Google request and
  no native hook. This establishes the corrected test expectation as preserved
  behavior, not a waived regression.

The final six-case run on corrected bytes passed with terminal exit 0 and all
six positive endpoint receipts. All three host-tool cases observed actual host
closure and rejection before additional endpoint I/O. The final wrapper used a
separate process session and retained its proper terminal result; completed
compiler-generation verification and final source-diff identity also passed.
See `native-e2e-final-receipt.json`, `native-e2e-final-observations.jsonl` and
`native-e2e-final.log`. This is a full final-file pass, not an aggregate of the
earlier interrupted/failing run.

The 248.55s test-file duration is deliberate real-boundary cost: six distinct
provider/metadata configurations each boot an isolated built Gateway through
the maintained owner, then exercise actual loopback transport, credential/image
exclusion and host lifetime. Registry mocks cannot supply this requested proof.
No retries or timeout increases were added. CI wall/CPU time remains unmeasured
until this retained regression is published and executed there.

## Preserved setup/interruption history

- Initial runtime setup rejected group-writable fixture ancestry from the native
  host's inherited umask. A preserved QA-child diagnostic exposed that guard.
  Subsequent test processes use private **umask 0077** only for their own child
  session. No guard or global permission setting was changed. Core schema and
  standalone built CLI configuration validation both passed during diagnosis.
- An outer candidate command wrapper returned 143 while its actual test
  descendant continued. The descendant was observed through terminal Vitest
  output: five passes, one failure, completed-generation verification and final
  process disappearance. No duplicate was started. Its outer exit is unknown
  beyond 143, not relabeled zero; subsequent commands use an isolated process
  session and explicit terminal receipts.
- Initial baseline provisioning hit `/tmp` inode exhaustion. Only that task's
  disposable baseline worktree was removed after verifying its overlay bytes
  exactly matched the saved patch. The replacement uses the regular filesystem;
  candidate/store/source and unrelated artifacts were not removed.

## Limits and remaining gate

Synthetic loopback HTTP endpoints and synthetic keys exercise actual built
transport and configured-key resolution; no live Gemini/OAuth inference or image
semantic intelligence is claimed. Host-tool cases supply data images at the
public SDK boundary; attachment cases enter the real QA channel.

Captured-owner observations are not deliberately mismatched ambient generations.
Closed-attempt retained-tool rejection is not plugin uninstall or credential
revocation. Product fresh-install/latest-stable upgrade/settings-preservation
coverage, actual new-head hosted CI/review and final reviewer acceptance remain
separate obligations. Dependency installation does not satisfy product upgrade.

Do not duplicate the functioning native checkout/build, restart blocked Gateway
proxy attempts, or require fork-wide Actions activation. Preserve current test
and build handles from the progress receipt until they settle.
