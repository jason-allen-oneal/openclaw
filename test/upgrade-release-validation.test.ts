import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  runUpgradeReleaseValidation,
  upgradeReleaseValidationManifest,
  validateTargetUpgradeRelease,
} from "../scripts/lib/upgrade-release-validation.mts";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function temporaryRoot() {
  const root = await mkdtemp(path.join(tmpdir(), "upgrade-release-gate-"));
  roots.push(root);
  return root;
}

describe("recipe-capable release admission", () => {
  it("preserves frozen and protocol-1 package acceptance without reading qualification artifacts", async () => {
    for (const packageJson of [{}, { openclaw: { updateAdmissionProtocol: 1 } }]) {
      expect(upgradeReleaseValidationManifest(packageJson)).toBeUndefined();
      await expect(
        validateTargetUpgradeRelease({
          packageJson,
          targetRoot: "/nonexistent",
          targetArtifactPath: "/nonexistent/package.tgz",
        }),
      ).resolves.toBeUndefined();
    }
  });

  it("requires an explicit supported recipe protocol and release-owner manifest", () => {
    expect(() =>
      upgradeReleaseValidationManifest({ openclaw: { upgradeRecipeProtocol: 2 } }),
    ).toThrow(/Unsupported/);
    expect(() =>
      upgradeReleaseValidationManifest({ openclaw: { upgradeRecipeProtocol: 1 } }),
    ).toThrow();
    expect(
      upgradeReleaseValidationManifest({
        openclaw: {
          updateAdmissionProtocol: 1,
          upgradeRecipeProtocol: 1,
          upgradeReleaseValidationManifest: "qualification.json",
        },
      }),
    ).toBe("qualification.json");
  });

  it("fails closed before execution when a declared manifest is missing", async () => {
    const root = await temporaryRoot();
    await expect(
      validateTargetUpgradeRelease({
        packageJson: {
          openclaw: { upgradeRecipeProtocol: 1, upgradeReleaseValidationManifest: "missing.json" },
        },
        targetRoot: root,
        targetArtifactPath: path.join(root, "target.tgz"),
      }),
    ).rejects.toThrow(/release-owner qualification manifest/);
  });

  it("cannot use fixture mode or another source revision for package publication", async () => {
    const root = await temporaryRoot();
    await writeFile(
      path.join(root, "catalog.json"),
      JSON.stringify({
        schemaVersion: 1,
        id: "empty",
        artifacts: [],
        releases: [],
        recipes: [],
        adapters: [],
        qualifications: [],
      }),
    );
    const args = [
      "--catalog",
      path.join(root, "catalog.json"),
      "--evidence",
      "unused",
      "--artifacts-dir",
      root,
      "--dispositions",
      "unused",
    ];
    const targetCommit = "a".repeat(40);
    await expect(
      runUpgradeReleaseValidation([...args, "--fixture", "--head", targetCommit], { targetCommit }),
    ).rejects.toThrow(/production evidence/);
    await expect(
      runUpgradeReleaseValidation([...args, "--head", "b".repeat(40)], { targetCommit }),
    ).rejects.toThrow(/exact target commit/);
    await expect(
      runUpgradeReleaseValidation([...args, "--head", targetCommit], { targetCommit }),
    ).rejects.toThrow(/no qualified routes/);
  });

  it("rejects evidence for a different target package even when its version is shared", async () => {
    const root = await temporaryRoot();
    const targetCommit = "a".repeat(40);
    const catalog = {
      schemaVersion: 1,
      id: "target-binding",
      artifacts: [{ id: "target", sha256: "b".repeat(64), length: 1 }],
      releases: [
        {
          id: "release",
          version: "2026.9.8",
          buildId: "target-build",
          commit: targetCommit,
          artifactId: "target",
          runtimeFamily: "node",
          stateContracts: { state: 20, agent: 24 },
        },
      ],
      recipes: [],
      adapters: [],
      qualifications: [
        {
          id: "route",
          recipe: { id: "recipe", revision: 1 },
          sourceReleaseId: "old",
          targetReleaseId: "release",
          installKind: "npm",
          platform: { os: "linux", arch: "x64", serviceMode: "systemd" },
          runtimeFamily: "node",
          stateContractClass: "state",
          evidenceArtifactId: "evidence",
        },
      ],
    };
    const catalogPath = path.join(root, "catalog.json");
    await writeFile(catalogPath, JSON.stringify(catalog));
    const args = [
      "--catalog",
      catalogPath,
      "--evidence",
      "unused",
      "--artifacts-dir",
      root,
      "--dispositions",
      "unused",
      "--head",
      targetCommit,
    ];
    const expected = { targetCommit, targetArtifactSha256: "c".repeat(64) };
    await expect(runUpgradeReleaseValidation(args, expected)).rejects.toThrow(
      /release package and source commit/,
    );
    catalog.releases[0]!.commit = "d".repeat(40);
    await writeFile(catalogPath, JSON.stringify(catalog));
    await expect(runUpgradeReleaseValidation(args, { targetCommit })).rejects.toThrow(
      /release package and source commit/,
    );
  });
});
