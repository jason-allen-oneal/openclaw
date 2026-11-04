import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { text } from "node:stream/consumers";
import { afterEach, describe, expect, it } from "vitest";
import { writeOpenAiResponsesText } from "../../../helpers/openai-responses-sse.js";
import { useAutoCleanupTempDirTracker } from "../../../helpers/temp-dir.js";
import { readMockRequests, useMediaGateway } from "../media/media-gateway.test-support.js";
import { listen } from "../media/media-http.test-support.js";
import { withFixturePlugin } from "./fixture-plugin-config.js";

const ACTIVE_MODEL = "gpt-5.6-luna";
const MODEL = "fixture-vision";
const MARKER = "IMAGE_IDENTITY_CHANNEL_PROOF";
const FINAL_REPLY = "QA_IMAGE_IDENTITY_OK";
const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAHElEQVR4nGP4z8DwnxLMMGrAsDCAQv2jBgwPAwAxtf4Q24P5oAAAAABJRU5ErkJggg==";
const PLUGIN = "image-lifecycle-provider";
const HARNESS = "image-lifecycle-harness";
const SUMMARY = "Synthetic provider summary: red above blue.";
const digest = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
const tempDirs = useAutoCleanupTempDirTracker(afterEach);
type Owner = "google" | "gemini";
type Mode = "native" | "model-only" | "legacy";
const credential = (owner: Owner) => "synthetic-image-proof-" + owner;
type NativeCall = {
  handler: Owner;
  provider: string;
  model: string;
  mime: string;
  bytes: number;
  sha256: string;
};
type WireCall = {
  method: string;
  path: string;
  model?: string;
  credential: Owner | "none" | "unknown";
  images: Array<{ mime: string; bytes: number; sha256: string }>;
};

// Observe every request, not only inference. Never store headers or credential values.
async function startImageEndpoint(owner: Owner) {
  const calls: WireCall[] = [];
  const errors: string[] = [];
  const server = createServer((request, response) => {
    void (async () => {
      const auth = request.headers.authorization;
      const call: WireCall = {
        method: request.method ?? "",
        path: request.url ?? "",
        images: [],
        credential: !auth
          ? "none"
          : auth === "Bearer " + credential("google")
            ? "google"
            : auth === "Bearer " + credential("gemini")
              ? "gemini"
              : "unknown",
      };
      calls.push(call);
      const raw = await text(request);
      const body = raw ? JSON.parse(raw) : {};
      call.model = body.model;
      for (const item of body.input ?? []) {
        for (const content of item.content ?? []) {
          if (content.type !== "input_image") {
            continue;
          }
          const match = /^data:([^;]+);base64,(.+)$/s.exec(content.image_url ?? "");
          if (!match) {
            throw new Error("expected inline synthetic image at final provider boundary");
          }
          const bytes = Buffer.from(match[2]!, "base64");
          call.images.push({ mime: match[1]!, bytes: bytes.length, sha256: digest(bytes) });
        }
      }
      if (request.method === "GET" && request.url === "/v1/models") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ object: "list", data: [{ id: MODEL, object: "model" }] }));
        return;
      }
      if (request.method !== "POST" || request.url !== "/v1/responses") {
        throw new Error("unexpected image-provider route");
      }
      writeOpenAiResponsesText(response, {
        text: SUMMARY,
        messageId: "msg_" + owner,
        responseId: "resp_" + owner,
      });
    })().catch((error: unknown) => {
      errors.push(error instanceof Error ? error.message : String(error));
      if (!response.headersSent) {
        response.writeHead(400, { "content-type": "text/plain" });
      }
      response.end("synthetic image endpoint rejected request");
    });
  });
  const listener = await listen(server);
  return { ...listener, calls, errors };
}

