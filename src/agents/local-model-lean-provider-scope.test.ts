import { describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import type { AnyAgentTool } from "./agent-tools.types.js";
import { filterLocalModelLeanTools, isLocalModelLeanEnabled } from "./local-model-lean.js";

function configWithLeanEnabled(): OpenClawConfig {
  return {
    agents: {
      list: [
        {
          id: "main",
          experimental: {
            localModelLean: true,
          },
        },
      ],
    },
  };
}

function tools(names: string[]): AnyAgentTool[] {
  return names.map((name) => ({ name })) as AnyAgentTool[];
}

describe("local model lean provider scope", () => {
  it("does not treat a hosted OpenAI-compatible provider as local", () => {
    const config = configWithLeanEnabled();
    const modelScope = {
      modelProvider: "meta",
      modelApi: "openai-completions",
      modelId: "muse-spark-1.1",
    } as const;

    expect(isLocalModelLeanEnabled({ config, agentId: "main", ...modelScope })).toBe(false);
    expect(
      filterLocalModelLeanTools({
        tools: tools(["read", "browser", "cron", "message", "exec"]),
        config,
        agentId: "main",
        ...modelScope,
      }).map((tool) => tool.name),
    ).toEqual(["read", "browser", "cron", "message", "exec"]);
  });

  it("keeps LM Studio eligible when only provider and model id are resolved", () => {
    const config = configWithLeanEnabled();
    const modelScope = {
      modelProvider: "lmstudio",
      modelId: "qwen3-coder",
    } as const;

    expect(isLocalModelLeanEnabled({ config, agentId: "main", ...modelScope })).toBe(true);
    expect(
      filterLocalModelLeanTools({
        tools: tools(["read", "browser", "cron", "message", "exec"]),
        config,
        agentId: "main",
        ...modelScope,
      }).map((tool) => tool.name),
    ).toEqual(["read", "exec"]);
  });

  it("preserves legacy config-only resolution when model scope is unavailable", () => {
    const config = configWithLeanEnabled();

    expect(isLocalModelLeanEnabled({ config, agentId: "main" })).toBe(true);
  });
});
