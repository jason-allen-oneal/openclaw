import { constants } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { reconcileOriginalRunPackagePublication } from "../../infra/package-update-activation-original-run.js";
import { runtimeProcessEntrypoints } from "../../infra/runtime-process-entrypoints.js";
import type { UpdateRecoveryFence } from "../../infra/update-run-recovery.js";
import { resumeUpgradeRecipeOriginalRun } from "../../infra/upgrade-recipes/recovery.js";
import { CommandProcessCleanupError } from "../../process/exec-result.js";
import { runUtf8CommandWithTimeout } from "../../process/exec.js";
import { inspectOriginalRecipePackagePublication } from "./recipe-original-publication.js";
import { createRecipeOriginalRecoveryPorts } from "./recipe-recovery-ports.js";
import {
  UPDATE_RECIPE_RESUME_CAPABILITY,
  recipeResumeResultSchema,
  type RecipeResumeInputWithoutExecutor,
} from "./recipe-resume-contract.js";
import {
  prepareOriginalRecipePublication,
  resumeOriginalRecipeStaging,
} from "./recipe-resume-preparation.js";
import { withUpdateCommandExecutorChild } from "./update-command-executor.js";
import { UpdateCommandRecipeReconciliationPendingError } from "./update-command-recovery-error.js";
import { withOwnedManagedUpdateEnv } from "./update-command-service-env.js";
import {
  verifyRecipeUpdateInstallation,
  type RecipeUpdateContext,
} from "./update-recipe-context.js";

/** The installed target owns schema admission, service reconciliation and terminal publication. */
export async function continueInAuthenticatedTarget(options: {
  recipe: RecipeUpdateContext;
  ledgerPath: string;
  env: NodeJS.ProcessEnv;
  fence: UpdateRecoveryFence;
}) {
  const { recipe, env, fence } = options;
  const { runId, installationKey } = recipe.maintenance.binding;
  const scratch = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-recipe-resume-"));
  try {
    const command = [
      recipe.maintenance.expected.runtimeExecutable,
      path.join(
        installationKey,
        "dist",
        runtimeProcessEntrypoints.updateMigratedFinalize.distWorkerPath,
      ),
    ];
    const workerEnv = {
      ...env,
      OPENCLAW_UPDATE_IN_PROGRESS: "1",
      TMPDIR: scratch,
      TMP: scratch,
      TEMP: scratch,
    };
    const invoke = (
      argv: string[],
      input?: string,
      beforeInput?: (pid: number, argv?: readonly string[]) => void,
    ) =>
      runUtf8CommandWithTimeout(argv, {
        cwd: installationKey,
        baseEnv: {},
        env: workerEnv,
        ...(input === undefined ? {} : { input, beforeInput }),
        timeoutMs: recipe.maintenance.timeoutMs,
        killProcessTree: true,
        requireProcessTreeExtinction: true,
        maxOutputBytes: 1024 * 1024,
      });
    await verifyRecipeUpdateInstallation(recipe, installationKey, "target");
    fence.assertCurrent();
    const check = await invoke([...command, "--check"]);
    fence.assertCurrent();
    if (check.cleanup !== "normal") {
      throw new CommandProcessCleanupError();
    }
    const capability = z
      .object({
        executorDelegation: z.literal("pid-start-v1"),
        recipeResume: z.literal(UPDATE_RECIPE_RESUME_CAPABILITY),
      })
      .safeParse(JSON.parse(check.stdout));
    if (check.termination !== "exit" || check.code !== 0 || !capability.success) {
      throw new UpdateCommandRecipeReconciliationPendingError(
        "Authenticated target cannot resume the original recipe run; retained state is unchanged.",
      );
    }
    await verifyRecipeUpdateInstallation(recipe, installationKey, "target");
    fence.assertCurrent();
    const resultPath = path.join(scratch, "result.json");
    const input: RecipeResumeInputWithoutExecutor = {
      capability: UPDATE_RECIPE_RESUME_CAPABILITY,
      runId,
      ledgerPath: options.ledgerPath,
      resultPath,
    };
    const child = await withUpdateCommandExecutorChild(
      fence,
      installationKey,
      async (executor, bindChild) => {
        const result = await invoke(
          [...command, "--recipe-resume"],
          JSON.stringify({ ...input, executor }),
          bindChild,
        );
        if (result.cleanup !== "normal") {
          throw new CommandProcessCleanupError();
        }
        return result;
      },
    );
    fence.assertCurrent();
    if (child.stderr) {
      process.stderr.write(child.stderr);
    }
    if (child.termination !== "exit" || child.code !== 0) {
      throw new UpdateCommandRecipeReconciliationPendingError(
        "Target recipe reconciliation did not complete; resume this original run without replaying effects.",
      );
    }
    const handle = await fs.open(resultPath, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = await handle.stat();
      if (
        !stat.isFile() ||
        stat.size > 64 * 1024 ||
        (stat.mode & 0o077) !== 0 ||
        (process.getuid && stat.uid !== process.getuid())
      ) {
        throw new Error("Target resume response lost its private bounded transport.");
      }
      const response = recipeResumeResultSchema.parse(JSON.parse(await handle.readFile("utf8")));
      fence.assertCurrent();
      if (response.runId !== runId || response.terminalRunId !== runId) {
        throw new Error("Target resume response selected another original run.");
      }
      const result = response.result;
      const verified = result.verification;
      if (
        result.status !== "ok" ||
        result.runId !== runId ||
        result.root !== installationKey ||
        verified?.serviceRunning !== true ||
        verified.versionMatch !== true ||
        verified.readyz !== true ||
        verified.settled !== true ||
        verified.runningVersion !== recipe.maintenance.expected.version ||
        verified.runningBuildId !== recipe.maintenance.expected.buildId ||
        verified.port !== recipe.maintenance.port ||
        !Number.isSafeInteger(verified.pid) ||
        (verified.pid ?? 0) <= 0
      ) {
        throw new Error("Target resume did not return exact actual managed-service readiness.");
      }
      return response;
    } finally {
      await handle.close();
    }
  } catch (error) {
    if (
      error instanceof CommandProcessCleanupError ||
      error instanceof UpdateCommandRecipeReconciliationPendingError
    ) {
      throw error;
    }
    throw new UpdateCommandRecipeReconciliationPendingError(
      "Original target response is unresolved; preserve its original owner and resume without replaying effects.",
      { cause: error },
    );
  } finally {
    await fs.rm(scratch, { recursive: true, force: true });
  }
}

