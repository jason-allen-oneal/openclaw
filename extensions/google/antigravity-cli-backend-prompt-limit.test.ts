import { describe, expect, it } from "vitest";
import { resolvePromptInput } from "../../src/agents/cli-runner/helpers.js";
import { buildGoogleAntigravityCliBackend } from "./antigravity-cli-backend.js";

describe("google antigravity CLI backend prompt limits", () => {
  it("fails before spawning agy when the prompt exceeds argv-safe length", () => {
    const backend = buildGoogleAntigravityCliBackend().config;
    const limit = backend.maxPromptArgChars ?? 0;

    expect(limit).toBeGreaterThan(0);
    expect(backend.args).toContain("{prompt}");
    expect(() =>
      resolvePromptInput({
        backend,
        prompt: "x".repeat(limit + 1),
      }),
    ).toThrow(/exceeds maxPromptArgChars/);
  });

  it("fails closed on empty successful agy output", () => {
    const backend = buildGoogleAntigravityCliBackend().config;

    expect(backend.reliability?.failOnEmptySuccessfulOutput).toEqual({
      message: "Google Antigravity CLI exited successfully without stdout or stderr.",
      code: "cli_empty_output",
    });
  });
});
