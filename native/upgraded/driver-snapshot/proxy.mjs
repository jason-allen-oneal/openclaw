// Byte-preserving observer. There is intentionally no event or warning injection route.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {parseArgs} from 'node:util';
import {randomUUID, createHash} from 'node:crypto';

const {values: args} = parseArgs({options: {
  out: {type: 'string'}, config: {type: 'string'},
  upstream: {type: 'string', default: 'ws://127.0.0.1:19990'},
  port: {type: 'string', default: '19992'}, protocol: {type: 'string', default: '4'},
  package: {type: 'string', default: '<ANDROID_CHECKOUT>'},
  'retain-payloads': {type: 'boolean', default: false},
  'forbid-setup': {type: 'boolean', default: false},
}});
if (!args.out || !args.config) throw new Error('--out and --config are required');
const upstreamUrl = new URL(args.upstream);
if (!['127.0.0.1', '[::1]'].includes(upstreamUrl.hostname) || upstreamUrl.protocol !== 'ws:') {
  throw new Error('Use the parent-owned loopback Gateway or SSH tunnel');
}
const root = path.resolve(args.out), port = Number(args.port), protocol = Number(args.protocol);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid proxy port');
fs.mkdirSync(root, {recursive: true, mode: 0o700});
const trace = path.join(root, 'native-wire.jsonl');
if (fs.existsSync(trace)) throw new Error('Refuse to append a new run to an existing wire capture');
const require = createRequire(path.join(path.resolve(args.package), 'package.json'));
const {WebSocket, WebSocketServer} = require('ws');
const config = JSON.parse(fs.readFileSync(args.config, 'utf8'));
if (!config.plugins?.allow?.includes('normal-ttl-proof') ||
    config.agents?.defaults?.model?.primary !== 'api-00/model-0' ||
    config.models?.providers?.['api-00']?.apiKey !== '<FIXTURE_CREDENTIAL_2>') {
  throw new Error('Refuse non-fixture Gateway configuration');
}
let phase = 'native-setup';
const clients = new Set(), closed = [];
const record = value => fs.appendFileSync(trace, JSON.stringify({timestampMs: Date.now(), phase, ...value}) + '\n', {mode: 0o600});
const digest = value => typeof value === 'string' ? createHash('sha256').update(value).digest('hex') : undefined;
const messageEvidence = message => {
  const text = typeof message?.content === 'string' ? message.content : (Array.isArray(message?.content) ? message.content : []).filter(block => block.type === 'text').map(block => block.text ?? '').join('');
  return {role: message?.role, textSha256: digest(text), fixtureReply: text.includes('NATIVE_CATALOG_TURN_OK'), id: message?.id};
};
const summary = () => ({phase, openConnections: [...clients].map(c => ({connection: c.id, role: c.role, pending: [...c.requests].map(([id, r]) => ({id, ...r}))})), closed});

