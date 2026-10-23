import fs from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'node:http';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';

const run = promisify(execFile);
const buildRoot = process.env.PROOF_BUILD_ROOT;
const sourceRoot = process.env.PROOF_SOURCE_ROOT;
const artifactRoot = process.env.PROOF_ARTIFACT_ROOT;
const pluginRoot = process.env.PROOF_PLUGIN_ROOT;
if (!buildRoot || !sourceRoot || !artifactRoot || !pluginRoot) throw new Error('Explicit isolated roots required');
const { acquireTestPortBlock } = await import(pathToFileURL(path.join(sourceRoot, 'src/test-utils/port-claims.ts')).href);
const claim = await acquireTestPortBlock({ offsets: [0, 1, 2, 3, 4] });
const dirs = Object.fromEntries(['home', 'state', 'workspace'].map(name => [name, path.join(artifactRoot, name)]));
await Promise.all(Object.values(dirs).map(dir => fs.mkdir(dir, { recursive: true })));
const configPath = path.join(dirs.state, 'openclaw.json');
const config = {
  gateway: { mode: 'local', port: claim.port, bind: 'loopback', auth: { mode: 'none' }, controlUi: { enabled: false } },
  agents: { ownership: 'explicit', entries: { main: {} }, defaults: { workspace: dirs.workspace, skipBootstrap: true, model: { primary: 'delivery-cli/proof', fallbacks: [] }, thinkingDefault: 'off', timeoutSeconds: 180 } },
  tools: { deny: ['*'] },
  messages: { visibleReplies: 'automatic' },
  plugins: { enabled: true, allow: ['delivery-reset-proof'], load: { paths: [pluginRoot] }, entries: { 'delivery-reset-proof': { enabled: true } }, slots: { memory: 'none' } },
  discovery: { mdns: { mode: 'off' } }, cron: { enabled: false },
  logging: { file: path.join(artifactRoot, 'gateway-runtime.jsonl') },
};
await fs.writeFile(configPath, JSON.stringify(config, null, 2));
const env = { PATH: process.env.PATH, HOME: dirs.home, LANG: 'C.UTF-8', TZ: 'UTC',
  OPENCLAW_STATE_DIR: dirs.state, OPENCLAW_CONFIG_PATH: configPath,
  OPENCLAW_SKIP_BROWSER_CONTROL_SERVER: '1', OPENCLAW_SKIP_CANVAS_HOST: '1',
  OPENCLAW_SKIP_CHANNELS: '1', OPENCLAW_SKIP_CRON: '1', OPENCLAW_SKIP_GMAIL_WATCHER: '1', PROOF_REAL_MODEL_URL: process.env.PROOF_REAL_MODEL_URL, PROOF_CLI_GATE_URL: `http://127.0.0.1:${claim.port + 1}` };
