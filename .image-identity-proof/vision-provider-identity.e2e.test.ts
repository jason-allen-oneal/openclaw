import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { useAutoCleanupTempDirTracker } from "../../../helpers/temp-dir.js";
import { withFixturePlugin } from "../runtime/fixture-plugin-config.js";
import { readMockRequests, useMediaGateway } from "./media-gateway.test-support.js";

const ACTIVE_MODEL = "gpt-5.6-luna";
const MODEL = "fixture-vision";
const MARKER = "IMAGE_IDENTITY_CHANNEL_PROOF";
const FINAL_REPLY = "QA_IMAGE_IDENTITY_OK";
const PNG = "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAHElEQVR4nGP4z8DwnxLMMGrAsDCAQv2jBgwPAwAxtf4Q24P5oAAAAABJRU5ErkJggg==";
const PLUGIN = "image-identity-fixture";
const SUMMARY = "Synthetic provider summary: red above blue.";
const digest = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
const tempDirs = useAutoCleanupTempDirTracker(afterEach);

type Call = {
  handler: string;
  provider: string;
  model: string;
  profile: string;
  sha256: string;
  bytes: number;
  mime: string;
};

// The external plugin supplies only inference and its own observation log.
// Launcher, plugin discovery/admission, image staging, selection and reply are real.
async function writeProviderFixture(root: string, distinct: boolean) {
  const pluginDir = path.join(root, PLUGIN);
  const callsPath = path.join(root, "provider-calls.jsonl");
  const ids = distinct ? ["google", "gemini"] : ["google"];
  const metadata = Object.fromEntries(ids.map((id) => [id, {
    capabilities: ["image"], defaultModels: { image: MODEL },
  }]));
  await fs.mkdir(pluginDir);
  await fs.writeFile(path.join(pluginDir, "openclaw.plugin.json"), JSON.stringify({
    id: PLUGIN,
    activation: { onStartup: true },
    providers: ids,
    contracts: { mediaUnderstandingProviders: ids },
    mediaUnderstandingProviderMetadata: metadata,
    configSchema: { type: "object", additionalProperties: false, properties: {} },
  }));
  const source = `
    const fs = require("node:fs");
    const { createHash } = require("node:crypto");
    module.exports = {
      id: ${JSON.stringify(PLUGIN)},
      register(api) {
        for (const id of ${JSON.stringify(ids)}) {
          api.registerMediaUnderstandingProvider({
            id, capabilities: ["image"], defaultModels: { image: ${JSON.stringify(MODEL)} },
            async describeImage(request) {
              fs.appendFileSync(${JSON.stringify(callsPath)}, JSON.stringify({
                handler: id, provider: request.provider, model: request.model,
                profile: request.profile, mime: request.mime,
                bytes: request.buffer.length,
                sha256: createHash("sha256").update(request.buffer).digest("hex"),
              }) + "\\n");
              return { text: ${JSON.stringify(SUMMARY)}, model: request.model };
            },
          });
        }
      },
    };
  `;
  await fs.writeFile(path.join(pluginDir, "index.js"), source);
  return { pluginDir, callsPath, pluginSourceSha256: digest(source) };
}

describe("built QA channel provider identity", () => {
  const fixture = useMediaGateway();

  it.each([
    { name: "distinct registered owner", distinct: true, expected: "gemini" },
    { name: "unclaimed historical alias", distinct: false, expected: "google" },
  ])("$name", async ({ name, distinct, expected }) => {
    const root = tempDirs.make("image-identity-proof-");
    const providerFixture = await writeProviderFixture(root, distinct);
    const conversation = { id: distinct ? "identity-native" : "identity-legacy", kind: "direct" as const };
    const profile = expected + ":synthetic";
    const { state, transport, mock } = await fixture.start({
      primaryModel: `mock-openai/${ACTIVE_MODEL}`,
      alternateModel: "mock-openai/gpt-5.6-luna-alt",
      mutateConfig(config) {
        const cfg = withFixturePlugin(config, providerFixture.pluginDir, PLUGIN);
        const models = cfg.models!.providers!;
        const active = models["mock-openai"]!.models.find((model) => model.id === ACTIVE_MODEL);
        if (!active) throw new Error("maintained QA active model missing");
        active.input = ["text"];
        const model = {
          id: MODEL, name: MODEL, input: ["text", "image"] as ("text" | "image")[],
          reasoning: false, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 8192, maxTokens: 1024,
        };
        for (const id of distinct ? ["google", "gemini"] : ["google"]) {
          models[id] = {
            api: "openai-responses", baseUrl: models["mock-openai"]!.baseUrl,
            apiKey: "synthetic-image-proof-only", models: [{ ...model }],
          };
        }
        // The fixture is the only Google handler. Never invoke a live bundled provider.
        cfg.plugins!.entries = { ...cfg.plugins!.entries, google: { enabled: false } };
        cfg.agents!.defaults!.imageModel = { primary: `gemini/${MODEL}` };
        cfg.tools = {
          ...cfg.tools, media: {
            ...cfg.tools?.media,
            image: {
              enabled: true,
              prompt: MARKER,
              models: [{ provider: "gemini", model: MODEL, profile }],
            },
          },
        };
        return cfg;
      },
    });
    await transport.sendInbound({
      accountId: "default", conversation, senderId: conversation.id,
      text: `${MARKER}: use the image description and reply exactly ${FINAL_REPLY}.`,
      attachments: [{
        id: "synthetic-split-image", kind: "image", mimeType: "image/png",
        fileName: "red-top-blue-bottom.png", contentBase64: PNG,
      }],
    });
    const finalOutbound = await transport.waitForOutbound({
      conversation, textIncludes: FINAL_REPLY, timeoutMs: 90_000,
    });
    const calls: Call[] = (await fs.readFile(providerFixture.callsPath, "utf8"))
      .trim().split("\n").map((line) => JSON.parse(line));
    expect(calls).toEqual([expect.objectContaining({
      handler: expected, provider: expected, model: MODEL, profile, mime: "image/png",
    })]);
    expect(calls[0]!.bytes).toBeGreaterThan(0);
    expect(calls[0]!.sha256).toMatch(/^[a-f0-9]{64}$/);
    const requests = (await readMockRequests(mock.baseUrl)).filter(
      (request) => request.allInputText.includes(MARKER),
    );
    expect(requests).toHaveLength(1);
    expect(requests[0]!.model).toBe(ACTIVE_MODEL);
    expect(requests[0]!.imageInputCount).toBe(0);
    expect(requests[0]!.allInputText).toContain(SUMMARY);
    const visible = state.getSnapshot().messages.filter(
      (message) => message.direction === "outbound" && message.accountId === "default" &&
        message.conversation.id === conversation.id &&
        message.conversation.kind === conversation.kind && !message.deleted,
    );
    expect(visible).toEqual([expect.objectContaining({ id: finalOutbound.id, text: FINAL_REPLY })]);
    if (process.env.IMAGE_IDENTITY_PROOF_RECEIPTS) {
      await fs.appendFile(process.env.IMAGE_IDENTITY_PROOF_RECEIPTS, JSON.stringify({
        name, calls, inputSha256: digest(Buffer.from(PNG, "base64")),
        pluginSourceSha256: providerFixture.pluginSourceSha256,
        mainModel: requests[0]!.model, mainModelReceivedSummary: true, visibleReplyCount: visible.length,
        inference: "synthetic", authScope: "profile forwarding only; no live credential resolution",
      }) + "\n");
    }
  }, 180_000);
});
