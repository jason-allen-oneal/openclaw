# Observer token-sharing native proof

Candidate: `16d08c5bc9b39a67aa539e2da12a646e98421fec` (PR #196344). Product source unchanged; the proof driver is outside the submitted diff.

Command: `node scripts/run-vitest.mjs extensions/codex/src/app-server/observer-token-sharing.native-proof.test.ts --maxWorkers=1 --pool=forks`. Exit **0**, one case passed, 33.79 seconds including reused compiler preparation; native case 11.414 seconds.

## Observed boundary

- Real managed Codex **0.164.0** process, selected model `gpt-6-luna`, private ephemeral thread.
- Real completion/auth-handoff/relay owners and physical loopback TLS receiver. Receiver observed one authorized request to the selected Responses route, with neither max-output-token nor temperature field.
- Native response reached completion as `OBSERVER_NATIVE_OK`.
- Strict explicit sampling rejected before a second native spawn or upstream request.
- Native process exit joined; private Codex home absent afterward.

## Limits

OAuth grant/refresh and provider response were synthetic. Provider URL was redirected to an actual loopback TLS receiver; no real provider inference was attempted. Host and child used the same external-blocking/loopback-only proxy fixture. This is **not** a shipped Gateway assessment, a real subscription-grant acceptance, or latest-stable upgrade proof. Those remain required by the hosted review. Existing committed boundary tests separately cover API-key sampling and host/harness propagation.

## Prior attempts

Seven setup/qualification attempts preceded the passing execution; none is claimed as passing. The first three exposed missing dependency-owner links in the new worktree (UI, extension owners, then workspace packages). The fourth required host-owned SQLite admission and was corrected to the repository live-test forks pool. The fifth used an explicit native binary rather than managed package selection; the sixth mismatched host/native proxy environments; both were refused by preserved product guards. The seventh selected historical model `gpt-5.4`, absent from the current native catalog. The passing fixture uses the current observer model `gpt-6-luna`. No production source or guards changed. Raw failure logs remain retained locally; machine-specific path strings are not included in this public summary.

The source driver imports maintained helpers from the exact candidate checkout. Place it at the path in the command to reproduce. `receipt.json` records hashes of the executed driver and original/redacted passing log.