const receipt = { model: 'delivery-cli/proof (actual Ollama qwen3:0.6b subprocess adapter)', providerBaseUrl: process.env.PROOF_REAL_MODEL_URL, producer: 'default agent reply resolver and documented CLI backend plugin; actual local model; no injected replyResolver', sourceHead: process.env.PROOF_SOURCE_HEAD, buildRoot, calls: [], requests: [], cliRuns: [], stages: [], passed: false };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const call = async (method, params = {}) => {
  const startedAt = new Date().toISOString();
  try {
    const result = await run(process.execPath, ['openclaw.mjs', 'gateway', 'call', method, '--params', JSON.stringify(params), '--port', String(claim.port), '--timeout', '120000', '--json'], { cwd: buildRoot, env, timeout: 150000, maxBuffer: 2 * 1024 * 1024 });
    receipt.calls.push({ method, params, startedAt, finishedAt: new Date().toISOString(), ...result });
    return JSON.parse(result.stdout.slice(result.stdout.indexOf('{')));
  } catch (error) {
    receipt.calls.push({ method, params, startedAt, error: String(error), stdout: error.stdout, stderr: error.stderr });
    throw error;
  }
};
let gateway, gatewayDone, gatewayLog, activeReceipt;
const receiver = createServer((request, response) => {
  void (async () => {
    const chunks = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const text = Buffer.concat(chunks).toString('utf8');
    assert.ok(activeReceipt, 'unexpected receiver request');
    if (request.url === '/cli-ready') {
      const entry = { ...JSON.parse(text), readyAt: new Date().toISOString() };
      receipt.cliRuns.push(entry);
      activeReceipt.cliReady(entry);
      await activeReceipt.release;
      entry.releaseAt = new Date().toISOString();
      if (!response.destroyed) { response.writeHead(200); response.end('continue'); }
    } else {
      receipt.requests.push({ text, acceptedAt: new Date().toISOString() });
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ messageId: activeReceipt.messageId }));
    }
  })().catch(error => response.destroy(error));
});
const stop = async () => {
  if (!gateway) return;
  gateway.kill('SIGTERM');
  const timer = setTimeout(() => gateway?.kill('SIGKILL'), 45000);
  const result = await gatewayDone;
  clearTimeout(timer);
  await gatewayLog.close();
  gateway = undefined;
  return result;
};
const start = async label => {
  gatewayLog = await fs.open(path.join(artifactRoot, `gateway-${label}.log`), 'w');
  gateway = spawn(process.execPath, ['openclaw.mjs', 'gateway', 'run', '--port', String(claim.port)], { cwd: buildRoot, env, stdio: ['ignore', gatewayLog.fd, gatewayLog.fd] });
  gatewayDone = new Promise(resolve => gateway.once('exit', (code, signal) => resolve({ code, signal })));
  const deadline = Date.now() + 180000;
  let ready = false;
  while (Date.now() < deadline) {
    if (gateway.exitCode !== null) throw new Error(`Gateway exited:${gateway.exitCode}`);
    try { const response = await fetch(`http://127.0.0.1:${claim.port}/readyz`); if (response.ok && (await response.json()).ready) { ready = true; break; } } catch {}
    await delay(250);
  }
  assert.ok(ready, 'Gateway readiness deadline');
  await call('health');
  console.log(JSON.stringify({ event: 'ready', label, pid: gateway.pid }));
};
const inspect = async () => {
  // Read only the canonical agent database; plugin capture trees contain package symlinks.
  const files = ['agents/main/agent/openclaw-agent.sqlite'];
  const rows = [];
  for (const name of files) {
    const database = new DatabaseSync(path.join(dirs.state, name), { readOnly: true });
    try {
      if (!database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='transcript_events'").get()) continue;
      rows.push(...database.prepare('SELECT session_id, seq, event_json, navigation_type, message_role FROM transcript_events ORDER BY session_id, seq').all());
      assert.deepEqual(database.prepare('PRAGMA quick_check').all().map(row => row.quick_check), ['ok']);
    } finally { database.close(); }
  }
  return rows;
};
const exercise = async (label, mutation) => {
  const sessionKey = `agent:main:delivery-cli-${label}`;
  const messageId = `receipt-${label}`;
  const text = `CLI-REPLY-${label}-ONLY`;
  const created = await call('sessions.create', { key: sessionKey, agentId: 'main' });
  await call('chat.inject', { sessionKey, agentId: 'main', message: `seed-${label}` });
  let ready, release;
  const cliReady = new Promise(resolve => { ready = resolve; });
  activeReceipt = { messageId, cliReady: ready, release: new Promise(resolve => { release = resolve; }) };
  const dispatch = call('delivery-reset-proof.dispatch', { sessionKey, messageId, text, receiver: `http://127.0.0.1:${claim.port + 1}/reply` });
  let mutationCall, timer;
  const stage = { label, mutation, text, created, passed: false };
  receipt.stages.push(stage);
  try {
    stage.cliReady = await Promise.race([cliReady, dispatch.then(() => { throw new Error('dispatch ended before CLI reached pre-finalization gate'); }), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('CLI readiness deadline')), 120000); })]);
    clearTimeout(timer);
    assert.equal(receipt.requests.filter(request => request.text === text).length, 0, 'no external reply before CLI finalization');
    if (mutation) {
      const logPath = path.join(artifactRoot, 'gateway-runtime.jsonl');
      const logOffset = (await fs.readFile(logPath)).length;
      stage.mutationRequestedAt = new Date().toISOString();
      mutationCall = call(mutation === 'reset' ? 'sessions.reset' : 'sessions.delete', { key: sessionKey, agentId: 'main', ...(mutation === 'reset' ? { reason: 'reset' } : { deleteTranscript: false }) });
      let settled = false;
      mutationCall.then(value => { stage.mutationResult = value; settled = true; }, error => { stage.mutationError = String(error); settled = true; });
      const deadline = Date.now() + 30000;
      while (Date.now() < deadline && !stage.lifecycleAdmission && !settled) {
        const lines = (await fs.readFile(logPath)).subarray(logOffset).toString('utf8').split('\n');
        for (const line of lines) {
          try {
            const entry = JSON.parse(line);
            if (entry['1']?.mutationKind === mutation && entry['2'] === 'session lifecycle queue waiting') stage.lifecycleAdmission = entry;
          } catch {}
        }
        if (!stage.lifecycleAdmission && !settled) await delay(50);
      }
      assert.ok(stage.lifecycleAdmission || settled, 'actual lifecycle admission or terminal result observed while CLI output is held');
      stage.mutationSettledBeforeCliRelease = settled;
    }
    stage.cliReleaseAt = new Date().toISOString();
    release();
    stage.outcomes = await Promise.allSettled([dispatch, mutationCall]);
    stage.rows = await inspect();
    stage.replies = stage.rows.filter(row => row.message_role === 'assistant' && row.event_json?.includes(text));
    stage.physicalReplies = receipt.requests.filter(request => request.text === text);
    assert.ok(stage.outcomes.every(outcome => outcome.status === 'fulfilled'), 'dispatch and mutation RPC both complete');
    assert.ok(stage.physicalReplies.length <= 1, 'no duplicate external reply');
    assert.ok(stage.physicalReplies.length === 0 || stage.replies.length === 1, 'every externally visible reply has exactly one durable canonical record');
    if (!mutation) assert.equal(stage.physicalReplies.length, 1, 'normal CLI control delivered');
    if (mutation === 'reset') {
      stage.historyAfterMutation = await call('chat.history', { sessionKey, agentId: 'main', limit: 100 });
      assert.ok(!JSON.stringify(stage.historyAfterMutation).includes(text), 'old CLI answer absent from new reset context');
      const resetRows = stage.rows.filter(row => row.navigation_type === 'reset');
      assert.ok(resetRows.length > 0, 'real reset boundary persisted');
      if (stage.physicalReplies.length) assert.ok(resetRows.some(row => row.session_id === stage.replies[0].session_id && row.seq > stage.replies[0].seq), 'delivered answer persisted before reset');
    }
    if (mutation === 'delete') {
      stage.recreated = await call('sessions.create', { key: sessionKey, agentId: 'main' });
      stage.historyAfterMutation = await call('chat.history', { sessionKey, agentId: 'main', limit: 100 });
      assert.ok(!JSON.stringify(stage.historyAfterMutation).includes(text), 'old CLI answer absent from rebound destination');
    }
    stage.passed = true;
    return { sessionKey, text };
  } finally { clearTimeout(timer); release(); await Promise.allSettled([dispatch, mutationCall]); activeReceipt = undefined; }
};
try {
  await new Promise(resolve => receiver.listen(claim.port + 1, '127.0.0.1', resolve));
  await start('first');
  const control = await exercise('control', undefined);
  await exercise('reset', 'reset');
  await exercise('rebind', 'delete');
  const before = await inspect();
  receipt.firstExit = await stop();
  assert.equal(receipt.firstExit.code, 0);
  await start('restart');
  receipt.controlHistory = await call('chat.history', { sessionKey: control.sessionKey, agentId: 'main', limit: 100 });
  assert.ok(JSON.stringify(receipt.controlHistory).includes(control.text), 'retained control reply readable through Gateway');
  const after = await inspect();
  assert.ok(before.every(old => after.some(row => row.session_id === old.session_id && row.seq === old.seq && row.event_json === old.event_json)), 'retained transcript bytes unchanged');
  await exercise('after-restart', 'reset');
  receipt.restartExit = await stop();
  assert.equal(receipt.restartExit.code, 0);
  receipt.passed = true;
} catch (error) { receipt.error = String(error); }
finally {
  receipt.finalExit = await stop();
  await new Promise(resolve => receiver.close(resolve));
  await claim.release();
  await fs.writeFile(path.join(artifactRoot, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify({ event: 'result', passed: receipt.passed, error: receipt.error }));
}
process.exit(receipt.passed ? 0 : 1);
