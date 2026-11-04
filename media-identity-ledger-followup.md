# Image ownership ledger repair and exact-base gates

Source head: `82928de42d294787c398466e288368d8654f3e5e`; direct preceding head: `997a8a9f51c8d60bcfbe7428fb61d6a6d306fd31`.

## Minimal source repair

Remove exactly one obsolete row from `config/test-mock-exports-baseline.txt`, made obsolete by the existing explicit mock-isolation rationale:

```text
["src/media-understanding/defaults.test.ts","../plugins/manifest-contract-eligibility.js","caf3017309ead608c8328accde085b11b960a22ac4fbfa913bc1893cf3fd7bae",1]
```

No runtime code, assertions, counted test LF, shared scalar, or allocation changes. The allocation remains248. Remote commit patch is one file/one deletion; all22 candidate file SHA256s match local approved bytes. The21 previous owners are unchanged. Ledger SHA256: `c95fd1021b232a868e3c8adcd242d139b1504eb1bb8d58485bf309950f634e8a`.

Actual local check (maintained publication ancestry plus the reviewed patch and ledger repair):

```text
node --import ./scripts/tsx.mjs scripts/check-test-mock-exports.mts --base HEAD
Mock factory ratchet OK: 6399 grandfathered factories.
exit 0
```

Whitespace check passes. The checker parses every remaining ledger row and validates canonical JSON tuple syntax. No behavior tests repeated for this one-line ledger retirement. The local archive's HEAD is a verification snapshot, not publication ancestry; the remote commit preserves real fork ancestry. Earlier100-test and maintained-base51-test receipts remain historical in [original proof](https://github.com/jason-allen-oneal/openclaw/blob/605a3b61acacc2df1ed70ae3f3a307969aeaf662/media-identity-evidence.md). Prior-head997a production and all test-type lanes passed; none is claimed as new82928de CI.

## Verified inherited budget debt

This PR adds exactly248 literal LF and248 credits: zero newly unallocated debt. The total-tree gate still fails, so this is a classification, not a waiver.

| Tree | Test LF | Effective ceiling | Debt |
|---|---:|---:|---:|
| Original CI base041a0941490d6a22ab182df5dbb90848f53a66b1 | 6446904 | 6446759 |145|
| Original merge5d0542e719dea7f09be8371c35dfe5274f87493a, headdbdb5900 |6447152|6447007|145|
| Maintained main1ca0669dbe3982369463b921397027f3727f51fd |6446989|6446844|145|
| CI mergeccc699147104e979bbd8f1e09a3ed3bf5d0c43c8, head997a8a9f |6447237|6447092|145|

