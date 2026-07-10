from pathlib import Path
import re


def sub(path: str, pattern: str, replacement: str, count: int = 1, flags: int = 0) -> None:
    p = Path(path)
    text = p.read_text()
    updated, matches = re.subn(pattern, replacement, text, count=count, flags=flags)
    if matches != count:
        raise SystemExit(f"{path}: expected {count} replacements for {pattern!r}, found {matches}")
    p.write_text(updated)


path = "src/agents/local-model-lean.ts"
sub(
    path,
    r"(type LocalModelLeanModelScope = \{\n  modelProvider\?: string;\n  modelApi\?: string;\n)(  modelId\?: string;)",
    r"\1  modelBaseUrl?: string;\n\2",
)
sub(path, r'(  "meta",\n)', r'\1  "minimax",\n')
sub(path, r'(  "moonshot",\n)', r'\1  "opencode",\n  "opencode-go",\n')
sub(
    path,
    r"(  const modelId = normalizeModelScopeValue\(params\.modelId\);\n\n)(  const providerConfig = resolveConfiguredModelProvider\(params\);)",
    r"\1  const resolvedEndpointLocality = resolveConfiguredEndpointLocality(params.modelBaseUrl);\n  if (resolvedEndpointLocality !== undefined) {\n    return resolvedEndpointLocality;\n  }\n\n\2",
)

path = "src/agents/agent-tools.ts"
sub(
    path,
    r"(function applyModelProviderToolPolicy\([\s\S]*?modelProvider\?: string;\n    modelApi\?: string;\n)(    modelId\?: string;)",
    r"\1    modelBaseUrl?: string;\n\2",
)
sub(
    path,
    r"(    modelProvider: params\?\.modelProvider,\n    modelApi: params\?\.modelApi,\n)(    modelId: params\?\.modelId,)",
    r"\1    modelBaseUrl: params?.modelBaseUrl,\n\2",
)
sub(
    path,
    r"(  /\*\* Model API for the current provider \(used for provider-native tool arbitration\)\. \*/\n  modelApi\?: string;\n)",
    r"\1  /** Resolved endpoint used by the active model transport. */\n  modelBaseUrl?: string;\n",
)
sub(
    path,
    r"(    modelProvider: options\?\.modelProvider,\n    modelApi: options\?\.modelApi,\n)(    modelId: options\?\.modelId,)",
    r"\1    modelBaseUrl: options?.modelBaseUrl,\n\2",
)

path = "src/agents/embedded-agent-runner/run/attempt.ts"
p = Path(path)
text = p.read_text()
updated, matches = re.subn(
    r"(modelApi: params\.model\.api,\n)(\s+)(?!modelBaseUrl:)",
    r"\1\2modelBaseUrl: params.model.baseUrl,\n\2",
    text,
)
if matches < 4:
    raise SystemExit(f"{path}: expected at least 4 model API propagation sites, found {matches}")
p.write_text(updated)

path = "src/agents/harness/tool-surface-bridge.ts"
sub(
    path,
    r"(  modelId\?: string;\n  modelProvider\?: string;\n)(  modelToolsEnabled: boolean;)",
    r"\1  modelBaseUrl?: string;\n\2",
)
p = Path(path)
text = p.read_text()
updated, matches = re.subn(
    r"(    modelProvider: params\.modelProvider,\n)(    modelId: params\.modelId,)",
    r"\1    modelBaseUrl: params.modelBaseUrl,\n\2",
    text,
)
if matches < 2:
    raise SystemExit(f"{path}: expected at least 2 model-scope propagation sites, found {matches}")
p.write_text(updated)

path = "extensions/copilot/src/tool-bridge.ts"
sub(
    path,
    r"(    modelId: input\.modelId,\n    modelProvider: input\.modelProvider,\n)(    modelToolsEnabled: true,)",
    r"\1    modelBaseUrl: attemptParams.model?.baseUrl,\n\2",
)

path = "src/agents/local-model-lean-provider-scope.test.ts"
p = Path(path)
text = p.read_text()
marker = '  it("keeps LM Studio eligible when only provider and model id are resolved", () => {'
test = '''  it.each(["minimax", "opencode", "opencode-go"])(
    "disables lean mode from the resolved hosted endpoint for %s",
    (modelProvider) => {
      const config: OpenClawConfig = {
        agents: {
          list: [
            {
              id: "main",
              model: "ollama/qwen3-coder",
              experimental: { localModelLean: true },
            },
          ],
        },
      };

      expect(
        isLocalModelLeanEnabled({
          config,
          agentId: "main",
          modelProvider,
          modelBaseUrl: "https://models.example.com/v1",
          modelId: "hosted-model",
        }),
      ).toBe(false);
    },
  );

'''
if marker not in text:
    raise SystemExit(f"{path}: insertion marker missing")
p.write_text(text.replace(marker, test + marker, 1))

path = "src/agents/harness/tool-surface-bridge.test.ts"
p = Path(path)
text = p.read_text()
old_scope = "  modelScope: { modelProvider?: string; modelId?: string } = {},"
new_scope = "  modelScope: { modelProvider?: string; modelBaseUrl?: string; modelId?: string } = {},"
if text.count(old_scope) != 1:
    raise SystemExit(f"{path}: createRuntime model scope marker missing")
text = text.replace(old_scope, new_scope, 1)
marker = '  it("still applies lean filtering for known local harness providers", () => {'
test = '''  it("keeps the full harness surface for a resolved hosted endpoint", () => {
    const config: OpenClawConfig = {
      agents: {
        list: [
          {
            id: "main",
            model: "ollama/qwen3-coder",
            experimental: { localModelLean: true },
          },
        ],
      },
    };
    const runtime = createRuntime(config, {
      modelProvider: "opencode",
      modelBaseUrl: "https://models.example.com/v1",
      modelId: "hosted-model",
    });

    expect(runtime.toolSearchControlsEnabled).toBe(false);
    expect(
      runtime
        .compactTools(tools(["read", "browser", "cron", "message", "exec"]))
        .tools.map((tool) => tool.name),
    ).toEqual(["read", "browser", "cron", "message", "exec"]);
    runtime.cleanup();
  });

'''
if marker not in text:
    raise SystemExit(f"{path}: insertion marker missing")
p.write_text(text.replace(marker, test + marker, 1))
