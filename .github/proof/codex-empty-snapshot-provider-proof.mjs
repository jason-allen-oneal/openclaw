import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const targetRoot = process.cwd();
const importTarget = (relativePath) =>
  import(pathToFileURL(path.join(targetRoot, relativePath)).href);
const { buildCodexWorkspaceBootstrapContext } = await importTarget(
  "extensions/codex/src/app-server/attempt-context.ts",
);
const { ensureCodexAppServerClientRuntime } = await importTarget(
  "extensions/codex/src/app-server/client-runtime.ts",
);
const { CodexAppServerClient } = await importTarget(
  "extensions/codex/src/app-server/client.ts",
);
const { createCodexAppServerBindingStore, sessionBindingIdentity } = await importTarget(
  "extensions/codex/src/app-server/session-binding.ts",
);
const { buildTurnStartParams, startOrResumeThread } = await importTarget(
  "extensions/codex/src/app-server/thread-lifecycle.ts",
);

const codexBin = process.env.CODEX_PROOF_BIN;
if (!codexBin) throw new Error("CODEX_PROOF_BIN is missing");
const lateGuidance = "LATE_ROOT_MUST_NOT_APPEAR_IN_RESUMED_PROVIDER_INPUT";
const proofRoot = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-late-root-proof-"));
const workspace = path.join(proofRoot, "workspace");
const agentDir = path.join(proofRoot, "agent");
const codexHome = path.join(proofRoot, "codex-home");
const sessionFile = path.join(proofRoot, "session.jsonl");
const providerRequests = [];
let providerServer;

function finishProviderResponse(response, index) {
  const responseId = `resp_late_root_proof_${index}`;
  const item = {
    type: "message",
    id: `msg_late_root_proof_${index}`,
    role: "assistant",
    status: "completed",
    content: [{ type: "output_text", text: `PROOF_TURN_${index}_OK`, annotations: [] }],
  };
  response.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-store",
  });
  for (const event of [
    { type: "response.created", response: { id: responseId } },
    { type: "response.output_item.done", output_index: 0, item },
    {
      type: "response.completed",
      response: {
        id: responseId,
        status: "completed",
        output: [item],
        usage: { input_tokens: 32, output_tokens: 8, total_tokens: 40 },
      },
    },
  ]) {
    response.write(`data: ${JSON.stringify(event)}\n\n`);
  }
  response.end("data: [DONE]\n\n");
}

async function startProvider() {
  providerServer = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    providerRequests.push({
      method: request.method,
      path: request.url,
      body: JSON.parse(Buffer.concat(chunks).toString("utf8")),
    });
    finishProviderResponse(response, providerRequests.length);
  });
  await new Promise((resolve, reject) => {
    providerServer.once("error", reject);
    providerServer.listen(0, "127.0.0.1", resolve);
  });
  const address = providerServer.address();
  if (!address || typeof address === "string") throw new Error("provider failed to bind");
  return `http://127.0.0.1:${address.port}/v1`;
}

const values = new Map();
const stateStore = {
  register: (key, value) => values.set(key, value),
  registerIfAbsent(key, value) {
    if (values.has(key)) return false;
    values.set(key, value);
    return true;
  },
  update(key, updateValue) {
    const next = updateValue(values.get(key));
    if (next === undefined) return false;
    values.set(key, next);
    return true;
  },
  lookup: (key) => values.get(key),
  consume(key) {
    const value = values.get(key);
    values.delete(key);
    return value;
  },
  delete: (key) => values.delete(key),
  deleteIf(key, predicate) {
    const value = values.get(key);
    return value !== undefined && predicate(value) && values.delete(key);
  },
  entries: () => [...values].map(([key, value]) => ({ key, value, createdAt: 0 })),
  clear: () => values.clear(),
};
const bindingStore = createCodexAppServerBindingStore(stateStore);
const sessionId = "late-root-provider-proof";
const sessionKey = `agent:main:${sessionId}`;
const config = { tools: { web: { search: { enabled: false } } } };
const createAttempt = (runId, prompt) => ({
  prompt,
  sessionId,
  sessionKey,
  sessionFile,
  workspaceDir: workspace,
  bootstrapWorkspaceDir: workspace,
  runId,
  provider: "codex",
  modelId: "gpt-5.4-codex",
  model: {
    id: "gpt-5.4-codex",
    name: "gpt-5.4-codex",
    api: "openai-codex-responses",
    provider: "codex",
    contextWindow: 200000,
    maxTokens: 8192,
    compat: { supportsTools: false },
  },
  thinkLevel: "medium",
  disableTools: false,
  config,
  timeoutMs: 120000,
  authStorage: {},
  authProfileStore: { version: 1, profiles: {} },
  modelRegistry: {},
});
const buildWorkspaceContext = (attempt) =>
  buildCodexWorkspaceBootstrapContext({
    params: attempt,
    resolvedWorkspace: workspace,
    executionWorkspace: workspace,
    effectiveWorkspace: workspace,
    sessionKey,
    sessionAgentId: "main",
    memoryToolNames: [],
    ringZeroActive: false,
    sandboxed: false,
  });

