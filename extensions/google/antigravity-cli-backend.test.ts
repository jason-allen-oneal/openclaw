// Verifies Antigravity CLI backend config boundaries.
import { describe, expect, it } from "vitest";
import { buildGoogleAntigravityCliBackend } from "./antigravity-cli-backend.js";

describe("google-antigravity CLI backend", () => {
  it("forwards selected models and reseeds stateless runs from raw OpenClaw transcript", () => {
    const backend = buildGoogleAntigravityCliBackend();

    expect(backend.config).toEqual(
      expect.objectContaining({
        command: "agy",
        modelArg: "--model",
        sessionMode: "none",
        reseedFromRawTranscriptWhenUncompacted: true,
      }),
    );
    expect(backend.config.modelAliases).toEqual(
      expect.objectContaining({
        "gemini-3-pro-high": "gemini-3-pro-high",
        "gemini-3-pro": "gemini-3-pro-low",
        flash: "gemini-3-flash",
      }),
    );
  });
});
