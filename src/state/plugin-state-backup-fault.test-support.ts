import { vi } from "vitest";
import { runtimeProcessEntrypoints } from "../infra/runtime-process-entrypoints.js";
import { resolveRuntimeWorkerUrl } from "../infra/runtime-worker-url.js";
import * as workerStore from "../infra/sqlite-worker-store.js";
import { closeOpenClawStateDatabaseByPathAsync } from "./openclaw-state-db.js";

export async function observePluginStateBackupWriteFaultForTest(databasePath: string) {
  await closeOpenClawStateDatabaseByPathAsync(databasePath);
  const open = workerStore.openSharedStateSqliteWorkerStore;
  const originalUrl = resolveRuntimeWorkerUrl(runtimeProcessEntrypoints.sharedStateStore);
  const faultUrl = resolveRuntimeWorkerUrl({
    currentModuleUrl: import.meta.url,
    sourceWorkerName: "plugin-state-backup-fault.worker.test-support",
    distWorkerPath: "state/plugin-state-backup-fault.worker.test-support.js",
  });
  const observer = vi
    .spyOn(workerStore, "openSharedStateSqliteWorkerStore")
    .mockImplementation(
      async (options, ...rest) =>
        await open(
          options.databasePath === databasePath && options.moduleUrl.href === originalUrl.href
            ? { ...options, moduleUrl: faultUrl }
            : options,
          ...rest,
        ),
    );
  return async () => {
    try {
      await closeOpenClawStateDatabaseByPathAsync(databasePath);
    } finally {
      observer.mockRestore();
    }
  };
}
