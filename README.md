# PR #194423: node pairing recovery proof

Candidate: [`13b077c8432ced4c058e11b9a792bc9d81e87a77`](https://github.com/openclaw/openclaw/commit/13b077c8432ced4c058e11b9a792bc9d81e87a77)
Review base: `7ab0143fc2288251377d0b355b1c78a30c1b55ac`
Captured 2026-11-07 UTC. Contributor-provided execution evidence, not an authenticated CI receipt.

## Observed built-runtime behavior

The real built `dist/entry.js gateway` ran with isolated HOME/config/state and signed raw WebSocket node clients. Pairing approvals used public Gateway RPCs. No mocks replaced dispatch, pairing storage, node registry, or transport.

| Step | Observed result |
|---|---|
| Replacement publishes 4096 free bytes | Accepted; operator `node.list` reads 4096, connected |
| Obsolete socket attempts 1024 | `UNAVAILABLE` / `PAIRING_CHANGED`, then close 4001 |
| Operator reads after obsolete closure | Still 4096 and connected: obsolete request had no effect |
| Replacement publishes 6144 | Accepted; operator reads 6144, still connected |
| Cleanup | Clients stopped; isolated Gateway exited 0 |

[Captured summary](runtime/summary.json) · [actual request/response and close trace](runtime/wire-trace.jsonl) · [Gateway log](runtime/gateway.log) · [candidate/build/input bindings](runtime/manifest.json).

## Reproduce

Build this committed candidate with `pnpm build:runtime`. The executed owner is `dist/message-handler-gSU5j5BZ.mjs`, containing the connection-scoped close; this is not a re-export. From the candidate checkout:

```sh
node --import ./scripts/tsx.mjs /path/to/driver.mjs "$PWD" 13b077c8432ced4c058e11b9a792bc9d81e87a77 dist/message-handler-gSU5j5BZ.mjs /path/to/new-output-directory
```

[Executed driver](driver.mjs) uses the maintained signing helper. It verifies candidate/build identity and source cleanliness, hashes entry/owner/helper/driver before execution, and rechecks them after. Generated credentials and private runtime databases are intentionally not published. Driver bytes match the runtime manifest. The captured launch PATH was additionally redacted for local home-directory prefixes; no scenario was rerun or result changed.

## Focused verification and review

- **87 tests / 4 files passed**, including real-WebSocket replacement recovery, pairing publication changes, unavailable pairing state, and same-connection promotion. [Log](checks/focused-tests.log)
- Targeted Gateway-server test typecheck, four-file lint, formatting, diff check, and staged test-line ratchet passed. The 149-line allocation matches net new regression/support lines without changing the shared scalar. [Results](checks/results.json) · [ratchet](checks/test-budget.log)
- `pnpm build:runtime` exited 0. Its report-only Control UI size warnings are retained; this PR changes no UI source. [Build log](checks/build.log)
- **One selected behavioral mutant killed:** reversing the registered-connection comparison makes all three close/preserve assertions fail; the unmutated isolated baseline passed all three. This is not a whole-suite mutation score. [Summary](mutation/summary.json) · [patch](mutation/mutation.diff) · [baseline](mutation/baseline.log) · [mutant](mutation/mutant.log)
- [Independent native review](independent-review.md): no P0–P2 production findings; the test-budget finding was resolved and checked. Local autoreview failed authentication and produced no review; [failure](attempts/autoreview-unavailable.log) and [status](attempts/autoreview-status.json) remain explicit. Final-head hosted review and CI are separate GitHub records.

Commands: `node scripts/run-vitest.mjs src/gateway/server.node-pairing-replacement.test.ts src/gateway/server.node-pairing-publication.test.ts src/gateway/node-registry.test.ts src/gateway/server/ws-connection/authenticated-request-dispatch.node-recovery.test.ts --maxWorkers=1`; `node scripts/run-tsgo.mjs -p test/tsconfig/tsconfig.core.test.gateway-server.json --incremental`; repository `run-oxlint.mjs --tsconfig config/tsconfig/oxlint.core.json` on the four changed code/test files; `check-test-lines-ratchet.mts --base 7ab0143fc2288251377d0b355b1c78a30c1b55ac --no-merge-base --staged`.

## Earlier attempts and limits

The [development red baseline](attempts/baseline-red.log) exercised the new stats test against unpatched production: it received `PAIRING_CHANGED` but timed out waiting for close. Earlier operator/node authentication fixture errors and the missing unit-fixture lifecycle owner are retained in `attempts/`; they are not product reproductions. Test formatting and fixture refinements followed the red run before the final candidate.

The first mutation checkout hit `/tmp` inode exhaustion; its first main-filesystem baseline lacked UI workspace dependencies. Those are setup failures, not killed mutants. Both are retained in `attempts/`.

This is a bounded Gateway repair for an obsolete connection, not a claimed reproduction of the original Android incident's initiating network race or a physical Android UI/reconnect demonstration. The raw clients deliberately do not auto-reconnect. Transient lookup failure and same-connection promotion are covered by focused tests, not fault-injected in the standalone run. No global coverage/CRAP score is claimed. No live Gateway, external channel, model request, deployment, or merge was used.
