#!/usr/bin/env node
// Real built Gateway + public pairing RPC fixture + transparent Android wire recorder.
import assert from 'node:assert/strict';
import { createHash, createPrivateKey, createPublicKey, randomBytes, randomUUID } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const [repoArg, expectedSha, ownerArg, outputArg] = process.argv.slice(2);
assert(repoArg && /^[a-f0-9]{40}$/.test(expectedSha ?? '') && ownerArg && outputArg,
  'Usage: node --import <repo>/scripts/tsx.mjs driver.mjs <repo> <40-char-SHA> <dist/owner.mjs> <new-output-dir>');
const repo = await fs.realpath(repoArg);
const output = path.resolve(outputArg);
await fs.mkdir(output, { recursive: false, mode: 0o700 });
const privateRoot = path.join(output, 'private-runtime');
const home = path.join(privateRoot, 'home');
const state = path.join(privateRoot, 'state');
const configFile = path.join(state, 'openclaw.json');
await fs.mkdir(home, { recursive: true, mode: 0o700 });
await fs.mkdir(state, { recursive: true, mode: 0o700 });
const secret = randomBytes(32).toString('hex');
const entry = path.join(repo, 'dist/entry.js');
const owner = await fs.realpath(path.resolve(repo, ownerArg));
const helper = path.join(repo, 'scripts/e2e/lib/upgrade-survivor/mobile-pairing-client.mts');
const hash = (value) => createHash('sha256').update(value).digest('hex');
const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
const inputs = { entry, owner, buildInfo: path.join(repo, 'dist/build-info.json'), signingHelper: helper, driver: process.argv[1] };
const bindings = {};
const traces = [];
const clients = [];
const nativeConnections = [];
const observations = {};
const startedAt = new Date().toISOString();
let child, proxy, control, buildInfo, operator, identity, replacement, gatewayUrl, summary, failure;
let rawLogs = '';
let finished = false;
let resolveFinished;
const finishedPromise = new Promise((resolve) => { resolveFinished = resolve; });
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clientMetadata = { id: 'openclaw-android', displayName: 'Android pairing recovery native proof', version: 'test', platform: 'android', deviceFamily: 'android', instanceId: 'pairing-recovery-android' };

function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, val]) =>
    [key, /^(token|bootstrapToken|deviceToken|deviceTokens|signature|nonce|password|auth|publicKey|publicKeyRawBase64|privateKeyPkcs8Base64|privateKeyPem)$/i.test(key) ? '[redacted]' : redact(val)]));
  return typeof value === 'string' ? value.replaceAll(secret, '[redacted]').replaceAll(privateRoot, '<isolated-runtime>').replaceAll(repo, '<candidate-checkout>').replaceAll(process.env.HOME ?? '<home>', '<home>') : value;
}
function record(kind, details) { traces.push({ at: new Date().toISOString(), kind, ...redact(details) }); }
async function waitFor(condition, label, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await condition();
    if (result) return result;
    await delay(100);
  }
  throw new Error(`Timed out: ${label}`);
}
async function unusedPort() {
  const listener = net.createServer().listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const port = listener.address().port;
  await new Promise((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
  return port;
}
function payload(frame) {
  if (frame.params?.payload) return frame.params.payload;
  return frame.params?.payloadJSON ? JSON.parse(frame.params.payloadJSON) : null;
}
function fail(error) {
  failure ??= error instanceof Error ? error : new Error(String(error));
  finished = true;
  resolveFinished();
}

let WebSocket, WebSocketServer, buildConnectRequest;
class WireClient {
  constructor(label) {
    this.label = label;
    this.socket = new WebSocket(gatewayUrl);
    this.frames = [];
    this.pending = new Map();
    this.closeInfo = null;
    this.socket.on('message', (data) => {
      const frame = JSON.parse(String(data));
      this.frames.push(frame);
      record('receive', { client: label, frame });
      if (frame.type === 'res') this.pending.get(frame.id)?.resolve(frame);
    });
    this.socket.on('close', (code, reason) => {
      this.closeInfo = { code, reason: String(reason) };
      record('close', { client: label, ...this.closeInfo });
      for (const pending of this.pending.values()) pending.reject(new Error(`${label} closed ${code}`));
    });
    this.socket.on('error', (error) => record('socket-error', { client: label, error: String(error) }));
    clients.push(this);
  }
  async requestFrame(frame) {
    const result = new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(frame.id); reject(new Error(`Timed out: ${this.label}/${frame.method}`)); }, 15000);
      this.pending.set(frame.id, {
        resolve: (value) => { clearTimeout(timer); this.pending.delete(frame.id); resolve(value); },
        reject: (error) => { clearTimeout(timer); this.pending.delete(frame.id); reject(error); },
      });
    });
    record('send', { client: this.label, frame });
    this.socket.send(JSON.stringify(frame));
    return result;
  }
  async rpc(method, params = {}) { return this.requestFrame({ type: 'req', id: randomUUID(), method, params }); }
  async ok(method, params = {}) {
    const response = await this.rpc(method, params);
    assert.equal(response.ok, true, `${method}: ${JSON.stringify(redact(response))}`);
    return response.payload;
  }
  async connect({ identity: nodeIdentity, role }) {
    const challenge = await waitFor(() => this.frames.find((frame) => frame.type === 'event' && frame.event === 'connect.challenge'), `${this.label} challenge`);
    const isNode = role === 'node';
    const frame = buildConnectRequest({ challengePayload: challenge.payload,
      client: isNode ? clientMetadata : { id: 'gateway-client', displayName: 'Pairing recovery proof operator', version: 'test', platform: 'linux', deviceFamily: 'Desktop', instanceId: 'pairing-recovery-operator' },
      mode: isNode ? 'node' : 'backend', role, scopes: isNode ? [] : ['operator.admin', 'operator.pairing', 'operator.read', 'operator.write'], auth: { token: secret }, identity: nodeIdentity });
    frame.params.caps = [];
    if (isNode) { frame.params.commands = []; frame.params.permissions = {}; frame.params.client.modelIdentifier = 'test'; }
    return this.requestFrame(frame);
  }
  async stop() {
    if (this.socket.readyState === WebSocket.CLOSED) return;
    this.socket.close();
    await Promise.race([once(this.socket, 'close').catch(() => {}), delay(1000)]);
    if (this.socket.readyState !== WebSocket.CLOSED) this.socket.terminate();
  }
}

