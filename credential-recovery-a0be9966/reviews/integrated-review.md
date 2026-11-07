# Independent main-integration review

## Reviewed identity and result

- Candidate: `$HISTORICAL_CANDIDATE_REPO`, clean `fix/media-provider-identity-resume` at `93e40061e983fecd13b71b8ba503c05e60c76014`.
- Current-main integration baseline: `e814c50ed66c1c3849e596e32324c22100034f1c` (`origin/main`).
- Premerge first parent: `0827e1da77760a4f3f68d4ea8d9388d958d64e5a`.
- Result: **one actionable integration defect; no additional auth-owner integration findings**. This exact candidate needs the type-import correction below before acceptance. At final source observation the checkout remained clean at the reviewed candidate, so the correction was not yet present.

## Finding

### P1: Update the new identity module to the upstream provider-type location

Location: `src/media-understanding/provider-identities.ts:9`.

The PR-new module imports `MediaUnderstandingProvider` from `./types.js`. Current main moved that type to `./provider-types.js`; the complete current `types.ts` neither defines nor re-exports it. The main merge migrated existing consumers, including the manually resolved `provider-registry.ts`, but could not migrate this PR-only module. The resulting candidate has a nonexistent named type import and cannot pass TypeScript checking. Import the type from `./provider-types.js`, as the other migrated media modules now do.

This is established by source inspection of the importing line and both complete export declarations, not by a reviewer-executed compiler run. The implementation owner was notified immediately; no reviewer source edit was made.

## Actual fresh-review coverage

This is an integration-focused assessment, not a claim to have independently re-reviewed every line of the whole 40-file PR from scratch.

### Media identity and current-main callers

- Reviewed identity-aware normalization, the new manifest-derived identity registry, native/override registry merging, configured-image capability inheritance, metadata defaults/priorities, and the capability-only registry.
- Traced changed normalized IDs through shared-entry capability inference, image/audio automatic selection, provider-entry dispatch, model-decision reporting, talk transcription selection, direct prepared-image runtime dispatch, and image-tool timeout/handler selection.
- Checked the prepared image runtime's captured metadata scope and exact-provider versus historical-alias lookup against retained-generation callers and their contract tests. Current main's type split is the one concrete incompatibility found.
- Compared the merge's overlapping media changes: the upstream request cancellation/authority propagation and extracted decision-format helpers remain present alongside identity-aware routing. Existing effect guards in image-tool dispatch remain in place.
- Inspected remaining one-argument media normalizer callers. Generic image transport alias fallback is confined to the existing MiniMax fallback; remaining image-tool alias heuristics and the OpenAI factory check did not establish a likely new integration failure.
- Read registry ownership/order/disabled-owner/legacy-alias contracts and captured-versus-ambient prepared-image ownership contracts. This was source review only, not an execution claim.

### Credential recovery and authority integration

A bounded independent subreview compared both merge parents and the integrated result for OAuth preparation, store/factory wiring, runtime reads, published inheritance, and credential-authority ownership.

- The already-reviewed repair paths remain unchanged from the premerge first parent.
- The overlapping `model-auth-provider-config.ts` integration preserves upstream inline-key cooldown and `sourceConfig` handling; both profile-projection callers retain credential-authority propagation.
- Authority continues into runtime models and current main's embedded auth-controller authorization-settlement/re-resolution loop. Config, cancellation, selection/account guards, and the final `assertProviderAuthAuthority(current)` remain before credentials escape.
- Relevant upstream state-read changes retain snapshot admission-identity checks. No auth-command or ownership contract was found dropped.
- The extracted credential-read factory remains bound to the existing scoped reader, without an additional mutable owner, cache, or authority source.

No actionable finding was identified in that auth-integration subreview. The unchanged recovery implementation and mechanical extraction rely on the earlier accepted `auth-review.md` and `extraction-review.md` in this directory; this report does not relabel those earlier reviews or test receipts as fresh execution at the merged head.

## Boundaries

Applied the ub-mode workflow proportionally to read-only review and used the simplification lens on ownership and integration seams. No tests, builds, source changes, Git mutations, installed-runtime changes, or remote mutations were performed by this reviewer or the bounded auth reviewer. The parent owns focused verification and package proof. The only output written here is this requested review report.
