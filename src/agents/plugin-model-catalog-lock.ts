import path from "node:path";
import { acquireFileLockSyncWithRetry } from "../infra/file-lock-sync.js";
import { withFileLock } from "../plugin-sdk/file-lock.js";
import { OAUTH_REFRESH_LOCK_OPTIONS } from "./auth-profiles/constants.js";

/** Returns the lock shared by catalog planning, writes, and logout cleanup. */
function resolvePluginModelCatalogLockPath(agentDir: string): string {
  return path.join(path.resolve(agentDir), "plugin-model-catalog");
}

/** Runs a synchronous catalog operation while holding its per-agent lock. */
export function withPluginModelCatalogWriteLockSync<T>(agentDir: string, run: () => T): T {
  const release = acquireFileLockSyncWithRetry(resolvePluginModelCatalogLockPath(agentDir));
  try {
    return run();
  } finally {
    release();
  }
}

/** Runs an async catalog operation while holding its per-agent lock. */
export async function withPluginModelCatalogWriteLock<T>(
  agentDir: string,
  run: () => Promise<T>,
): Promise<T> {
  return await withFileLock(
    resolvePluginModelCatalogLockPath(agentDir),
    OAUTH_REFRESH_LOCK_OPTIONS,
    run,
  );
}

/** Holds all requested catalog locks in stable order to avoid deadlocks. */
export async function withPluginModelCatalogWriteLocks<T>(
  agentDirs: readonly string[],
  run: () => Promise<T>,
): Promise<T> {
  const sortedAgentDirs = [
    ...new Set(agentDirs.map((agentDir) => path.resolve(agentDir))),
  ].toSorted();
  const acquireNext = async (index: number): Promise<T> => {
    const agentDir = sortedAgentDirs[index];
    if (!agentDir) {
      return await run();
    }
    return await withPluginModelCatalogWriteLock(agentDir, () => acquireNext(index + 1));
  };
  return await acquireNext(0);
}
