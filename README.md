# File-tool workspace recovery: exact-head runtime evidence

Final PR head: `d0c37b128383e05031f639ab5c5dd04acb9222ca`.

Runtime execution head: `45e8df9c1287e5d82b6f295b3c01b39c0d10faae`. The only later change corrects one stale UI test heading to match unchanged production copy. The [reuse receipt](ui-heading-repair-receipt.json) verifies all recorded runtime/source hashes remain identical; no rebuild or runtime rerun on the final head is claimed. The affected production HTTP/browser suite passed all three tests ([log](ui-heading-repair-test.log)).

This captures the **shipped CLI and unmodified production file tools**, with a
**scripted loopback model transport** selecting deterministic calls. It is not
proof of real-model reasoning, autonomous recovery, or a `sessions_spawn` call.
The two workers are separately launched through supported `agent exec --cwd`.

## Observed behavior

| Actual tool | Coordinator bound to another Git repository | Correctly bound worker |
|---|---|---|
| `read` | Root escape with `sessions_spawn` / `cwd` recovery guidance | Returned exact read canary |
| `write` | Same diagnostic; no file created | Created exact expected bytes |
| `edit` | Same diagnostic; original bytes retained | Changed the intended block |
| `apply_patch` | Same worker-binding diagnostic | Changed only the intended file |

The driver independently hashes the target and coordinator files before and
after rejection, then checks complete final file contents after recovery. All
four rejected calls leave both repositories unchanged. Both CLI invocations
exit 0; the rejected run correctly records four tool failures, while recovery
records four successes. No shell tool, injected tool implementation, direct
factory invocation, HTTP `/tools/invoke`, fabricated tool result, or manually
written positive result is used.

## Inspectable evidence

- [Actual tool calls and results observed over the model transport](transport-tool-trace.json)
- [Independent phase outcomes and filesystem hashes](scripted-summary.json)
- [Rejected CLI result](scripted-rejected.stdout.json) and [diagnostics](scripted-rejected.stderr.log)
- [Recovered CLI result](scripted-recovered.stdout.json) and [runtime log](scripted-recovered.stderr.log)
- [Exact candidate/build/source/owner-bundle and executed-driver hashes](candidate-manifest.json)
- [Execution driver](run-scripted-cli-proof.py)
- [Failed prior attempts and limitations](failed-attempts.md)

The public driver replaces its local checkout default with required
`CANDIDATE_REPO`; it has not been rerun after that portability edit. The manifest
retains the original executed-driver hash; [public hashes](SHA256SUMS.json) bind
these redacted/adapted copies separately. Local paths in captured logs/receipts
are redacted. The synthetic provider key is not a credential.

## Verification

- 88 targeted tests passed: [10 linked-worktree/container tests](core-tests.log)
  plus [26 root-guard/patch and 52 Codex bridge tests](sibling-tests.log).
- [Madge: zero cycles](madge.log), resolving the named CI failure after a
  conflict-free integration of current upstream main containing #194496.
- Targeted core lint and agents-root typecheck exit 0; the earlier unrelated
  type errors did not recur on this candidate.
- [Runtime build exit 0](build-receipt.json), metadata matches candidate SHA.
  The build reports existing Control UI performance-budget warnings; no UI
  change is included in this PR.
- Fresh independent review of all seven PR files: no actionable P0–P3 findings.
  Diff SHA-256 `9f5e3afaac296fc1da3f3671c2194a4a2af83ae6e8409d83f2f4f886d8ac35b1`.

Final-head hosted CI and review acceptance remain separate from these local
receipts. No merge or deployment is represented here.
