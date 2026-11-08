# PR #194472 live behavior proof

### Real-agent OAuth proof — completed November 7, 2026

Tested unchanged published head `37b5e053951bd8e60f187ff508a93d9787d070b0`. The ordinary `pnpm dev` build and `pnpm dev gateway run` launched a separate loopback Gateway with disposable config, workspace, roles and sessions. Actual model inference used the Codex runtime and the existing native ChatGPT OAuth login (`appServer.transport: stdio`, `homeScope: user`); no API key, credential copy, synthetic inference, tool mock or production Gateway change was used. A new native thread was created, not a resumed live thread.

The shipped Gateway client's normal token handshake explicitly requested and received `operator.admin` (plus read/write/approvals). Through the public Gateway WebSocket API, `sessions.create` made a Full Access session and `chat.send` submitted the request: fetch GitHub's public `octocat` profile, then use `openclaw` to preassign that login to the existing contributor role. The model selected and executed the lookup and both setup calls. Tool and provenance evidence was retrieved using `chat.history`, not reconstructed from assistant prose.

Sanitized recorded sequence (UTC):

```text
2026-11-07T07:03:26.824Z web_fetch: HTTP 200; resultContentSource=network
2026-11-07T07:03:33.253Z openclaw call: turnTainted=true
2026-11-07T07:04:14.919Z openclaw result: done: config.set
2026-11-07T07:04:17.687Z openclaw call: turnTainted=true
2026-11-07T07:04:28.468Z openclaw result: readback confirms octocat = contributor
2026-11-07T07:04:31.121Z agent.wait: status=ok; rerouted=false
```

The first `openclaw` result reported:

```text
[openclaw] running: config.set
Updated gateway.roles.assignments.byGithubLogin.octocat. Change will apply without restarting the gateway.
[openclaw] done: config.set
```

The model then requested a separate read-only setup-tool verification. Its result confirmed the saved `octocat = contributor` mapping and unchanged existing mapping, role definitions and default role. Independent disk readback found:

```json
{"existing-fixture":"contributor","octocat":"contributor"}
```

The complete post-write config equals the original config plus this mapping, passed through the existing `stampConfigWriteMetadata` function. This matters: the minimal fixture also acquired the normal selected-model allowlist and migration/version metadata on first write. Those automatic additions are disclosed, not hidden under a claim that only one JSON field changed. Every other authored setting is preserved. Both delegated calls retained `turnTainted: true`; the public lookup remained `resultContentSource: network`. The sole recorded `exec` item was native Code Mode wrapping `tools.web_fetch`, not a shell command or file mutation. There was no extra user prompt, auth fallback, live-account role assignment, external message, or production restart.

Post-run artifact checks:

```text
PASS: HTTP 200 lookup precedes both tainted OpenClaw delegations
PASS: delegated config.set, setup readback and independent disk readback agree
PASS: complete config matches requested change plus canonical write migrations
PASS: no shell/file mutation shortcut; terminal status ok and no reroute
PASS: isolated Gateway shutdown completed cleanly
```

Earlier failures remain part of the evidence: the API-only experiment never reached inference; the first OAuth run did reach real inference but generic `gateway call chat.send` requested only `operator.write` and correctly failed owner authorization. No mapping was saved by that run. The successful run used the same production candidate with properly admitted administrator scope, not a sender-flag override or an authorization bypass.

This closes the requested live lookup → delegated assignment → persisted readback evidence gap. It does not claim subsequent GitHub login, deployment, passing CI, or maintainer security approval. Current-head approval remains separate. No code changed in collecting this proof.