The second CI checkout is now directly bound by [job126321426675](https://github.com/openclaw/openclaw/actions/runs/41752493652/job/126321426675) Checkout logs, not inferred from matching counts:

```text
CHECKOUT_BASE_SHA: 1ca0669dbe3982369463b921397027f3727f51fd
CHECKOUT_SHA: ccc699147104e979bbd8f1e09a3ed3bf5d0c43c8
ccc699147104e979bbd8f1e09a3ed3bf5d0c43c8 -> origin/ci-target
1ca0669dbe3982369463b921397027f3727f51fd -> origin/ci-ratchet-base
HEAD is now at ccc69914 Merge 997a8a9f51c8d60bcfbe7428fb61d6a6d306fd31 into 1ca0669dbe3982369463b921397027f3727f51fd
```

Prepare release-gate ratchet merge tree was skipped. No identity claim for subsequent CI until its own checkout is observed.

Independent recount used official9e8cd4fd92667ece5743dc39e08be9a82504baee archive:25661 tracked files selected by the checker's9Git pathspecs,6446816LF; scalar6325633+1096allocations totaling121053=6446686 ceiling (130debt). Complete four-commit/60-file comparison to041a changes10counted files and2allocations. All12final files were acquired at exact041a and their Git blobSHA1s matched official comparison metadata. They add88LF/73credits, increasing inherited debt by15. Complete041a→1ca comparison adds85LF/85credits, leaving145. No new whole-tree checker execution is claimed for the reconstructed trees. Officiald27139b2 correction of47earlier lines is already included and cannot be applied twice.

Exact changed count inputs:

```json
[
  {
    "path": "config/test-lines-allocations/release-fast-lane-budget.txt",
    "baseLF": null,
    "targetLF": 2,
    "blob": "12998cca5fc448b4876c3e043b18c40826f6019c",
    "allocation": 43
  },
  {
    "path": "config/test-lines-allocations/subagents-two-status-summary.txt",
    "baseLF": null,
    "targetLF": 2,
    "blob": "af3d41b297fe1201ee202b0e72b43105c7af230f",
    "allocation": 30
  },
  {
    "path": "test/scripts/ci-workflow-guards.test.ts",
    "baseLF": 8281,
    "targetLF": 8324,
    "blob": "447a711028f084a2496a8de10941f19a0389076b",
    "delta": 43
  },
  {
    "path": "ui/src/components/board/board-view.test.ts",
    "baseLF": 762,
    "targetLF": 762,
    "blob": "e96b67258233323482200852d9340877b10309f4",
    "delta": 0
  },
  {
    "path": "ui/src/components/login-gate.test.ts",
    "baseLF": 488,
    "targetLF": 488,
    "blob": "9b3ed7cc16fa5d752b77cc011857655b39ccbe6d",
    "delta": 0
  },
  {
    "path": "ui/src/components/session-organizer-batch-mutations.test.ts",
    "baseLF": 842,
    "targetLF": 842,
    "blob": "41704c75ca2e4eef815360d2e4a7c35ccbe928c4",
    "delta": 0
  },
  {
    "path": "ui/src/lib/sessions/session-offline-lifecycle.test.ts",
    "baseLF": 767,
    "targetLF": 777,
    "blob": "40d2d1d721ebe0913e189ce560b711bad43b73e4",
    "delta": 10
  },
  {
    "path": "ui/src/pages/chat/chat-footer-layout.browser.test.ts",
    "baseLF": 597,
    "targetLF": 597,
    "blob": "7faa24ccc5accf506e06747857e69046ff2e4a0c",
    "delta": 0
  },
  {
    "path": "ui/src/pages/chat/chat-pane.test.ts",
    "baseLF": 1004,
    "targetLF": 1005,
    "blob": "4d40992005b02a42b97302a2be9efdbb38652ef9",
    "delta": 1
  },
  {
    "path": "ui/src/pages/chat/components/chat-details-subagents.test.tsx",
    "baseLF": 126,
    "targetLF": 156,
    "blob": "be87e9f03515a559feaa5b3c6904ce920ebb2b72",
    "delta": 30
  },
  {
    "path": "ui/src/pages/chat/components/widget-card.test.tsx",
    "baseLF": 923,
    "targetLF": 924,
    "blob": "df5affc96f6bf0b0c6381c4eb5f79f91f811173e",
    "delta": 1
  },
  {
    "path": "ui/src/pages/usage/usage-page-export-interruption.test.ts",
    "baseLF": 40,
    "targetLF": 43,
    "blob": "0042fefb250e498c2dc4e9ebb66b02fab1eb11c1",
    "delta": 3
  }
]
```

Existing inherited-debt tracker: https://github.com/openclaw/openclaw/issues/191738 . A maintained reconciliation or equivalent coverage-preserving correction is required; no allocation inflation, scalar padding, test deletion or gate weakening is included here.

## Built-runtime prerequisite and review limits

At prior exact head997a8a9f, build-artifacts was skipped and the run supplied zero artifacts. The local owned dependency closure remains incomplete; build/CLI/channel-ingress proof is NOT EXECUTED. Passing typechecks and source-boundary tests are not a completed built-runtime flow.

Required external prerequisite: a secretless isolated environment provisioned with the accepted exact head using the normal pinned package manager, followed by successful `pnpm build:ci-artifacts`, retaining source/build identity. Alternatively a complete normally generated runtime, packaged plugins AND authentic pinned dependency/metadata closure are needed. The macOS native-policy runtime artifact omits plugins/platform dependencies and is not sufficient. No credential-hydrating Testbox, production runner, registry bypass or workflow exception was used.

ClawSweeper has acknowledged the PR but has not posted a durable review verdict at this evidence capture. Dispatch success is not acceptance. No duplicate review request. PR-only: no production install/update/config/deploy or merge.
