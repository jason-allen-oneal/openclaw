# Independent review — frozen credential-authority repair

## Disposition

**No blocking source findings. Accepted for the next rebuilt installed-runtime proof.** This is code/proof-driver review, not a runtime pass, publication approval substitute, or Platinum acceptance.

Read-only review covered the complete six-file patch against checkout HEAD `e33d13d69b1447e7c4e402f8d6727431e67503a1`, the surrounding physical credential-owner/read implementation, model-auth selection/projection, image runtime binding, and final stream effect guard. No source edits, test/build execution, browser actions, publication, production changes, or merges occurred in this review.

## Exact binding

- Patch SHA-256: `bc24ac7312889a03359636938cd4ccd8a23259ec9af572192ace7950fb7b8cde`.
- Freeze manifest SHA-256: `a8f705775a45f0a5375b59766059a8a9a342c0e9928540e3359caa0350fb5c07`.
- Prepared installed driver SHA-256: `0d4f2ee90c19368013e11e498897dc660d700bdbb2e6a801b4e066e79e35beed`.
- All six working-file SHA-256 values match `credential-authority-repair-freeze.json`; full Git status contains exactly the six declared files, with no unrelated delta. Neither HEAD nor source was mutated by this review.

## Reviewed contracts

1. **Selected persisted credential authority.** Static API-key/token resolution now uses the existing `prepareAuthProfileCredentialRead` owner rather than trusting retained store bytes. That owner retains both local and inherited physical dependencies, including an absent local slot that could later shadow an inherited credential. Persisted-profile provenance retains a reader after removal, so removal cannot silently reclassify that credential as runtime-only. The immediate assertion prevents returning an already stale key.
2. **No blanket logout cancellation.** Comparison is against the selected credential, not the whole store revision. Unrelated-profile changes therefore do not revoke still-valid selected credentials. Removed/replaced material is rejected; a newly loaded replacement can resolve normally. The change does not alter API-key-only logout's deliberate decision to leave unrelated work running.
3. **Delayed final effects.** Both direct profile selection and provider-entry profile bindings retain the existing provider-auth-authority symbol. The current image runtime carries that authority onto its bound model. The existing completion/stream boundary asserts it after awaited transport preparation and rate-limit admission, before invoking the provider. The regression test exercises that real boundary while controlling only the rate-limit wait.
4. **Existing special ownership.** Personal profiles use their existing retained physical reader. Setup/runtime-only credentials and external CLI overlays do not acquire a new persisted-store dependency. The patch changes neither explicit no-auth/literal classification nor provider/plugin selection. The SecretRef comparison preserves the prepared materialization only when the persisted canonical reference still matches, while comparing the remaining credential shape; it is not a new secret resolver or a proof of arbitrary external secret rotation.
5. **Regression scope and admission.** The five added cases cover API-key/token removal for local and inherited ownership, an unrelated-profile mutation, delayed dispatch refusal, stale replacement rejection and fresh replacement recovery. The existing database-worker admission list is used because real credential-owner writes require it. The allocation is separate and matches the new test's 155 LF; existing image allowance and shared scalar are unchanged.

The writer reports 57 distinct targeted cases plus passing types/lint/format/budget checks. Their logs/receipts were not rerun here. The reported early custody/lane setup failures are correctly distinguished from the later real-owner red reproduction; this review does not relabel earlier failures.

## Installed proof driver review and execution requirements

The prepared driver is suitable for the bounded **retained static-key logout** proof after rebuilding/installing the reviewed tree into the existing isolated prefix:

- It uses separate native/model-only registration and asserts route-specific positive controls with the synthetic Gemini credential and canonical image hash.
- It retains a host-created tool in an active captured attempt, performs real live `models.authLogout`, checks that the targeted profile was removed with zero broad run aborts, and reads the public inventory to require zero remaining Gemini API-key profiles.
- It releases the retained call, requires refusal and successful terminal harness settlement, and rejects **any** fixture HTTP observed after logout. Thus an unknown bearer or image-only request cannot count as a retained-tool pass.
- It retains diagnostic logs and the original red evidence instead of overwriting them.

Execution/report caveats (not source blockers):

- **Fresh-after-logout is diagnostic.** The separate fresh process records bearer categories and expected failures but does not assert a particular category. Inspect those actual records before concluding anything about fresh no-auth behavior. `custom-local` is intentionally distinct from `profile-id-literal`, `old synthetic`, or `unknown`; a fresh 401 is not authenticated access, and an exit-zero driver is not by itself proof that the fresh case was accepted correctly.
- Bind the rebuilt tarball, build-info, installed package and relevant source hashes to the exact repaired tree/head. The script does not itself prove that the old installed e33d package was replaced, so the build/install handoff must provide that binding.
- If a required result is absent, the driver's later dereference/outer catch fails closed; such a result remains a setup/collection failure rather than successful revocation evidence.
- The retained suite does not by itself prove every lifecycle/upgrade obligation. Reuse the separately accepted prior evidence only where repaired inputs and boundaries are unaffected, and disclose the known transcript-history limitation.

## Remaining gate

Run the rebuilt installed native/model-only proof, review its actual effects and source/package binding, then publish through the existing sole PR owner and verify exact-head required CI and the durable reviewer verdict. Current published Gold 3/6 is not the user's requested done gate.
