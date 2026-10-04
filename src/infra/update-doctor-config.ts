import fs from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import { isRecord } from "@openclaw/normalization-core/record-coerce";
import JSON5 from "json5";
import type { z } from "zod";
import type {
  UpdateDoctorConfigChangeSchema,
  UpdateDoctorConfigWriteRefusalSchema,
} from "./update-doctor-config-schema.js";

export type UpdateDoctorConfigChange = z.infer<typeof UpdateDoctorConfigChangeSchema>;
export type UpdateDoctorConfigWriteRefusal = z.infer<typeof UpdateDoctorConfigWriteRefusalSchema>;

export function formatUpdateDoctorConfigWriteRefusal(
  refusal: UpdateDoctorConfigWriteRefusal,
): string {
  return `Doctor config promotion refused for top-level keys: ${refusal.keys.join(", ") || "none recorded"}. ${refusal.reason}: ${refusal.message}`;
}

export function formatUpdateDoctorConfigChange(change: UpdateDoctorConfigChange): string {
  return change.kind === "key"
    ? `Doctor changed config key: ${change.key}.`
    : `Doctor migration: ${change.message}`;
}

export function getUpdateDoctorConfigFailureReason(refusal?: UpdateDoctorConfigWriteRefusal) {
  return refusal
    ? refusal.reason === "requester-revoked"
      ? "requester-revoked"
      : "repair-requires-config-change"
    : undefined;
}

export function createUpdateDoctorConfigWarningStep(
  root: string,
  changes: readonly UpdateDoctorConfigChange[],
) {
  const keys = [
    ...new Set(changes.flatMap((change) => (change.kind === "key" ? [change.key] : []))),
  ].toSorted();
  return {
    name: "doctor-config-changes",
    command: "report Doctor config changes",
    cwd: root,
    durationMs: 0,
    exitCode: 0,
    advisory: {
      kind: "recoverable-maintenance" as const,
      message: `Doctor changed config keys ${keys.join(", ") || "none recorded"} during update checks. Check those settings after the update; this version cannot verify that they were applied.`,
    },
  };
}

/** Shipped Doctors without typed receipts expose only their private config write window. */
export async function observeUpdateDoctorConfigChanges(
  configPath: string,
  before: unknown,
  recorded?: UpdateDoctorConfigChange[],
): Promise<UpdateDoctorConfigChange[]> {
  if (recorded) {
    return recorded;
  }
  if (!isRecord(before)) {
    return [];
  }
  const after: unknown = JSON5.parse(await fs.readFile(configPath, "utf8"));
  if (!isRecord(after)) {
    return [];
  }
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((key) => !isDeepStrictEqual(before[key], after[key]))
    .toSorted()
    .map((key) => ({ kind: "key", key }));
}
