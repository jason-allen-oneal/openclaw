import { describe, expect, it } from "vitest";
import { buildGoogleAntigravityCliBackend } from "./antigravity-cli-backend.js";

describe("google antigravity CLI backend prompt limits", () => {
  it("declares an argv prompt limit for the agy {prompt} argv path", () => {
    const backend = buildGoogleAntigravityCliBackend().config;

    expect(backend.input).toBe("arg");
    expect(backend.args).toContain("{prompt}");
    expect(backend.maxPromptArgChars).toBe(8000);
  });

  it("fails closed on empty successful agy output", () => {
    const backend = buildGoogleAntigravityCliBackend().config;

    expect(backend.reliability?.failOnEmptySuccessfulOutput).toEqual({
      message: "Google Antigravity CLI exited successfully without stdout or stderr.",
      code: "cli_empty_output",
    });
  });
});
