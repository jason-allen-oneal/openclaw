#!/usr/bin/env node
// Uses the repository-maintained signing fixture; the Gateway is a separate built CLI process.
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const [repoArg, expectedSha, ownerArg, outputArg] = process.argv.slice(2);
assert(repoArg && /^[a-f0-9]{40}$/.test(expectedSha ?? '') && ownerArg && outputArg,
  'Usage: node --import <repo>/scripts/tsx.mjs driver.mjs <repo> <40-char-SHA> <dist/owner.js> <new-output-dir>');
const repo = await fs.realpath(repoArg);
const output = path.resolve(outputArg);
const entry = path.join(repo, 'dist/entry.js');
const owner = await fs.realpath(path.resolve(repo, ownerArg));
assert(owner.startsWith(`${repo}/dist/`) && /\.m?js$/.test(owner), 'Owner must be a built dist JavaScript module');
const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
assert.equal(git('rev-parse', 'HEAD'), expectedSha);
assert.equal(git('status', '--porcelain', '--untracked-files=no'), '', 'Tracked source must be clean');
const buildInfo = JSON.parse(await fs.readFile(path.join(repo, 'dist/build-info.json'), 'utf8'));
assert.equal(buildInfo.commit, expectedSha, 'Build must identify the candidate commit');
await fs.mkdir(output, { recursive: false, mode: 0o700 });
const secret = randomBytes(32).toString('hex');
const privateRoot = path.join(output, 'private-runtime');
const home = path.join(privateRoot, 'home');
const state = path.join(privateRoot, 'state');
const configFile = path.join(state, 'openclaw.json');
await fs.mkdir(home, { recursive: true, mode: 0o700 });
await fs.mkdir(state, { recursive: true, mode: 0o700 });
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const helper = path.join(repo, 'scripts/e2e/lib/upgrade-survivor/mobile-pairing-client.mts');
const { buildConnectRequest, createMobilePairingIdentity } = await import(pathToFileURL(helper).href);
const { WebSocket } = createRequire(path.join(repo, 'package.json'))('ws');
const bindings = {};
for (const [name, filename] of Object.entries({ entry, owner, buildInfo: path.join(repo, 'dist/build-info.json'), signingHelper: helper, driver: process.argv[1] })) {
  bindings[name] = { path: filename === process.argv[1] ? 'driver.mjs' : path.relative(repo, filename), sha256: hash(await fs.readFile(filename)) };
}
const traces = [];
const startedAt = new Date().toISOString();
const clients = [];
let child;
let rawLogs = '';
let summary;
let failure;

function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, val]) =>
    [key, /^(token|bootstrapToken|deviceToken|deviceTokens|signature|nonce|password|auth|publicKey|privateKeyPem)$/i.test(key) ? '[redacted]' : redact(val)]));
  return typeof value === 'string' ? value.replaceAll(secret, '[redacted]').replaceAll(privateRoot, '<isolated-runtime>').replaceAll(repo, '<candidate-checkout>') : value;
}
function record(kind, details) { traces.push({ at: new Date().toISOString(), kind, ...redact(details) }); }
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(condition, label, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await condition();
    if (result) return result;
    await delay(100);
  }
  throw new Error(`Timed out: ${label}`);
}

