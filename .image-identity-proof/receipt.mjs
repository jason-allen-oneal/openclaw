import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = process.cwd();
const proof = path.dirname(fileURLToPath(import.meta.url));
const target = "82928de42d294787c398466e288368d8654f3e5e";
const stage = process.argv[2];
assert(["source", "dependencies", "ci-build", "qa-build", "staged", "completed"].includes(stage));
assert.equal(process.env.PROOF_TARGET_SHA, target);
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
assert.equal(git("rev-parse", "HEAD"), target);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sha256 = async (file) => hash(await fs.readFile(file));
const manifest = JSON.parse(await fs.readFile(path.join(proof, "source-manifest.json"), "utf8"));
assert.equal(manifest.target, target);
for (const [file, expected] of Object.entries(manifest.sha256)) {
  assert.equal(await sha256(path.join(root, file)), expected, file);
}
const out = process.env.PROOF_RECEIPT_DIR;
assert(out && path.isAbsolute(out));
await fs.mkdir(out, { recursive: true });
const record = {
  stage, target, head: git("rev-parse", "HEAD"), tree: git("rev-parse", "HEAD^{tree}"),
  workflowCommit: process.env.GITHUB_SHA, runId: process.env.GITHUB_RUN_ID,
  attempt: process.env.GITHUB_RUN_ATTEMPT, node: process.version, at: new Date().toISOString(),
  lockfileSha256: await sha256(path.join(root, "pnpm-lock.yaml")),
  trackedDiff: git("diff", "--name-only", "HEAD"),
  proofSha256: {},
};
for (const file of ["receipt.mjs", "source-manifest.json", "vision-provider-identity.e2e.test.ts"]) {
  record.proofSha256[file] = await sha256(path.join(proof, file));
}
assert.equal(record.trackedDiff, "", "normal install/build must not alter tracked source");
if (stage === "source") {
  await fs.writeFile(path.join(out, "source.json"), JSON.stringify(record, null, 2) + "\n");
} else {
  const before = JSON.parse(await fs.readFile(path.join(out, "source.json"), "utf8"));
  assert.equal(record.lockfileSha256, before.lockfileSha256, "frozen lock changed");
}
if (stage === "dependencies") {
  record.pnpmVersion = execFileSync("pnpm", ["--version"], { encoding: "utf8" }).trim();
}
async function collect(directory, base = directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = {};
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) Object.assign(files, await collect(file, base));
    else if (entry.isSymbolicLink()) files[path.relative(base, file)] = { symlink: await fs.readlink(file) };
    else if (entry.isFile()) files[path.relative(base, file)] = await sha256(file);
  }
  return files;
}
if (stage === "ci-build" || stage === "qa-build") {
  await fs.access(path.join(root, "dist", "index.js"));
  record.dist = await collect(path.join(root, "dist"));
  record.distManifestSha256 = hash(JSON.stringify(record.dist));
  if (stage === "qa-build") {
    for (const plugin of ["qa-channel", "qa-lab"]) {
      await fs.access(path.join(root, "dist", "extensions", plugin, "openclaw.plugin.json"));
    }
  }
}
if (stage === "completed") {
  const rows = (await fs.readFile(path.join(out, "channel-receipts.jsonl"), "utf8"))
    .trim().split("\n").map((line) => JSON.parse(line));
  assert.equal(rows.length, 2, "both owner and legacy channel scenarios must execute");
  assert.deepEqual(rows.map((row) => row.calls[0].provider), ["gemini", "google"]);
  record.channel = rows;
  record.remaining = [
    "Captured-owner/ambient-no-owner built retained-tool mismatch",
    "Captured-no-owner/ambient-owner built retained-tool mismatch",
    "Unchanged baseline build: failure must be attributed to identity defect, not setup",
    "Live provider credential/inference integration is intentionally outside synthetic proof",
  ];
}
await fs.writeFile(path.join(out, stage + ".json"), JSON.stringify(record, null, 2) + "\n");
console.log(JSON.stringify({ stage, target, runId: record.runId, lockfileSha256: record.lockfileSha256 }));