/** Resume the durable original pointer through existing native package and target owners only. */
export async function resumeRetainedRecipeUpdate(options: {
  installation: string;
  ledgerPath: string;
  runId: string;
  runnerEntryUrl: string;
}) {
  const recovery = await createRecipeOriginalRecoveryPorts(options);
  if (path.resolve(options.installation) !== recovery.retained.binding.installationKey) {
    throw new Error("Recipe resume differs from its original native installation selection.");
  }
  return withOwnedManagedUpdateEnv(recovery.env, () =>
    resumeUpgradeRecipeOriginalRun({
      runId: options.runId,
      ports: recovery.ports,
      continueRun: async ({ retained, fence }) => {
        recovery.bindNativeFence(fence);
        if (!(await recovery.hasPublication())) {
          await resumeOriginalRecipeStaging({
            retained,
            fence,
            recipe: recovery.recipe,
            env: recovery.env,
          });
          fence.assertCurrent();
        }
        const inspected = await inspectOriginalRecipePackagePublication({
          retained,
          recipe: recovery.recipe,
          assertCurrent: fence.assertCurrent,
        });
        const preparing = inspected.phase === "preparing" || inspected.phase === "prepared";
        if (preparing) {
          await prepareOriginalRecipePublication({
            retained,
            fence,
            recipe: recovery.recipe,
            env: recovery.env,
            candidateRoot: inspected.candidateRoot,
          });
          fence.assertCurrent();
        }
        await reconcileOriginalRunPackagePublication({
          retained,
          fence,
          operationId: inspected.operationId,
          expectedCandidate: inspected.expectedCandidate,
          ...(preparing ? { continuePreparation: true } : {}),
        });
        fence.assertCurrent();
        return continueInAuthenticatedTarget({
          recipe: recovery.recipe,
          env: recovery.env,
          ledgerPath: retained.ledgerAuthority.databasePath,
          fence,
        });
      },
    }),
  );
}
