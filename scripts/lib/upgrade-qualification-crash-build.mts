import { parse } from "@babel/parser";

/** Deliberately compile-time only. Never imported by production runtime code. */
export const qualificationCrashOwners = [
  {
    name: "intent-persistence",
    file: "src/cli/update-cli/recipe-step-execution.ts",
    expression: "await selected.prepareIntent()",
  },
  {
    name: "snapshot-completion",
    file: "src/infra/update-candidate-snapshot.ts",
    prefix: "await run({",
    contains: 'mode: "snapshot"',
  },
  {
    name: "migration-commit",
    file: "src/state/openclaw-state-db-maintenance.ts",
    prefix: "runSqliteImmediateTransactionSync(",
    functionName: "runStateSchemaMigrationTransaction",
    guard: 'pathname === "/qualification/state/state/openclaw.sqlite"',
  },
  {
    name: "package-publication",
    file: "src/infra/package-update-publication-owner.ts",
    prefix: "await activateStagedNpmPackageRoot(",
  },
  {
    name: "service-startup",
    file: "src/cli/update-cli/update-command-service.ts",
    prefix: 'await runUpdatedInstallGatewayCommand(activation, "restart")',
  },
  {
    name: "commit-intent",
    file: "src/gateway/server-upgrade-maintenance.ts",
    expression: "await startup.owner.recordCommitIntent(current.revision)",
  },
  {
    name: "gate-release",
    file: "src/process/gateway-work-admission.ts",
    expression: "GATEWAY_WORK_ADMISSION_STATE.upgradeMaintenance = undefined",
  },
  {
    name: "terminal-receipt",
    file: "src/infra/update-run-write.ts",
    prefix: "mutateRun(",
    functionName: "finishUpdateRun",
  },
] as const;

type Owner = (typeof qualificationCrashOwners)[number];
type AstNode = { type: string; start: number; end: number; [key: string]: unknown };
function isAstNode(value: unknown): value is AstNode {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof value.type === "string" &&
    "start" in value &&
    typeof value.start === "number" &&
    "end" in value &&
    typeof value.end === "number"
  );
}

/** Exact owner AST anchors refuse drift; the output is NOT a production release artifact. */
export function instrumentQualificationCrashOwner(
  code: string,
  file: string,
  options: { boundary: string; runId: string; markerDirectory?: string },
): string | undefined {
  const owner: Owner | undefined = qualificationCrashOwners.find((item) =>
    file.endsWith(`/${item.file}`),
  );
  if (!owner) {
    return undefined;
  }
  const boundaries = qualificationCrashOwners.flatMap((item) => [
    `${item.name}-before`,
    `${item.name}-after`,
  ]);
  if (!boundaries.includes(options.boundary) || !/^[a-f0-9-]{36}$/u.test(options.runId)) {
    throw new Error("Qualification build requires an exact crash boundary and original UUID.");
  }
  const source = parse(code, { sourceType: "module", plugins: ["typescript"] });
  const matches: AstNode[] = [];
  const visit = (value: unknown, functions: string[]) => {
    if (!isAstNode(value)) {
      return;
    }
    const node = value;
    const nested =
      node.type === "FunctionDeclaration" && isAstNode(node.id) && typeof node.id.name === "string"
        ? [...functions, node.id.name]
        : functions;
    if (["AwaitExpression", "CallExpression", "AssignmentExpression"].includes(node.type)) {
      const text = code.slice(node.start, node.end);
      if (
        ("expression" in owner ? text === owner.expression : text.startsWith(owner.prefix)) &&
        (!("contains" in owner) || text.includes(owner.contains)) &&
        (!("functionName" in owner) || nested.includes(owner.functionName))
      ) {
        matches.push(node);
      }
    }
    for (const child of Object.values(node)) {
      if (Array.isArray(child)) {
        child.forEach((entry) => visit(entry, nested));
      } else if (isAstNode(child)) {
        visit(child, nested);
      }
    }
  };
  visit(source.program, []);
  if (matches.length !== 1) {
    throw new Error(`Qualification crash owner drift: ${owner.file} (${matches.length} matches)`);
  }
  const selected = matches[0];
  if (!selected) {
    throw new Error("Qualification crash owner was not selected.");
  }
  const asyncCall = selected.type === "AwaitExpression";
  const guard = "guard" in owner ? owner.guard : "true";
  const replacement = `${asyncCall ? "await " : ""}__qualificationCrash${asyncCall ? "Async" : "Sync"}(${JSON.stringify(owner.name)}, ${guard}, ${asyncCall ? "async " : ""}() => (${code.slice(selected.start, selected.end)}))`;
  // The fixed marker/run ID/boundary are compiled into the isolated candidate AND
  // runner. No loader variable, CLI flag, or normal runtime can enable this path.
  const markerDirectory = options.markerDirectory ?? "/qualification/output";
  if (!markerDirectory.startsWith("/") || markerDirectory.includes("\0")) {
    throw new Error("Qualification marker requires a private absolute output directory.");
  }
  const header = `
import * as __qualificationFs from "node:fs";
function __qualificationCrashPoint(name: string, admitted: boolean): void {
  if (!admitted || name !== ${JSON.stringify(options.boundary)}) return;
  const marker = ${JSON.stringify(markerDirectory + "/boundary.json")};
  if (__qualificationFs.existsSync(marker)) return;
  const stat = __qualificationFs.readFileSync("/proc/self/stat", "utf8");
  const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
  const data = JSON.stringify({ boundary: name, runId: ${JSON.stringify(options.runId)}, pid: process.pid, startTime: fields[19] });
  const temporary = marker + "." + process.pid;
  const fd = __qualificationFs.openSync(temporary, "wx", 0o600);
  try { __qualificationFs.writeFileSync(fd, data); __qualificationFs.fsyncSync(fd); } finally { __qualificationFs.closeSync(fd); }
  __qualificationFs.renameSync(temporary, marker);
  const parent = __qualificationFs.openSync(${JSON.stringify(markerDirectory)}, "r");
  try { __qualificationFs.fsyncSync(parent); } finally { __qualificationFs.closeSync(parent); }
  process.kill(process.pid, "SIGSTOP");
}
function __qualificationCrashSync<T>(name: string, admitted: boolean, effect: () => T): T {
  __qualificationCrashPoint(name + "-before", admitted);
  const value = effect();
  __qualificationCrashPoint(name + "-after", admitted);
  return value;
}
async function __qualificationCrashAsync<T>(name: string, admitted: boolean, effect: () => Promise<T>): Promise<T> {
  __qualificationCrashPoint(name + "-before", admitted);
  const value = await effect();
  __qualificationCrashPoint(name + "-after", admitted);
  return value;
}
`;
  return header + code.slice(0, selected.start) + replacement + code.slice(selected.end);
}

export function createUpgradeQualificationCrashPlugin(options: {
  boundary: string;
  runId: string;
  markerDirectory?: string;
}) {
  return {
    name: "openclaw:release-only-qualification-crash",
    transform(code: string, id: string) {
      return instrumentQualificationCrashOwner(code, id, options);
    },
  };
}
