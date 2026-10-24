# Retained native final audit

Audited 2026-10-24T02:33:21.487809+00:00. Independent artifact audit; only this report and JSON were written.

## Result

Exact Android **7a5e0bd** completes legacy reconnect/chat and retained-state upgraded recovery. Both 140-second captures pass; source/APK provenance, signed pairing, session/history continuity and terminal cleanup are verified. This is not yet CI/Platinum completion.

| Observed boundary | Legacy 9.6 recovery | Upgraded current Gateway |
|---|---:|---:|
| Native observation seconds | 140.273 | 140.063 |
| Successful 732-row catalog responses | 7/7 | 18/18 |
| Responses carrying refreshFailed | 0 | 8 |
| Metadata-change events | 1 unflagged | 6 (4 semantic, 1 status-only, 1 usage-only) |
| Actual native UI turns reaching matching final | 1 | 1 |
| Request-to-final seconds | 3.025 | 2.831 |
| Readiness probes HTTP 200/ready during native connection | 15/15 | 14/14 |
| Seconds without further catalog reads after last response | 35.680 | 11.122 |

All three native catalogs retain 732 rows after initial population. The upgraded run shows both genuine provider/chat warnings, retained rows throughout, then both warnings clear; only 10.854 seconds remain after both are clear. It contains one status-only event, but a semantic catalog/auth event arrives in the same millisecond, so this is delivery evidence—not isolated causal status-only recovery. Owner regressions cover that branch.

## Continuity and migration

- Identical installed app/test APK hashes and signed device/public-key hashes across completed legacy/upgraded runs; token authentication, no bootstrap or new setup.
- Persisted app files at legacy shutdown exactly match upgrade startup. Same session-key and session-ID hashes; the original user/assistant pair appears in upgraded history before the new UI send. The new turn appends to that same history.
- Original home/state/workspace/plugin directory identities and agent-database inode remain. Canonical migration and the second turn legitimately change database bytes; retained session semantics are verified through native history, not inferred from file hashes alone.
- Direct package-only startup failed with exit 78 because schema 23 required doctor migration. The preserved failed receipt is hash-linked to successful `doctor --fix --non-interactive --no-workspace-suggestions` (exit 0), then the recovery boot. Configuration changed through that migration; no reseed or state-copy occurred. Do not claim a zero-migration/zero-touch upgrade.
- Gateway moves from official 9.6/eb377ac to reused current a7f5cc, distinct from Android 7a5e0bd. Preserve that attribution.
- Both successful remote Gateway phases exit 0; all recorded children are gone and ports 20094/20095 are free. Both local capture/proxy/tunnel groups exit 0. Resource samplers are intentionally terminated with SIGTERM, not test failures.

## Resource and proof limits

Gateway RSS during native connection: legacy 825,244–1,236,512 KiB; upgraded 1,707,316–2,178,556 KiB. These short observations do not establish memory-leak/admission resolution or comparative improvement. One of 14 upgraded readiness probes reports a degraded event loop despite remaining ready; none of 15 legacy probes does. Native-interval readiness is sampled, not a continuous guarantee; startup observations outside this interval are excluded.

The completed legacy run contains only one genuine refresh-induced hint. The earlier failed-onboarding capture contains 18 natural hints/four successful catalog reads but no completed observer/UI qualification. Sustained-hint preservation/cadence is supported by owner RED/147 GREEN regressions; there is no matched sustained-native A/B effect-size claim. The actual prior reviewer accepted owner tests for distinct branches and imposed no universal fresh-native-repeat gate.

Both UI sends are corroborated by native wire IDs, message/session hashes and matching final events. Visual interpretation of upgraded reply/history/warning/recovery screenshots is attributed to the root's recorded inspection; this audit independently checks their hashes and native/wire states. The legacy reply screenshot was also directly inspected by this auditor. Inference is deterministic/local. The upgraded send precedes the failure interval; do not claim a send while warnings were active.

## GitHub snapshot

One read during this audit: PR 181112 head 7a5e0bd, OPEN/MERGEABLE; 18 success, 47 skip, 6 running, 1 pending, 0 failed. CI run 40054032083. The durable semantic verdict still reviews **ef99274**, Gold 3/6, last updated 01:03:58Z. No new-head semantic acceptance observed; no review request sent by this audit.

Machine-readable exact counts, receipt hashes and limitations: `retained-final-audit.json`.
