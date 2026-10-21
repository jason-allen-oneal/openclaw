# Reproduction — adapted, not an extra captured run

The captured logs/receipts are execution evidence. This consolidated recipe is **adapted and unexecuted**; only syntax was checked. It includes corrected readiness/profile handling and the actual local no-auth contract. Historical drivers are preserved separately and intentionally retain the assertions that failed.

Use supported Node.js, Python 3 and npm, a new empty task directory, and an existing local Ollama service at `127.0.0.1:11434` with `qwen3:0.6b` installed. No model download, service restart or cloud credential is required. Prepare a clean candidate checkout at `4382a3109df1849e0fb0a6350c5f279d080756f8` with its repository dependencies and exact-head build:

```sh
node --import ./scripts/tsx.mjs scripts/build-all.mts sourcePerformance
```

Keep all files from this `drivers/` directory together. First run **stable-only setup**; do not use the historical setup script's optional `--candidate` route, which dispatches the old combined assertions.

```sh
python3 reproduce-setup.py plan --root /path/to/new-empty-proof-root
python3 reproduce-setup.py run --root /path/to/new-empty-proof-root
python3 reproduce-candidate.py \
  --root /path/to/new-empty-proof-root \
  --candidate /path/to/clean-built-candidate \
  --expected-head 4382a3109df1849e0fb0a6350c5f279d080756f8
```

Stable setup pins the published 2026.10.3 package integrity, installs an isolated consumer package, seeds synthetic credentials/catalogs through published storage owners, and creates the conversation through the actual launcher/Gateway/model. It stops stable while leaving the task-owned proxy available for the candidate. The candidate recipe runs actual Doctor, canonical/recovered turns, offline named-profile logout, supplemental built-SDK authored-root inference, Gateway restart, retained history and rejected logged-out local request. It never substitutes a helper-created conversation or response.

The SDK companion is intentionally pinned to this exact PR head. It reads the original authored file with empty in-memory canonical auth and invokes the real built LLM client. This is not a claim that the embedded Gateway admits authored-root-only credentials: that unchanged boundary rejects before registry fallback. Configured loopback providers permit credential-free requests; the receiver must reject them and never receive a revoked key. Zero receiver HTTP requests is not the local fixture's contract.

Every failure stops with logs and state retained. Inspect before resuming; never reseed a failed directory to hide a failure. Stop only the proxy PID recorded in this new directory's `live-proxy.address.json` after completing/abandoning the attempt. Never run any recipe against operator state or the retained original proof directory.

`launcher-driver.py` and older `candidate-proof*.py`/`candidate-tail.py` are historical provenance, not passing turnkey recipes. Initial invalid config, GPU failure, readiness/checkpoint assertions, unnamed-profile refusal, root-only Gateway rejection and invalid zero-I/O expectation remain documented in the evidence README. New adapted source hashes are in the final publication manifest; historical source hashes remain in their original receipts.
