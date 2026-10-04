import { createHash } from "node:crypto";
import { constants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import type { AuthenticatedUpgradeRecipeCatalog } from "../../infra/upgrade-recipes/catalog.js";
import { validateUpgradeReleaseQualification } from "../../infra/upgrade-recipes/qualification.js";
import type { RecipeUpdateArtifactSelectors } from "./update-recipe-context.js";

/** Actual signed qualification evidence; catalog advertisement alone is not an upgrade proof. */
export async function verifyRecipeQualificationEvidence(
  recipe: Pick<RecipeUpdateArtifactSelectors, "artifactsDirectory" | "route">,
  catalog: AuthenticatedUpgradeRecipeCatalog,
): Promise<void> {
  const qualification = catalog.catalog.qualifications.find(
    (entry) => entry.id === recipe.route.qualificationId,
  );
  const artifact = catalog.catalog.artifacts.find(
    (entry) => entry.id === qualification?.evidenceArtifactId,
  );
  if (!artifact || artifact.length > 8 * 1024 * 1024) {
    throw new Error("Recipe lacks bounded authenticated historical qualification evidence.");
  }
  const filename = path.join(recipe.artifactsDirectory, artifact.id);
  const handle = await fs.open(filename, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await handle.stat();
    if (
      !before.isFile() ||
      before.size !== artifact.length ||
      (before.mode & 0o077) !== 0 ||
      (process.getuid && before.uid !== process.getuid())
    ) {
      throw new Error("Recipe qualification evidence has changed or is not owner-private.");
    }
    const bytes = await handle.readFile();
    const after = await handle.stat();
    const named = await fs.lstat(filename);
    if (
      bytes.length !== artifact.length ||
      createHash("sha256").update(bytes).digest("hex") !== artifact.sha256 ||
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.ctimeMs !== after.ctimeMs ||
      before.mtimeMs !== after.mtimeMs ||
      named.dev !== after.dev ||
      named.ino !== after.ino
    ) {
      throw new Error(
        "Recipe qualification evidence differs from its exact authenticated artifact.",
      );
    }
    validateUpgradeReleaseQualification({
      catalog: catalog.catalog,
      evidence: JSON.parse(bytes.toString("utf8")),
      changedContracts: [],
      dispositions: [],
    });
  } finally {
    await handle.close();
  }
}
