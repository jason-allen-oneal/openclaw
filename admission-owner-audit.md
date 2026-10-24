# Admission-owner source audit

Read-only source/history audit for Android PR #181112, prepared October 24, 2026 UTC. This is supplemental interpretation, not a runtime result. No product changes, tests, pressure injection, or Gateway launches were performed by this audit.

## Source identities

- Official reported Gateway 2026.9.6: `eb377ac59e6c9fd6c7705028034812becf00271b`.
- Android candidate inspected: `7a5e0bda258ac938456e42cfcb6b4f2b2fa23a30`.
- The candidate's Gateway source is inherited upstream code, not an Android repair. Any current-Gateway improvement must retain that attribution.

## What the official Gateway actually does

1. A critical memory sample [publishes `openclaw.memory.critical`](https://github.com/openclaw/openclaw/blob/eb377ac59e6c9fd6c7705028034812becf00271b/src/logging/diagnostic-memory.ts#L431). This is not itself an instruction to close agent admission.
2. The [shared-state worker subscriber](https://github.com/openclaw/openclaw/blob/eb377ac59e6c9fd6c7705028034812becf00271b/src/state/openclaw-state-worker-store.ts#L342) retires idle stores only: it requires an idle timer and existing store, excludes maintenance scope, and excludes active actor operations. The [history/usage subscriber](https://github.com/openclaw/openclaw/blob/eb377ac59e6c9fd6c7705028034812becf00271b/src/config/sessions/session-transcript-worker-resources.ts#L130) skips pending or rotating lanes.
3. The exact reported error, [“Agent database execution admission is closed”](https://github.com/openclaw/openclaw/blob/eb377ac59e6c9fd6c7705028034812becf00271b/src/state/openclaw-agent-execution.ts#L139), comes from a retired logical owner, displaced owner identity, or an unsupported maintenance/deletion scope. It is not an RSS-threshold test.
4. The official [native-failure catch](https://github.com/openclaw/openclaw/blob/eb377ac59e6c9fd6c7705028034812becf00271b/src/state/openclaw-agent-execution.ts#L244) closes the entire logical owner when `current.failed()` is true. [Logical close](https://github.com/openclaw/openclaw/blob/eb377ac59e6c9fd6c7705028034812becf00271b/src/state/openclaw-agent-execution.ts#L365) marks it retired before native cleanup. [Native failure](https://github.com/openclaw/openclaw/blob/eb377ac59e6c9fd6c7705028034812becf00271b/src/state/openclaw-agent-execution-native.ts#L377) includes opening failure or an unavailable opened worker.

This supports a possible native-failure-to-admission-closure sequence. It does **not** establish that memory pressure, catalog traffic, or pressure-driven idle retirement caused that native failure in issue #179075. The inspected pressure subscribers have active-work guards; no failing pressure-retirement boundary was reproduced.

## Relevant existing upstream repairs

| Boundary | Verified merged repair | Scope of evidence |
| --- | --- | --- |
| Transient SQLite contention permanently poisons logical admission | [#162750](https://github.com/openclaw/openclaw/pull/162750), `54885d54a0385b6137847a1b29ba14c4cf5a8474` | Commit patch keeps logical ownership for pre-entry contention, retires the settled native generation, and retries within a bounded budget. Current [owner catch](https://github.com/openclaw/openclaw/blob/7a5e0bda258ac938456e42cfcb6b4f2b2fa23a30/src/state/openclaw-agent-execution-owner.ts#L277) contains this distinction. Existing `openclaw-agent-execution.close-wedge.test.ts` covers retry, deadline, and shutdown. |
| Retained native worker exits between operations | [#163258](https://github.com/openclaw/openclaw/pull/163258), `88095dc00eef288c3829909d4dc64a9e249fa7ef` | Existing real-worker regressions establish fresh-generation recovery before dispatch, preserve invalid old claims, and do not replay dispatched work. The PR explicitly does not reproduce the original production exit cause. |
| Codex startup fanout and unowned idle children | [#168387](https://github.com/openclaw/openclaw/pull/168387), `a825abb1fae404fd186ab65cb427019f0f9b4d9c` | Existing upstream provenance identified by issue #170457's source/history review; not an Android change. |
| Abandoned initialized Codex discovery | [#168365](https://github.com/openclaw/openclaw/pull/168365), `e7ec72eb23c57265ea4980648e5762b2d59e70c9` | Existing owner-aware retirement identified by issue #170457's source/history review; preserves sibling leases. |

The first two PR bodies, merge identities, and the contention commit patch were read directly. The Codex provenance above is recorded in the linked issue review and is not new local runtime verification. Existing catalog-producer separation/retry fixes are independently covered in `../../gateway-warning-owner-audit.md`; they should not be duplicated or credited to Android.

## Same-author historical evidence and its limit

[Issue #170457](https://github.com/openclaw/openclaw/issues/170457) is authored by **NOVA-Openclaw**, the author of #179075. It reports Gateway 2026.9.6 with approximately 30 agents, stale/disabled Codex discovery, timed-out app-server children, 16 children at boot (about 341 MB combined RSS), and an earlier 30-orphan observation (about 985 MB). The report correlates process accumulation with state-lifecycle contention and the same admission-closed error; removing stale entries and terminating orphaned children reportedly stopped that episode.

This is a concrete same-author alternative/contributing-mechanism lead, **not proof that the later Android incident shares its cause**. The issue's [review](https://github.com/openclaw/openclaw/issues/170457#issuecomment-6135732371) and [source/history follow-up](https://github.com/openclaw/openclaw/issues/170457#issuecomment-6142092810) distinguish absent plugin configuration from explicit disablement, identify existing fixes, and leave the exact stale-entry and state-lifecycle relationship unverified. No inference that Android triggered these processes is justified.

## Interpretation rules for the new matched native A/B

- Attribute measured differences to the changed Android build only when the Gateway, fixture, workload, and observation window are held fixed.
- Count actual traffic, provider work, RSS/CPU, worker/process exits, and actual UI-turn outcomes separately. A successful turn while connected demonstrates availability for that observed interval, not recovery from an unobserved admission failure.
- A lower RSS sample, quiet catalog, or successful turn does not establish the reporter's 3.24–3.29 GiB failure was reproduced or resolved.
- If an admission error occurs, preserve the **first underlying native/open/lease/cleanup failure and stack**, plus close/revoke ordering. Repeated generic admission-closed messages alone do not identify the producer.
- No artificial pressure is part of the parent's planned matched A/B. This audit supplies ownership context only; results must come from its actual receipts.
