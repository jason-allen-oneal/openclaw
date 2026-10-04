export type VerifiedUpgradeRecipeRunnerBundle = {
  readonly root: string;
  readonly manifestDigest: string;
  readonly closureDigest: string;
  readonly runtimePath: string;
  readonly entrypointPath: string;
  readonly nativeDependencies: readonly string[];
};
