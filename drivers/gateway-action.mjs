// Bounded, one-shot real Gateway action. No retry, event injection or paid inference.
// Turn flow matches catalogSessionRpc in models-catalog-fixture.test-support.ts.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {parseArgs} from 'node:util';
import {randomUUID, createHash} from 'node:crypto';

const {values: args} = parseArgs({options: {
  out: {type: 'string'}, config: {type: 'string'},
  action: {type: 'string', default: 'turn'}, provider: {type: 'string'},
  url: {type: 'string'}, protocol: {type: 'string', default: '4'},
  package: {type: 'string'}, phase: {type: 'string', default: 'unlabeled'},
}});
if (!args.out || !args.config || !args.package || !['turn', 'provider-refresh'].includes(args.action)) {
  throw new Error('--out, --config, --package and supported --action are required');
}
if (args.action === 'provider-refresh' && !/^api-\d{2}$/.test(args.provider ?? '')) throw new Error('Explicit fixture provider required');
const config = JSON.parse(fs.readFileSync(args.config, 'utf8'));
if (!config.plugins?.allow?.includes('normal-ttl-proof') ||
    config.agents?.defaults?.model?.primary !== 'api-00/model-0' ||
    config.models?.providers?.['api-00']?.apiKey !== '<FIXTURE_CREDENTIAL_2>') {
  throw new Error('Refuse non-fixture Gateway configuration');
}
const url = args.url ?? `ws://127.0.0.1:${config.gateway.port}`;
const parsed = new URL(url);
if (parsed.protocol !== 'ws:' || !['127.0.0.1', '[::1]'].includes(parsed.hostname)) throw new Error('Task loopback Gateway/tunnel required');
const root = path.resolve(args.out);
fs.mkdirSync(root, {recursive: true, mode: 0o700});
const intentPath = path.join(root, 'action-intent.json');
const sessionKey = `agent:main:native-natural-${randomUUID()}`, idempotencyKey = randomUUID();
const expectedReply = 'NATIVE_CATALOG_TURN_OK';
const receipt = {action: args.action, phase: args.phase, provider: args.provider,
  startedAtMs: Date.now(), sessionKey: args.action === 'turn' ? sessionKey : undefined,
  idempotencyKey: args.action === 'turn' ? idempotencyKey : undefined,
  driverSha256: createHash('sha256').update(fs.readFileSync(fileURLToPath(import.meta.url))).digest('hex'),
  configSha256: createHash('sha256').update(fs.readFileSync(args.config)).digest('hex'),
  eventsInjected: false, paidInference: false, calls: []};
