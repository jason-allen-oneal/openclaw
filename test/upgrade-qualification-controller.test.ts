import { spawn } from "node:child_process";
import { once } from "node:events";
import { watch } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parse } from "@babel/parser";
import { describe, expect, it } from "vitest";
import {
  qualificationProcessIdentity,
  upgradeQualificationRunManifestSchema,
} from "../scripts/lib/upgrade-qualification-controller.mts";
import {
  instrumentQualificationCrashOwner,
  qualificationCrashOwners,
} from "../scripts/lib/upgrade-qualification-crash-build.mts";

const runId = "00000000-0000-4000-8000-000000000001";

describe("release-only historical qualification controller", () => {
  it("rejects an unpinned systemd image and commands encoded as shell strings", () => {
    expect(
      upgradeQualificationRunManifestSchema.safeParse({
        schemaVersion: 1,
        purpose: "fixture",
        image: "debian:latest",
        architecture: "amd64",
        timeoutMs: 60_000,
        cells: [],
      }).success,
    ).toBe(false);
  });

  it("parses real Linux process identity without confusing spaces in comm with stat fields", () => {
    const fields = ["T", ...Array.from({ length: 18 }, () => "0"), "91235", "0"];
    expect(qualificationProcessIdentity(`135 (node worker (test)) ${fields.join(" ")}`)).toEqual({
      state: "T",
      startTime: "91235",
    });
    expect(() => qualificationProcessIdentity("135 (node) T")).toThrow(/identity/);
  });

  it("anchors every crash point to the actual existing owner and refuses source drift", async () => {
    for (const owner of qualificationCrashOwners) {
      const file = path.resolve(owner.file);
      const source = await fs.readFile(file, "utf8");
      const result = instrumentQualificationCrashOwner(source, file, {
        boundary: `${owner.name}-after`,
        runId,
      });
      expect(result).toBeDefined();
      expect(() => parse(result!, { sourceType: "module", plugins: ["typescript"] })).not.toThrow();
      expect(() =>
        instrumentQualificationCrashOwner("export const drift = true;", file, {
          boundary: `${owner.name}-before`,
          runId,
        }),
      ).toThrow(/owner drift/);
    }
  });

  it.skipIf(process.platform !== "linux")(
    "actually stops and can be killed before/after gate mutation in an isolated child",
    async ({ signal }) => {
      const root = await fs.mkdtemp(path.join(os.tmpdir(), "upgrade-qualification-crash-"));
      try {
        for (const position of ["before", "after"]) {
          const directory = path.join(root, position);
          await fs.mkdir(directory);
          const effect = path.join(directory, "effect");
          const source = `import fs from "node:fs";
const GATEWAY_WORK_ADMISSION_STATE = { set upgradeMaintenance(value) { fs.writeFileSync(${JSON.stringify(effect)}, String(value)); } };
GATEWAY_WORK_ADMISSION_STATE.upgradeMaintenance = undefined;
`;
          const transformed = instrumentQualificationCrashOwner(
            source,
            "/fixture/src/process/gateway-work-admission.ts",
            {
              boundary: `gate-release-${position}`,
              runId,
              markerDirectory: directory,
            },
          );
          const filename = path.join(directory, "runner.mts");
          await fs.writeFile(filename, transformed!);
          const watcher = watch(directory);
          const markerReady = new Promise<void>((resolve, reject) => {
            signal.addEventListener(
              "abort",
              () => {
                const reason: unknown = signal.reason;
                reject(reason instanceof Error ? reason : new Error(String(reason)));
              },
              { once: true },
            );
            watcher.on("change", (_event, name) => {
              if (name === "boundary.json") {
                resolve();
              }
            });
          });
          const child = spawn(process.execPath, [filename], { stdio: "ignore" });
          const closed = once(child, "close");
          try {
            await Promise.race([
              markerReady,
              closed.then(() => {
                throw new Error("Crash child exited before stopping");
              }),
            ]);
            const marker = JSON.parse(
              await fs.readFile(path.join(directory, "boundary.json"), "utf8"),
            );
            expect(marker).toMatchObject({
              boundary: `gate-release-${position}`,
              runId,
              pid: child.pid,
            });
            const identity = qualificationProcessIdentity(
              await fs.readFile(`/proc/${child.pid}/stat`, "utf8"),
            );
            expect(identity.startTime).toBe(marker.startTime);
            child.kill("SIGKILL");
            await closed;
            if (position === "before") {
              await expect(fs.stat(effect)).rejects.toMatchObject({ code: "ENOENT" });
            } else {
              expect(await fs.readFile(effect, "utf8")).toBe("undefined");
            }
          } finally {
            watcher.close();
            child.kill("SIGKILL");
            await closed;
          }
        }
      } finally {
        await fs.rm(root, { recursive: true, force: true });
      }
    },
  );
});
