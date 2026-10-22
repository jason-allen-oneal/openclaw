# Session-memory capture evidence — #159826

Candidate source: `2975dedca83e94d3530fdb339077bfe040d1b560`. Baseline: `a8ead196291935d24c44a4f40b67397d88c70256`.

## Observed results

| Boundary | Result |
| --- | --- |
| Baseline shipped CLI / Gateway / WebSocket | Six sessions received distinct markers through `chat.inject`; six concurrent `sessions.reset` calls and six success logs retained only five files. Two success logs name the same capture path. |
| Regression on baseline | Six expected captures, one retained: failure. |
| Candidate focused checks | Three relevant session-memory suites, 19 tests passed; scoped lint, formatting and core typecheck passed on source bytes verified identical to candidate commit. |
| Exact-head shipped Gateway and retained-state replay | Pending; no claim of completion. |

## Inspectable records

- [Gateway request/response receipt](gateway-baseline-receipt.json)
- [Actual baseline Gateway output](gateway-baseline.log)
- [Regression failure](test-red.log) and [focused passing suite](test-green.log)
- [Candidate source hashes](candidate-source.json)
- [Portable Gateway driver](gateway-runtime.mjs)

The runtime invokes `node openclaw.mjs gateway run` and `node openclaw.mjs gateway call` against isolated loopback state. It uses real session/transcript, hook, filesystem and SQLite owners, synthetic conversation markers, no model/provider and no external channel. Recorded missing marker: `CAPTURE-baseline-2-ONLY`. Baseline Gateway stopped with exit 0. This is a data-loss result, not a readiness or compilation failure.

The public records redact machine-specific checkout, home and artifact roots; loopback constants and synthetic IDs are retained. The portable driver copy is supplied for reproduction; the output records are from the actual original execution. A restart and injected interrupted-publication run from earlier source exist locally but are not promoted here as exact committed-head proof.

## Implementation and compatibility

The existing file-lock owner serializes allocation, provenance reservation and exclusive create. The sequential filename allocator remains authoritative. No schema, provenance format, configuration, retention policy, or durable filename registry is added. In particular, old provenance rows do not permanently reserve absent paths. This differs from the unresolved durable-reservation policy in closed PR #144146.

The one added observable regression checks every captured marker, content hash, session identity and trust classification. Optional slug generation and transcript reads stay outside the critical section. Production delta: +23/-10; regression delta: +69; docs delta: +2/-1. Simplification found no extra machinery to remove; the 23 production lines reuse existing owners rather than introduce a reservation registry.
