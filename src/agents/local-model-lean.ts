/**
 * Local-model lean tool filtering.
 * Removes high-latency or channel-dependent tools for local models while
 * preserving explicitly required delivery tools.
 */
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { normalizeAgentId, parseAgentSessionKey } from "../routing/session-key.js";
import { resolveAgentConfig, resolveDefaultAgentId } from "./agent-scope-config.js";
import type { AnyAgentTool } from "./agent-tools.types.js";
import { compileGlobPatterns, matchesAnyGlobPattern } from "./glob-pattern.js";
import { expandToolGroups, normalizeToolName } from "./tool-policy.js";

const LOCAL_MODEL_LEAN_DENY_TOOL_NAMES = new Set([
  "browser",
  "cron",
  "image_generate",
  "message",
  "music_generate",
  "pdf",
  "tts",
  "video_generate",
]);
const LOCAL_MODEL_LEAN_DIRECT_TOOL_NAMES = new Set(["exec"]);
const LOCAL_MODEL_LEAN_TOOL_SEARCH_DEFAULTS = {
  enabled: true,
  mode: "tools",
  searchDefaultLimit: 5,
  maxSearchLimit: 10,
} as const;

type LocalModelLeanModelScope = {
  modelProvider?: string;
  modelApi?: string;
  modelId?: string;
};

function hasResolvedModelScope(params: LocalModelLeanModelScope): boolean {
  return (
    params.modelProvider !== undefined ||
    params.modelApi !== undefined ||
    params.modelId !== undefined
  );
}

function isLocalLeanEligibleModel(params: LocalModelLeanModelScope): boolean {
  const provider = (params.modelProvider ?? "").trim().toLowerCase();
  const api = (params.modelApi ?? "").trim().toLowerCase();
  const modelId = (params.modelId ?? "").trim().toLowerCase();

  return (
    provider === "ollama" ||
    provider === "ollama-local" ||
    provider === "llama-cpp" ||
    provider === "lmstudio" ||
    provider === "lm-studio" ||
    api === "ollama" ||
    api === "llama-cpp" ||
    api === "lmstudio" ||
    api === "lm-studio" ||
    modelId.startsWith("ollama/") ||
    modelId.startsWith("ollama-local/") ||
    modelId.startsWith("lmstudio/") ||
    modelId.startsWith("lm-studio/")
  );
}

function resolvePreservedLocalModelLeanToolNames(names?: Iterable<string>) {
  if (!names) {
    return [];
  }
  return compileGlobPatterns({
    raw: expandToolGroups([...names]).filter((name) => normalizeToolName(name) !== "*"),
    normalize: normalizeToolName,
  });
}

/** Resolves tool names that must survive local-model lean filtering. */
export function resolveLocalModelLeanPreserveToolNames(params?: {
  toolNames?: Iterable<string>;
  forceMessageTool?: boolean;
  sourceReplyDeliveryMode?: string;
}): string[] {
  const names = [...(params?.toolNames ?? [])];
  if (params?.forceMessageTool || params?.sourceReplyDeliveryMode === "message_tool_only") {
    names.push("message");
  }
  return [...new Set(names)];
}

// Agent id may arrive explicitly, through the session key, or via config default.
// Resolve once so default/agent experimental flags use the same scope.
function resolveLocalModelLeanAgentId(params: {
  config?: OpenClawConfig;
  agentId?: string;
  sessionKey?: string;
}): string | undefined {
  const explicitAgentId =
    typeof params.agentId === "string" && params.agentId.trim()
      ? normalizeAgentId(params.agentId)
      : undefined;
  if (explicitAgentId) {
    return explicitAgentId;
  }
  const parsedSessionAgentId = parseAgentSessionKey(params.sessionKey)?.agentId;
  if (parsedSessionAgentId) {
    return normalizeAgentId(parsedSessionAgentId);
  }
  return params.config ? resolveDefaultAgentId(params.config) : undefined;
}

/** Returns true when local-model lean mode is enabled for the selected agent. */
export function isLocalModelLeanEnabled(
  params: {
    config?: OpenClawConfig;
    agentId?: string;
    sessionKey?: string;
  } & LocalModelLeanModelScope,
): boolean {
  if (hasResolvedModelScope(params) && !isLocalLeanEligibleModel(params)) {
    return false;
  }

  const normalizedAgentId = resolveLocalModelLeanAgentId(params);
  const resolvedExperimental =
    params.config && normalizedAgentId
      ? (resolveAgentConfig(params.config, normalizedAgentId)?.experimental ??
        params.config.agents?.defaults?.experimental)
      : params.config?.agents?.defaults?.experimental;
  return resolvedExperimental?.localModelLean ?? false;
}

/** Filters tools for local-model lean mode while preserving required delivery tools. */
export function filterLocalModelLeanTools(
  params: {
    tools: AnyAgentTool[];
    config?: OpenClawConfig;
    agentId?: string;
    sessionKey?: string;
    preserveToolNames?: Iterable<string>;
  } & LocalModelLeanModelScope,
): AnyAgentTool[] {
  if (!isLocalModelLeanEnabled(params)) {
    return params.tools;
  }
  const preservedToolNames = resolvePreservedLocalModelLeanToolNames(params.preserveToolNames);
  return params.tools.filter((tool) => {
    const normalizedName = normalizeToolName(tool.name);
    return (
      matchesAnyGlobPattern(normalizedName, preservedToolNames) ||
      !LOCAL_MODEL_LEAN_DENY_TOOL_NAMES.has(normalizedName)
    );
  });
}

// Lean mode targets coding-tuned local models; keep their familiar shell
// primitive visible instead of requiring a catalog search to rediscover it.
export function shouldCatalogToolForLocalModelLean(tool: AnyAgentTool): boolean {
  return !LOCAL_MODEL_LEAN_DIRECT_TOOL_NAMES.has(normalizeToolName(tool.name));
}

export function applyLocalModelLeanToolSearchDefaults(
  params: {
    config?: OpenClawConfig;
    agentId?: string;
    sessionKey?: string;
  } & LocalModelLeanModelScope,
): OpenClawConfig | undefined {
  if (!params.config || !isLocalModelLeanEnabled(params)) {
    return params.config;
  }
  if (params.config.tools?.toolSearch !== undefined) {
    return params.config;
  }
  return {
    ...params.config,
    tools: {
      ...params.config.tools,
      toolSearch: LOCAL_MODEL_LEAN_TOOL_SEARCH_DEFAULTS,
    },
  };
}
