# Comment-only mock-isolation follow-up

Source head: `997a8a9f51c8d60bcfbe7428fb61d6a6d306fd31`.
Parent: `dbdb5900ddc31ff2502df187c247c3c67be3a01a`.

The only source change replaces one blank line immediately before the manifest-contract-eligibility mock in `src/media-understanding/defaults.test.ts` with:

```ts
// mock-isolation: Use synthetic manifest metadata without live plugin discovery or policy state.
```

No runtime code, test assertions, or LF count changes. The exact248-line allocation is unchanged. All21 remote file hashes match the local approved candidate:20 unchanged, defaults.test.ts now SHA256 `8bed70efcac4edec16f101fa809ce573c8f2f112de9775589c39033dade6a75d`.

## Targeted verification

- Actual repository `scanClosedMockFactories` + native TypeScript parser on the repaired file: diagnostics `[]`, findings `[]`, exit0.
- `node node_modules/oxfmt/bin/oxfmt --check src/media-understanding/defaults.test.ts`: passed, exit0.
- `git diff --check`: passed.
- Whole mock-export ratchet: exit1, requests removal of the now-obsolete exact baseline entry below. The baseline file was not changed by this approved comment-only repair.

```text
Shrink config/test-mock-exports-baseline.txt (run with --prune):
  ["src/media-understanding/defaults.test.ts","../plugins/manifest-contract-eligibility.js","caf3017309ead608c8328accde085b11b960a22ac4fbfa913bc1893cf3fd7bae",1]
```

The same entry was verified in official CI base `041a0941490d6a22ab182df5dbb90848f53a66b1`. The new isolation rationale addresses the closed-mock finding, but stale-ledger cleanup remains an actionable gate; no aggregate pass is claimed.

## Historical proof and outstanding gates

The [original immutable proof](https://github.com/jason-allen-oneal/openclaw/blob/605a3b61acacc2df1ed70ae3f3a307969aeaf662/media-identity-evidence.md) remains bound to its original head/base. No behavioral tests were repeated for this comment-only change. Prior-head production-type CI success is historical, not new-head proof.

New-head CI: https://github.com/openclaw/openclaw/actions/runs/41752493652 . Build-artifacts is skipped and no downloadable build artifacts were observed; full build and actual built CLI/channel-ingress remain unverified. The prior CI merge-tree145-line budget overage is under exact-base analysis, not yet classified here. ClawSweeper dispatch success is not a review verdict; none was posted at this observation. No duplicate re-review requested. No production change or merge.
