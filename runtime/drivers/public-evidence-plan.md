# Public evidence preparation — not published

## Candidate execution

After a clean committed candidate has its exact-head build, run:

```sh
PROOF_ROOT=/path/to/proof-root python3 candidate-proof.py run \
  --candidate /path/to/candidate \
  --expected-head FULL_40_CHARACTER_SHA
```

`candidate-proof.py plan` executes no candidate code. The `run` route requires matching `dist/build-info.json` commit, clean checkout, unchanged stable config and authored root, stopped stable Gateway, and live task-owned proxy. It runs the actual `openclaw.mjs` launcher for Doctor, Gateway, session/model RPCs, agent turns, and offline credential logout. It records every command exit and stops the task Gateway before direct read-only SQLite observations. It does not reseed stable data or silently retry failed mutations.

The positive sequence is canonical credentials + retained stable history, then the recovered legacy-only profile. After offline logout of canonical and Doctor's imported manual profile, one candidate restart proves authored-root-only authentication continues to work while canonical auth is refused with zero physical receiver requests. This avoids mistaking Doctor's imported manual profile for proof of authored `models.json` fallback.

## Minimum sanitized evidence closure

Publish only after the candidate run passes and the parent reviews all contents:

1. `README.md` — exact candidate SHA/build identity, published stable version/integrity, observed behavior table, relative artifact links, command exits, and limitations below.
2. `stable-final-summary.json`, `candidate-result.json`, and `candidate-bindings.json` — hashes, exact-head linkage, result observations and provenance.
3. Successful stable command/process receipts and their actual output: `stable-live-cpu-turn.*`, `stable-history-inflight.*`, `stable-gateway-cpu.process.json`, `stable-gateway-cpu.log`. The history filename says "inflight" because it was launched while waiting, but its observed result contains the completed two-message conversation and no active run.
4. Candidate command/process receipts and corresponding outputs referenced by `candidate-result.json`. Include the negative auth refusal and final history, not just a green summary.
5. `candidate-before.json`, `candidate-after-doctor.json`, `candidate-after-logout.json`, and `candidate-final-state.json`. These are read-only compact state observations containing hashes, metadata, fixture-match booleans and synthetic inventory only, never database copies.
6. `live-proxy.requests.jsonl` and `live-proxy.responses.jsonl`, sanitized and reduced only to the exact observed stable/candidate receiver events referenced by the summaries. Include the complete selected request/response records, not reconstructed examples. Keep original raw file hashes distinct from selected public-file hashes.
7. Portable `reproduce-setup.py`, `reproduce-stable-seed.mjs`, `candidate-proof.py`, `live-proxy-cpu.mjs`, `reproduction.md`, and `recipe-provenance.json`. The new consolidated recipe is explicitly adapted and unexecuted. Keep the original `runtime-proof.mjs` and `launcher-driver.py` only as hashed historical setup provenance: their failed setup paths are not a successful reproduction recipe. Captured receipts are the executed evidence; original executed hashes stay distinct from adapted-source hashes.
8. Small failed prerequisite receipts/logs or a clearly linked appendix: `stable-seed-command.json` / `stable-seed.log`, initial invalid-config startup, and `stable-live-turn.receipt.json` / its failure output. Preserve the GPU failure event from receiver/Gateway logs. These failures must not be relabeled successful.

Before publication, replace task root, installation path, user path, hostname and machine-only identifiers in shared text with consistent descriptive placeholders; leave portable loopback endpoint constants executable. Inspect complete selected traces for unexpected private context or credentials. All intended model-auth values here are visibly synthetic. Do not publish full SQLite state, auth stores, package tarballs, dependencies, or the entire `state/` tree. The real local model runs had zero provider spend.

## Mandatory disclosed limitations

- Stable fixture auth/catalog data came through the published stable exported storage owners. The earlier helper harness failed before its model lookup; it is not passing runtime evidence.
- The successful user flow uses the actual launcher, Gateway, OpenClaw agent runtime, persisted session/history, and real local model. The loopback proxy validates synthetic auth and translates OpenAI streaming to native Ollama CPU-only streaming; it never invents assistant output.
- Initial 4B GPU model inference failed with host Vulkan `ErrorDeviceLost`. That failure is retained. The successful route uses the installed `qwen3:0.6b` model with CPU-only request options; no model service restart or production credential was required.
- The first isolated Gateway config used obsolete `agents.defaults.memorySearch`; the failed startup remains recorded, and the corrected fixture uses `memory.search`.
- A local exact-head pass does not claim hosted CI or ClawSweeper's acceptance; those gates require their own live observations.
