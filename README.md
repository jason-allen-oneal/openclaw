# Archive retirement: inspectable execution evidence

Product PR: [openclaw/openclaw#188378](https://github.com/openclaw/openclaw/pull/188378). Product head: `440f9f312feeeba735cb942491efd2cd52c40e47`.

This separate proof branch contains contributor-captured evidence, not product source or an approval. It mirrors the sanitized, revision-pinned Gist evidence byte-for-byte and exposes each artifact as an ordinary GitHub repository file. No Gist access is required. Historical failed attempts and limitations remain intact. Maintainer acceptance of the retention contract is not claimed.

## Start here

- [Data-model compatibility and stable-upgrade evidence](COMPATIBILITY.md): official 2026.10.9 persisted state → candidate Doctor repair → consented retirement/interruption/replay; old-reader refusal is separate from successful downgrade.
- [Real Gateway/browser execution summary](artifacts/gateway-worker-proof/publication/gateway-worker-execution-summary.json): nine cases, real RPC/served-asset/preservation/layout evidence, every inventory partial.
- [Real Gateway terminal receipt](artifacts/gateway-worker-proof/real-gateway-ui/attempt-nur6b0jd/command.json), [complete browser observations](artifacts/gateway-worker-proof/real-gateway-ui/attempt-nur6b0jd/real-gateway-recovery-eSYNB9/results.json), [immutable executed harness](artifacts/gateway-worker-proof/real-gateway-ui/attempt-nur6b0jd/executed-harness/proof.test.ts).
- [Worker SQL-boundary red→green and scope](artifacts/gateway-worker-proof/ci-followup/recovery-worker-proof.md), [catalog CI fixture red→green](artifacts/gateway-worker-proof/ci-followup/catalog-fixture-repair/README.md).
- [Complete evidence guide and limitations](FULL-EVIDENCE.md), [product-head reuse map](final-head-evidence-map.json), [artifact path/hash manifest](manifest.json).

The six root JSON bundles retain original/public hashes and complete published text. The `artifacts/<bundle>/` tree extracts those exact published bytes so reviewers can read individual logs/receipts without parsing a large bundle. Entries explicitly labelled excerpts remain excerpts; their original complete-log hashes and line ranges remain available.

## Read through the GitHub API

Use this directory's immutable commit SHA as `PROOF_COMMIT`, not the moving branch name. For example:

```sh
gh api -H 'Accept: application/vnd.github.raw+json' "repos/jason-allen-oneal/openclaw/contents/artifacts/stable-upgrade/stable-upgrade/run/summary.json?ref=$PROOF_COMMIT"
```

Read-only evidence does not itself approve the retention contract or establish final-head CI. The PR contains the current review/CI status; the older recorded failures are intentionally retained.
