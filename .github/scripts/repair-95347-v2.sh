#!/usr/bin/env bash

set -e

TARGET_BRANCH="fix/memory-search-timeout-config"

FILES=(
  packages/memory-host-sdk/src/host/types.ts
  extensions/memory-core/src/memory-tool-manager.test-mocks.ts
  extensions/memory-core/src/memory/qmd-manager.ts
  extensions/memory-core/src/memory/qmd-manager.test.ts
  extensions/memory-core/src/memory/search-manager.ts
  extensions/memory-core/src/memory/search-manager.test.ts
  extensions/memory-core/src/tools.ts
  extensions/memory-core/src/tools.test.ts
)

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

git remote add upstream https://github.com/openclaw/openclaw.git 2>/dev/null || true
git fetch upstream main
git fetch origin "+refs/heads/${TARGET_BRANCH}:refs/remotes/origin/${TARGET_BRANCH}"
git checkout -B "${TARGET_BRANCH}" "refs/remotes/origin/${TARGET_BRANCH}"

old_head=$(git rev-parse HEAD)
git reset --hard upstream/main
git checkout "$old_head" -- "${FILES[@]}"

git add "${FILES[@]}"

corepack enable
pnpm install --frozen-lockfile
node_modules/.bin/oxfmt --write "${FILES[@]}"
node_modules/.bin/oxlint "${FILES[@]}"
node scripts/test-projects.mjs \
  extensions/memory-core/src/memory/qmd-manager.test.ts \
  extensions/memory-core/src/memory/search-manager.test.ts \
  extensions/memory-core/src/tools.test.ts
pnpm tsgo:extensions:test
git diff --check

git add "${FILES[@]}"
git commit -m "fix(memory): rebase configurable search deadlines"
git push --force-with-lease origin "HEAD:refs/heads/${TARGET_BRANCH}"
