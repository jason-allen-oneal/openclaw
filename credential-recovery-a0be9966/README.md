# Main-integrated credential recovery evidence

Candidate **a0be996609f0b1c4f8a23ab7f2ab5883efbe79fa**, tree
`43091e3fe05472d3659c0a9b13209fc6c3294b25`, integrates upstream main
`e814c50ed66c1c3849e596e32324c22100034f1c` without rewriting the existing PR history.
This addendum supersedes current-candidate claims only; all
[historical proof and failures](https://github.com/jason-allen-oneal/openclaw/blob/9bc423d06dba9d58d83545be955bb5f88d635780/credential-repair-9db22c6c/credential-repair-evidence.md)
remain available and are not relabeled as new execution.

## Repair and review

The two previous hosted-review findings were addressed at the existing auth
owners. Selected-provider/config context now reaches credential preparation and
migration checks, preserving the scoped migration intent of
[PR #143310](https://github.com/openclaw/openclaw/pull/143310). Valid
published inherited credentials can recover an unreadable/absent derived store,
but the shared physical owner still grants credential use. Recovery cannot
override a readable local credential. Unknown mutation outcomes, retired
publication and removed credentials remain denied. The credential-read operation was extracted with its
existing reader injected to comply with the source-size ratchet; no new cache or
credential owner was introduced.

Independent [recovery](reviews/auth-review.md) and
[extraction](reviews/extraction-review.md) reviews cover that repair. The separate
[main-integration assessment](reviews/integrated-review.md) covers overlapping
media/auth changes, not a fresh review of every unchanged PR line. Its one finding
was corrected in this candidate: the new identity module now imports its type
from upstream's `provider-types.js`. The extraction review's unused-import finding
was also corrected. Both original reports remain intact.

## Verification

- **202 tests across 12 affected files passed** on `93e40061e983fecd13b71b8ba503c05e60c76014`.
  The only subsequent source change is the erased type-import correction above.
  [Exact command and timing](core-checks.json), [test output](checks/focused-tests.log).
- On exact `a0be9966`, production and affected auth-test types, changed-production
  and auth-test lint, changed-TypeScript formatting and the test-size ratchet all
  passed. [Commands and timings](core-final-checks.json). This is targeted local
  verification; hosted CI remains the broad check.
- An earlier typecheck attempt was refused by the dependency-containment guard,
  before TypeScript ran. The source checkout was moved and dependencies installed
  inside it; the guard was not bypassed. The failed receipt and
  [diagnostic](checks/prior-external-toolchain-refusal.log) are preserved.
- Canonical public package build passed in **1571.74 seconds**, including
  maintained package checks. No build policy or warning budget was weakened.
  [Build receipt](core-main-package-build.json).
- The build's maintained UI performance step uses `--report-only`
  (`scripts/ui.mts`). Its [size report](checks/ui-size-report.log) exceeds three
  targets: largest ordinary JS (548.0 vs 547.4 KiB gzip), chat boot JS
  (1,290,304 vs 1,289,030 bytes) and new boot JS (798,976 vs 797,380 bytes).
  These are retained advisory overruns, **not passing size targets**. Attribution
  was not established by a separate baseline UI build; no limit was raised.
- The candidate was installed into an isolated prefix using the maintained
  package-install helper. Build metadata identifies this exact commit;
  **17,161 dist/launcher files** match the
  tarball byte-for-byte. [Install binding](core-main-installed-binding.json).
  Tarball SHA-256: `5b7fd94c051501ad61db20e4df5a030cfeadd77301debda259bbe435f0faf7d5`.
- A first local binding-script attempt stopped after successful installation:
  an overbroad `dist/private*` filename assertion matched four ordinary private-file
  utility modules. The [failure receipt](installed-binding-first-attempt.json)
  is preserved. That assertion was removed; canonical package integrity was not
  bypassed. The successful installation was reused, all installed bytes were
  rechecked, and runtime proof began only after binding passed.
- Installed CLI/Gateway proof passed in **204.88 seconds**. In both
  model-only and native-handler modes, the positive control sent the expected
  synthetic key and 85-byte PNG through the selected provider. Live logout then
  removed the API-key profile without blanket-aborting the retained run. The
  already-created host image tool refused use and made **zero HTTP requests after
  logout**. Live inventory confirmed zero remaining API-key profiles.
  [Selected observations](installed-results.json).
- The [first runtime attempt](core-main-installed-proof-v1.json) passed its
  model-only positive control, then stopped waiting for gateway readiness before
  any logout test. Its copied driver supplied 90 retries to a helper whose default
  is 300 (retries include quarter-second pauses, not one-second units). The gateway
  subsequently reported ready at about 75 seconds. The isolated gateway was
  stopped, the first attempt retained, and v2 reran only the runtime proof using
  the maintained default retry count and startup-failure cleanup. No package
  reinstall, product change, or relaxation of logout/refusal/HTTP assertions.

## Scope and limitations

The receivers and keys are synthetic and loopback-only: this is actual installed
product-boundary proof, **not a live Gemini/OAuth service test**. The separate
fresh-after-logout diagnostic is not the retained-tool check: both modes sent an
image with the existing `custom-local` fallback marker and received HTTP401. Its observed
requests/exit are retained in the results, and no removed key was transmitted.
Zero-I/O is claimed only for the retained revoked tools.

Earlier generation-overlap/install/upgrade sweeps remain explicitly prior-head
evidence, not new runs here. No production deployment, remote merge, or hosted
review/CI acceptance is claimed by this local proof. Existing maintainer security
approval requirements remain separate.

## Reproduction and integrity

[Source binding](core-main-source-binding.json) records the exact tree and all 40
changed-file hashes. [Export manifest](export-manifest.json) binds original local
files to their published bytes. The
[driver](proof/installed-driver.path-redacted.mjs) is a **path-redacted replay
template**, not the byte-identical executed original; substitute the named paths
and use the isolated fixture setup from the historical evidence. Its base fixture
plugin is included beside it. Raw Gateway logs, auth/config databases, real tokens,
closed-beta plugin source and unrelated personal paths are deliberately excluded.
