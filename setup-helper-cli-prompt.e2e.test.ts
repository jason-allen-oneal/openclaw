// Copy to test/ for the maintained E2E runner. Local proof fixture, not a product change.
import fs from "node:fs/promises";
import path from "node:path";
import { json } from "node:stream/consumers";
import { expect, it, onTestFinished } from "vitest";
import {
  createOpenAiResponsesModelConfig,
  startOpenAiResponsesModelServer,
} from "./helpers/openai-responses-model-fixture.js";
import { writeOpenAiResponsesText } from "./helpers/openai-responses-sse.js";
import { createOpenClawTestInstance } from "./helpers/openclaw-test-instance.js";

const COLLISION = "COLLISION_SETUP_196365";
const HEALTHY = "HEALTHY_MANAGED_SETUP_196365";
const DIAGNOSIS = "This configured agent conflicts with managed setup";

it("captures authored collision and healthy managed setup-planner prompts through shipped CLI commands", {
  timeout: 300_000,
}, async ({ signal }) => {
  const outputDir = process.env.PROOF_ARTIFACT_DIR ?? path.join(process.cwd(), ".artifacts", "setup-helper-cli-proof");
  await fs.mkdir(outputDir, { recursive: true });
  const requests: unknown[] = [];
  const commands: unknown[] = [];
  onTestFinished(async () => {
    await fs.writeFile(path.join(outputDir, "model-requests.json"), JSON.stringify(requests, null, 2));
    await fs.writeFile(path.join(outputDir, "cli-results.json"), JSON.stringify(commands, null, 2));
  });
  const model = await startOpenAiResponsesModelServer({
    modelId: "setup-proof",
    bindError: "proof model server did not bind",
    onRequest: async (request, response) => {
      const body = await json(request);
      requests.push(body);
      writeOpenAiResponsesText(response, {
        text: JSON.stringify(body).includes(HEALTHY)
          ? JSON.stringify({ reply: "SETUP_PROOF_ACK" })
          : "SETUP_PROOF_ACK",
        messageId: "msg_setup_proof_" + requests.length,
        responseId: "resp_setup_proof_" + requests.length,
      });
    },
  });
  onTestFinished(model.close);

  for (const [kind, agentId, marker] of [
    ["authored-collision", "openclaw", COLLISION],
    ["healthy-managed", "main", HEALTHY],
  ] as const) {
    const config = createOpenAiResponsesModelConfig({
      baseUrl: model.baseUrl,
      providerId: "setup-proof",
      modelId: "setup-proof",
      reasoning: false,
      toolProfile: "minimal",
    });
    config.agents = { ...config.agents, entries: { [agentId]: {} } };
    config.tools = { ...config.tools, alsoAllow: ["openclaw"] };
    config.plugins = { enabled: false };
    const instance = await createOpenClawTestInstance({
      name: "setup-helper-" + kind,
      config,
      signal,
      env: {
        OPENCLAW_SKIP_PROVIDERS: undefined,
        OPENCLAW_TEST_MINIMAL_GATEWAY: undefined,
        OPENCLAW_DISABLE_BUNDLED_PLUGINS: undefined,
        OPENCLAW_AGENT_RUNTIME: undefined,
        OPENAI_API_KEY: undefined,
        OPENAI_OAUTH_TOKEN: undefined,
        ANTHROPIC_API_KEY: undefined,
      },
    });
    onTestFinished(instance.cleanup);
    const beforeRequest = requests.length;
    const message = `${marker}: Describe setup support for this synthetic installation. Make no changes and call no tools.`;
    const args = kind === "authored-collision"
      ? ["agent", "--local", "--agent", agentId, "--message", message, "--json"]
      // setup --json is overview-only and would not exercise its real command planner.
      : ["setup", "--message", message];
    const startedAt = Date.now();
    const result = await instance.cli(args, { timeoutMs: 120_000 });
    commands.push({ kind, args, startedAt, finishedAt: Date.now(), ...result });
    expect(result.code, result.stderr + "\n" + result.stdout).toBe(0);
    expect(result.stdout).toContain("SETUP_PROOF_ACK");
    const emitted = requests.slice(beforeRequest).find((body) => JSON.stringify(body).includes(marker));
    expect(emitted, "real request containing the user's marker must reach the model transport").toBeDefined();
    const body = emitted as {
      instructions?: string;
      input?: { role?: string; content?: string | { text?: string }[] }[];
    };
    const systemText = [
      body.instructions ?? "",
      ...(body.input ?? []).filter((item) => item.role === "system").map((item) =>
        typeof item.content === "string" ? item.content : (item.content ?? []).map((part) => part.text ?? "").join("\n")),
    ].join("\n");
    await fs.writeFile(path.join(outputDir, kind + "-system-prompt.txt"), systemText);
    if (kind === "authored-collision") {
      expect(systemText).toContain('Agent id "openclaw" is reserved for the system agent.');
      expect(systemText).toContain(DIAGNOSIS);
      expect(systemText).toContain("preserving its workspace, sessions, bindings, and credentials");
      expect(systemText).toContain("Do not simply rename its config key or delete its state");
    } else {
      expect(systemText).not.toContain(DIAGNOSIS);
      expect(systemText).not.toContain("Ask the Gateway operator to migrate it to a non-reserved id");
    }
  }
});
