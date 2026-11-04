# Lifecycle / installed-product proof — completed follow-on, credential gate fails

## Outcome

Exact published head **e33d13d69b1447e7c4e402f8d6727431e67503a1**, clean native source, no production behavior changes. Original six-case suite and green hosted CI were not repeated. All new owned CLI/Gateway processes are settled. The overall done gate is **not met**: actual credential revocation failed in both retained model-only and native image paths. Attribution to the patch is **not established**; this is current-head execution evidence, not a claim of an introduced vulnerability.

## Confirmed current-authority finding

Both tests use the real installed public package, public plugin SDK, actual host-created `view_image`, real live Gateway `chat.send`, and ordinary `models.authLogout` RPC. No private auth writes, forged metadata, ALS substitution, runtime exports, or policy bypass.

1. Save a synthetic Gemini API key with normal `models auth paste-api-key`; configure a real provider-profile reference.
2. Positive control sends the exact85-byte PNG and correct Gemini synthetic key only to its loopback endpoint. Native case additionally records the actual Gemini native callback; model-only records zero native callbacks.
3. Real Gateway attempt constructs and retains its image tool, captures genuine prepared metadata, and holds on a file barrier. Unique captured session key is verified; host remains active.
4. `openclaw gateway call models.authLogout --json --params '{"provider":"gemini","credentialType":"api_key","agentId":"main"}'` succeeds, reports every Gemini API-key profile removed, `abortedRunIds:[]`, and no warning.
5. Only after that response, release the held attempt and invoke its existing tool. **Both modes physically transmit the removed synthetic Gemini bearer and canonical image.** Native callback trace has one entry for control and one after logout. The tool resolves successfully; the harness deliberately raises the failed invariant afterward.

Receipts:
- `installed-credential-revocation-v4-progress.json`: model-only; removed `gemini:default` and `gemini:proof`; one post-logout old-key request; driver exit1.
- `installed-credential-revocation-native-progress.json`: native; real callback instrumented; old-key request after confirmed removal; final phase `revocation-violation-reproduced`, exit1. Its endpoint rejects unknown credentials with401.
- Fresh post-removal differential does **not** use the old synthetic key, but still sends an unknown bearer and image; authenticated native probe rejects401/command exit1. That is a separate observed I/O limitation, not proof that fresh requests correctly fail before I/O.

Do not publish this as green credential-revocation proof. Existing closed-host refusal and provider-retirement refusal do not cover it.

## Other NEW coverage completed

| Boundary | Observed result |
|---|---|
| Real provider-generation overlap, both ownership directions | Supported config publication replaces provider while A is retained; B admitted through real Gateway request; same PID, deferred cleanup. Exact A tool invoked inside B refuses `Plugin image-lifecycle-provider is retiring` before HTTP. Original A/A and new B/B controls succeed. |
| Scope of overlap proof | Adversarial supported SDK-boundary refusal, **not ordinary channel A/B reachability**. Distinct actual owner maps/source roots; no synthetic metadata. First direction passed in a suite whose later reverse assertion failed; corrected reverse-only exit0/1pass. Raw failure preserved. |
| Public candidate package | Maintained normal `package-openclaw-for-docker.mjs` build+validation exit0,823.29sec. No privateQA contents. Tar SHA256 `3dd744059991c931abc68f3f4ef0c4b4cff6fb87a74b9295a435b35554b84d84`,110810456bytes,19,629 entries; build-info exact e33d. |
| Fresh installed product | Real npm prefix install; real public plugin install; model-only and native image controls pass, exact image/key, zero competing Google HTTP and correct native trace. |
| Latest stable transition | Official npm latest2026.10.10/CLI commit7dc3350, authentic registry SHA512 verified. Same prefix/state transitioned to candidate e33d via maintained external-package-manager helper, verified backup, real old Gateway stop, fresh Doctor. No in-process self-update claim. Same semver but different genuine artifacts/commits. |
| Preserved upgrade settings/data | ImageModel, media settings, provider connections and selected unrelated config unchanged before reconfiguration; real post-upgrade image succeeds. Gateway history retains original user message plus new request, same session key/id/start time/model. |
| Upgrade limitation | Custom fixture returns assistant text but does not transcript-commit it. Final original assertion expected an unsupported assistant transcript entry and exited1. Separate executable observation verification exits0 for the actual existing user/session data and settings. No claim of preserving absent assistant transcript data. |

## Retained failed setup and verification receipts

All failures remain under `$PROOF_LOGS` and selected sanitized copies:
- Original package-wait prerequisite timeout; no upgrade had yet occurred.
- Candidate Doctor/plugin install correctly refused inherited group-write cache ancestry. Only owned proof roots moved by same-filesystem rename to private0700 ancestry, with original path aliases retained. Host cache and production permissions unchanged. Supported Doctor `--fix --force` confirmed that owned workspace realpath move; no safety guard disabled.
- Fresh driver accidentally reused the before-settings artifact filename. Fresh snapshot preserved; original pretransition last-good config (mtime05:36:21, byte-equal then-current config) recovered the upgrade projection. Initial continuation had independently checked original projection before transition.
- Default-profile auth CLI correctly refused divergent installed service state without writes. Ordinary named isolated profile fixed the intended service namespace; production service untouched.
- Offline-only logout CLI refused the active Gateway. Correct public live mutation is `models.authLogout`; no bypass.
- Targeted removal of only `gemini:proof` left the valid Doctor-migrated `gemini:default` profile; continued I/O was therefore not yet a revocation defect. Public auth inventory establishes that. Final tests remove **all** Gemini API keys and still reproduce old-key I/O.
- Public build retained an existing UI gzip size warning but package validation/build command exited0.

## Binding, evidence, next action

- `source-exact-published-head.json`, `public-package-identity.json`, `installed-candidate-artifact-binding.json`, `lifecycle-upgrade-final-receipt.json` bind source, tar and both installed products.
- `lifecycle-executed/`: prior sanitized lifecycle fixture/receipts and export hashes.
- `installed-executed/`: sanitized installed drivers, failed/passed receipts and manifest with original/exported SHA256. Root labels need substitution for replay; no config/auth databases or Gateway tokens exported.
- Native `$CANDIDATE` is clean at e33d, builds/deps reusable. Public tar and owned state roots are retained; no active test runner. Original cache-root paths are symlinks to `$PROOF_ROOT/{installed,fresh}`.
- Potential review entry points (inference, not established root cause): `prepareOpenClawTools` captures prepared auth store; `runImagePrompt` carries that store and snapshot; `resolveImageRuntime` uses the retained stores/config for `getApiKeyForModelCore`. Lifetime checks passed while credential authority had changed.
- **Next executable work:** independently review final credential reproduction and source attribution/current upstream; coordinate a focused current-auth-authority repair, preserving captured provider identity. Use the retained native/installed harness and rerun these targeted cases on the repair. Then bind rebuilt artifact/evidence to repaired head and get hosted CI/reviewer reassessment. No publication or new reviewer request by this worker.

Last actually read hosted verdict for e33d is Gold3/6 (comment updated05:05:36), not Platinum. Parent/source owner may have newer review state; use its accepted readback. All production, merge, new-tab and broad-Actions restrictions preserved.
