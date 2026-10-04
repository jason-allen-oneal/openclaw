import { beforeEach, expect, it, vi } from "vitest";
import { hasCommandProcessCleanupError } from "../../process/exec-result.js";
import { runUpgradeRecipeTargetMaintenance } from "./recipe-maintenance-target.js";
import { UPDATE_RECIPE_MAINTENANCE_CAPABILITY } from "./update-recipe-maintenance-contract.js";

const fixture = vi.hoisted(() => ({ command: vi.fn(), bind: vi.fn() }));
vi.mock("../../process/exec.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../process/exec.js")>()),
  runCommandWithTimeout: fixture.command,
}));
vi.mock("./update-command-executor.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./update-command-executor.js")>()),
  captureUpdateCommandExecutorAuthority: () => ({ installKey: "/target" }),
  withUpdateCommandExecutorChild: async (
    _fence: unknown,
    _root: string,
    run: (grant: unknown, bind: unknown) => unknown,
  ) => run({ runId: "run", root: "/target" }, fixture.bind),
}));
const binding = {
  protocol: 1 as const,
  runId: "run",
  planDigest: "a".repeat(64),
  targetArtifactId: "target-artifact",
  installationKey: "/target",
  stateRootKey: "/state",
};
const receipt = { binding, phase: "committed", revision: 3, updatedAtMs: 1 };
const options = () => ({
  fence: { assertCurrent: vi.fn() },
  input: {
    binding,
    expected: {
      version: "fixture",
      buildId: "fixture-build",
      runtimeExecutable: "/runtime/node",
      installationRoot: "/target",
      stateRoot: "/state",
      configPath: "/state/openclaw.json",
      configHash: "b".repeat(64),
      configSourceDigest: "c".repeat(64),
      profile: "default",
    },
    stateVersions: [{ path: "/state/state/openclaw.sqlite", userVersion: 1 }],
    port: 18789,
    timeoutMs: 1000,
  },
  env: { OPENCLAW_STATE_DIR: "/state" },
  verifyTarget: vi.fn(async () => {}),
});
beforeEach(() => {
  fixture.command.mockReset();
  fixture.bind.mockReset();
  fixture.command.mockImplementation(
    async (argv: string[], input: { beforeInput: (pid: number, argv: string[]) => void }) => {
      input.beforeInput(42, argv);
      return {
        code: 0,
        signal: null,
        killed: false,
        termination: "exit",
        stderr: "",
        stdout: JSON.stringify(
          argv.at(-1) === "--check"
            ? { capability: UPDATE_RECIPE_MAINTENANCE_CAPABILITY }
            : {
                capability: UPDATE_RECIPE_MAINTENANCE_CAPABILITY,
                outcome: "target-committed",
                managedServiceVerified: false,
                receipt,
              },
        ),
      };
    },
  );
});

it.each(["NODE_OPTIONS", "NODE_PATH", "LD_PRELOAD", "OPENSSL_CONF"])(
  "refuses %s code injection before executing even the capability probe",
  async (selector) => {
    const selected = options();
    await expect(
      runUpgradeRecipeTargetMaintenance({
        ...selected,
        env: { ...selected.env, [selector]: "untrusted" },
      }),
    ).rejects.toThrow("injection");
    expect(fixture.command).not.toHaveBeenCalled();
    expect(selected.verifyTarget).not.toHaveBeenCalled();
  },
);

it("binds both target children, rehashes before effects, and leaves manager verification explicit", async () => {
  const selected = options();
  const result = await runUpgradeRecipeTargetMaintenance(selected);
  expect(selected.verifyTarget).toHaveBeenCalledTimes(2);
  expect(fixture.bind).toHaveBeenCalledTimes(2);
  expect(result).toMatchObject({
    outcome: "target-committed",
    managedServiceVerified: false,
    receipt,
  });
  expect(fixture.command.mock.calls[1]?.[1]).toMatchObject({
    baseEnv: {},
    killProcessTree: true,
    requireProcessTreeExtinction: true,
  });
  const payload = JSON.parse(fixture.command.mock.calls[1]?.[1].input);
  expect(payload.binding).toEqual(binding);
  expect(payload.executor).toEqual({ runId: "run", root: "/target" });
});

it("does not accept a different plan's committed receipt or replay the target", async () => {
  fixture.command.mockResolvedValueOnce({
    code: 0,
    signal: null,
    killed: false,
    termination: "exit",
    stdout: JSON.stringify({ capability: UPDATE_RECIPE_MAINTENANCE_CAPABILITY }),
  });
  fixture.command.mockResolvedValueOnce({
    code: 0,
    signal: null,
    killed: false,
    termination: "exit",
    stdout: JSON.stringify({
      capability: UPDATE_RECIPE_MAINTENANCE_CAPABILITY,
      outcome: "target-committed",
      managedServiceVerified: false,
      receipt: { ...receipt, binding: { ...binding, planDigest: "f".repeat(64) } },
    }),
  });
  await expect(runUpgradeRecipeTargetMaintenance(options())).rejects.toThrow("exact approved run");
  expect(fixture.command).toHaveBeenCalledTimes(2);
});

it("propagates unconfirmed target cleanup even when the transport exited", async () => {
  fixture.command.mockResolvedValueOnce({
    code: 0,
    signal: null,
    killed: false,
    termination: "exit",
    stdout: JSON.stringify({ capability: UPDATE_RECIPE_MAINTENANCE_CAPABILITY }),
  });
  fixture.command.mockResolvedValueOnce({
    code: 1,
    signal: null,
    killed: false,
    termination: "exit",
    stdout: JSON.stringify({ processSettlement: "uncertain" }),
  });
  const failure = await runUpgradeRecipeTargetMaintenance(options()).catch(
    (error: unknown) => error,
  );
  expect(hasCommandProcessCleanupError(failure)).toBe(true);
});
