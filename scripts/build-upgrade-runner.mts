import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { build } from "tsdown";
import { runtimeProcessEntrypoints } from "../src/infra/runtime-process-entrypoints.js";
import { upgradeRecipeRunnerProcessNames } from "../src/infra/upgrade-recipes/runner-process-contract.js";
import { isDirectRunUrl } from "./lib/direct-run.mjs";
import {
  createManagedHandoffBuildConfigs,
  createSealedRecoveryBuildConfig,
} from "./lib/managed-handoff-build-config.mts";
import { createUpgradeQualificationCrashPlugin } from "./lib/upgrade-qualification-crash-build.mjs";

/** Build only; production bundles still require authenticated runtime/native artifact provisioning. */
export async function buildUpgradeRecipeRunner(
  outputDirectory: string,
  options?: { qualification: { boundary: string; runId: string } },
): Promise<void> {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const output = path.resolve(outputDirectory);
  if (
    output === path.join(root, "dist") ||
    output.startsWith(`${path.join(root, "dist")}${path.sep}`)
  ) {
    throw new Error(
      "Standalone runner build requires private output outside shared dist artifacts.",
    );
  }
  const config = createSealedRecoveryBuildConfig({
    currentModuleUrl: new URL("../src/cli/update-cli/standalone-updater-entry.ts", import.meta.url)
      .href,
    sourceWorkerName: "standalone-updater-entry",
    distWorkerPath: "openclaw-updater.mjs",
  });
  const workers = upgradeRecipeRunnerProcessNames;
  const workerConfigs = workers.map((name) => {
    const entry = runtimeProcessEntrypoints[name];
    const source = fileURLToPath(new URL(`./${entry.sourceWorkerName}.ts`, entry.currentModuleUrl));
    const virtual = `sealed-upgrade-worker:${name}`;
    const workerConfig = createSealedRecoveryBuildConfig({
      ...entry,
      distWorkerPath: entry.distWorkerPath.replace(/\.js$/u, ".mjs"),
    });
    return Object.assign({}, workerConfig, {
      entry: { [entry.distWorkerPath.replace(/\.js$/u, "")]: virtual },
      plugins: [
        workerConfig.plugins,
        {
          name: "openclaw:sealed-upgrade-worker",
          resolveId(id: string) {
            return id === virtual ? `\0${virtual}` : null;
          },
          load(id: string) {
            return id === `\0${virtual}`
              ? `import ${JSON.stringify(fileURLToPath(new URL("../src/infra/sealed-runtime-bootstrap.ts", import.meta.url)))};
                 import { registerUpgradeRecipeRunnerProcesses } from ${JSON.stringify(fileURLToPath(new URL("../src/infra/upgrade-recipes/runner-processes.ts", import.meta.url)))};
                 registerUpgradeRecipeRunnerProcesses(new URL(${JSON.stringify(`${path.posix.relative(path.posix.dirname(entry.distWorkerPath), ".")}/`)}, import.meta.url));
                 await import(${JSON.stringify(source)});`
              : null;
          },
        },
      ],
    });
  });
  for (const sealed of [config, ...createManagedHandoffBuildConfigs(), ...workerConfigs]) {
    // Disable project config discovery: this bounded owner must not accidentally
    // run the application's entire tsdown matrix or write its shared artifacts.
    await build({
      ...sealed,
      ...(options
        ? {
            plugins: [sealed.plugins, createUpgradeQualificationCrashPlugin(options.qualification)],
          }
        : {}),
      config: false,
      cwd: root,
      outDir: output,
      clean: false,
    });
  }
  if (options) {
    await fs.writeFile(
      path.join(output, "QUALIFICATION_FIXTURE_ONLY.json"),
      JSON.stringify({ purpose: "fixture", ...options.qualification }),
      { flag: "wx", mode: 0o600 },
    );
  }
}
if (isDirectRunUrl(process.argv[1], import.meta.url)) {
  const output = process.argv[2];
  if (!output) {
    throw new Error("Supply a private output directory for the standalone runner build.");
  }
  const { values } = parseArgs({
    args: process.argv.slice(3),
    strict: true,
    options: {
      "qualification-boundary": { type: "string" },
      "qualification-run-id": { type: "string" },
    },
  });
  if (Boolean(values["qualification-boundary"]) !== Boolean(values["qualification-run-id"])) {
    throw new Error("Qualification builds require both the boundary and original UUID.");
  }
  const boundary = values["qualification-boundary"];
  const runId = values["qualification-run-id"];
  await buildUpgradeRecipeRunner(
    output,
    boundary && runId ? { qualification: { boundary, runId } } : undefined,
  );
}
