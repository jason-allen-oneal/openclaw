#!/usr/bin/env bash

set -e

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git fetch origin fix/local-model-lean-provider-scope
git checkout -B repair-target origin/fix/local-model-lean-provider-scope
python3 .github/scripts/repair-103112.py

corepack enable
pnpm install --frozen-lockfile
node_modules/.bin/oxfmt --write \
  src/agents/local-model-lean.ts \
  src/agents/agent-tools.ts \
  src/agents/embedded-agent-runner/run/attempt.ts \
  src/agents/harness/tool-surface-bridge.ts \
  extensions/copilot/src/tool-bridge.ts \
  src/agents/local-model-lean-provider-scope.test.ts \
  src/agents/harness/tool-surface-bridge.test.ts
node_modules/.bin/oxlint \
  src/agents/local-model-lean.ts \
  src/agents/agent-tools.ts \
  src/agents/embedded-agent-runner/run/attempt.ts \
  src/agents/harness/tool-surface-bridge.ts \
  extensions/copilot/src/tool-bridge.ts \
  src/agents/local-model-lean-provider-scope.test.ts \
  src/agents/harness/tool-surface-bridge.test.ts
node scripts/test-projects.mjs \
  src/agents/local-model-lean.test.ts \
  src/agents/local-model-lean-provider-scope.test.ts \
  src/agents/harness/tool-surface-bridge.test.ts \
  src/agents/embedded-agent-runner/run/attempt.spawn-workspace.context-engine.test.ts

git add src/agents/local-model-lean.ts src/agents/agent-tools.ts \
  src/agents/embedded-agent-runner/run/attempt.ts \
  src/agents/harness/tool-surface-bridge.ts \
  extensions/copilot/src/tool-bridge.ts \
  src/agents/local-model-lean-provider-scope.test.ts \
  src/agents/harness/tool-surface-bridge.test.ts
git commit -m "fix(agents): use resolved endpoint for lean locality"
git push origin HEAD:fix/local-model-lean-provider-scope
