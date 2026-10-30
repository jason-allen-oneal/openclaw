# Recovery inventory worker correction

Runtime proof source head: `bf1debacae768ac8da1a8ee496f99fc1b53323fe` (worker commit `a52de97cf89`, separate UI test repair `bf1debacae7`).

## Finding and invariant

ClawSweeper reviewed `983ac6b` and found synchronous recovery ledger SQL/cold native snapshot work on the Gateway request thread. The explicit `update.status` inventory must execute off that thread, with the real serving owner, existing scan budgets and current lifecycle authority.

The four-file correction reuses the existing serialized Gateway recovery worker, admission port, captured database engine context, native section and cancellation owner. No new worker entrypoint, cache, deletion path or UI API shape was added. The scan returns before any cleanup branch and rechecks authority in the worker and caller before publication. Ordinary status polling still does not enumerate recovery. The existing 150 ms scan budget is not a wall-clock deadline for worker startup or queueing.

## Red to green

The existing explicit-status integration test now creates a genuine completed update ledger and capture directory, closes the native database, acquires the actual test Gateway owner, and calibrates main-thread SQL spies before the request. It also checks protected-original and capture bytes are unchanged. The pre-fix implementation made nine main-thread SQL preparations, including the update ledger read. That invariant failed before response assertions (`recovery-worker-red-sql.log`).

The corrected owner passes 22 gateway-status tests plus 23 inventory/automatic-cleanup tests: 45 total across 3 files, wrapper exit 0, 144.73 s including compilation. This is a focused rerun, not 45 new unique tests. Core typecheck, type-aware scoped lint, formatting, zero-cycle import guard and test-line ratchet passed. An independent four-file review found no actionable issues. The simplification pass retained the existing owner instead of introducing a second worker service.

Earlier setup failures remain retained: one wrong close-helper import, followed by an overly strict complete-count assertion on a legitimately time-bounded inventory. The final test asserts the SQL boundary before inspecting the bounded response and preserves incomplete semantics. No production budget was loosened.

## Separate CI repairs and attribution

The split-diff browser test had a demonstrated ResizeObserver/animation-start race. Its repair awaits measurement delivery before the existing animation-idle condition, retaining every geometry/content assertion; seven tests passed. See `ui-disclosure-race-proof.md`.

PostgreSQL conformance failed on the synthetic merge due to a newer main config-read regression. Exact main failure and merged upstream fix `34a4e118` are recorded in `postgres-ci-failure/README.md`; the next merge CI must include that fix. No unrelated config patch or freshness merge was added.

The old Android third-party run timed out. A prior run of this PR passed with identical Android/workflow sources and matched runner settings; no specific hung test or fix is claimed. The substantive new head gets normal CI, not a manual green-chasing rerun.

## Runtime proof

`pnpm build:runtime` passed on final head, including actual runtime and Control UI assets. The separate real-Gateway proof completed all nine cases at 400/820/1280 px with wrapper exit 0 and unchanged source/build hashes; all scans honestly report partial time-limit inventories. Complete receipts, RPCs, scoped layout measurements and archive/manifest preservation hashes are included. The first attempt could not launch Chromium because its temporary socket path exceeded the Unix limit. That failure is retained; the harness now uses a short task-owned temporary directory. Independent proof review also corrected the real cleanup RPC name, required a visible shell target, and separated execution completion from assertion success.

The earlier CLI/stable-upgrade proof remains historical evidence. CLI cleanup behavior is unchanged by this Gateway inventory correction; the real Gateway-to-browser boundary requires fresh proof. No upstream maintainer acceptance of the retention contract is claimed.

## Final test-only correction

Candidate 440f9f312feeeba735cb942491efd2cd52c40e47 additionally repairs the catalog E2E fixture to advertise the two tool APIs required by newly merged upstream admission checks. The exact two upstream files reproduce the failure; the corrected fixture passes3/3 before restoring the production overlay. All127 canonical UI assets still match the real-Gateway proof. See catalog-fixture-repair/README.md. No CLI or Gateway production changes followed the runtime proof.
