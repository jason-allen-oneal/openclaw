import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const root = process.argv[2], pkg = process.argv[3];
const require = createRequire(path.join(pkg, 'package.json'));
const {WebSocket} = require('ws');
const config = JSON.parse(fs.readFileSync(path.join(root, 'config.json'), 'utf8'));
const settings = JSON.parse(fs.readFileSync(path.join(root, 'case.json'), 'utf8'));
let warningArm;
const records = [], pending = new Map();
const record = value => {const item = {time: Date.now(), ...value}; records.push(item); fs.appendFileSync(path.join(root, 'wire.jsonl'), JSON.stringify(item) + '\n');};
const providerState = () => {
  const file = path.join(root, 'provider.jsonl');
  // appendFileSync emits one complete short JSONL record. Ignore only an incomplete final line.
  const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const lines = text.endsWith('\n') ? text.trim().split('\n') : text.slice(0, text.lastIndexOf('\n')).split('\n');
  const rows = lines.filter(Boolean).map(line => JSON.parse(line));
  const live = new Set(), completed = new Set(), latestDeadline = new Map(), errors = [];
  for (const row of rows) {
    if (row.kind === 'catalog-start') live.add(row.call);
    if (row.kind === 'catalog-return') {live.delete(row.call); completed.add(row.provider); if (row.inferredFreshDeadline !== null) latestDeadline.set(row.provider, row.inferredFreshDeadline);}
    if (row.kind === 'catalog-error') {live.delete(row.call); latestDeadline.delete(row.provider); errors.push(row);}
  }
  return {live: [...live], errors, completedProviders: completed.size, lastTime: rows.at(-1)?.time ?? 0, rows: rows.length, expiredProviders: [...latestDeadline].filter(([, deadline]) => deadline <= Date.now()).map(([provider]) => provider), lastReturn: rows.findLast(row => row.kind === 'catalog-return')?.time ?? 0};
};
const ws = new WebSocket(`ws://127.0.0.1:${config.gateway.port}`);
let counter = 0, connected = false, active = false, startedAt, stoppedAt, followupBatches = 0, events = 0;
let seedId, seedAccepted = false, lastMetadata = 0, finished = false, settlementObserved = false, quietSince, waitingForWarningExpiry = false;
let stopTimer, settlementTimer, preparationTimer;
const send = (method, params, reason) => {
  const id = String(++counter);
  pending.set(id, {method, start: Date.now(), reason}); record({kind: 'request', id, method, params, reason});
  ws.send(JSON.stringify({type: 'req', id, method, params})); return id;
};
const finish = (failure) => {
  if (finished) return;
  finished = true; active = false;
  clearTimeout(hardTimer); clearTimeout(stopTimer); clearInterval(preparationTimer); clearInterval(settlementTimer);
  const provider = providerState();
  const requestsById = new Map(records.filter(x => x.kind === 'request').map(x => [x.id, x]));
  const warningResponses = records.filter(x => x.kind === 'response' && x.method === 'models.list' && x.ok && x.refreshFailed === true && x.time >= (warningArm?.armedAt ?? Infinity));
  const warningEvidence = settings.warningOnFirstExpired ? {
    armed: warningArm,
    injectedTerminalFailure: provider.errors.some(x => x.provider === warningArm?.provider && x.injectedFailure),
    successfulWarningResponses: warningResponses.length,
    retainedConfiguredRows: warningResponses.some(x => x.modelCount === 732 && requestsById.get(x.id)?.params?.view === 'configured'),
    failedMeasuredRpcs: records.filter(x => x.kind === 'response' && x.time >= (startedAt ?? Infinity) && x.ok !== true).length,
  } : undefined;
  if (!failure && warningEvidence && (!warningEvidence.injectedTerminalFailure || !warningEvidence.successfulWarningResponses || !warningEvidence.retainedConfiguredRows || warningEvidence.failedMeasuredRpcs)) {
    failure = 'Warning variant did not prove terminal provider failure plus successful configured 732-row warning response with all measured RPCs successful';
  }
  if (failure) record({kind: 'fatal', message: failure});
  const result = {startedAt, stoppedAt, finishedAt: Date.now(), followupBatches, events, connected, seedAccepted, settlementObserved, quietSince, failure, provider, warningEvidence, requests: records.filter(x => x.kind === 'request'), responses: records.filter(x => x.kind === 'response'), eventsAfterStop: records.filter(x => x.kind === 'event' && stoppedAt !== undefined && x.time >= stoppedAt), pending: [...pending.values()]};
  fs.writeFileSync(path.join(root, 'result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({connected, startedAt, followupBatches, events, settlementObserved, pending: pending.size, failure}));
  ws.close(); setTimeout(() => process.exit(!failure && connected && startedAt && settlementObserved ? 0 : 1), 100);
};
const stop = reason => {
  if (!active) return;
  active = false; stoppedAt = Date.now(); clearTimeout(stopTimer);
  record({kind: 'stop-followup', reason, followupBatches, events});
  settlementTimer = setInterval(() => {
    const p = providerState();
    const lastResponse = records.findLast(x => x.kind === 'response')?.time ?? 0;
    const latest = Math.max(stoppedAt, p.lastTime, lastResponse, lastMetadata);
    if (p.live.length === 0 && pending.size === 0 && Date.now() - latest >= 5000) {
      settlementObserved = true; quietSince = latest; finish();
    } else if (Date.now() - stoppedAt >= 65000) finish('No five-second settled quiet interval before 65s settlement cap');
  }, 100);
};
const begin = () => {
  clearInterval(preparationTimer); preparationTimer = undefined;
  const prepared = providerState();
  const selectedProvider = config.agents.defaults.model.primary.split('/')[0];
  const warningProvider = prepared.expiredProviders.find(id => id !== selectedProvider);
  if (settings.warningOnFirstExpired && !warningProvider) {
    finish('Warning fixture requires an already-expired non-selected provider after the complete successful seed'); return;
  }
  active = true; startedAt = Date.now();
  if (settings.warningOnFirstExpired) {
    warningArm = {provider: warningProvider, armedAt: Date.now(), selectedProvider, seedCompletedProviders: prepared.completedProviders, expiredProviders: prepared.expiredProviders};
    fs.writeFileSync(path.join(root, 'warning-arm.json'), JSON.stringify(warningArm));
    record({kind: 'warning-armed', ...warningArm});
  }
  record({kind: 'start', windowMs: 45000, maxFollowupBatches: 30, provider: providerState(), note: 'Immediate first ordinary read after complete dynamic publication; no TTL wait'});
  send('models.list', {}, 'single-initial-read'); stopTimer = setTimeout(() => stop('45-second-cap'), 45000);
};
const checkPrepared = () => {
  if (finished || active || startedAt || !seedAccepted) return;
  const p = providerState();
  if (p.completedProviders === 64 && p.live.length === 0 && lastMetadata >= p.lastReturn) {
    if (settings.warningOnFirstExpired && !p.expiredProviders.some(id => id !== config.agents.defaults.model.primary.split('/')[0])) {
      if (!waitingForWarningExpiry) {record({kind: 'await-natural-warning-expiry', note: 'Current parallel acquisition may publish before any normal TTL expires; no read/event/expiry is injected during this wait'}); waitingForWarningExpiry = true;}
      return;
    }
    record({kind: 'precondition-passed', provider: p, publicationTime: lastMetadata}); begin();
  }
};
const hardTimer = setTimeout(() => finish('180s connection/preparation/scenario deadline'), 180000);
ws.on('error', error => finish(`WebSocket: ${error.message}`));
ws.on('message', bytes => {
  const f = JSON.parse(bytes);
  if (f.event === 'connect.challenge') {
    ws.send(JSON.stringify({type: 'req', id: 'connect', method: 'connect', params: {minProtocol: 4, maxProtocol: 4, client: {id: 'cli', version: 'normal-ttl-feedback-proof', platform: 'linux', mode: 'cli'}, role: 'operator', scopes: ['operator.admin'], auth: {token: config.gateway.auth.token}}})); return;
  }
  if (f.type === 'res' && f.id === 'connect') {
    record({kind: 'connect-result', ok: f.ok, error: f.error});
    if (!f.ok) {finish('Connect rejected'); return;}
    connected = true;
    record({kind: 'preparation', note: 'One unscoped explicit full catalog seed; wait all64 providers and natural publication because RPC may return at foreground5s deadline'});
    seedId = send('models.list', {refresh: true}, 'one-time-preparation-seed');
    preparationTimer = setInterval(checkPrepared, 100); return;
  }
  if (f.type === 'res') {
    const p = pending.get(f.id); pending.delete(f.id);
    const models = f.payload?.models;
    record({kind: 'response', id: f.id, method: p?.method, elapsedMs: p ? Date.now() - p.start : null, ok: f.ok, error: f.error, modelCount: models?.length, unavailableCount: models?.filter(row => row.available === false).length, refreshFailed: f.payload?.refreshFailed, pendingProviders: f.payload?.pendingProviders, providers: f.payload?.providers?.map(row => ({provider: row.provider, status: row.status})), reason: p?.reason});
    if (f.id === seedId) {if (!f.ok) {finish('Explicit initialization rejected'); return;} seedAccepted = true; checkPrepared();}
    return;
  }
  if (f.type !== 'event') return;
  record({kind: 'event', event: f.event, seq: f.seq, ...(f.event === 'chat.metadata.changed' ? {payload: f.payload} : {})});
  if (f.event !== 'chat.metadata.changed') return;
  events++; lastMetadata = Date.now();
  // This setup-publication event is not itself a measured follow-up trigger.
  const wasActive = active; checkPrepared();
  if (!wasActive || !active) return;
  followupBatches++;
  const reason = `natural-metadata-${followupBatches}`;
  send('models.list', {}, reason);
  send('models.list', {view: 'provider-config', includeDetails: true}, reason);
  send('models.authStatus', {}, reason);
  send('chat.metadata', {sessionKey: 'agent:main:main'}, reason);
  send('models.list', {sessionKey: 'agent:main:main', view: 'configured'}, reason);
  if (followupBatches >= 30) stop('30-followup-cap');
});
