import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { z } from "zod";
import { qualificationCrashOwners } from "./upgrade-qualification-crash-build.mjs";
import { awaitBoundary } from "./upgrade-qualification-fixture-boundary.mjs";
import {
  assertQualificationImageIdentity,
  assertRootlessQualificationDaemon,
  readHistoricalObservation,
  collectHistoricalObservation,
} from "./upgrade-qualification-observation-collection.mjs";
import { parseObservedProcess } from "./upgrade-qualification-observation-files.mjs";

const boundFile = z.strictObject({
  path: z.string().min(1),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  length: z.number().int().positive(),
});
const command = z.array(z.string().min(1)).min(1);
const cell = z.strictObject({
  id: z.string().regex(/^[a-zA-Z0-9._-]+$/),
  runId: z.string().uuid(),
  source: boundFile,
  target: boundFile,
  inputs: z.array(boundFile),
  fixture: boundFile,
  // Commands are argv, never shell fragments. The external bootstrap owns trust,
  // actual inventory, approval and mutation; this controller is only its test owner.
  apply: command,
  resume: command,
  observation: boundFile.optional(),
  boundary: z
    .enum(
      qualificationCrashOwners.flatMap((owner) => [`${owner.name}-before`, `${owner.name}-after`]),
    )
    .optional(),
});
export const upgradeQualificationRunManifestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  purpose: z.enum(["fixture", "historical-transition"]),
  // Pin a release-owner native-systemd image. No host service/container is adopted.
  image: z.string().regex(/^(?:[^\s]+@)?sha256:[a-f0-9]{64}$/),
  architecture: z.enum(["amd64", "arm64"]),
  timeoutMs: z.number().int().min(60_000).max(7_200_000),
  cells: z.array(cell).min(1),
});

export { assertQualificationImageIdentity } from "./upgrade-qualification-observation-collection.mjs";

export function qualificationProcessIdentity(stat: string) {
  const { state, startTime } = parseObservedProcess(stat);
  return { state, startTime };
}

async function copyBoundFile(binding: z.infer<typeof boundFile>, destination: string) {
  const handle = await fs.open(binding.path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size !== binding.length) {
      throw new Error(`Input type/length mismatch: ${binding.path}`);
    }
    const staged = await fs.open(destination, "wx", 0o444);
    const hash = createHash("sha256");
    let length = 0;
    try {
      for await (const bytes of handle.createReadStream({ autoClose: false })) {
        length += bytes.length;
        if (length > binding.length) {
          throw new Error(`Input grew during staging: ${binding.path}`);
        }
        hash.update(bytes);
        await staged.write(bytes);
      }
      await staged.sync();
    } finally {
      await staged.close();
    }
    if (length !== binding.length || hash.digest("hex") !== binding.sha256) {
      throw new Error(`Input digest mismatch: ${binding.path}`);
    }
  } finally {
    await handle.close();
  }
}

function executeDocker(args: string[], log: string, timeout: number, env: NodeJS.ProcessEnv) {
  const child = spawn("docker", args, { env, stdio: ["ignore", "pipe", "pipe"] });
  const chunks: Buffer[] = [];
  let length = 0;
  const keep = (bytes: Buffer) => {
    length += bytes.length;
    if (length <= 8 * 1024 * 1024) {
      chunks.push(bytes);
    }
  };
  child.stdout.on("data", keep);
  child.stderr.on("data", keep);
  const timer = setTimeout(() => child.kill("SIGKILL"), timeout);
  const settled = new Promise<{ code: number | null; output: string }>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => {
      clearTimeout(timer);
      const output = Buffer.concat(chunks).toString("utf8");
      void fs.writeFile(log, output, { flag: "wx", mode: 0o600 }).then(
        () => resolve({ code, output }),
        (error: unknown) => reject(error instanceof Error ? error : new Error(String(error))),
      );
    });
  });
  return { child, settled };
}

export { assertRootlessQualificationDaemon } from "./upgrade-qualification-observation-collection.mjs";

