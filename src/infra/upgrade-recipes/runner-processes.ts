import { runtimeProcessEntrypoints } from "../runtime-process-entrypoints.js";
import { registerSealedRuntimeProcessEntrypoint } from "../runtime-process-url.js";

// Target Doctor/finalization/maintenance workers are launched from authenticated target artifacts,
// not copied from this retained predecessor runner. These are the independent owner's workers.
export const upgradeRecipeRunnerProcessNames = [
  "sqliteReadOnly",
  "sharedStateStore",
  "sqliteStore",
  "sqliteSnapshotStaging",
  "sqliteReadOnlyNativeResource",
  "sqliteSourceRevision",
  "sqliteIntegrity",
  "updateCandidateState",
  "stateOwnership",
  "stateLeaseHeartbeat",
  "gatewayStateOwnerHeartbeat",
  "fsSafeCopy",
  "spawnBroker",
  "databaseVerify",
  "agentSchemaInspection",
  "stateMigrationSnapshot",
] as const satisfies readonly (keyof typeof runtimeProcessEntrypoints)[];

/** Called before any worker entry executes; no environment-selected installation fallback. */
export function registerUpgradeRecipeRunnerProcesses(root: URL): void {
  for (const name of upgradeRecipeRunnerProcessNames) {
    registerSealedRuntimeProcessEntrypoint(
      name,
      new URL(runtimeProcessEntrypoints[name].distWorkerPath.replace(/\.js$/u, ".mjs"), root),
    );
  }
}