async function setupCode() {
  const socket = new WebSocket(args.upstream);
  return await new Promise((resolve, reject) => {
    let settled = false;
    const done = (error, value) => {if (settled) return; settled = true; clearTimeout(timer); socket.close(); error ? reject(error) : resolve(value);};
    const timer = setTimeout(() => done(new Error('Setup RPC deadline')), 30000);
    socket.on('error', error => done(error));
    socket.on('close', () => done(new Error('Setup socket closed before result')));
    socket.on('message', bytes => {
      const frame = JSON.parse(bytes);
      if (frame.event === 'connect.challenge') socket.send(JSON.stringify({type: 'req', id: 'connect', method: 'connect', params: {minProtocol: protocol, maxProtocol: protocol, client: {id: 'cli', version: 'native-natural-proof', platform: 'linux', mode: 'cli'}, role: 'operator', scopes: ['operator.admin'], auth: {token: config.gateway.auth.token}}}));
      if (frame.type === 'res' && frame.id === 'connect') {
        if (!frame.ok) {done(new Error('Setup connection rejected')); return;}
        socket.send(JSON.stringify({type: 'req', id: 'setup', method: 'device.pair.setupCode', params: {publicUrl: `ws://127.0.0.1:${port}`, includeQr: false}}));
      }
      if (frame.type === 'res' && frame.id === 'setup') done(frame.ok ? undefined : new Error('Setup code rejected'), frame.payload);
    });
  });
}
const server = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.url === '/setup' && req.method === 'GET') {
      if (args['forbid-setup']) {res.writeHead(403); res.end(JSON.stringify({error: 'Retained-state capture forbids new setup codes'})); return;}
      res.end(JSON.stringify(await setupCode())); return;
    }
    if (req.url === '/summary' && req.method === 'GET') {res.end(JSON.stringify(summary())); return;}
    if (req.url === '/phase' && req.method === 'POST') {
      let body = '';
      for await (const chunk of req) {body += chunk; if (body.length > 1024) throw new Error('Phase body too large');}
      const name = JSON.parse(body).name;
      if (typeof name !== 'string' || !/^[a-z0-9_-]{1,60}$/.test(name)) throw new Error('Invalid phase name');
      phase = name;
      record({direction: 'observer-phase'});
      fs.writeFileSync(path.join(root, 'phase.json'), JSON.stringify({name, timestampMs: Date.now()}), {mode: 0o600});
      res.end(JSON.stringify({phase})); return;
    }
    res.writeHead(404); res.end('{}');
  } catch (error) {res.writeHead(500); res.end(JSON.stringify({error: error.message}));}
});
const wss = new WebSocketServer({server});
wss.on('connection', client => {
  const upstream = new WebSocket(args.upstream);
  const c = {id: randomUUID(), client, upstream, role: null, requests: new Map()};
  clients.add(c); record({direction: 'connection-open', connection: c.id});
  client.on('message', (bytes, isBinary) => {
    const frame = JSON.parse(bytes);
    if (args['forbid-setup'] && frame.method === 'connect' && frame.params?.auth?.bootstrapToken) {
      record({direction: 'retained-state-setup-blocked', connection: c.id, role: frame.params?.role});
      client.close(1008, 'Retained-state capture forbids bootstrap pairing');
      upstream.close();
      return;
    }
    if (frame.method === 'connect') c.role = frame.params.role;
    if (frame.type === 'req') {
      c.requests.set(frame.id, {method: frame.method, startedAt: Date.now(), phase, sessionKeySha256: digest(frame.params?.sessionKey)});
      record({direction: 'request', connection: c.id, role: c.role, id: frame.id, method: frame.method,
        ...(frame.method === 'connect' ? {
          deviceIdentitySha256: typeof frame.params?.device?.id === 'string' ? createHash('sha256').update(frame.params.device.id).digest('hex') : undefined,
          devicePublicKeySha256: typeof frame.params?.device?.publicKey === 'string' ? createHash('sha256').update(frame.params.device.publicKey).digest('hex') : undefined,
          authFields: Object.keys(frame.params?.auth ?? {}).sort(),
        } : {}),
        ...(['chat.send', 'chat.history'].includes(frame.method) ? {sessionKeySha256: digest(frame.params?.sessionKey), messageSha256: digest(frame.params?.message)} : {}),
        ...(['models.list', 'chat.metadata'].includes(frame.method) ? {params: frame.params} : {})});
    }
    if (upstream.readyState === WebSocket.OPEN) upstream.send(bytes, {binary: isBinary});
    else upstream.once('open', () => upstream.send(bytes, {binary: isBinary}));
  });
  upstream.on('message', (bytes, isBinary) => {
    const frame = JSON.parse(bytes);
    if (frame.type === 'event') record({direction: 'gateway-event', connection: c.id, role: c.role, event: frame.event, seq: frame.seq,
      ...(frame.event === 'chat.metadata.changed' ? {payload: frame.payload} : {}),
      ...(frame.event === 'chat' ? {runId: frame.payload?.runId, sessionKeySha256: digest(frame.payload?.sessionKey), state: frame.payload?.state, message: messageEvidence(frame.payload?.message)} : {})});
    if (frame.type === 'res') {
      const pending = c.requests.get(frame.id), method = pending?.method;
      const elapsedMs = pending ? Date.now() - pending.startedAt : null;
      c.requests.delete(frame.id);
      if (args['retain-payloads'] && ['models.list', 'chat.metadata'].includes(method)) {
        fs.appendFileSync(path.join(root, 'catalog-payloads.private.jsonl'), JSON.stringify({timestampMs: Date.now(), phase, method, frame}) + '\n', {mode: 0o600});
      }
      const models = frame.payload?.models;
      record({direction: 'response', connection: c.id, role: c.role, id: frame.id, method, requestPhase: pending?.phase, elapsedMs,
        payloadBytes: Buffer.byteLength(JSON.stringify(frame.payload ?? null)), ok: frame.ok,
        ...(method === 'models.list' ? {modelCount: models?.length, refreshFailed: frame.payload?.refreshFailed ?? false,
          pendingProviders: frame.payload?.pendingProviders,
          modelIdentitySha256: models ? createHash('sha256').update(JSON.stringify(models.map(row => [row.provider, row.id]).sort())).digest('hex') : undefined,
          availability: models?.reduce((counts, row) => {const key = row.available === true ? 'available' : row.available === false ? 'unavailable' : 'indeterminate'; counts[key] = (counts[key] ?? 0) + 1; return counts;}, {})} : {}),
        ...(method === 'chat.send' ? {runId: frame.payload?.runId, status: frame.payload?.status, sessionKeySha256: pending?.sessionKeySha256} : {}),
        ...(method === 'chat.history' ? {sessionKeySha256: pending?.sessionKeySha256, sessionIdSha256: digest(frame.payload?.sessionId), messages: frame.payload?.messages?.map(messageEvidence)} : {}),
        ...(method === 'models.authStatus' ? {providers: frame.payload?.providers?.map(row => ({provider: row.provider, status: row.status}))} : {}),
        ...(frame.ok ? {} : {error: frame.error})});
    }
    // Forward the original bytes, preserving sequence, flags, RPC payload and timing ownership.
    if (client.readyState === WebSocket.OPEN) client.send(bytes, {binary: isBinary});
  });
  upstream.on('error', error => {record({direction: 'upstream-error', connection: c.id, message: error.message}); client.close();});
  client.on('error', error => {record({direction: 'client-error', connection: c.id, message: error.message}); upstream.close();});
  client.on('close', (code, reason) => {
    const item = {connection: c.id, role: c.role, code, reason: reason.toString(), unresolved: [...c.requests].map(([id, value]) => ({id, ...value}))};
    record({direction: 'client-close', ...item}); closed.push(item); upstream.close(); clients.delete(c);
  });
  upstream.on('close', (code, reason) => {record({direction: 'upstream-close', connection: c.id, code, reason: reason.toString()}); client.close();});
});
server.listen(port, '127.0.0.1', () => {
  fs.writeFileSync(path.join(root, 'proxy-ready.json'), JSON.stringify({pid: process.pid, port, upstream: args.upstream, protocol, eventsInjected: false, setupForbidden: args['forbid-setup']}), {mode: 0o600});
  console.log(JSON.stringify({ready: true, pid: process.pid, port, eventsInjected: false}));
});
process.on('SIGTERM', () => {
  fs.writeFileSync(path.join(root, 'proxy-close.json'), JSON.stringify(summary(), null, 2), {mode: 0o600});
  for (const c of clients) {c.client.terminate(); c.upstream.terminate();}
  wss.close(); server.close(() => process.exit(0));
});
