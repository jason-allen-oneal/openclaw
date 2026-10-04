import { spawn } from "node:child_process";
import { once } from "node:events";
import { watch } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parse } from "@babel/parser";
import { describe, expect, it } from "vitest";
import {
  assertQualificationImageIdentity,
  assertRootlessQualificationDaemon,
  runUpgradeQualificationController,
  qualificationProcessIdentity,
  upgradeQualificationRunManifestSchema,
} from "../scripts/lib/upgrade-qualification-controller.mts";
import {
  instrumentQualificationCrashOwner,
  qualificationCrashOwners,
} from "../scripts/lib/upgrade-qualification-crash-build.mts";

const runId = "00000000-0000-4000-8000-000000000001";

describe("release-only historical qualification controller", () => {
  it("requires the actual rootless security option, not an isolation attestation", () => {
    expect(
      assertRootlessQualificationDaemon(
        JSON.stringify({
          ID: "daemon",
          SecurityOptions: ["name=rootless", "name=seccomp,profile=builtin"],
        }),
      ),
    ).toBe("daemon");
    for (const SecurityOptions of [[], ["rootless"], ["name=rootless=false"]]) {
      expect(() =>
        assertRootlessQualificationDaemon(JSON.stringify({ ID: "daemon", SecurityOptions })),
      ).toThrow(/rootless Docker/);
    }
    for (const observation of ["bad-json", "{}", '{"ID":"daemon","SecurityOptions":null}']) {
      expect(() => assertRootlessQualificationDaemon(observation)).toThrow();
    }
  });

  it.each(["host", "context"])(
    "refuses a rootful daemon before machine creation with %s selection",
    async (selection) => {
      const root = await fs.mkdtemp(path.join(os.tmpdir(), "qualification-isolation-"));
      const originalPath = process.env.PATH;
      const originalHost = process.env.DOCKER_HOST;
      const originalContext = process.env.DOCKER_CONTEXT;
      try {
        const calls = path.join(root, "calls.jsonl");
        await fs.writeFile(
          path.join(root, "docker"),
          `#!${process.execPath}
import fs from "node:fs";
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(calls)}, JSON.stringify(args)+"\\n");
if (args[0] === "context" && args[1] === "inspect") {
  console.log(JSON.stringify([{Endpoints:{docker:{Host:"unix:///fixture/context.sock"}}}]));
  process.exit(0);
}
if (args[2] !== "info") process.exit(9);
console.log(JSON.stringify({ID:"rootful",SecurityOptions:["name=seccomp,profile=builtin"]}));
`,
          { mode: 0o700 },
        );
        process.env.PATH = `${root}${path.delimiter}${originalPath ?? ""}`;
        process.env.DOCKER_HOST = "unix:///fixture/rootful.sock";
        if (selection === "context") {
          process.env.DOCKER_CONTEXT = "selected-rootless";
        } else {
          delete process.env.DOCKER_CONTEXT;
        }
        const binding = { path: "/not-read", length: 1, sha256: "a".repeat(64) };
        const manifest = path.join(root, "manifest.json");
        await fs.writeFile(
          manifest,
          JSON.stringify({
            schemaVersion: 1,
            purpose: "fixture",
            image: `sha256:${"a".repeat(64)}`,
            architecture: "amd64",
            timeoutMs: 60_000,
            cells: [
              {
                id: "cell",
                runId,
                source: binding,
                target: binding,
                fixture: binding,
                inputs: [],
                apply: ["apply"],
                resume: ["resume"],
              },
            ],
          }),
        );
        await expect(
          runUpgradeQualificationController([
            "--run-manifest",
            manifest,
            "--output",
            path.join(root, "output"),
          ]),
        ).rejects.toThrow(/rootless Docker/);
        expect(
          (await fs.readFile(calls, "utf8"))
            .trim()
            .split("\n")
            .map((line) => JSON.parse(line)),
        ).toEqual([
          ...(selection === "context" ? [["context", "inspect", "selected-rootless"]] : []),
          [
            "--host",
            selection === "context"
              ? "unix:///fixture/context.sock"
              : "unix:///fixture/rootful.sock",
            "info",
            "--format",
            "{{json .}}",
          ],
        ]);
      } finally {
        for (const [name, value] of [
          ["PATH", originalPath],
          ["DOCKER_HOST", originalHost],
          ["DOCKER_CONTEXT", originalContext],
        ]) {
          if (value === undefined) {
            delete process.env[name!];
          } else {
            process.env[name!] = value;
          }
        }
        await fs.rm(root, { recursive: true, force: true });
      }
    },
  );

  it("binds a local content-addressed image and refuses a substituted machine identity", () => {
    const image = `sha256:${"a".repeat(64)}`;
    expect(assertQualificationImageIdentity(image, `${image}\n`)).toBe(image);
    expect(() => assertQualificationImageIdentity(image, `sha256:${"b".repeat(64)}`)).toThrow(
      /pinned local image/,
    );
    expect(() => assertQualificationImageIdentity(image, "debian:latest")).toThrow(/immutable/);
  });
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
