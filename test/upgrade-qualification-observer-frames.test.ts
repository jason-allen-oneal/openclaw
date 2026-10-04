import { createHash } from "node:crypto";
import { expect, it, vi } from "vitest";
import { observePausedBoundary } from "../scripts/lib/upgrade-qualification-inspector.mjs";
import { assertObservationAudit } from "../scripts/lib/upgrade-qualification-observation-files.mjs";

const original = "00000000-0000-4000-8000-000000000001";
const source = "function originalOwner() { return commit(); }";
const script = {
  path: "/qualification/runner/owner.mjs",
  length: Buffer.byteLength(source),
  sha256: createHash("sha256").update(source).digest("hex"),
};
const location = { lineNumber: 4, columnNumber: 8 };
const ancestor = {
  callFrameId: "original-owner",
  functionName: "originalOwner",
  location: { scriptId: "owner", ...location },
};
const top = {
  callFrameId: "sqlite-commit",
  functionName: "commit",
  location: { scriptId: "sqlite", lineNumber: 2, columnNumber: 4 },
};
function fixture(maintenanceHeld = true) {
  const frame = { script, functionName: ancestor.functionName, location };
  const mapping = {
    location: top.location,
    guardExpression: "options.database === database",
    actionId: "publish",
    operation: "state.schema.repair",
    facts: { runId: "original.runId", actionId: "original.action", operation: "options.operation" },
    factFrames: { runId: frame, actionId: frame },
  };
  const values: Record<string, Record<string, unknown>> = {
    "sqlite-commit": {
      "options.database === database": true,
      "options.operation": "state.schema.repair",
      "state.upgradeMaintenance !== undefined": maintenanceHeld,
      "state.suspendPhase": "suspended",
    },
    "original-owner": { "original.runId": original, "original.action": "publish" },
  };
  const transport = {
    call: vi.fn(async (method: string, params: { callFrameId?: string; expression?: string }) => {
      if (method === "Debugger.getScriptSource") {
        return { scriptSource: source };
      }
      return { result: { value: values[params.callFrameId ?? ""]?.[params.expression ?? ""] } };
    }),
  };
  return {
    transport,
    mapping,
    original,
    pause: { callFrames: [top, ancestor] },
    scripts: new Map([["owner", { url: script.path }]]),
    binding: {},
    onLiveTarget: undefined,
  };
}

it("reads original identity from the exact synchronous owner without inventing a parent job", async () => {
  const input = fixture();
  const observed = await observePausedBoundary(input);
  expect(observed.observedFacts).toEqual({
    runId: original,
    actionId: "publish",
    operation: "state.schema.repair",
  });
  expect(input.transport.call).toHaveBeenCalledWith("Debugger.evaluateOnCallFrame", {
    callFrameId: "original-owner",
    expression: "original.runId",
    returnByValue: true,
    throwOnSideEffect: true,
  });
  expect(input.transport.call.mock.calls.some(([method]) => method === "Debugger.resume")).toBe(
    false,
  );
});

it.each(["missing", "ambiguous", "relocated", "changed-source"])(
  "holds a %s original owner frame",
  async (kind) => {
    const input = fixture();
    if (kind === "missing") {
      input.pause.callFrames = [top];
    } else if (kind === "ambiguous") {
      input.pause.callFrames.push({ ...ancestor, callFrameId: "duplicate" });
    } else if (kind === "relocated") {
      input.pause.callFrames = [
        top,
        { ...ancestor, location: { ...ancestor.location, columnNumber: 9 } },
      ];
    } else {
      input.mapping.factFrames.runId.script = { ...script, sha256: "b".repeat(64) };
    }
    await expect(observePausedBoundary(input)).rejects.toThrow(/frame|immutable script/);
  },
);

it("does not reinterpret a side-effect refusal as permission to use a different frame", async () => {
  const input = fixture();
  input.transport.call.mockImplementationOnce(async () => ({
    result: { value: undefined },
    exceptionDetails: { text: "side effect" },
  }));
  await expect(observePausedBoundary(input)).rejects.toThrow(/Read-only guard observation refused/);
  expect(input.transport.call).toHaveBeenCalledTimes(1);
});

it.each([true, false])(
  "observes held-runtime maintenance=%s before SIGSTOP without claiming suspension is open",
  async (maintenanceHeld) => {
    const input = fixture(maintenanceHeld);
    const heldRuntime = {
      maintenanceHeldExpression: "state.upgradeMaintenance !== undefined",
      suspensionPhaseExpression: "state.suspendPhase",
      expected: { maintenanceHeld, suspensionPhase: "suspended" },
    };
    await expect(
      observePausedBoundary({ ...input, mapping: { ...input.mapping, heldRuntime } }),
    ).resolves.toMatchObject({
      heldRuntime: {
        maintenanceHeld,
        suspensionPhase: "suspended",
        stage: "debugger-held-before-kernel-stop",
      },
    });
    await expect(
      observePausedBoundary({
        ...input,
        mapping: {
          ...input.mapping,
          heldRuntime: {
            ...heldRuntime,
            expected: { ...heldRuntime.expected, maintenanceHeld: !maintenanceHeld },
          },
        },
      }),
    ).rejects.toThrow(/reviewed boundary side/);
  },
);

it("binds frame selectors, held observations and execution snapshot semantics into the review audit", () => {
  const input = fixture();
  const mapping = {
    ...input.mapping,
    id: "selected",
    phase: "fresh",
    script,
    entry: script,
    source: script,
    sourceMap: script,
    sourceLocation: location,
    snapshotContract: "original-run-pre-migration-backup",
  };
  const binding = { boundary: "snapshot-completion", side: "after", runId: original };
  const audit = {
    ...mapping,
    ...binding,
    purpose: "reviewed-unchanged-artifact-boundary",
    mappingId: mapping.id,
    scriptSha256: script.sha256,
    entrySha256: script.sha256,
    sourceSha256: script.sha256,
    sourceMapSha256: script.sha256,
    guardReadOnly: true,
    effectOrdering: true,
    basis: "Exact backup owner continuation",
  };
  expect(() => assertObservationAudit(audit, mapping, binding)).not.toThrow();
  expect(() =>
    assertObservationAudit({ ...audit, factFrames: undefined }, mapping, binding),
  ).toThrow(/exact inputs/);
  expect(() =>
    assertObservationAudit({ ...audit, snapshotContract: undefined }, mapping, binding),
  ).toThrow(/exact inputs/);
  expect(() =>
    assertObservationAudit({ ...audit, heldRuntime: { invented: true } }, mapping, binding),
  ).toThrow(/exact inputs/);
});