async function waitFor<T>(
  name: string,
  check: () => Promise<T | undefined>,
  timeout = 45000,
): Promise<T> {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const value = await check();
    if (value !== undefined) return value;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("timeout waiting for " + name);
}
async function events(file: string): Promise<any[]> {
  return fs
    .readFile(file, "utf8")
    .then((s) =>
      s
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((x) => JSON.parse(x)),
    )
    .catch(() => []);
}
async function writePlugins(root: string, ownsFirst: boolean) {
  const trace = path.join(root, "lifecycle-events.jsonl");
  const release = path.join(root, "release-a");
  const dirs: string[] = [];
  for (const [generation, owns] of [
    ["A", ownsFirst],
    ["B", !ownsFirst],
  ] as const) {
    const dir = path.join(root, "provider-" + generation);
    await fs.mkdir(dir);
    dirs.push(dir);
    await fs.writeFile(
      path.join(dir, "openclaw.plugin.json"),
      JSON.stringify({
        id: PLUGIN,
        generationOverlap: true,
        activation: { onStartup: true },
        providers: owns ? ["google", "gemini"] : ["google"],
        contracts: { mediaUnderstandingProviders: ["google"] },
        mediaUnderstandingProviderMetadata: {
          google: { aliases: ["gemini"], capabilities: ["image"], defaultModels: { image: MODEL } },
        },
        configSchema: { type: "object", additionalProperties: false, properties: {} },
      }),
    );
    await fs.writeFile(
      path.join(dir, "index.js"),
      [
        'const fs = require("node:fs");',
        'const { describeImageWithModel } = require("openclaw/plugin-sdk/media-understanding");',
        "module.exports = {id: " + JSON.stringify(PLUGIN) + ", register(api) {",
        "fs.appendFileSync(" +
          JSON.stringify(trace) +
          ', JSON.stringify({event:"registered", generation:' +
          JSON.stringify(generation) +
          '})+"\\n");',
        'api.registerMediaUnderstandingProvider({id:"google",aliases:["gemini"],capabilities:["image"],defaultModels:{image:' +
          JSON.stringify(MODEL) +
          "},",
        "async describeImage(request) { fs.appendFileSync(" +
          JSON.stringify(trace) +
          ',JSON.stringify({event:"native",generation:' +
          JSON.stringify(generation) +
          ',provider:request.provider})+"\\n"); return describeImageWithModel(request); }});',
        "}};",
      ].join("\n"),
    );
  }
  const harness = path.join(root, HARNESS);
  await fs.mkdir(harness);
  await fs.writeFile(
    path.join(harness, "openclaw.plugin.json"),
    JSON.stringify({
      id: HARNESS,
      activation: { onStartup: true },
      configSchema: { type: "object", additionalProperties: false, properties: {} },
    }),
  );
  await fs.writeFile(
    path.join(harness, "index.js"),
    [
      'const fs = require("node:fs");',
      'const { createAgentHarnessAssistantMessage } = require("openclaw/plugin-sdk/agent-harness-attempt-runtime");',
      'const key = Symbol.for("qa-image-lifecycle-retained-public-tools");',
      "const coordinator = globalThis[key] ??= {};",
      "const record = (event) => fs.appendFileSync(" +
        JSON.stringify(trace) +
        ',JSON.stringify(event)+"\\n");',
      "module.exports={id:" + JSON.stringify(HARNESS) + ",register(api){",
      "api.registerAgentHarness({id:" +
        JSON.stringify(HARNESS) +
        ',label:"Synthetic retained public image tool proof",supports:()=>({supported:true,priority:100}),',
      "async runAttempt(params){",
      'const isA = params.prompt.includes("FIRST_ATTEMPT");',
      "const prepared=params.preparedModelRuntime; const host=params.hostCapabilities;",
      'if(!prepared?.metadataSnapshot)throw new Error("real prepared metadata missing");',
      "const tools=await host.createToolSurfaceAsync({config:params.config,agentDir:params.agentDir,workspaceDir:params.workspaceDir,sessionKey:params.sessionKey,sessionId:params.sessionId,agentId:params.agentId,modelProvider:params.provider,modelId:params.modelId,preparedModelRuntime:prepared,abortSignal:params.abortSignal,sandbox:params.sandbox});",
      'const tool=tools.find(x=>x.name==="view_image");if(!tool)throw new Error("host image tool missing");',
      "const args={path:" +
        JSON.stringify("data:image/png;base64," + PNG) +
        ",prompt:" +
        JSON.stringify(MARKER) +
        "};",
      'record({event:"captured",attempt:isA?"A":"B",sessionKey:params.sessionKey,metadataRoot:prepared.metadataSnapshot.byPluginId.get("image-lifecycle-provider")?.rootDir,policyHash:prepared.metadataSnapshot.policyHash,geminiOwners:[...(prepared.metadataSnapshot.declaredProviderOwners.get("gemini")??[])]});',
      "if(isA){ coordinator.retained={tool,host,args}; const deadline=Date.now()+100000;",
      "while(!fs.existsSync(" +
        JSON.stringify(release) +
        ')){if(Date.now()>deadline)throw new Error("A release timed out");params.abortSignal?.throwIfAborted();await new Promise(r=>setTimeout(r,100));}',
      'const retainedResult=await tool.execute("retained-original-control",args);record({event:"original-control",summaryReceived:JSON.stringify(retainedResult).includes(' +
        JSON.stringify(SUMMARY) +
        ")});",
      'record({event:"released",attempt:"A"});',
      "}else{",
      'if(!coordinator.retained)throw new Error("no retained public tool");',
      "let active=true;try{coordinator.retained.host.assertActive()}catch{active=false}",
      'record({event:"before-cross-attempt",retainedHostActive:active});',
      'try{const result=await coordinator.retained.tool.execute("cross-attempt-image",coordinator.retained.args);record({event:"cross-attempt-result",rejected:false,summaryReceived:JSON.stringify(result).includes(' +
        JSON.stringify(SUMMARY) +
        ')});}catch(e){record({event:"cross-attempt-result",rejected:true,error:String(e?.message??e).slice(0,600)});}',
      'const result=await tool.execute("current-image-control",args);record({event:"current-control",summaryReceived:JSON.stringify(result).includes(' +
        JSON.stringify(SUMMARY) +
        ")});",
      "}",
      'const reply=isA?"LIFECYCLE_A_DONE":"LIFECYCLE_B_DONE";',
      'const assistant=createAgentHarnessAssistantMessage({api:"openai-responses",provider:params.provider,modelId:params.modelId},reply,{aborted:false});',
      'return{terminal:{kind:"ok"},sessionIdUsed:params.sessionId,messagesSnapshot:[assistant],assistantTexts:[reply],toolMetas:[],lastAssistant:assistant,didSendViaMessagingTool:false,messagingToolSentTexts:[],messagingToolSentMediaUrls:[],messagingToolSentTargets:[],cloudCodeAssistFormatError:false,replayMetadata:{hadPotentialSideEffects:true,replaySafe:false},itemLifecycle:{startedCount:1,completedCount:1,activeCount:0}};',
      "}});}};",
    ].join("\n"),
  );
  return { dirs, harness, trace, release };
}

