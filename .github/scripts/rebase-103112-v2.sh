#!/usr/bin/env bash

set -e

TARGET_BRANCH="fix/local-model-lean-provider-scope"

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

git remote add upstream https://github.com/openclaw/openclaw.git 2>/dev/null || true
git fetch upstream main
git fetch origin "+refs/heads/${TARGET_BRANCH}:refs/remotes/origin/${TARGET_BRANCH}"
git checkout -B "${TARGET_BRANCH}" "refs/remotes/origin/${TARGET_BRANCH}"

old_head=$(git rev-parse HEAD)
git reset --hard upstream/main

if ! git merge --no-commit --no-ff "$old_head"; then
  echo "Merge conflicts:" >&2
  git diff --name-only --diff-filter=U >&2
  exit 2
fi

corepack enable
pnpm install --frozen-lockfile
node_modules/.bin/oxfmt --write \
  extensions/copilot/src/tool-bridge.ts \
  src/agents/agent-tools.ts \
  src/agents/embedded-agent-runner/run/attempt.ts \
  src/agents/harness/tool-surface-bridge.ts \
  src/agents/harness/tool-surface-bridge.test.ts \
  src/agents/local-model-lean.ts \
  src/agents/local-model-lean-provider-scope.test.ts
node_modules/.bin/oxlint \
  extensions/copilot/src/tool-bridge.ts \
  src/agents/agent-tools.ts \
  src/agents/embedded-agent-runner/run/attempt.ts \
  src/agents/harness/tool-surface-bridge.ts \
  src/agents/harness/tool-surface-bridge.test.ts \
  src/agents/local-model-lean.ts \
  src/agents/local-model-lean-provider-scope.test.ts
node scripts/test-projects.mjs \
  src/agents/local-model-lean-provider-scope.test.ts \
  src/agents/harness/tool-surface-bridge.test.ts
pnpm tsgo:core:test
git diff --check

git add -A
git commit -m "fix(agents): sync provider-scoped lean mode with main"
git push --force-with-lease origin "HEAD:refs/heads/${TARGET_BRANCH}"
