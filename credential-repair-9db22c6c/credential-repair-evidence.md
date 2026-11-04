# Retained credential authority: source-bound installed proof

Published source revision; this immutable evidence snapshot records the exact reviewed candidate **9db22c6cf27118f32f27ee549eb65332ca9958b5**, tree **7559ee4f28e2b24a58e3ec1fb6b9075433e14b8c**, parent **e33d13d69b1447e7c4e402f8d6727431e67503a1**. [Six-file binding](source-binding.json) is the preserved pre-publication receipt; its historical NOT PUBLISHED status predates the verified source push. Independent review found no blocking source findings: [review](reports/credential-authority-repair-review.md).

## Actual repaired-head observations

| Boundary | Result |
| --- | --- |
| Public package build | Exit 0, 674.64s; build-info records 9db22c6c; private QA absent |
| Installed bytes | All 16,865 checked dist/launcher files match the tar; SHA-256 76dccdf6bf2d84e0d614499bf7b3f4f5030668b906eab60ce0baedb14b48ddd8 |
| Native and model-only controls | Real host-created image tools, installed public CLI/Gateway and physical loopback receiver; correct synthetic credential and canonical 85-byte image; no competing Google request |
| Real live logout | models.authLogout removes all Gemini API-key profiles; models.authStatus confirms none remain; no blanket abort |
| Retained tool after logout | Both modes refuse removed credentials, terminal harness settles, zero post-logout HTTP during retained invocation; actual native callback observed |
| Fresh request diagnostic | Each fresh process sends image with intentional custom-local marker, receives 401 and fails; no removed key transmitted |
| Targeted source checks | Reported 57 distinct cases; type/lint/format and exact 155-LF allocation pass; no additional test execution for publication |

Direct records:
- [Canonical summary](repair/installed-credential-repair-summary.json), [raw selected final progress](repair/installed-credential-revocation-native-progress.json), [exit/timing](repair/credential-authority-repair-proof-driver-v2-receipt.json).
- [Build command/receipt](repair/credential-public-package-build-receipt.json), [package identity](repair/credential-package-identity.json), [install receipt](repair/credential-authority-repair-install-receipt.json), [installed binding](repair/credential-installed-artifact-binding.json).
- [Executed v2 driver export](repair/installed-credential-revocation-repair-v2.mjs), [v1 driver](repair/installed-credential-revocation-repair.mjs), [precise driver-only correction](repair/credential-proof-driver-v2-change.json).
- [Original failed observation attempt](repair/first-attempt-progress.json), [failed exit receipt](repair/credential-authority-repair-proof-driver-receipt.json). Offline inventory refused live state; it was not a revocation verdict. Only observation changed to live authStatus with malformed/unavailable guards; logout/refusal/HTTP assertions remain.
- [Scoped final receipts](scoped-checks/credential-final-checks-receipt.json), [real-owner red](scoped-checks/credential-regression-red-v3.log), [green](scoped-checks/credential-regression-green-v2.log), [budget](scoped-checks/credential-budget-final.log).
- [Detailed installed report](reports/installed-credential-repair-results.md). Its handoff's parent-review requirement has since been accepted; no report text is rewritten to erase chronology.

## Preserved adverse baseline and prior-head lifecycle / upgrade evidence

The original e33d installed tests transmitted removed synthetic credentials and image bytes after successful live logout in both modes: [model-only failure](prior-e33d/installed-executed/installed-credential-revocation-v4-progress.json), [native failure](prior-e33d/installed-executed/installed-credential-revocation-native-progress.json). Introduction attribution is **not established**.

[Prior lifecycle and upgrade report](reports/lifecycle-upgrade-results.md) and all its selected exported artifacts remain in prior-e33d. This is **e33d evidence, not a repeated upgrade test on 9db22c6c**:
- [Generation outcome](prior-e33d/lifecycle-executed/outcome.json), [final receipt](prior-e33d/lifecycle-executed/lifecycle-final-receipt.json), [reverse-direction receipt](prior-e33d/lifecycle-executed/lifecycle-reverse-receipt.json). Supported SDK-boundary A/B retirement refusal in both directions; not ordinary channel A/B reachability.
- [Stable integrity](prior-e33d/installed-executed/installed-stable-integrity.json), [prior installed binding](prior-e33d/installed-executed/installed-candidate-artifact-binding.json), [transition](prior-e33d/installed-executed/installed-upgrade-transition-receipt.log), [observation verification](prior-e33d/installed-executed/installed-upgrade-observation-verification.json).
- [Settings before](prior-e33d/installed-executed/installed-upgrade-settings-before-recovered.json) and [after](prior-e33d/installed-executed/installed-upgrade-settings-after.json) are selected credential-hash-only projections, not config/auth databases.
- Existing user history and session identity survived. The custom fixture never committed its assistant text; the failed assertion and separate narrower successful verification remain. No claim of preserving absent assistant transcript data.
- Earlier [immutable six-case evidence](https://github.com/jason-allen-oneal/openclaw/blob/4280124ae6d8598db0b955d38730d3628b52f994/native-v3-evidence.md) retains initial provider-routing red/green, failures, and source provenance.

## Limits and reproduction

No live external Gemini/OAuth inference. Zero HTTP applies only to retained revoked-credential invocations, not all fresh images. No new full stable-upgrade sweep on the repaired head. No production changes or merge. New-head hosted CI and durable review are pending at evidence publication; Gold 3/6 at e33d is not Platinum acceptance.

[Export manifest](export-manifest.json) records original and sanitized hashes/lengths. Operator paths are labels; exported driver copies require path substitution and the isolated fixture setup shown in prior drivers. They were not re-executed after sanitization. Fixed loopback constants and known synthetic keys are intentional test inputs. No auth/config database, real bearer, raw Gateway log, or private endpoint is exported. Source receipts referring to private logs describe retained original records, not public files. All exported files are enumerated below by manifest; original files remain unchanged.