fs.writeFileSync(intentPath, JSON.stringify(receipt, null, 2), {flag: 'wx', mode: 0o600});
const save = () => fs.writeFileSync(path.join(root, 'action-receipt.json'), JSON.stringify(receipt, null, 2), {mode: 0o600});
const require = createRequire(path.join(path.resolve(args.package), 'package.json'));
const {WebSocket} = require('ws');
const socket = new WebSocket(url), pending = new Map();
let sequence = 0, runId, terminal = false, connected = false;
let resolveConnection, rejectConnection;
const connection = new Promise((resolve, reject) => {resolveConnection = resolve; rejectConnection = reject;});
const connectionTimer = setTimeout(() => rejectConnection(new Error('Gateway connection timeout')), 20000);
const rejectPending = error => {for (const entry of pending.values()) {clearTimeout(entry.timer); entry.reject(error);} pending.clear();};
const request = (method, params, timeout = 20000) => new Promise((resolve, reject) => {
  const id = String(++sequence), call = {id, method, startedAtMs: Date.now()};
  receipt.calls.push(call); save();
  const timer = setTimeout(() => {pending.delete(id); call.timeout = true; reject(new Error(method + ' timeout; do not blindly retry'));}, timeout);
  pending.set(id, {resolve, reject, timer, call});
  socket.send(JSON.stringify({type: 'req', id, method, params}));
});
socket.on('error', error => {rejectConnection(error); rejectPending(error);});
socket.on('close', () => {const error = new Error('Gateway socket closed'); rejectConnection(error); rejectPending(error);});
socket.on('message', bytes => {
  const frame = JSON.parse(bytes);
  if (frame.event === 'connect.challenge') socket.send(JSON.stringify({type: 'req', id: 'connect', method: 'connect', params: {
    minProtocol: Number(args.protocol), maxProtocol: Number(args.protocol), client: {id: 'cli', version: 'native-natural-turn-proof', platform: 'linux', mode: 'cli'},
    role: 'operator', scopes: ['operator.admin'], auth: {token: config.gateway.auth.token},
  }}));
  if (frame.type === 'res' && frame.id === 'connect') {
    clearTimeout(connectionTimer);
    if (frame.ok) {connected = true; resolveConnection();} else rejectConnection(new Error('Gateway connect rejected'));
    return;
  }
  if (frame.type !== 'res') return;
  const entry = pending.get(frame.id);
  if (!entry) return;
  pending.delete(frame.id); clearTimeout(entry.timer);
  Object.assign(entry.call, {finishedAtMs: Date.now(), elapsedMs: Date.now() - entry.call.startedAtMs, ok: frame.ok,
    status: frame.payload?.status, refreshFailed: frame.payload?.refreshFailed,
    modelCount: frame.payload?.models?.length, error: frame.error});
  save();
  if (frame.ok) entry.resolve(frame.payload); else entry.reject(new Error(frame.error?.message ?? 'Gateway RPC rejected'));
});
const totalTimer = setTimeout(() => {receipt.hardDeadline = true; save(); socket.terminate();}, 100000);
try {
  await connection;
  if (args.action === 'provider-refresh') {
    const result = await request('models.list', {agentId: 'main', view: 'configured', includeDetails: true, refresh: true, provider: args.provider}, 45000);
    receipt.result = {refreshFailed: result.refreshFailed ?? false, pendingProviders: result.pendingProviders,
      modelCount: result.models?.length, selectedProviderRowCount: result.models?.filter(row => row.provider === args.provider).length};
    // This receipt proves the real request only. Provider terminal/publication and native outcome remain separate gates.
    receipt.requestCompleted = true;
  } else {
    const created = await request('sessions.create', {agentId: 'main', model: 'api-00/model-0', key: sessionKey});
    if (created.key !== sessionKey || created.ok !== true) throw new Error('Session creation did not confirm exact fixture key');
    const sent = await request('chat.send', {sessionKey, message: 'Reply with the synthetic test marker.', idempotencyKey});
    runId = sent.runId; receipt.runId = runId; receipt.sendStatus = sent.status; save();
    if (typeof runId !== 'string' || sent.status !== 'started') throw new Error('chat.send did not confirm a started run');
    const waited = await request('agent.wait', {runId, timeoutMs: 30000}, 35000);
    receipt.terminalStatus = waited.status;
    terminal = ['ok', 'error', 'aborted', 'cancelled'].includes(waited.status);
    if (waited.status !== 'ok') throw new Error('Agent did not finish successfully: ' + (waited.error ?? waited.status));
    const history = await request('chat.history', {sessionKey});
    const persisted = history.messages?.some(message => message.role === 'assistant' && Array.isArray(message.content)
      && message.content.some(part => part.type === 'text' && part.text === expectedReply));
    receipt.persistedReplyVerified = persisted === true;
    receipt.historyMessageCount = history.messages?.length;
    if (!persisted) throw new Error('Successful terminal run did not expose the exact persisted assistant reply');
    receipt.passed = true;
  }
} catch (error) {
  receipt.error = error.message; receipt.passed = false;
  if (connected && runId && !terminal && socket.readyState === WebSocket.OPEN) {
    try {
      receipt.abortResult = await request('chat.abort', {sessionKey, runId}, 10000);
      receipt.abortSettlement = await request('agent.wait', {runId, timeoutMs: 5000}, 7000);
    } catch (cleanupError) {receipt.abortError = cleanupError.message;}
  }
} finally {
  clearTimeout(connectionTimer); clearTimeout(totalTimer);
  receipt.finishedAtMs = Date.now(); receipt.elapsedMs = receipt.finishedAtMs - receipt.startedAtMs;
  receipt.pendingMethods = [...pending.values()].map(entry => entry.call.method);
  save(); socket.close(); setTimeout(() => socket.terminate(), 1000).unref();
  console.log(JSON.stringify({action: args.action, phase: args.phase, passed: receipt.passed,
    requestCompleted: receipt.requestCompleted, terminalStatus: receipt.terminalStatus,
    persistedReplyVerified: receipt.persistedReplyVerified, error: receipt.error, out: root}));
}
process.exitCode = receipt.error ? 1 : 0;
