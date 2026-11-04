# PR #192436 — built provider-identity evidence v3

## Exact source and result

Published source: [e33d13d69b1447e7c4e402f8d6727431e67503a1](https://github.com/openclaw/openclaw/pull/192436/commits/e33d13d69b1447e7c4e402f8d6727431e67503a1).
[Source binding](native-v3-source-binding.json) verifies this tree is exactly parent ee4d7e1fc7da70993b7948b48b9b5b6f1267e765 plus the reviewed two-file overlay, SHA256 08c1cd624fad2c2397d41fdfcbe197cf55047d5885fe9a923b676e1cc2b3214c. No product, dependency, lockfile, workflow, selector, mock-ledger or shared-ceiling change was added.

**Final complete run: 6/6 passed, terminal exit 0, 252.82 seconds wall time (248.55 seconds test duration).** [Command/exit](native-e2e-final-receipt.json), [six receiver observations](native-e2e-final-observations.jsonl), [full settled log](native-e2e-final.log), [execution handoff](native-execution-report.md), [independent v3 review](native-fixture-v3-review.md).

This is exact head-plus-overlay local built proof. Publication binding establishes identical source bytes; it does not turn local execution into hosted CI. New-head CI and durable hosted acceptance remain pending.

## Observable behavior

| Scenario | Actual image/credential destination | Competing destination |
| --- | --- | --- |
| Native attachment offload | Gemini, Gemini synthetic credential; native handler/provider agree | Zero Google requests |
| Model-only attachment offload | Gemini, Gemini synthetic credential; no native handler | Zero Google requests |
| Unclaimed inbound legacy alias | Google, Google synthetic credential | Zero Gemini requests |
| Native host-created image tool | Gemini, Gemini synthetic credential; captured plugin owner | Zero Google requests |
| Model-only host-created image tool | Gemini, Gemini synthetic credential; no native handler | Zero Google requests |
| Explicit standalone legacy model | Configured Gemini endpoint/credential; no native handler | Zero Google requests |

All cases use actual built transport and configured-key resolution to synthetic loopback HTTP receivers, assert the image digest, correct model/credential label and zero competing traffic. No real provider credentials or live-model intelligence are claimed. All three host-tool cases reject the same retained tool after actual attempt-host closure, before any additional endpoint request.

## Genuine baseline, not a whole-suite baseline pass

Baseline 5756d032d1e7559338a9efaa378c100f6d263439: **two selected cases failed, four skipped**, exit 1, 160.20 seconds. [Receipt](native-baseline-e2e-receipt.json), [receiver observations](native-baseline-e2e-observations.jsonl), [full log](native-baseline-e2e.log).

- Native offload reproduced the bug: a Gemini handler carried provider Google and sent the image plus Google synthetic credential to the competing Google receiver.
- The legacy standalone failure exposed an incorrect new-test expectation: both unchanged base and candidate already respect explicit `imageModel: gemini/fixture-vision`. v3 checks that preserved positive Gemini outcome. This case is not presented as a repaired product bug.
- Earlier candidate setup/wrapper and five-pass/one-expectation-failure history is retained: [first receipt](native-e2e-first-receipt.json), [first log](native-e2e-first.log), [later failing log](native-e2e-private.log), [observations](native-e2e-private-observations.jsonl), [initial static receipts](native-checks-receipt.json), [v2 receipts](native-checks-v2-receipt.json). The wrapper's 143/unknown descendant exit is not relabeled success.

## Normal build, admission, budget and cost

- [Genuine acquisition](native-acquisition-receipt.json), [pinned frozen install](native-install-receipt.json), [private-QA build](native-qa-build-receipt.json), [baseline build](native-baseline-qa-build-receipt.json). Runtime build receipt is bound to v2 overlay; v3 changes only the retained test/its exact allocation, not built product or dependency inputs. Final source-stable run binds v3 explicitly.
- [Full maintained CI manifest](native-ci-manifest-receipt.json) and [output](native-ci-manifest-output.txt) admit the real fixture to `checks-node-changed`, `pretest_build_mode: private-qa`. [Final-byte direct planner](native-planner-final-receipt.json) selects maintained E2E config `test/vitest/vitest.e2e.config.ts`.
- Hosted matrix runtime policy is `bun-all`; this local replay used the recorded Node/Vitest command. Hosted execution is a separate gate, not implied by local success.
- [Final checks](native-checks-v3-receipt.json): pinned format, targeted lint, E2E types and tracked budget all exit 0. [Budget](native-budget-v3.log): 6,447,936 / 6,447,936, zero slack; test has exactly 462 LF, separate allocation 462, existing allocation 248 untouched.
- Six isolated Gateway configurations cost 252.82 seconds wall time because registry mocks cannot demonstrate actual receiver image/key exclusion or host lifetime. No retry or timeout increase was added. Hosted CPU/wall cost remains to be measured.

## Explicit remaining proof and review gates

Closed-attempt refusal is **not** plugin uninstall/disable, credential revocation, or overlapping-generation/mismatched-ambient proof. Fresh product installation, latest-stable upgrade and preservation of existing settings remain unestablished. Dependency installation is not product-upgrade proof. These six tests do not complete the user's done gate.

Prior durable ClawSweeper review of 82928de4 reported no code findings but readiness/proof 1/6 and patch quality 3/6; it remains historical, not current-head acceptance. Await new-head hosted CI/private-QA execution and an actual updated durable verdict.

## Preservation and sanitization

[Export manifest](native-v3-redaction-manifest.json) records original and exported hashes. Raw originals remain retained; exported copies redact operator-local paths/IPs and strip terminal escapes, without changing assertions, outcomes or limitations. Synthetic receiver credential fields are owner labels, not keys. Prior evidence remains at [original proof](https://github.com/jason-allen-oneal/openclaw/blob/605a3b61acacc2df1ed70ae3f3a307969aeaf662/media-identity-evidence.md), [ledger follow-up](https://github.com/jason-allen-oneal/openclaw/blob/924be7eff3d8ba1ea8f936381b4f4bc4c1f87544/media-identity-ledger-followup.md) and [comment-only evidence](https://github.com/jason-allen-oneal/openclaw/blob/0dee5dd95f12d8e837884c6e67effb1bc73c5685/media-identity-comment-followup.md). Old inherited-budget and Gateway-proxy failures are historical; normal native build access subsequently worked. No production changes or merge.
