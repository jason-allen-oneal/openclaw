import type { createPluginModelCatalogReadOperations } from "../agents/plugin-model-catalog.read-operation.js";
import {
  createWorkerOperationRegistry,
  type WorkerOperations,
} from "../state/worker-operation-registry.js";
import type { immutableInstallReadOperations } from "./package-update-activation-immutable.js";
import type { SqliteReadOnlyOperationContext } from "./sqlite-readonly-operation-types.js";
import type { upgradeMaintenanceReadOperations } from "./upgrade-recipes/maintenance-store.js";
import type { upgradeRecipeStepReadOperations } from "./upgrade-recipes/receipts-store.js";
import type { upgradeRecipeRetainedRunReadOperations } from "./upgrade-recipes/retained-run.js";

export type SqliteReadOnlyOperations = WorkerOperations<
  ReturnType<typeof createPluginModelCatalogReadOperations> &
    typeof immutableInstallReadOperations &
    typeof upgradeMaintenanceReadOperations &
    typeof upgradeRecipeStepReadOperations &
    typeof upgradeRecipeRetainedRunReadOperations
>;

export const sqliteReadOnlyOperations = createWorkerOperationRegistry<
  SqliteReadOnlyOperations,
  SqliteReadOnlyOperationContext
>({
  pluginCatalog: () =>
    import("../agents/plugin-model-catalog.kernel.js").then(
      (module) => module.pluginModelCatalogReadOperations,
    ),
  immutableInstall: () =>
    import("./package-update-activation-immutable.js").then(
      (module) => module.immutableInstallReadOperations,
    ),
  upgradeMaintenance: () =>
    import("./upgrade-recipes/maintenance-store.js").then(
      (module) => module.upgradeMaintenanceReadOperations,
    ),
  upgradeRecipeRuns: () =>
    import("./upgrade-recipes/retained-run.js").then(
      (module) => module.upgradeRecipeRetainedRunReadOperations,
    ),
  upgradeRecipeSteps: () =>
    import("./upgrade-recipes/receipts-store.js").then(
      (module) => module.upgradeRecipeStepReadOperations,
    ),
});
