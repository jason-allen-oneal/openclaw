# Session-memory capture evidence — #159826 / #181081

Final source: `18ea9065fdd8c1b300a9bce1952769a998b0a016`. This run exercises the maintainer's exclusive **atomic** publication refinement through the shipped Gateway, using a new build of the exact clean head.

| Boundary | Observed result |
| --- | --- |
| Reopen retained synthetic state | All **17** artifacts from the prior Gateway proof remain present with matching hashes and session provenance. |
| Six concurrent real `sessions.reset` requests | **23** complete files: six new files, one per departing session, each with the exact expected synthetic content and matching session ID/key/hash provenance. All prior 17 files and provenance remain unchanged. |
| Stop and restart the same built Gateway, then six more concurrent resets | **29** complete files. All 23 prior files/provenance remain unchanged; the second six captures again have distinct filenames and exact session/content bindings. Both Gateway exits are 0. |
| Independent verification | **12/12** new captures occupy distinct complete files; session IDs/keys match the recorded `sessions.create` responses, file timestamps fall within the corresponding reset request window, content hashes match SQLite provenance, and database `quick_check` returns `ok`. |

## Final-head records

- [Gateway request/response and persisted-state receipt](atomic-final/gateway-receipt.json)
- [Independent complete-file/session binding verification](atomic-final/independent-verification.json)
- [First Gateway output](atomic-final/gateway-first.log), [restart output](atomic-final/gateway-restart.log), [driver output](atomic-final/gateway-output.log), [command exit](atomic-final/gateway-command.json)
- [All 29 synthetic memory files](atomic-final/memory/)
- [Exact-head build exit and production artifact hashes](atomic-final/build-receipt.json), [build output](atomic-final/build.log)
- [Unchanged Gateway driver](atomic-final/gateway-runtime.mjs), [run wrapper](atomic-final/run-final-18ea.py), [independent verifier](atomic-final/verify-final-18ea.py), [build wrapper](atomic-final/build-final-18ea.py)
- [Current-head CI snapshot](atomic-final/ci-checks.json), [raw/published artifact hashes](atomic-final/artifact-manifest.json)

The shipped entry points are `node openclaw.mjs gateway run` and real loopback-WebSocket `node openclaw.mjs gateway call`. The unchanged driver creates sessions, injects distinct synthetic messages, and issues six resets concurrently. Its only source import claims an isolated test port. The separate verifier strengthens the original driver verdict with explicit file-count, distinct-file, complete-content, and source-session bindings. Its initial expected body included an extra trailing newline; the [recorded verifier correction](atomic-final/verifier-format-correction.json) requires the exact complete document with the canonical single trailing newline and passes against the unchanged runtime artifacts. No production code, timeout, lock, or filesystem operation is replaced or shortened.

The exact-head `qaRuntime` build uses Node 24.22.1. Dependencies were initially copied into this isolated checkout from the already frozen archive-proof install after verifying the package manifests and lockfile were byte-identical. The first build stopped before product execution because the root-only copy lacked workspace canvas dependency links; that [setup failure](atomic-final/initial-build-setup.receipt.json) and [log](atomic-final/initial-build-setup.log) are retained. The checkout's supported `pnpm install --frozen-lockfile` [completed in two seconds](atomic-final/install.log), materializing its own workspace links before the successful build. No dependency resolution or source change was made.

A preliminary shared clone could not read an old object in the donor's shallow Git history; it failed before build or runtime. The successful build used a fresh shallow clone of the public PR branch and verified the exact head. No donor checkout or dependency install was modified.

The old Gateway processes had exited before the prior synthetic fixture was copied to this isolated host. Python's safe tar extractor discarded directory modes, so the first startup correctly rejected the copied client directory. The runner restores the original directory modes (including private 0700 client custody) after safe extraction. The next startup correctly required credential migration for the relocated fixture; the supported [Doctor fix](atomic-final/doctor-receipt.json) prepares that synthetic state before the successful run. Both [directory-mode](atomic-final/directory-mode-setup.command.json) and [migration](atomic-final/migration-setup.receipt.json) setup failures are retained, and no session reset ran in either failed admission attempt. No product guard was disabled.

The driver rewrites task-local configuration for its new workspace/port. The independent verifier compares all original 17 artifact hashes and complete provenance records against the [pre-transfer receipt](atomic-final/prior-input-receipt.json), then checks preservation after both runs. Private home paths and configured model identity are redacted only in published copies; raw evidence remains local. Synthetic content and executable loopback constants are preserved.

## Prior failure and supplementary controls

[Prior-head proof](prior-head-proof.md) preserves the baseline observation: six real concurrent resets produced only five files while logging six successful saves. It also retains the earlier interrupted-publication/recovery control and focused regression results. Those runs remain explicitly bound to their original source heads; the final-head Gateway run above supersedes the old live-proof gap for atomic publication.

This proof does not invoke a model/provider or an external channel, nor claim network-filesystem or multi-Gateway coverage. It exercises the changed capture owner through actual Gateway session reset, transcript, filesystem, SQLite provenance, and restart boundaries.
