# Credential-catalog upgrade reproduction

**Status: adapted, unexecuted source.** These scripts consolidate the corrected fixture configuration and the successful CPU-model route observed in the retained evidence. The complete new setup script has only been syntax-checked and its inert plan printed. Do not describe it as the exact executed historical recipe or as a passing reproduction until an actual run produces its own receipts.

The original executed `launcher-driver.py` is retained unchanged for provenance. Its `prepare` mode contains the obsolete `agents.defaults.memorySearch` key and failed 4B GPU choice; **it is not the successful setup recipe**. Historical setup was corrected before the successful Gateway run. `recipe-provenance.json` distinguishes the attempted and successful executed sources from these adapted scripts and records their separate SHA-256 hashes.

## Files

Keep these together:

- `reproduce-setup.py`: full fresh stable setup and optional exact-head candidate continuation.
- `reproduce-stable-seed.mjs`: synthetic fixture creation using published stable exported owners, with lifecycle cleanup. It does not impersonate a model request or create the proof conversation through helpers.
- `live-proxy-cpu.mjs`: the unchanged, historically executed auth-checking HTTP receiver and OpenAI-to-Ollama CPU streaming adapter. All assistant tokens come from actual local inference.
- `candidate-proof.py`: actual launcher Doctor/Gateway/agent/logout verification against the same retained stable state.

## Prerequisites

Use a supported Node.js runtime, npm and Python 3. Have `qwen3:0.6b` already installed in a local Ollama-compatible service listening at `127.0.0.1:11434`. The recipe does not download models, restart services, alter daemon configuration, use remote credentials or invoke a cloud model. It uses `num_gpu: 0` per inference request to avoid the observed Vulkan failure. Synthetic API keys are only auth selectors checked by the task-owned loopback proxy.

For candidate continuation, prepare a clean checkout with the requested full 40-character commit SHA and a completed build whose `dist/build-info.json` names that SHA.

## Inspect without changing state

```sh
python3 reproduce-setup.py plan --root /path/to/new-empty-proof-root
```

`plan` creates nothing and executes no candidate code. The output root must be new/empty for `run`, and must not be the retained historical proof directory.

## Run the full sequence

```sh
python3 reproduce-setup.py run \
  --root /path/to/new-empty-proof-root \
  --candidate /path/to/clean-built-candidate \
  --expected-head FULL_40_CHARACTER_COMMIT_SHA
```

The script performs these concrete steps:

1. Download the observed published stable `openclaw@2026.10.3` tarball and verify its pinned SHA-512 integrity; install it in an isolated npm consumer package, not the extracted publisher package with devDependencies.
2. Confirm the installed CPU model responds, create task-owned loopback proxy/Gateway endpoint files, and write the corrected config using `memory.search`, the `qwen3:0.6b` model, isolated workspace/state and disabled plugins.
3. Seed the canonical synthetic profile and generated legacy credential copies through the actual stable `AuthStorage` and catalog persistence exports. The authored root contains a distinct manual key. Recovered credentials have no profile yet.
4. Start the actual stable `openclaw.mjs gateway run`, submit the actual Gateway-backed agent turn, then read its retained history with `chat.history`. The generated assistant response is not scripted.
5. Stop stable and record package, launcher, config, authored-root and database observations. Preserve that same state.
6. Invoke `candidate-proof.py` on that state: actual launcher Doctor migration; canonical and recovered turns; offline logout; candidate restart; authored-root-only success; revoked canonical zero-I/O refusal; final retained history and read-only state checks.

Every command has its own status/log receipt. Readiness bounds and model timeouts remain explicit. A failed step stops with retained evidence; the script does not silently repeat Doctor, reset state or relabel retries passing.

## Separate stable and candidate stages

Omit `--candidate` and `--expected-head` to stop after successful stable setup. This intentionally leaves the task-owned auth proxy running for the candidate stage; its PID is in `live-proxy.address.json` and `reproduction-run.json`.

```sh
python3 reproduce-setup.py run --root /path/to/new-empty-proof-root
python3 /path/to/new-empty-proof-root/candidate-proof.py run \
  --candidate /path/to/clean-built-candidate \
  --expected-head FULL_40_CHARACTER_COMMIT_SHA
```

After the split candidate stage, stop only that recorded proxy PID. The automated combined route stops it itself after candidate success. Never point either recipe at the operator's real OpenClaw state.

## Provenance limits

The adapted seed avoids the failed historical helper's model-registry lookup and uses explicit lifecycle cleanup. It creates the real retained session only through the launcher/Gateway. The generated catalog endpoint is normalized to the active auth proxy, while its legacy `fixture-model` inventory remains a fixture; configured runtime metadata selects the real local qwen model. These are disclosed recipe adaptations, not claims that the adapted sources already ran.

Original failed helper, invalid-config and GPU receipts remain historical failures. The observed successful stable CPU run and the future candidate run have their own independent captured evidence. See `public-evidence-plan.md` for the minimum sanitized publication closure.