/** Each cell creates and retains its own systemd machine; no synthetic systemctl shim qualifies. */
export async function runUpgradeQualificationController(args: string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    strict: true,
    options: {
      "run-manifest": { type: "string" },
      output: { type: "string" },
      help: { type: "boolean" },
    },
  });
  if (values.help) {
    console.log(
      "Usage: upgrade:qualify --run-manifest <release-owner JSON> --output <new private directory>",
    );
    console.log(
      "Runs pinned historical artifacts in fresh native-systemd containers; retains logs, crash identities and assertion receipts. It neither signs nor publishes qualification.",
    );
    return;
  }
  if (!values["run-manifest"] || !values.output) {
    throw new Error(
      "Required --run-manifest and --output; JSON validation alone is upgrade:catalog:validate.",
    );
  }
  const manifest = upgradeQualificationRunManifestSchema.parse(
    JSON.parse(await fs.readFile(values["run-manifest"], "utf8")),
  );
  const names = new Set(manifest.cells.map((item) => item.id));
  if (names.size !== manifest.cells.length) {
    throw new Error("Duplicate qualification cell.");
  }
  if (
    manifest.purpose === "historical-transition" &&
    manifest.cells.some((item) => item.boundary)
  ) {
    throw new Error(
      "Instrumented crash artifacts are fixture proof, not exact production artifact qualification. Use unchanged-artifact interception for production crash evidence.",
    );
  }
  if (
    manifest.cells.some(
      (item) => item.observation && (manifest.purpose !== "historical-transition" || item.boundary),
    )
  ) {
    throw new Error(
      "Unchanged-artifact observation is historical-only and cannot use instrumented boundaries.",
    );
  }
  const output = path.resolve(values.output);
  await fs.mkdir(output, { mode: 0o700 }); // Exclusive run; never overwrite prior evidence.
  // Capture selection once; later environment/context edits cannot redirect machine operations.
  const initialEnv = { ...process.env };
  const rawChecked = async (argv: string[], log: string, env: NodeJS.ProcessEnv) => {
    const result = await executeDocker(argv, log, manifest.timeoutMs, env).settled;
    if (result.code !== 0) {
      throw new Error(`Qualification command failed (${result.code}); retained ${log}`);
    }
    return result.output;
  };
  let endpoint = initialEnv.DOCKER_HOST;
  if (initialEnv.DOCKER_CONTEXT || !endpoint) {
    const context =
      initialEnv.DOCKER_CONTEXT ||
      (
        await rawChecked(["context", "show"], path.join(output, "docker-context.log"), initialEnv)
      ).trim();
    const contexts = z
      .array(z.object({ Endpoints: z.object({ docker: z.object({ Host: z.string() }) }) }))
      .length(1)
      .parse(
        JSON.parse(
          await rawChecked(
            ["context", "inspect", context],
            path.join(output, "docker-endpoint.log"),
            initialEnv,
          ),
        ),
      );
    endpoint = contexts[0]!.Endpoints.docker.Host;
  }
  if (!endpoint?.startsWith("unix://") || !path.isAbsolute(endpoint.slice(7))) {
    throw new Error(
      "Qualification requires an explicitly resolved local rootless Docker Unix socket; remote/TLS contexts are not admitted.",
    );
  }
  const selectedEndpoint = endpoint;
  const env = { ...initialEnv };
  for (const name of [
    "DOCKER_CONTEXT",
    "DOCKER_HOST",
    "DOCKER_TLS",
    "DOCKER_TLS_VERIFY",
    "DOCKER_CERT_PATH",
  ]) {
    delete env[name];
  }
  const execute = (argv: string[], log: string, timeout: number) =>
    executeDocker(["--host", selectedEndpoint, ...argv], log, timeout, env);
  const checked = async (argv: string[], log: string, timeout: number) => {
    const result = await execute(argv, log, timeout).settled;
    if (result.code !== 0) {
      throw new Error(`Qualification command failed (${result.code}); retained ${log}`);
    }
    return result.output;
  };
  const inspectDaemon = async (log: string) =>
    assertRootlessQualificationDaemon(
      await checked(["info", "--format", "{{json .}}"], log, manifest.timeoutMs),
    );
  const daemonId = await inspectDaemon(path.join(output, "docker-isolation.log"));
  const reports: unknown[] = [];
  for (const item of manifest.cells) {
    const directory = path.join(output, item.id);
    const input = path.join(directory, "input");
    const result = path.join(directory, "output");
    await fs.mkdir(directory, { mode: 0o700 });
    await fs.mkdir(input, { mode: 0o755 });
    await fs.mkdir(result, { mode: 0o777 }); // Isolated container UID; parent is private.
    await copyBoundFile(item.source, path.join(input, "source.tgz"));
    await copyBoundFile(item.target, path.join(input, "target.tgz"));
    await copyBoundFile(item.fixture, path.join(input, "fixture.sh"));
    for (const [index, binding] of item.inputs.entries()) {
      await copyBoundFile(binding, path.join(input, `input-${index}`));
    }
    if (item.observation) {
      await copyBoundFile(item.observation, path.join(input, "observation.json"));
    }
    const observation = item.observation ? await readHistoricalObservation(input, item) : undefined;
    await fs.writeFile(path.join(input, "cell.json"), JSON.stringify(item), {
      mode: 0o444,
      flag: "wx",
    });
    const machine = `openclaw-upgrade-qualification-${randomUUID()}`;
    const log = (name: string) => path.join(directory, `${name}.log`);
    const exec = (...argv: string[]) => ["exec", machine, ...argv];
    let creationAttempted = false;
    let failure: Error | undefined;
    let apply: ReturnType<typeof execute> | undefined;
    try {
      const imageIdentity = assertQualificationImageIdentity(
        manifest.image,
        await checked(
          ["image", "inspect", manifest.image, "--format", "{{.Id}}"],
          log("image-identity"),
          manifest.timeoutMs,
        ),
      );
      if ((await inspectDaemon(log("daemon-before-create"))) !== daemonId) {
        throw new Error("Qualification Docker daemon identity changed before machine creation.");
      }
      creationAttempted = true;
      await checked(
        [
          "run",
          "--detach",
          "--name",
          machine,
          "--network",
          "none",
          "--cgroupns",
          "private",
          "--privileged",
          "--platform",
          `linux/${manifest.architecture}`,
          "--tmpfs",
          "/run",
          "--tmpfs",
          "/run/lock",
          "--tmpfs",
          "/tmp",
          "--mount",
          `type=bind,src=${input},dst=/qualification/input,readonly`,
          "--mount",
          `type=bind,src=${result},dst=/qualification/output`,
          manifest.image,
          "/sbin/init",
        ],
        log("machine-create"),
        manifest.timeoutMs,
      );
      const machineImageIdentity = await checked(
        ["inspect", machine, "--format", "{{.Image}}"],
        log("machine-image-identity"),
        manifest.timeoutMs,
      );
      if (machineImageIdentity.trim() !== imageIdentity) {
        throw new Error("Qualification machine did not start the inspected immutable image.");
      }
      await checked(
        exec("systemctl", "is-system-running", "--wait"),
        log("systemd-boot"),
        manifest.timeoutMs,
      );
      const manager = await checked(
        exec(
          "/bin/sh",
          "-ec",
          'test "$(cat /proc/1/comm)" = systemd; test -d /run/systemd/system; test "$(od -An -tx1 -N4 /proc/1/exe | tr -d " \n")" = 7f454c46; systemctl show --property=Version --value; systemctl --no-pager list-units --type=service',
        ),
        log("native-systemd"),
        manifest.timeoutMs,
      );
      if (!manager.trim()) {
        throw new Error("Native systemd returned no manager evidence.");
      }
      await checked(
        exec(
          "npm",
          "install",
          "--global",
          "--prefix",
          "/qualification/npm",
          "--ignore-scripts",
          "--offline",
          "/qualification/input/source.tgz",
        ),
        log("historical-install"),
        manifest.timeoutMs,
      );
      await checked(
        exec(
          "/bin/bash",
          "/qualification/input/fixture.sh",
          "seed",
          "/qualification/input/cell.json",
        ),
        log("fixture-seed"),
        manifest.timeoutMs,
      );
      await checked(
        exec(
          "/bin/bash",
          "/qualification/input/fixture.sh",
          "assert-source",
          "/qualification/input/cell.json",
        ),
        log("assert-source"),
        manifest.timeoutMs,
      );
      if (observation) {
        let observationCommand = 0;
        await collectHistoricalObservation({
          observation,
          result,
          directory,
          runId: item.runId,
          execute: (argv) =>
            checked(
              exec(...argv),
              log(`unchanged-observation-${observationCommand++}`),
              manifest.timeoutMs,
            ),
        });
      } else {
        apply = execute(exec(...item.apply), log("apply"), manifest.timeoutMs);
      }
      if (item.boundary && apply) {
        const marker = z
          .strictObject({
            boundary: z.string(),
            pid: z.number().int().min(2),
            startTime: z.string().regex(/^[0-9]+$/),
            runId: z.string().uuid(),
          })
          .parse(await awaitBoundary(result, manifest.timeoutMs, apply.settled));
        if (marker.boundary !== item.boundary || marker.runId !== item.runId) {
          throw new Error("Crash marker belongs to another boundary/run.");
        }
        // A real proc observation, not a fixture-authored stopped/healthy boolean.
        const stat = await checked(
          exec("cat", `/proc/${marker.pid}/stat`),
          log("crash-process"),
          manifest.timeoutMs,
        );
        const identity = qualificationProcessIdentity(stat);
        if (identity.startTime !== marker.startTime) {
          throw new Error("Crash marker process identity changed.");
        }
        await checked(
          exec("kill", "-STOP", String(marker.pid)),
          log("crash-stop"),
          manifest.timeoutMs,
        );
        const stopped = qualificationProcessIdentity(
          await checked(
            exec("cat", `/proc/${marker.pid}/stat`),
            log("crash-stopped-process"),
            manifest.timeoutMs,
          ),
        );
        if (!["T", "t"].includes(stopped.state) || stopped.startTime !== marker.startTime) {
          throw new Error("Crash process was not the stopped original process.");
        }
        await checked(
          exec("kill", "-KILL", String(marker.pid)),
          log("crash-kill"),
          manifest.timeoutMs,
        );
        await apply.settled; // Join before original-run resume. Nonzero after SIGKILL is expected.
        await checked(exec(...item.resume), log("resume"), manifest.timeoutMs);
      } else if (apply && (await apply.settled).code !== 0) {
        throw new Error("Historical apply failed; diagnostics retained.");
      }
      await checked(
        exec(
          "/bin/bash",
          "/qualification/input/fixture.sh",
          "assert-target",
          "/qualification/input/cell.json",
        ),
        log("assert-target"),
        manifest.timeoutMs,
      );
      await checked(
        exec("systemctl", "--no-pager", "list-units", "--type=service"),
        log("native-services-final"),
        manifest.timeoutMs,
      );
      reports.push({
        id: item.id,
        runId: item.runId,
        source: item.source,
        target: item.target,
        boundary:
          item.boundary ?? (observation ? `${observation.boundary}-${observation.side}` : null),
        unchangedArtifactObservation: Boolean(observation),
        outcome: "passed",
        directory,
      });
    } catch (error) {
      await fs.writeFile(path.join(directory, "failure.txt"), String(error), {
        flag: "wx",
        mode: 0o600,
      });
      failure = error instanceof Error ? error : new Error(String(error));
    } finally {
      // Remove only the fresh named machine. Host state, images and existing
      // containers remain untouched; all inputs and diagnostics remain retained.
      if (creationAttempted) {
        const cleanup = await execute(
          ["rm", "--force", machine],
          log("machine-cleanup"),
          manifest.timeoutMs,
        ).settled;
        if (
          cleanup.code !== 0 &&
          !(cleanup.output.includes("No such container") && cleanup.output.includes(machine))
        ) {
          failure = new AggregateError(
            [
              ...(failure ? [failure] : []),
              new Error(`Qualification machine cleanup remains uncertain: ${machine}`),
            ],
            "Qualification cell failed or its isolated machine cleanup is uncertain.",
          );
        }
      }
      if (apply) {
        apply.child.kill("SIGKILL");
        await apply.settled;
      }
    }
    if (failure) {
      throw failure;
    }
  }
  const report = {
    schemaVersion: 1,
    purpose: manifest.purpose,
    authenticated: false,
    signed: false,
    releaseQualification: false,
    cells: reports,
  };
  await fs.writeFile(path.join(output, "collection.json"), JSON.stringify(report, null, 2), {
    flag: "wx",
    mode: 0o600,
  });
  console.log(JSON.stringify({ collected: reports.length, output, releaseQualification: false }));
}