async function readNode() {
  assert(identity, 'Android identity must be admitted first');
  const listing = await operator.ok('node.list');
  return listing.nodes.find((node) => node.nodeId === identity.deviceId);
}
const stats = (memoryFreeBytes) => ({ event: 'node.host.stats', payload: { cpuCount: 4, memoryTotalBytes: 8192, memoryFreeBytes } });
async function controlRequest(route, body) {
  record('control', { route, body });
  if (route === '/identity') {
    assert(!identity, 'Only one Android identity is admitted');
    const privateKey = createPrivateKey({ key: Buffer.from(body.privateKeyPkcs8Base64, 'base64'), format: 'der', type: 'pkcs8' });
    const publicKey = createPublicKey(privateKey);
    const publicDer = publicKey.export({ format: 'der', type: 'spki' });
    const publicRaw = publicDer.subarray(-32);
    assert.equal(publicRaw.toString('base64'), body.publicKeyRawBase64);
    assert.equal(hash(publicRaw), body.deviceId);
    identity = { deviceId: body.deviceId, privateKeyPem: privateKey.export({ format: 'pem', type: 'pkcs8' }), publicKeyPem: publicKey.export({ format: 'pem', type: 'spki' }) };
    for (let attempt = 0; attempt < 3; attempt++) {
      const candidate = new WireClient(`initial-approval-${attempt + 1}`);
      const response = await candidate.connect({ role: 'node', identity });
      if (response.ok) { await candidate.stop(); observations.initialApproval = 'public RPCs'; return { deviceId: identity.deviceId }; }
      assert.equal(response.error?.details?.code, 'PAIRING_REQUIRED', JSON.stringify(redact(response)));
      await candidate.stop();
      const devices = await operator.ok('device.pair.list');
      const deviceRequest = devices.pending?.find((item) => item.deviceId === identity.deviceId);
      if (deviceRequest) await operator.ok('device.pair.approve', { requestId: deviceRequest.requestId });
      const nodes = await operator.ok('node.pair.list');
      const nodeRequest = nodes.pending?.find((item) => item.nodeId === identity.deviceId);
      if (nodeRequest) await operator.ok('node.pair.approve', { requestId: nodeRequest.requestId });
      assert(deviceRequest || nodeRequest, 'Refusal must have a corresponding approval request');
    }
    throw new Error('Initial synthetic identity approval failed');
  }
  if (route === '/ready') {
    const node = await readNode();
    assert.equal(node?.connected, true);
    observations.androidInitiallyConnected = true;
    return { node };
  }
  if (route === '/replace') {
    assert(observations.androidInitiallyConnected && !replacement);
    replacement = new WireClient('fixture-replacement');
    assert.equal((await replacement.connect({ role: 'node', identity })).ok, true);
    const initial = await replacement.ok('node.event', stats(4096));
    assert.equal(initial.handled, true); assert.equal(initial.reason, 'updated');
    const node = await readNode();
    assert.equal(node?.connected, true); assert.equal(node.hostStats.memoryFreeBytes, 4096);
    observations.beforeStaleRequest = 4096;
    return { node };
  }
  if (route === '/check-rejected') {
    assert(replacement);
    const node = await readNode();
    assert.equal(node?.connected, true); assert.equal(node.hostStats.memoryFreeBytes, 4096);
    observations.afterStaleRequest = 4096;
    return { node };
  }
  if (route === '/check-recovered') {
    assert.equal(observations.afterStaleRequest, 4096);
    const node = await readNode();
    assert.equal(node?.connected, true); assert.equal(node.hostStats.memoryFreeBytes, 6144);
    const authenticated = nativeConnections.filter((connection) => connection.authenticated);
    assert.equal(authenticated.length, 2, 'Initial and automatic replacement Android handshakes');
    const requests = nativeConnections.flatMap((connection) => connection.requests.filter((frame) => frame.method === 'node.event'));
    const stale = requests.filter((frame) => frame.params?.event === 'node.host.stats' && payload(frame)?.memoryFreeBytes === 1024);
    const fresh = requests.filter((frame) => frame.params?.event === 'node.host.stats' && payload(frame)?.memoryFreeBytes === 6144);
    assert.equal(stale.length, 1, 'Rejected request must not replay');
    assert.equal(fresh.length, 1, 'Fresh stats request sent once');
    const old = authenticated[0];
    const rejection = old.responses.find((frame) => frame.id === stale[0].id);
    assert.equal(rejection?.ok, false);
    assert.equal(rejection.error?.code, 'UNAVAILABLE');
    assert.equal(rejection.error?.details?.code, 'PAIRING_CHANGED');
    assert.equal(old.gatewayClose?.code, 4001);
    assert(old.rejectionIndex < old.closeIndex, 'Error response precedes close');
    observations.recoveredStats = 6144;
    observations.androidAuthenticatedConnections = authenticated.length;
    observations.rejectedEventWireCount = stale.length;
    observations.newEventWireCount = fresh.length;
    observations.rejection = rejection.error;
    observations.obsoleteClose = old.gatewayClose;
    return { node, observations };
  }
  if (route === '/finish') {
    assert.equal(body.passed, true, `Android assertions failed: ${body.error ?? 'unspecified'}`);
    assert.equal(observations.recoveredStats, 6144, 'Host recovery assertions must pass first');
    observations.native = body.observations ?? {};
    finished = true; resolveFinished();
    return { completed: true };
  }
  throw new Error(`Unknown control route ${route}`);
}

