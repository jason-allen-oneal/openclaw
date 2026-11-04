# Reviewed credential repair — rebuilt installed proof passes

## Exact candidate and status

- Local commit: `9db22c6cf27118f32f27ee549eb65332ca9958b5`.
- Tree: `7559ee4f28e2b24a58e3ec1fb6b9075433e14b8c`; parent: published `e33d13d69b1447e7c4e402f8d6727431e67503a1`.
- Exactly the six independently reviewed files were committed. All source hashes still match `credential-authority-repair-freeze.json` after the commit hook and build. Checkout `$CANDIDATE` is clean.
- Commit metadata is preserved in `credential-authority-repair-commit.txt` so the sole publisher can retain this exact identity. No remote publication or merge occurred.
- Public package build succeeded in **674.64s**, including maintained tarball integrity checks. UI size warnings remain in the build log; no budget was changed to suppress them.
- Tar SHA-256: `76dccdf6bf2d84e0d614499bf7b3f4f5030668b906eab60ce0baedb14b48ddd8`.
- Build-info records the exact repaired commit. **16,865 dist/launcher files** were compared byte-for-byte with the tar after isolated installation; all match. The repaired authority-owner marker is present in the package. Private QA paths are absent.
- Installed only in the existing isolated proof prefix, resolving to `$PROOF_ROOT/fresh/prefix`. The maintained `openclaw_e2e_install_package` helper performed the external package-manager install. Production was untouched.

## Actual installed-runtime result

The corrected driver exited **0**, **175.13s**, at **2026-11-04T06:43:33Z**. Both model-only and native cases:

1. Used real host-created `view_image`, public plugin SDK and installed CLI/Gateway.
2. Passed the positive image control at the Gemini fixture endpoint with the synthetic Gemini key and canonical 85-byte PNG (`a86fd9b9eb25dcd6531ae4a19ec3e05bcfe08acb907a5154310d5df94b8e5d1a`). No Google receiver request occurred.
3. Retained the tool in an active captured attempt, then used live public `models.authLogout` to remove all Gemini API-key profiles. `gemini:proof` was removed and `abortedRunIds` was empty; no blanket cancellation was introduced.
4. Confirmed zero remaining Gemini API-key profiles through live `models.authStatus`.
5. Released the retained tool. Both refused the removed/replaced credential and settled successfully, with **zero HTTP after logout** during that retained call. The native callback was actually entered.
6. Read the persisted request through public history. This does not expand the prior assistant-transcript-preservation claim.

The original e33d red proof remains unchanged. This run supplies the corresponding repaired installed-runtime green proof; it does not claim the original bug was introduced by the image PR.

## Fresh-request diagnostic assessed explicitly

Each separate fresh-after-logout process sent one image request using **`custom-local`**, not the removed synthetic credential, a profile-ID literal, or an unknown bearer. The synthetic receiver rejected each with **HTTP401**; the CLI returned failure. This is the existing local-provider/no-auth marker path, not authenticated access after revocation. `CUSTOM_LOCAL_AUTH_MARKER` is owned by `src/agents/model-auth-markers.ts`; local route eligibility is maintained in `src/agents/model-auth-provider-config.ts`. This patch deliberately preserves that behavior. Do not summarize this as “all fresh requests emit zero image bytes”: they do not. The zero-I/O claim is specifically the retained revoked-credential call.

## Preserved fixture failure and bounded correction

The first rebuilt installed attempt exited1 after **64.42s**: its inventory observation used offline-only `openclaw models auth list` while the owned Gateway was live. Credential custody correctly refused it. The positive control and live logout had succeeded, but the retained call was not released, so this was **not a revocation verdict**. The owned Gateway was stopped and the failed receipt/logs retained.

The v2 driver changes only that observation to public live `models.authStatus`, rejects unavailable/malformed inventory, and writes separate v2 logs. The actual logout, positive control, retained call, refusal and zero-HTTP checks are unchanged. No product source or installed package changed; no rebuild/reinstall was repeated. The original and revised driver hashes and precise reason are in `credential-proof-driver-v2-change.json`. This small executed driver delta needs parent receipt review before public evidence acceptance.

## Evidence and remaining work

`installed-credential-repair-summary.json` is the compact observed result. `installed-credential-repair-evidence-manifest.json` binds 13 source/build/install/driver/proof artifacts with SHA-256. Raw logs and both attempts remain under `$PROOF_LOGS/`; the manifest is a local handoff, not a claim of public availability. Do not export isolated auth/config databases or raw Gateway logs.

All owned processes settled; isolated Gateway port44932 is closed. Source is clean. No unrelated suite was repeated.

Next: parent reviews the receipts and live-inventory driver delta; the existing sole source owner publishes the exact reviewed commit plus sanitized immutable evidence, preserving newer maintainer changes; collect new-head CI and the actual reviewer verdict. Prior stable-upgrade/lifecycle proof remains separately scoped to e33d and its disclosed limits; this task did not run a new full stable-upgrade sweep. The user's done gate remains open until publication, required CI and reviewer acceptance are verified.
