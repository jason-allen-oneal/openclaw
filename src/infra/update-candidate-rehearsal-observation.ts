import path from "node:path";
import { createConfigIO } from "../config/io.factory.js";
import type { UpdateCandidateRehearsal } from "./update-candidate-rehearsal.js";
import {
  readUpdateStateSchemaVersions,
  UpdateCandidateDatabaseMappingSchema,
  UpdateStateSchemaVersionsSchema,
  type UpdateCandidateDatabaseMapping,
  type UpdateStateSchemaVersion,
} from "./update-candidate-state.js";

export type UpdateCandidateRehearsalStateObservation = {
  sourceStateVersions: UpdateStateSchemaVersion[];
  stateVersions: UpdateStateSchemaVersion[];
};

/** Consume the snapshot writer's exact alias-to-physical-copy manifest, never invert hashes. */
export function projectUpdateCandidateStateObservation(
  privateStateRoot: string,
  mappings: readonly UpdateCandidateDatabaseMapping[],
  sourceStateVersions: readonly UpdateStateSchemaVersion[],
  privateStateVersions: readonly UpdateStateSchemaVersion[],
): UpdateCandidateRehearsalStateObservation {
  const source = UpdateStateSchemaVersionsSchema.parse(sourceStateVersions);
  const observed = UpdateStateSchemaVersionsSchema.parse(privateStateVersions);
  const selected = new Map<string, string>();
  const privatePaths = new Set<string>();
  for (const value of mappings) {
    const mapping = UpdateCandidateDatabaseMappingSchema.parse(value);
    const relative = path.relative(privateStateRoot, mapping.privatePath);
    if (
      !path.isAbsolute(mapping.privatePath) ||
      !relative ||
      relative === ".." ||
      relative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relative)
    ) {
      throw new Error("Rehearsal database mapping escaped its exact private snapshot root.");
    }
    if (selected.has(mapping.sourcePath)) {
      throw new Error("Rehearsal database mapping repeats a source locator.");
    }
    selected.set(mapping.sourcePath, mapping.privatePath);
    privatePaths.add(mapping.privatePath);
  }
  if (selected.size !== source.length || source.some((entry) => !selected.has(entry.path))) {
    throw new Error(
      "Rehearsal database mapping differs from its retained source snapshot inventory.",
    );
  }
  const current = new Map<string, Omit<UpdateStateSchemaVersion, "path">>();
  for (const { path: privatePath, ...version } of observed) {
    if (!privatePaths.has(privatePath) || current.has(privatePath)) {
      throw new Error("Rehearsal observed an unmapped or duplicate private database locator.");
    }
    current.set(privatePath, version);
  }
  if (current.size !== privatePaths.size) {
    throw new Error(
      "Rehearsal did not observe every retained private database; absence cannot be inferred.",
    );
  }
  const stateVersions = source.map((entry) => {
    const privatePath = selected.get(entry.path)!;
    return Object.assign({ path: entry.path }, current.get(privatePath)!);
  });
  return { sourceStateVersions: source, stateVersions };
}

/** Called only after all canary children settle and before their private files are cleaned up. */
export async function collectUpdateCandidateRehearsalStateObservation(params: {
  rehearsal: UpdateCandidateRehearsal;
  root: string;
  nodeRunner?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  assertCurrent?: () => void;
}): Promise<UpdateCandidateRehearsalStateObservation> {
  const { rehearsal } = params;
  if (!rehearsal.databaseMappings || !rehearsal.sourceStateVersions) {
    throw new Error(
      "Candidate snapshot worker does not provide exact database observation mappings.",
    );
  }
  params.signal?.throwIfAborted();
  params.assertCurrent?.();
  const snapshot = await createConfigIO({
    configPath: rehearsal.configPath,
    env: rehearsal.env,
    observe: false,
    pluginValidation: "core-only",
  }).readConfigFileSnapshot();
  params.assertCurrent?.();
  if (!snapshot.valid) {
    throw new Error(
      "Post-rehearsal configuration cannot select verified private database observations.",
    );
  }
  const stateVersions = await readUpdateStateSchemaVersions({
    root: params.root,
    nodeRunner: params.nodeRunner,
    timeoutMs: params.timeoutMs,
    signal: params.signal,
    stateDir: rehearsal.stateDir,
    env: rehearsal.env,
    config: snapshot.config,
  });
  params.signal?.throwIfAborted();
  params.assertCurrent?.();
  return projectUpdateCandidateStateObservation(
    rehearsal.stateDir,
    rehearsal.databaseMappings,
    rehearsal.sourceStateVersions,
    stateVersions,
  );
}
