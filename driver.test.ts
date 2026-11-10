import { text as readText } from "node:stream/consumers";
import { afterEach, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { resetPluginLoaderTestStateForTest } from "../plugins/loader.test-fixtures.js";
import { clearPluginMetadataLifecycleCaches } from "../plugins/plugin-metadata-lifecycle.js";
import { withOpenClawTestState } from "../test-utils/openclaw-test-state.js";
import { resetPreparedModelRuntimeSnapshotsForTest } from "../agents/prepared-model-runtime.test-support.js";
import { completionChunk, completionModelDefinition, startCompletionServer } from "../agents/simple-completion.test-support.js";
import { createSessionObserverCompletion } from "./session-observer-completion.js";
import { defaultPrepareModel, defaultCompleteModel } from "./session-observer-model.js";
import { observerState } from "./session-observer-state.test-support.js";

afterEach(async () => {
  await resetPreparedModelRuntimeSnapshotsForTest();
  clearPluginMetadataLifecycleCaches();
  resetPluginLoaderTestStateForTest();
  vi.restoreAllMocks();
});

it("recovers invalid observer JSON through default preparation and real loopback HTTP fallback", async () => {
  await withOpenClawTestState({ label: "observer-http-proof" }, async (state) => {
    const requests: Array<{ path: string | undefined; model: string; stream: boolean; hasTools: boolean; maxTokens: unknown; temperature: unknown }> = [];
    await using server = await startCompletionServer((request, response) => {
      void readText(request).then((raw) => {
        const body = JSON.parse(raw);
        requests.push({ path: request.url, model: body.model, stream: body.stream, hasTools: !!body.tools?.length, maxTokens: body.max_tokens ?? body.max_completion_tokens, temperature: body.temperature });
        const output = body.model === "recovery"
          ? { headline: "Recovered via HTTP fallback", health: "on-track", assessment: "Fallback produced a valid assessment." }
          : { headline: "Invalid optional field", health: "on-track", planProgress: null };
        response.writeHead(200, { "content-type": "text/event-stream" });
        response.end(completionChunk(JSON.stringify(output), body.model));
      });
    });
    const provider = "observer-proof";
    const models = ["primary", "recovery"].map((id) => completionModelDefinition({ id }));
    await state.writeJson("provider/openclaw.plugin.json", {
      id: provider, providers: [provider],
      configSchema: { type: "object", properties: {}, additionalProperties: false },
    });
    const runtimePath = await state.writeText("provider/index.cjs", `module.exports = {id:"observer-proof",register(api){api.registerProvider({id:"observer-proof",label:"Observer proof",auth:[]});}};`);
    const cfg: OpenClawConfig = {
      agents: { defaults: {
        workspace: state.workspaceDir,
        model: `${provider}/primary`,
        utilityModel: { primary: `${provider}/primary`, fallbacks: [`${provider}/recovery`] },
      } },
      models: { providers: { [provider]: { api: "openai-completions", baseUrl: server.baseUrl, apiKey: "synthetic-proof-only", models } } },
      plugins: { allow: [provider], entries: { [provider]: { enabled: true } }, load: { paths: [runtimePath] }, slots: { memory: "none" } },
    };
    await state.writeConfig(cfg);
    const nativeFetch = globalThis.fetch;
    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const target = new URL(input instanceof Request ? input.url : input);
      expect(target.origin).toBe(new URL(server.baseUrl).origin);
      return nativeFetch(input, init);
    });
    const request = createSessionObserverCompletion({ getConfig: () => cfg, prepareModel: defaultPrepareModel, completeModel: defaultCompleteModel, isCurrent: () => true });
    const observer = observerState({ utilityModelRef: `${provider}/primary` });
    const result = await request(observer, ["Read source and ran targeted checks."]).catch((error: unknown) => ({ error: error instanceof Error ? error.message : String(error) }));
    console.log("OBSERVER_HTTP_PROOF " + JSON.stringify({ requests, result, activeControllerCleared: observer.activeController === undefined }));
    expect(requests.map(({ model }) => model)).toEqual(["primary", "recovery"]);
    expect(requests.every(({ path, stream, hasTools, maxTokens, temperature }) => path === "/v1/chat/completions" && stream && !hasTools && maxTokens === 300 && temperature === 0.2)).toBe(true);
    expect(result).toMatchObject({ headline: "Recovered via HTTP fallback", health: "on-track" });
    expect(observer.activeController).toBeUndefined();
  });
});
