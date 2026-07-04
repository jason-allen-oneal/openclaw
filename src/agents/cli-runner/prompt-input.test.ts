import { describe, expect, it } from "vitest";
import { resolvePromptInput } from "./helpers.js";

describe("CLI runner prompt input routing", () => {
  it("fails before spawning when an oversized prompt cannot be moved away from a {prompt} argv placeholder", () => {
    expect(() =>
      resolvePromptInput({
        backend: {
          args: ["--print", "{prompt}"],
          input: "arg",
          maxPromptArgChars: 8,
        } as never,
        prompt: "x".repeat(9),
      }),
    ).toThrow(/exceeds maxPromptArgChars/);
  });

  it("keeps stdin fallback for oversized prompts when args do not contain {prompt}", () => {
    expect(
      resolvePromptInput({
        backend: {
          args: ["--print"],
          input: "arg",
          maxPromptArgChars: 8,
        } as never,
        prompt: "x".repeat(9),
      }),
    ).toEqual({ stdin: "x".repeat(9) });
  });
});
