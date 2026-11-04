# Credential-authority repair — source candidate, not published

Base: `e33d13d69b1447e7c4e402f8d6727431e67503a1`. The focused code candidate is in `$CANDIDATE`; native build/dependency namespace remains owned by this task until final handoff. No production changes, commit, push, merge or browser action.

## Root cause and minimal repair

Static API-key/token profile resolution trusted retained store bytes after its physical owner removed/replaced the credential. It did not use existing `prepareAuthProfileCredentialRead`; the model-auth projection carried no authority. The candidate reuses that owner for persisted static profiles, checks before returning the key, and propagates the existing provider-auth-authority symbol through direct and provider-entry selection. The existing stream final-effect guard checks it after awaited transport/rate-limit work. Provider/plugin metadata selection is unchanged.

The assertion is selected-credential-specific, not a global store revision. Tests mutate another profile successfully without invalidating the selected profile. Removed entries with persisted-profile provenance cannot become runtime-only credentials. Setup/runtime-only/external CLI overlays retain existing semantics. SecretRef credentials compare their canonical reference against the same prepared materialization; no new resolver or state store was added. A retained credential replaced with different material is refused; a fresh request with the new store succeeds. The patch does not change local no-auth/literal classification.

## Current upstream preflight

Fresh main `076924b41ef2ad970642f566e9bf5e0e435ff2e9` has byte-identical implicated `oauth.ts`, `model-auth-provider-config.ts`, and `image-model-runtime.ts`. Latest release and npm are `2026.10.10`. Historical issue81987 and legacy-logout PR145585 do not fix this successful-logout/retained-image case. The source owner separately confirmed current PR head/no maintainer changes and maintained API-key logout semantics. Receipts: `$PROOF_LOGS/credential-upstream-preflight/`.

## Executed regression and checks

- Real-owner red: three removal/replacement cases fail on unmodified production source at the missing authority assertion (`credential-regression-red-v3.log`,97.87s including cold compiler).
- First candidate:3new cases+14existing OAuth cases pass (`credential-regression-green-v1.log`,108.12s).
- Final behavioral matrix:5new cases (API key/token × local/inherited owner, plus replacement recovery) and38existing profile cases pass (`credential-regression-green-v2.log`,50.36s). Each local/inherited removal case holds a real `complete` call at its rate-limit boundary, performs the actual auth-owner removal, then verifies no second provider dispatch. It also proves unrelated-profile mutation is tolerated. The only controlled wait is a narrow spy around the maintained rate-limit admission; credential storage/resolution/projection/final completion guard are real.
- Final exact new-file run:5/5 passed,exit0,21.82s wall (`credential-final-checks-receipt.json`). Final lint/format both exit0. All owned processes settled.
- Production typecheck `pnpm tsgo:core`:exit0. Matching test shard `tsconfig.core.test.agents-other.json`:final exit0. Lint source+test:v2 exit0; test-only final lint and format receipts are in the final checks receipt.
- Exact test allocation155 new LF, separate `static-profile-current-authority.txt`. Existing image allocation and shared scalar unchanged. Final ratchet:6,448,091/6,448,091,zero slack,exit0.
- `git diff --check`:exit0. Automated CRAP/duplication/mutation metrics have not been measured; do not claim them. Source simplification reuses existing owner/capability and adds no state, service, framework or new production file.

## Failed attempts preserved

Initial test setup tried a synchronous credential writer in a worker; it correctly refused admission. The second setup used the wrong unit-fast lane and correctly lacked a host owner. The new test is now admitted through the maintained database-worker file list. These are setup failures, not defect reproductions. Initial lint found redundant default type arguments; initial test types found omitted fixture baseUrl/content. All were corrected without weakening authority checks, and original logs remain. No failure was relabeled green.

## Independent review and installed proof handoff

`credential-authority-repair.patch` and `credential-authority-repair-freeze.json` carry the reviewable six-file delta. Parent notification hit the unavailable native relay; no duplicate reviewer was spawned. **Independent code review is required before commit/publication.** Original public package/head remains unchanged.

The targeted installed proof driver `$PROOF_LOGS/installed-credential-revocation-repair.mjs` is syntax-valid but UNEXECUTED. It reuses the prior real host/tool/logout protocol and isolated fresh-product prefix, runs model-only and native modes, records post-logout public auth inventory, and separately classifies `custom-local`/profile-id-literal/old-synthetic/unknown bearer values without exposing headers. It writes a new bounded `credential-authority-repair-proof` log directory and leaves old red proof intact. Do not execute it against the old e33d installed package and call it repair proof.

After review: coordinate exact-head publication/commit with the existing source owner, build the maintained public package from that reviewed head (reuse prior package command/dependencies), install ONLY into the existing owned isolated proof prefix using the maintained external package-manager helper, run the prepared driver, and bind tar/build-info/source/installed hashes to the repaired head. Preserve positive controls, zero post-logout image/key HTTP, all receipts and fresh local no-auth classification. Hosted required CI and actual Platinum-or-better review remain required. No original six-case acquisition/build repeats unless changed auth inputs justify targeted rerun.
