import fs from "node:fs/promises";
import { beforeEach, expect, it, vi } from "vitest";
import { CommandProcessCleanupError } from "../../process/exec-result.js";
import { UPDATE_RECIPE_RESUME_CAPABILITY } from "./recipe-resume-contract.js";
import { continueInAuthenticatedTarget } from "./recipe-target-continuation.js";
import { UpdateCommandRecipeReconciliationPendingError } from "./update-command-recovery-error.js";
import { approvedContext } from "./update-recipe-context.test-support.js";

const mocks = vi.hoisted(() => ({ command: vi.fn(), verify: vi.fn(), bind: vi.fn() }));
vi.mock("../../process/exec.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../process/exec.js")>()),
  runUtf8CommandWithTimeout: mocks.command,
}));
vi.mock("./update-recipe-context.js", async (original) => ({
  ...(await original<typeof import("./update-recipe-context.js")>()),
  verifyRecipeUpdateInstallation: mocks.verify,
}));
vi.mock("./update-command-executor.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./update-command-executor.js")>()),
  withUpdateCommandExecutorChild: async (
    _fence: unknown,
    _root: string,
    run: (grant: object, bind: typeof mocks.bind) => Promise<unknown>,
  ) => run({ runId }, mocks.bind),
}));
const recipe = approvedContext();
recipe.maintenance.binding.runId = "00000000-0000-4000-8000-000000000001";
const runId = recipe.maintenance.binding.runId;
const response = () => ({
  capability: UPDATE_RECIPE_RESUME_CAPABILITY,
  runId,
  terminalRunId: runId,
  outcome: "completed",
  managedServiceVerified: true,
  result: {
    runId,
    status: "ok",
    mode: "npm",
    root: recipe.maintenance.binding.installationKey,
    after: {
      version: recipe.maintenance.expected.version,
      buildId: recipe.maintenance.expected.buildId,
    },
    steps: [],
    durationMs: 0,
    verification: {
      serviceRunning: true,
      versionMatch: true,
      readyz: true,
      settled: true,
      runningVersion: recipe.maintenance.expected.version,
      runningBuildId: recipe.maintenance.expected.buildId,
      port: recipe.maintenance.port,
      pid: 42,
    },
  },
});
const input = {
  recipe,
  ledgerPath: "/selected-state/state.sqlite",
  env: {},
  fence: { assertCurrent: vi.fn() },
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.command.mockImplementation(
    async (_args: string[], opts: { input?: string; beforeInput?: (pid: number) => void }) => {
      if (!opts.input) {
        return {
          code: 0,
          termination: "exit",
          cleanup: "normal",
          stdout: JSON.stringify({
            executorDelegation: "pid-start-v1",
            recipeResume: UPDATE_RECIPE_RESUME_CAPABILITY,
          }),
        };
      }
      opts.beforeInput?.(42);
      const payload = JSON.parse(opts.input);
      await fs.writeFile(payload.resultPath, JSON.stringify(response()), {
        mode: 0o600,
        flag: "wx",
      });
      return { code: 0, termination: "exit", cleanup: "normal", stderr: "" };
    },
  );
});
it("rehashes the installed target and binds the child before accepting exact readiness", async () => {
  await expect(continueInAuthenticatedTarget(input)).resolves.toMatchObject({
    terminalRunId: runId,
  });
  expect(mocks.verify).toHaveBeenCalledTimes(2);
  expect(mocks.bind).toHaveBeenCalledWith(42);
  const args = mocks.command.mock.calls[1]?.[0];
  expect(args).toEqual([
    recipe.maintenance.expected.runtimeExecutable,
    expect.stringContaining("dist/"),
    "--recipe-resume",
  ]);
});
it("keeps semantic pending custody after a joined child loses its terminal response", async () => {
  mocks.command.mockImplementation(async (_args: string[], opts: { input?: string }) =>
    opts.input
      ? { code: 0, termination: "exit", cleanup: "normal", stderr: "" }
      : {
          code: 0,
          termination: "exit",
          cleanup: "normal",
          stdout: JSON.stringify({
            executorDelegation: "pid-start-v1",
            recipeResume: UPDATE_RECIPE_RESUME_CAPABILITY,
          }),
        },
  );
  await expect(continueInAuthenticatedTarget(input)).rejects.toBeInstanceOf(
    UpdateCommandRecipeReconciliationPendingError,
  );
});
it("refuses malformed target result objects even after successful process exit", async () => {
  mocks.command.mockImplementation(async (_args: string[], opts: { input?: string }) => {
    if (!opts.input) {
      return {
        code: 0,
        termination: "exit",
        cleanup: "normal",
        stdout: JSON.stringify({
          executorDelegation: "pid-start-v1",
          recipeResume: UPDATE_RECIPE_RESUME_CAPABILITY,
        }),
      };
    }
    await fs.writeFile(
      JSON.parse(opts.input).resultPath,
      JSON.stringify({ ...response(), result: null }),
      { mode: 0o600 },
    );
    return { code: 0, termination: "exit", cleanup: "normal", stderr: "" };
  });
  await expect(continueInAuthenticatedTarget(input)).rejects.toBeInstanceOf(
    UpdateCommandRecipeReconciliationPendingError,
  );
});
it("preserves genuine process cleanup uncertainty, rather than reporting semantic success", async () => {
  mocks.command.mockResolvedValue({
    code: 0,
    termination: "exit",
    cleanup: "uncertain",
    stdout: "",
  });
  await expect(continueInAuthenticatedTarget(input)).rejects.toBeInstanceOf(
    CommandProcessCleanupError,
  );
});