class WireClient {
  constructor(label, url) {
    this.label = label;
    this.socket = new WebSocket(url);
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
      for (const pending of this.pending.values()) pending.reject(new Error(`${label} closed ${code}: ${reason}`));
    });
    this.socket.on('error', (error) => record('socket-error', { client: label, error: String(error) }));
    clients.push(this);
  }
  async requestFrame(frame) {
    const result = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timed out: ${this.label}/${frame.method}`)), 15000);
      this.pending.set(frame.id, {
        resolve: (value) => { clearTimeout(timer); this.pending.delete(frame.id); resolve(value); },
        reject: (error) => { clearTimeout(timer); this.pending.delete(frame.id); reject(error); },
      });
    });
    record('send', { client: this.label, frame });
    this.socket.send(JSON.stringify(frame));
    return result;
  }
  async rpc(method, params = {}) {
    return this.requestFrame({ type: 'req', id: randomUUID(), method, params });
  }
  async ok(method, params = {}) {
    const response = await this.rpc(method, params);
    assert.equal(response.ok, true, `${method}: ${JSON.stringify(redact(response))}`);
    return response.payload;
  }
  async connect({ identity, role }) {
    const challenge = await waitFor(() => this.frames.find((frame) => frame.type === 'event' && frame.event === 'connect.challenge'), `${this.label} challenge`);
    const isNode = role === 'node';
    const frame = buildConnectRequest({
      challengePayload: challenge.payload,
      client: { id: isNode ? 'node-host' : 'gateway-client', displayName: `Pairing recovery proof ${this.label}`,
        version: '1.0.0', platform: 'linux', deviceFamily: 'Desktop', instanceId: isNode ? 'pairing-recovery-node' : 'pairing-recovery-operator' },
      mode: isNode ? 'node' : 'backend', role,
      scopes: isNode ? [] : ['operator.admin', 'operator.pairing', 'operator.read', 'operator.write'],
      auth: { token: secret }, identity,
    });
    // The shared signing fixture's mobile capabilities are unrelated to this stats proof.
    // These unsigned declarations intentionally request no privileged commands.
    frame.params.caps = [];
    if (isNode) { frame.params.commands = []; frame.params.permissions = {}; }
    return this.requestFrame(frame);
  }
  async stop() {
    if (this.socket.readyState === WebSocket.CLOSED) return;
    this.socket.close();
    await Promise.race([once(this.socket, 'close').catch(() => {}), delay(1000)]);
    if (this.socket.readyState !== WebSocket.CLOSED) this.socket.terminate();
  }
}

try {
  const listener = net.createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const port = listener.address().port;
  await new Promise((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
  const config = { gateway: { mode: 'local', bind: 'loopback', port, auth: { mode: 'token', token: secret }, controlUi: { enabled: false } },
    plugins: { enabled: false }, cron: { enabled: false }, agents: { defaults: { workspace: path.join(privateRoot, 'workspace') } } };
  await fs.writeFile(configFile, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  const env = { PATH: process.env.PATH, LANG: 'C.UTF-8', HOME: home, USERPROFILE: home,
    OPENCLAW_HOME: home, OPENCLAW_STATE_DIR: state, OPENCLAW_CONFIG_PATH: configFile,
    OPENCLAW_SKIP_CHANNELS: '1', OPENCLAW_SKIP_PROVIDERS: '1', OPENCLAW_SKIP_GMAIL_WATCHER: '1',
    OPENCLAW_SKIP_CRON: '1', OPENCLAW_SKIP_BROWSER_CONTROL_SERVER: '1', OPENCLAW_SKIP_CANVAS_HOST: '1',
    OPENCLAW_DISABLE_BUNDLED_PLUGINS: '1', OPENCLAW_SERVICE_REPAIR_POLICY: 'never',
    NO_COLOR: '1' };
  const args = [entry, 'gateway', '--port', String(port), '--bind', 'loopback', '--allow-unconfigured'];
  record('launch', { executable: process.execPath, args, config: redact(config), env: redact(env) });
  child = spawn(process.execPath, args, { cwd: repo, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', (bytes) => { rawLogs += String(bytes); });
  child.stderr.on('data', (bytes) => { rawLogs += String(bytes); });
  await waitFor(async () => {
    if (child.exitCode !== null) throw new Error(`Gateway exited before readiness (${child.exitCode})`);
    try { const response = await fetch(`http://127.0.0.1:${port}/readyz`, { signal: AbortSignal.timeout(1000) }); return response.ok; } catch { return false; }
  }, 'built Gateway /readyz', 60000);
  record('ready', { endpoint: '/readyz', pid: child.pid });
  const url = `ws://127.0.0.1:${port}`;
  const operator = new WireClient('operator', url);
  assert.equal((await operator.connect({ role: 'operator' })).ok, true, 'Operator must authenticate');
  const identity = createMobilePairingIdentity();
  let obsolete;
  // Connect and approve only requests created for this proof identity, using public RPCs.
  for (let attempt = 0; attempt < 3; attempt++) {
    const candidate = new WireClient(`obsolete-attempt-${attempt + 1}`, url);
    const response = await candidate.connect({ role: 'node', identity });
    if (response.ok) { obsolete = candidate; break; }
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
  assert(obsolete, 'Node must become connected after public approval');
  const replacement = new WireClient('replacement', url);
  assert.equal((await replacement.connect({ role: 'node', identity })).ok, true);
  const stats = (memoryFreeBytes) => ({ event: 'node.host.stats', payload: { cpuCount: 4, memoryTotalBytes: 8192, memoryFreeBytes } });
  const readNode = async () => {
    const listing = await operator.ok('node.list');
    return listing.nodes.find((node) => node.nodeId === identity.deviceId);
  };
  const initial = await replacement.ok('node.event', stats(4096));
  assert.equal(initial.handled, true); assert.equal(initial.reason, 'updated');
  let node = await readNode();
  assert.equal(node.connected, true); assert.equal(node.hostStats.memoryFreeBytes, 4096);
  const rejection = await obsolete.rpc('node.event', stats(1024));
  assert.equal(rejection.ok, false);
  assert.equal(rejection.error?.code, 'UNAVAILABLE');
  assert.equal(rejection.error?.details?.code, 'PAIRING_CHANGED');
  const closed = await waitFor(() => obsolete.closeInfo, 'obsolete close after rejection', 5000);
  assert.equal(closed.code, 4001);
  node = await readNode();
  assert.equal(node.connected, true); assert.equal(node.hostStats.memoryFreeBytes, 4096);
  const subsequent = await replacement.ok('node.event', stats(6144));
  assert.equal(subsequent.handled, true); assert.equal(subsequent.reason, 'updated');
  node = await readNode();
  assert.equal(node.connected, true); assert.equal(node.hostStats.memoryFreeBytes, 6144);
  assert.equal(replacement.closeInfo, null);
  summary = { status: 'passed', candidateSha: expectedSha, startedAt, finishedAt: new Date().toISOString(),
    observations: { obsoleteResponse: rejection.error, obsoleteClose: closed, beforeStaleRequest: 4096,
      afterStaleRequest: 4096, replacementAfterClose: 6144, replacementConnected: true },
    limits: ['Simulated signed node clients, not a physical Android app.',
      'Transient pairing-storage failure and same-connection promotion are separate regression tests, not fault-injected here.',
      'No model request, external channel, deployment, merge, or live Gateway access.'] };
} catch (error) {
  failure = error;
  summary = { status: 'failed', candidateSha: expectedSha, startedAt, finishedAt: new Date().toISOString(), error: redact(error?.stack ?? String(error)) };
} finally {
  const clientCleanup = await Promise.allSettled(clients.map((client) => client.stop()));
  const cleanupErrors = clientCleanup.filter((result) => result.status === 'rejected').map((result) => String(result.reason));
  if (child && child.exitCode === null) {
    child.kill('SIGTERM');
    await Promise.race([once(child, 'exit'), delay(5000)]);
    if (child.exitCode === null && child.signalCode === null) {
      process.kill(-child.pid, 'SIGKILL');
      await once(child, 'exit');
    }
  }
  summary.cleanup = { clients: cleanupErrors.length === 0, gatewayExitCode: child?.exitCode, gatewaySignal: child?.signalCode, errors: cleanupErrors };
  for (const [name, filename] of Object.entries({ entry, owner, buildInfo: path.join(repo, 'dist/build-info.json'), signingHelper: helper, driver: process.argv[1] })) {
    if (hash(await fs.readFile(filename)) !== bindings[name].sha256) cleanupErrors.push(`Input changed during proof: ${name}`);
  }
  if (cleanupErrors.length) summary.status = 'failed';
  await fs.writeFile(path.join(output, 'manifest.json'), `${JSON.stringify({ candidateSha: expectedSha, buildInfo, bindings }, null, 2)}\n`);
  await fs.writeFile(path.join(output, 'wire-trace.jsonl'), traces.map((trace) => JSON.stringify(trace)).join('\n') + '\n');
  await fs.writeFile(path.join(output, 'gateway.log'), redact(rawLogs));
  await fs.writeFile(path.join(output, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  // Private runtime contains generated credentials; deliberately excluded from evidence publication.
  if (failure || cleanupErrors.length) process.exitCode = 1;
}