describe("built lifecycle image provider identity proof", () => {
  const fixture = useMediaGateway();
  it.each([true, false])(
    "retained captured owner present: %s",
    async (ownsFirst) => {
      const root = tempDirs.make("image-lifecycle-proof-");
      const plugins = await writePlugins(root, ownsFirst);
      const google = await startImageEndpoint("google");
      fixture.track(() => google.stop());
      const gemini = await startImageEndpoint("gemini");
      fixture.track(() => gemini.stop());
      const endpoints = { google, gemini };
      let phase = "start";
      let passed = false;
      let gatewayRef: any;
      const observations: Record<string, unknown> = {};
      try {
        const { transport, gateway } = await fixture.start({
          primaryModel: "mock-openai/" + ACTIVE_MODEL,
          alternateModel: "mock-openai/gpt-5.6-luna-alt",
          mutateConfig(config) {
            let cfg = withFixturePlugin(config, plugins.dirs[0]!, PLUGIN);
            cfg = withFixturePlugin(cfg, plugins.harness, HARNESS);
            cfg.models!.providers!["mock-openai"]!.models.find(
              (x) => x.id === ACTIVE_MODEL,
            )!.input = ["text"];
            for (const id of ["google", "gemini"] as const)
              cfg.models!.providers![id] = {
                api: "openai-responses",
                baseUrl: endpoints[id].url + "/v1",
                apiKey: credential(id),
                request: { allowPrivateNetwork: true },
                models: [
                  {
                    id: MODEL,
                    name: MODEL,
                    input: ["text", "image"],
                    reasoning: false,
                    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
                    contextWindow: 8192,
                    maxTokens: 1024,
                  },
                ],
              };
            cfg.plugins!.entries = { ...cfg.plugins!.entries, google: { enabled: false } };
            cfg.agents!.defaults!.maxConcurrent = 2;
            cfg.session = { ...cfg.session, dmScope: "per-channel-peer" };
            cfg.agents!.defaults!.imageModel = { primary: "gemini/" + MODEL };
            cfg.agents!.defaults!.models = {
              ...cfg.agents!.defaults!.models,
              ["mock-openai/" + ACTIVE_MODEL]: { agentRuntime: { id: HARNESS } },
            };
            cfg.tools = { ...cfg.tools, media: { ...cfg.tools?.media, image: { enabled: false } } };
            return cfg;
          },
        });
        gatewayRef = gateway;
        const a = { id: "lifecycle-a", kind: "direct" as const },
          b = { id: "lifecycle-b", kind: "direct" as const };
        phase = "retain-A";
        await transport.sendInbound({
          accountId: "default",
          conversation: a,
          senderId: "lifecycle-a",
          text: "FIRST_ATTEMPT",
        });
        const capturedA = await waitFor("A capture", async () =>
          (await events(plugins.trace)).find((x) => x.event === "captured" && x.attempt === "A"),
        );
        observations.capturedA = capturedA;
        const before = await gateway.call("system.info", {});
        const prior = (await gateway.call("config.get", {})) as { hash?: string };
        const cfg = JSON.parse(await fs.readFile(gateway.configPath, "utf8"));
        cfg.plugins.load.paths = cfg.plugins.load.paths.map((p: string) =>
          p === plugins.dirs[0] ? plugins.dirs[1] : p,
        );
        phase = "genuine-config-successor-publication";
        await fs.writeFile(gateway.configPath, JSON.stringify(cfg, null, 2) + "\n");
        const published = await waitFor("config successor", async () => {
          const c = (await gateway.call("config.get", {})) as any;
          return c.hash !== prior.hash &&
            c.appliedConfigHash &&
            c.appliedConfigHash === c.configRevisionHash
            ? c
            : undefined;
        });
        observations.published = published;
        await waitFor("B registration", async () =>
          (await events(plugins.trace)).find(
            (x) => x.event === "registered" && x.generation === "B",
          ),
        );
        observations.pidBefore = (before as { pid?: number }).pid;
        observations.pidAfter = ((await gateway.call("system.info", {})) as { pid?: number }).pid;
        phase = "cross-attempt-sdk-boundary";
        // QA channel delivery intentionally serializes ingress; use a second real
        // Gateway chat session to admit B while the channel-owned A stays active.
        const started = (await gateway.call("chat.send", {
          sessionKey: "agent:qa:lifecycle-b",
          message: "SECOND_ATTEMPT",
          deliver: false,
          idempotencyKey: "lifecycle-b-" + String(ownsFirst),
        })) as { runId?: string; status?: string };
        observations.startedB = started;
        await waitFor(
          "current B image control",
          async () => (await events(plugins.trace)).find((x) => x.event === "current-control"),
          60000,
        );
        const terminal = await gateway.call("agent.wait", {
          runId: started.runId,
          timeoutMs: 30000,
        });
        observations.terminalB = terminal;
        const trace = await events(plugins.trace);
        const ca = trace.find((x) => x.event === "captured" && x.attempt === "A"),
          cb = trace.find((x) => x.event === "captured" && x.attempt === "B");
        expect(ca.geminiOwners.includes(PLUGIN)).toBe(ownsFirst);
        expect(cb.geminiOwners.includes(PLUGIN)).toBe(!ownsFirst);
        // policyHash covers activation flags, not source paths/manifest metadata.
        expect(ca.metadataRoot).not.toBe(cb.metadataRoot);
        expect(trace.find((x) => x.event === "before-cross-attempt").retainedHostActive).toBe(true);
        const cross = trace.find((x) => x.event === "cross-attempt-result");
        observations.cross = cross;
        expect(trace.find((x) => x.event === "current-control").summaryReceived).toBe(true);
        expect(cross.rejected).toBe(true);
        expect(cross.error).toMatch(/retiring|source|scope|active|authority|run|owner|current/i);
        await fs.writeFile(plugins.release, "release\n");
        await transport.waitForOutbound({
          conversation: a,
          textIncludes: "LIFECYCLE_A_DONE",
          timeoutMs: 30000,
        });
        const settledTrace = await events(plugins.trace);
        expect(settledTrace.find((x) => x.event === "original-control").summaryReceived).toBe(true);
        expect(endpoints.google.calls).toEqual([]);
        const imageCalls = endpoints.gemini.calls.filter((x) => x.method === "POST");
        expect(imageCalls).toHaveLength(2);
        expect(imageCalls.every((x) => x.credential === "gemini" && x.images.length === 1)).toBe(
          true,
        );
        // Reverse direction enters captured native A, whose public inference
        // helper refuses the transplanted context before any network effect.
        expect(settledTrace.filter((x) => x.event === "native").map((x) => x.generation)).toEqual([
          ...(ownsFirst ? ["B"] : ["A", "A"]),
        ]);
        observations.crossAttemptNoAdditionalImageOrCredentialIo = true;
        passed = true;
        phase = "complete";
      } finally {
        await fs.writeFile(plugins.release, "release\n");
        const receipt = {
          ownsFirst,
          phase,
          passed,
          events: await events(plugins.trace),
          endpoints: { google: google.calls, gemini: gemini.calls },
          endpointErrors: { google: google.errors, gemini: gemini.errors },
          observations,
          boundary:
            "genuine admitted generations; adversarial retained public tool invoked from B harness (not ordinary channel mismatch)",
          ...(gatewayRef ? { gatewayLogTail: gatewayRef.logs().slice(-10000) } : {}),
        };
        await fs.appendFile(process.env.IMAGE_LIFECYCLE_RECEIPTS!, JSON.stringify(receipt) + "\n");
        console.info(
          "IMAGE_LIFECYCLE_RECEIPT " + JSON.stringify({ ...receipt, gatewayLogTail: undefined }),
        );
      }
    },
    180000,
  );
});
