import { createUiE2eVitestConfig } from "<candidate-checkout>/test/vitest/vitest.ui-e2e.config.ts";

const repo = "<candidate-checkout>";
const proof = "<proof-artifacts>/real-gateway-ui";
const base = createUiE2eVitestConfig();
const template = base.test.projects.find((project) => project.test.name === "ui-e2e-serial-standalone");
const include = [proof + "/proof.test.ts"];
export default {
  ...base,
  root: repo,
  cacheDir: proof + "/cache-root",
  test: {
    ...base.test,
    include,
    maxWorkers: 1,
    projects: [{
      ...template,
      root: repo,
      cacheDir: proof + "/cache-project",
      test: {
        ...template.test,
        name: "recovery-storage-real-gateway-proof",
        include,
        exclude: [],
        hookTimeout: 180_000,
        testTimeout: 120_000,
        fileParallelism: false,
        maxWorkers: 1,
      },
    }],
  },
};