function waitForTurnCompleted(client, threadId) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      dispose();
      reject(new Error(`turn completion timed out for ${threadId}`));
    }, 60000);
    const dispose = client.addNotificationHandler((notification) => {
      if (notification.method !== "turn/completed") return;
      if (notification.params?.threadId !== threadId) return;
      clearTimeout(timeout);
      dispose();
      resolve(notification.params);
    });
  });
}

async function runTurn(client, binding, attempt, appServer) {
  const completed = waitForTurnCompleted(client, binding.threadId);
  await client.request(
    "turn/start",
    buildTurnStartParams(attempt, {
      threadId: binding.threadId,
      cwd: workspace,
      appServer,
      promptText: attempt.prompt,
      preserveNativeTurnSettings: true,
    }),
    { timeoutMs: 60000 },
  );
  await completed;
}

async function openClient(startOptions) {
  const client = CodexAppServerClient.start(startOptions);
  const requests = [];
  const request = client.request.bind(client);
  client.request = async (method, params, options) => {
    if (method === "thread/start" || method === "thread/resume") {
      requests.push({ method, params });
    }
    return request(method, params, options);
  };
  await client.initialize();
  ensureCodexAppServerClientRuntime(client, { agentDir, config });
  return { client, requests, pid: client.getTransportPid(), identity: client.getRuntimeIdentity() };
}