try {
  assert(owner.startsWith(`${repo}/dist/`) && /\.m?js$/.test(owner));
  assert.equal(git('rev-parse', 'HEAD'), expectedSha);
  assert.equal(git('status', '--porcelain', '--untracked-files=no'), '', 'Tracked source must be clean');
  buildInfo = JSON.parse(await fs.readFile(inputs.buildInfo, 'utf8'));
  assert.equal(buildInfo.commit, expectedSha, 'Build must identify candidate commit');
  const ownerSource = await fs.readFile(owner, 'utf8');
  assert(ownerSource.includes('node pairing changed; reconnect') && ownerSource.includes('PAIRING_CHANGED'), 'Named built owner must contain the repair');
  for (const [name, filename] of Object.entries(inputs)) bindings[name] = { path: name === 'driver' ? 'driver.mjs' : path.relative(repo, filename), sha256: hash(await fs.readFile(filename)) };
  ({ buildConnectRequest } = await import(pathToFileURL(helper).href));
  ({ WebSocket, WebSocketServer } = createRequire(path.join(repo, 'package.json'))('ws'));
  const port = await unusedPort();
  const config = { gateway: { mode: 'local', bind: 'loopback', port, auth: { mode: 'token', token: secret }, controlUi: { enabled: false } }, plugins: { enabled: false }, cron: { enabled: false }, agents: { defaults: { workspace: path.join(privateRoot, 'workspace') } } };
  await fs.writeFile(configFile, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  const env = { PATH: process.env.PATH, LANG: 'C.UTF-8', HOME: home, USERPROFILE: home, OPENCLAW_HOME: home, OPENCLAW_STATE_DIR: state, OPENCLAW_CONFIG_PATH: configFile,
    OPENCLAW_SKIP_CHANNELS: '1', OPENCLAW_SKIP_PROVIDERS: '1', OPENCLAW_SKIP_GMAIL_WATCHER: '1', OPENCLAW_SKIP_CRON: '1', OPENCLAW_SKIP_BROWSER_CONTROL_SERVER: '1', OPENCLAW_SKIP_CANVAS_HOST: '1', OPENCLAW_DISABLE_BUNDLED_PLUGINS: '1', OPENCLAW_SERVICE_REPAIR_POLICY: 'never', NO_COLOR: '1' };
  const args = [entry, 'gateway', '--port', String(port), '--bind', 'loopback', '--allow-unconfigured'];
  record('launch', { executable: process.execPath, args, config, env: { ...env, PATH: '<inherited-path>' } });
  child = spawn(process.execPath, args, { cwd: repo, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', (bytes) => { rawLogs += String(bytes); });
  child.stderr.on('data', (bytes) => { rawLogs += String(bytes); });
  await waitFor(async () => {
    if (child.exitCode !== null) throw new Error(`Gateway exited before readiness (${child.exitCode})`);
    try { return (await fetch(`http://127.0.0.1:${port}/readyz`, { signal: AbortSignal.timeout(1000) })).ok; } catch { return false; }
  }, 'built Gateway /readyz', 60000);
  gatewayUrl = `ws://127.0.0.1:${port}`;
  record('gateway-ready', { endpoint: '/readyz', pid: child.pid });
  operator = new WireClient('operator');
  assert.equal((await operator.connect({ role: 'operator' })).ok, true);

  proxy = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  await once(proxy, 'listening');
  proxy.on('connection', (android) => {
    const upstream = new WebSocket(gatewayUrl);
    const connection = { index: nativeConnections.length + 1, android, upstream, requests: [], responses: [], authenticated: false, gatewayClose: null, rejectionIndex: -1, closeIndex: -1 };
    nativeConnections.push(connection);
    const waiting = [];
    upstream.on('open', () => { for (const message of waiting) upstream.send(message); waiting.length = 0; });
    android.on('message', (data) => {
      const text = String(data); const frame = JSON.parse(text);
      connection.requests.push(frame);
      record('android-send', { connection: connection.index, frame });
      if (upstream.readyState === WebSocket.OPEN) upstream.send(text); else waiting.push(text);
    });
    upstream.on('message', (data) => {
      const text = String(data); const frame = JSON.parse(text);
      connection.responses.push(frame);
      record('android-receive', { connection: connection.index, frame });
      if (frame.type === 'res' && frame.ok && connection.requests.some((request) => request.id === frame.id && request.method === 'connect')) connection.authenticated = true;
      if (frame.error?.details?.code === 'PAIRING_CHANGED') connection.rejectionIndex = traces.length - 1;
      if (android.readyState === WebSocket.OPEN) android.send(text);
    });
    upstream.on('close', (code, reason) => {
      connection.gatewayClose = { code, reason: String(reason) };
      record('android-gateway-close', { connection: connection.index, ...connection.gatewayClose });
      connection.closeIndex = traces.length - 1;
      if (android.readyState === WebSocket.OPEN) code === 1006 ? android.terminate() : android.close(code === 1005 ? 1000 : code, reason);
    });
    android.on('close', (code, reason) => {
      record('android-client-close', { connection: connection.index, code, reason: String(reason) });
      if (upstream.readyState === WebSocket.OPEN) code === 1006 ? upstream.terminate() : upstream.close(code === 1005 ? 1000 : code, reason);
      else if (upstream.readyState === WebSocket.CONNECTING) upstream.terminate();
    });
    for (const [label, socket] of [['android', android], ['upstream', upstream]]) socket.on('error', (error) => record('proxy-error', { connection: connection.index, side: label, error: String(error) }));
  });

  control = http.createServer(async (request, response) => {
    response.setHeader('Content-Type', 'application/json');
    if (request.method !== 'POST' || request.headers.authorization !== `Bearer ${secret}`) { response.writeHead(403); response.end('{"ok":false}'); return; }
    try {
      let data = '';
      for await (const part of request) { data += part; assert(data.length < 32768, 'Control request too large'); }
      const result = await controlRequest(request.url, data ? JSON.parse(data) : {});
      response.end(JSON.stringify({ ok: true, ...redact(result) }));
    } catch (error) {
      record('control-failure', { route: request.url, error: error?.stack ?? String(error) });
      response.writeHead(500); response.end(JSON.stringify({ ok: false, error: redact(String(error)) }));
      fail(error);
    }
  });
  control.listen(0, '127.0.0.1');
  await once(control, 'listening');
  const nativeArgs = { host: '10.0.2.2', gatewayPort: proxy.address().port, controlPort: control.address().port, token: secret, candidateSha: expectedSha };
  await fs.writeFile(path.join(privateRoot, 'native-args.json'), `${JSON.stringify(nativeArgs, null, 2)}\n`, { mode: 0o600 });
  record('native-fixture-ready', { gatewayPort: nativeArgs.gatewayPort, controlPort: nativeArgs.controlPort, connectionTarget: 'dedicated Android emulator' });
  process.stdout.write(`Native fixture ready; arguments file: ${path.join(privateRoot, 'native-args.json')}\n`);
  const timeout = setTimeout(() => fail(new Error('Native instrumentation did not finish within 15 minutes')), 15 * 60 * 1000);
  process.once('SIGTERM', () => fail(new Error('Driver terminated before native completion')));
  process.once('SIGINT', () => fail(new Error('Driver interrupted before native completion')));
  await finishedPromise;
  clearTimeout(timeout);
  assert(finished);
  if (failure) throw failure;
  summary = { status: 'passed', candidateSha: expectedSha, startedAt, finishedAt: new Date().toISOString(), observations,
    limits: ['Production Android GatewaySession on a native emulator, not a physical phone or full app UI.', 'Deterministic same-identity replacement; original historical initiating race was not reproduced.', 'Synthetic same-identity fixture receives the test-only Android key; no real user identity is accessed.', 'A transparent local WebSocket recorder forwards frames unmodified; it does not initiate recovery.', 'Authorization-denial pause is verified by focused Android regression tests separately.', 'No model request, external channel, deployment, merge, or live Gateway access.'] };
} catch (error) {
  failure = error;
  summary = { status: 'failed', candidateSha: expectedSha, startedAt, finishedAt: new Date().toISOString(), observations, error: redact(error?.stack ?? String(error)) };
} finally {
  if (control) await new Promise((resolve) => control.close(resolve));
  for (const connection of nativeConnections) { connection.android.terminate(); connection.upstream.terminate(); }
  if (proxy) await new Promise((resolve) => proxy.close(resolve));
  const clientCleanup = await Promise.allSettled(clients.map((client) => client.stop()));
  const cleanupErrors = clientCleanup.filter((result) => result.status === 'rejected').map((result) => String(result.reason));
  if (child && child.exitCode === null && child.signalCode === null) {
    child.kill('SIGTERM');
    await Promise.race([once(child, 'exit'), delay(5000)]);
    if (child.exitCode === null && child.signalCode === null) { process.kill(-child.pid, 'SIGKILL'); await once(child, 'exit'); }
  }
  for (const [name, filename] of Object.entries(inputs)) {
    if (bindings[name] && hash(await fs.readFile(filename)) !== bindings[name].sha256) cleanupErrors.push(`Input changed during proof: ${name}`);
  }
  if (git('rev-parse', 'HEAD') !== expectedSha || git('status', '--porcelain', '--untracked-files=no')) cleanupErrors.push('Source identity changed during proof');
  summary.cleanup = { clients: cleanupErrors.length === 0, gatewayExitCode: child?.exitCode, gatewaySignal: child?.signalCode, errors: cleanupErrors };
  if (cleanupErrors.length) summary.status = 'failed';
  await fs.writeFile(path.join(output, 'manifest.json'), `${JSON.stringify({ candidateSha: expectedSha, buildInfo, bindings }, null, 2)}\n`);
  await fs.writeFile(path.join(output, 'wire-trace.jsonl'), traces.map((trace) => JSON.stringify(trace)).join('\n') + '\n');
  await fs.writeFile(path.join(output, 'gateway.log'), redact(rawLogs));
  await fs.writeFile(path.join(output, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (failure || cleanupErrors.length) process.exitCode = 1;
}
