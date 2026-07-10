#!/usr/bin/env bash

set -e

TARGET_BRANCH="fix/memory-search-timeout-config"

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

git remote add upstream https://github.com/openclaw/openclaw.git 2>/dev/null || true
git fetch upstream main
git fetch origin "+refs/heads/${TARGET_BRANCH}:refs/remotes/origin/${TARGET_BRANCH}"
git checkout -B "${TARGET_BRANCH}" "refs/remotes/origin/${TARGET_BRANCH}"

old_head=$(git rev-parse HEAD)
git reset --hard upstream/main

merge_status=0
git merge --no-commit --no-ff "$old_head" || merge_status=$?

if [ "$merge_status" -ne 0 ]; then
  unresolved=$(git diff --name-only --diff-filter=U)
  if [ "$unresolved" != "extensions/memory-core/src/tools.ts" ]; then
    echo "Unexpected unresolved files:" >&2
    printf '%s\n' "$unresolved" >&2
    exit 1
  fi

  python3 - <<'PY'
from pathlib import Path
import re

path = Path("extensions/memory-core/src/tools.ts")
text = path.read_text()
if text.count("<<<<<<< HEAD\n") != 1 or text.count("=======\n") != 1 or text.count(">>>>>>> ") != 1:
    raise SystemExit("unexpected tools.ts conflict shape")

before, rest = text.split("<<<<<<< HEAD\n", 1)
_head, rest = rest.split("=======\n", 1)
theirs, after = re.split(r">>>>>>> [^\n]+\n", rest, maxsplit=1)

obsolete_retry = '''                if (rawResults.length === 0 && activeMemory.manager.sync) {
                  const timeoutMs = resolveMemoryManagerSearchPhaseTimeoutMs(activeMemoryDeadline);
                  await runMemorySearchTaskWithDeadline({
                    timeoutMs,
                    timeoutMessageMs: activeMemoryDeadline.timeoutMs,
                    run: async () =>
                      await activeMemory.manager.sync?.({ reason: "search", force: true }),
                  });
                  rawResults = await runActiveMemorySearch(activeMemory, activeMemoryDeadline);
                  pausedIndexIdentityReason = resolvePausedMemoryIndexIdentityReason(
                    activeMemory.manager.status(),
                  );
                  if (pausedIndexIdentityReason) {
                    return;
                  }
'''
if not before.endswith(obsolete_retry):
    raise SystemExit("pre-conflict retry block did not match expected feature branch shape")
before = before[: -len(obsolete_retry)]

if theirs.startswith("                }\n"):
    theirs = theirs[len("                }\n") :]

resolved_retry = '''                // One-shot CLI managers have no background lifecycle, so keep their bootstrap
                // retry. Long-lived QMD managers must not run update work in the tool hot path.
                if (
                  rawResults.length === 0 &&
                  activeMemory.manager.sync &&
                  (statusBeforeRetry.backend !== "qmd" || options.oneShotCliRun === true)
                ) {
                  const timeoutMs = resolveMemoryManagerSearchPhaseTimeoutMs(activeMemoryDeadline);
                  await runMemorySearchTaskWithDeadline({
                    timeoutMs,
                    timeoutMessageMs: activeMemoryDeadline.timeoutMs,
                    run: async () =>
                      await activeMemory.manager.sync?.({ reason: "search", force: true }),
                  });
                  rawResults = await runActiveMemorySearch(activeMemory, activeMemoryDeadline);
                  pausedIndexIdentityReason = resolvePausedMemoryIndexIdentityReason(
                    activeMemory.manager.status(),
                  );
                  if (pausedIndexIdentityReason) {
                    return;
                  }
                }
'''

resolved = before + resolved_retry + theirs + after
old_supplement = '''                        await searchMemoryCorpusSupplements({
                          query,
                          maxResults,
                          agentSessionKey: options.agentSessionKey,
                          corpus: requestedCorpus,
                        }),'''
new_supplement = '''                        await searchMemoryCorpusSupplements({
                          query,
                          maxResults,
                          agentId,
                          agentSessionKey: options.agentSessionKey,
                          sandboxed: options.sandboxed,
                          corpus: requestedCorpus,
                        }),'''
if resolved.count(old_supplement) != 1:
    raise SystemExit("supplement call did not match expected feature branch shape")
resolved = resolved.replace(old_supplement, new_supplement, 1)
if "<<<<<<<" in resolved or "=======" in resolved or ">>>>>>>" in resolved:
    raise SystemExit("conflict markers remain after resolution")
path.write_text(resolved)
PY

  git add extensions/memory-core/src/tools.ts
fi

if [ -n "$(git diff --name-only --diff-filter=U)" ]; then
  echo "Unresolved merge conflicts remain" >&2
  git diff --name-only --diff-filter=U >&2
  exit 1
fi

rm -f .github/workflows/repair-95347.yml .github/scripts/repair-95347.sh

python3 - <<'PY'
from pathlib import Path

path = Path("extensions/memory-core/src/tools.test.ts")
text = path.read_text()
old_title = 'it("keeps qmd zero-hit forced-sync retry inside one whole-search deadline", async () => {'
new_title = 'it("keeps one-shot qmd zero-hit retry inside one whole-search deadline", async () => {'
if text.count(old_title) != 1:
    raise SystemExit("expected one long-lived QMD deadline test")
text = text.replace(old_title, new_title, 1)
start = text.index(new_title)
end_marker = '  it("closes one-shot CLI qmd manager with timeout when forced sync never settles"'
end = text.index(end_marker, start)
segment = text[start:end]
needle = '''        },
      });'''
replacement = '''        },
        oneShotCliRun: true,
      });'''
if segment.count(needle) != 1:
    raise SystemExit("expected one tool construction site in QMD deadline test")
segment = segment.replace(needle, replacement, 1)
text = text[:start] + segment + text[end:]
path.write_text(text)
PY

git add -A

corepack enable
pnpm install --frozen-lockfile
node_modules/.bin/oxfmt --write \
  packages/memory-host-sdk/src/host/types.ts \
  extensions/memory-core/src/memory-tool-manager.test-mocks.ts \
  extensions/memory-core/src/memory/qmd-manager.ts \
  extensions/memory-core/src/memory/qmd-manager.test.ts \
  extensions/memory-core/src/memory/search-manager.ts \
  extensions/memory-core/src/memory/search-manager.test.ts \
  extensions/memory-core/src/tools.ts \
  extensions/memory-core/src/tools.test.ts
node_modules/.bin/oxlint \
  packages/memory-host-sdk/src/host/types.ts \
  extensions/memory-core/src/memory-tool-manager.test-mocks.ts \
  extensions/memory-core/src/memory/qmd-manager.ts \
  extensions/memory-core/src/memory/qmd-manager.test.ts \
  extensions/memory-core/src/memory/search-manager.ts \
  extensions/memory-core/src/memory/search-manager.test.ts \
  extensions/memory-core/src/tools.ts \
  extensions/memory-core/src/tools.test.ts
node scripts/test-projects.mjs \
  extensions/memory-core/src/memory/qmd-manager.test.ts \
  extensions/memory-core/src/memory/search-manager.test.ts \
  extensions/memory-core/src/tools.test.ts
pnpm tsgo:extensions:test
git diff --check

git add -A
git commit -m "fix(memory): rebase configurable search deadlines"
git push --force-with-lease origin "HEAD:refs/heads/${TARGET_BRANCH}"