try {
  await Promise.all([
    fs.mkdir(workspace, { recursive: true }),
    fs.mkdir(agentDir, { recursive: true }),
    fs.mkdir(codexHome, { recursive: true }),
  ]);
  const providerBaseUrl = await startProvider();
  await fs.writeFile(
    path.join(codexHome, "config.toml"),
    [
      'model = "gpt-5.4-codex"',
      'model_provider = "proof"',
      "",
      "[model_providers.proof]",
      'name = "proof"',
      `base_url = ${JSON.stringify(providerBaseUrl)}`,
      'wire_api = "responses"',
      "requires_openai_auth = false",
      "",
    ].join("\n"),
  );
  const startOptions = {
    transport: "stdio",
    command: codexBin,
    commandSource: "config",
    args: ["app-server", "--listen", "stdio://"],
    headers: {},
    env: { HOME: proofRoot, CODEX_HOME: codexHome },
    clearEnv: ["OPENAI_API_KEY", "CODEX_API_KEY"],
  };
  const appServer = {
    start: startOptions,
    requestTimeoutMs: 120000,
    turnCompletionIdleTimeoutMs: 120000,
    approvalPolicy: "never",
    approvalsReviewer: "user",
    sandbox: "read-only",
    codeModeOnly: false,
    loopDetectionPreToolUseRelay: true,
    connectionClass: "local-loopback",
    remoteAppsSubstrate: "preconfigured",
  };

  const firstAttempt = createAttempt("real-empty-start", "FIRST_EMPTY_SNAPSHOT_TURN");
  const firstContext = await buildWorkspaceContext(firstAttempt);
  if (firstContext.agentWorkspaceDeveloperInstructions !== undefined) {
    throw new Error("initial workspace unexpectedly had project instructions");
  }
  const firstRuntime = await openClient(startOptions);
  const firstBinding = await startOrResumeThread({
    client: firstRuntime.client,
    bindingStore,
    params: firstAttempt,
    agentId: "main",
    agentDir,
    cwd: workspace,
    dynamicTools: [],
    appServer,
    developerInstructions: firstContext.threadDeveloperInstructions,
    agentWorkspaceDeveloperInstructions: firstContext.agentWorkspaceDeveloperInstructions,
    agentWorkspaceDeveloperInstructionsAllowed:
      firstContext.agentWorkspaceDeveloperInstructionsAllowed,
    nativeProjectDocsDisabledOnResume: false,
    userMcpServersEnabled: false,
    webSearchAllowed: false,
    appServerRuntimeFingerprint: "late-root-proof-v1",
  });
  await runTurn(firstRuntime.client, firstBinding, firstAttempt, appServer);
  const identity = sessionBindingIdentity({ sessionId, sessionKey, agentId: "main", config });
  const frozen = await bindingStore.read(identity);
  if (frozen?.agentWorkspaceDeveloperInstructions !== null) {
    throw new Error("production binding did not persist an explicit empty snapshot");
  }
  const firstPid = firstRuntime.pid;
  if (!(await firstRuntime.client.closeAndWait({ exitTimeoutMs: 10000 }))) {
    throw new Error("first Codex process did not exit cleanly");
  }

  await fs.writeFile(path.join(workspace, "AGENTS.md"), `${lateGuidance}\n`);
  const resumeAttempt = createAttempt("real-empty-resume", "SECOND_COLD_RESUME_TURN");
  const changedContext = await buildWorkspaceContext(resumeAttempt);
  if (!changedContext.agentWorkspaceDeveloperInstructions?.includes(lateGuidance)) {
    throw new Error("changed workspace root was not observed before resume");
  }
  const resumeRuntime = await openClient(startOptions);
  const resumedBinding = await startOrResumeThread({
    client: resumeRuntime.client,
    bindingStore,
    params: resumeAttempt,
    agentId: "main",
    agentDir,
    cwd: workspace,
    dynamicTools: [],
    appServer,
    developerInstructions:
      "The configured root was empty when this thread started; later project files do not apply.",
    agentWorkspaceDeveloperInstructions: undefined,
    agentWorkspaceDeveloperInstructionsAllowed:
      changedContext.agentWorkspaceDeveloperInstructionsAllowed,
    nativeProjectDocsDisabledOnResume: true,
    userMcpServersEnabled: false,
    webSearchAllowed: false,
    appServerRuntimeFingerprint: "late-root-proof-v1",
  });
  const resumeRequest = resumeRuntime.requests.find((entry) => entry.method === "thread/resume");
  if (resumeRequest?.params?.config?.project_doc_max_bytes !== 0) {
    throw new Error("cold resume did not disable native project-doc discovery");
  }
  await runTurn(resumeRuntime.client, resumedBinding, resumeAttempt, appServer);
  const resumedProviderInput = JSON.stringify(providerRequests.at(-1)?.body ?? {});
  if (resumedProviderInput.includes(lateGuidance)) {
    throw new Error("late root guidance reached the resumed provider request");
  }
  if (
    resumedBinding.threadId !== firstBinding.threadId ||
    resumedBinding.lifecycle.action !== "resumed"
  ) {
    throw new Error("proof did not cold-resume the original native thread");
  }
  if (resumeRuntime.pid === firstPid) throw new Error("proof reused the first Codex process");
  if (providerRequests.length !== 2) {
    throw new Error(`expected two provider requests, saw ${providerRequests.length}`);
  }
  await resumeRuntime.client.closeAndWait({ exitTimeoutMs: 10000 });

  const targetHead = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  console.log(
    JSON.stringify({
      targetHead,
      codexVersion: resumeRuntime.identity?.serverVersion,
      sameNativeThread: resumedBinding.threadId === firstBinding.threadId,
      distinctAppServerProcesses: resumeRuntime.pid !== firstPid,
      explicitEmptySnapshot: frozen.agentWorkspaceDeveloperInstructions === null,
      resumeProjectDocMaxBytes: resumeRequest.params.config.project_doc_max_bytes,
      providerTurns: providerRequests.length,
      lateRootAbsentFromResumedProviderInput: !resumedProviderInput.includes(lateGuidance),
    }),
  );
  console.log("real-codex-empty-snapshot-cold-resume=late-root-absent-from-provider-input");
} finally {
  await new Promise((resolve) => providerServer?.close(resolve));
  await fs.rm(proofRoot, { recursive: true, force: true });
}
