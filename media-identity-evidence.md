# Registered media-provider identity: scoped evidence

## Candidate identity

Source head: `dbdb5900ddc31ff2502df187c247c3c67be3a01a` on genuine upstream ancestry `d27139b2b220327d6f65b659c6fba0b0110fad97`.

Reviewed patch SHA-256: `329e3cda8f445ac330c2f2c7bb9b57ab2dac16f1400e6bcc83f9113072344d32`. All 21 changed remote files match the independently reviewed v2 file hashes. Publication changes no implementation bytes. Local verification used official source archives with local snapshot commits; those synthetic histories were NOT pushed. The remote branch starts at the genuine upstream commit. No production deployment or merge.

## Problem and synthetic reproduction

Historical media normalization maps `gemini` to `google`. That remains useful when unclaimed, but an explicitly registered native provider or enabled model-provider manifest can own `gemini` independently. Before the fix, registry construction/lookup could combine hooks from both providers, and automatic image selection could check the wrong provider's auth or dispatch the wrong handler.

Use two synthetic native providers, one with `id: "google"` and a video hook, the other with `id: "gemini"` and an image hook. Build the ordinary media registry with both registration orders. Looking up `gemini` must return only its own provider, never the Google video hook. With an enabled synthetic manifest declaring `providers: ["gemini"]` but no media hook, image dispatch must retain the generic `gemini` owner. With no distinct owner, legacy `gemini` lookup must still resolve to `google`.

The inbound regression creates a 16x16 synthetic PNG, runs automatic image-model selection and the actual `runProviderEntry` boundary, and asserts the selected provider, auth-selection provider, profile, result, and absence of calls to the Google hook. Network/model inference is mocked; this is NOT live channel-ingress proof.

The standalone image regression runs the image tool through its existing boundary with a captured metadata snapshot inside another ambient generation. Four cases cover captured/ambient owner presence: true/true, true/false, false/false, false/true. Dispatch must follow the captured snapshot in every case. Independent review found this generation-scope omission in v1; two cases failed before the correction, and all 13 image-tool cases passed after it. Final v2 independent code review found no blocking issue. This is code review, not a build or end-to-end acceptance claim.

## Executed results and provenance

- Original base `dbecd558192e86d1492de16ca21fa7963bb208a1`: initial ownership regressions failed for registration-order hook mixing, model-only ownership, and auth-selection identity. V2 correction red: 2 failed / 11 passed; green: 13 passed. V2 affected siblings: 100 tests / 5 files passed, exit 0, 46.28s. Targeted core lint, formatting and whitespace checks passed. These remain OLD-BASE results.
- Maintained publication base `d27139b2b220327d6f65b659c6fba0b0110fad97` plus exact v2: **51 tests / 3 files passed**, exit 0, 126.56s including compilation and wrapper completion. See `media-identity-maintained-tests.txt`.
- Exact command: `node scripts/test-projects.mts src/media-understanding/provider-registry.test.ts src/media-understanding/runner.vision-skip.test.ts src/agents/tools/image-tool.custom-provider-auth.regression.test.ts --maxWorkers=1 --reporter=verbose`.
- Maintained budget command: `node scripts/check-test-lines-ratchet.mts --base HEAD` against the unmodified archive snapshot; **6,446,198 lines / 6,446,198 ceiling / zero slack**, exit 0. Own allocation is exactly 248 net regression lines. Shared scalar is unchanged by this PR.
- Also tested exact v2 on fresh main `9e8cd4fd92667ece5743dc39e08be9a82504baee`: 51 tests / 3 files passed, exit 0, 127.36s. That newer base had 130 inherited test lines over its ceiling, confirmed against the untouched index. It was not chosen for publication. The maintained `d27139b2` commit is the official correction of the original 47-line debt; no custom ceiling correction was made.
- First newer-base launch stopped before tests because a workspace dependency link was missing. Existing read-only workspace links were restored, then the supported runner passed. No dependency install, proxy override, registry change or guard bypass was used for these publication checks.

## Remaining gates and retained failures

- **Targeted typecheck and full build remain unexecuted.** A normal owned frozen-lock installation previously encountered unavailable pinned registry tarballs and metadata over the configured network route. Borrowed dependencies support the documented direct Node test runner but do not meet the independent-install guard for typecheck/build. Exact-head hosted CI must supply the remaining compiler/build checks; no green CI is claimed here.
- **Built CLI/channel-ingress verification remains unexecuted.** The synthetic dispatched-image boundary does not establish a deployed Gateway or channel result.
- A Talk local-HTTP fixture failed with `TypeError: fetch failed` on both patched and unchanged original-base source. Baseline comparison exited 1 in 112 seconds. The failure is not introduced by the patch in that observed environment; exact network cause is unproven. No override of network policy was used. This failure was not rerun during publication.
- V1 complexity/mutation results are historical and not represented as newly measured v2 proof. Five of six bounded mutations were killed; the surviving alias-map fallback mutation was equivalent for nonempty alias values.

## Scope and simplification review

One identity decision is shared by registry construction, metadata selection, auth/routing, and execution. Existing generation scope owns retained-image metadata; no new lifecycle manager, credential store, inference adapter or provider integration is added. Unclaimed historical aliases retain their shipped behavior. New metadata-only identity discovery reserves declared model-provider names without loading plugin code. Registration-order, model-only, native-hook precedence and captured-generation tests cover distinct failures, not test-count targets.

Diff: 21 files, 486 additions / 70 deletions; net test growth 248, allocation 2, docs 2, production net growth 164. Growth is needed to propagate owner-aware normalization across existing consumers; no unrelated refactor or policy ceiling change.

## Fresh upstream overlap check

Fresh official main `9e8cd4fd92667ece5743dc39e08be9a82504baee` was 20 commits ahead of the original base. The complete comparison returned 262 files (below the 300-file API cap), none changing the candidate owners or scoped instructions/lockfile. Narrow searches for `normalizeMediaProviderId` and open `gemini media-understanding alias` found no same-defect open fix. Related open #189926 batches configured image catalog resolution; #190287 changes explicit CLI audio/video selection and configured fallback. Neither fixes registered media aliases. Searches are bounded, not an exhaustive guarantee.

All examples and outputs in this evidence use public core code and synthetic fixtures. Path placeholders replace local machine/workspace paths in the attached logs; assertion outcomes and failures are retained.
