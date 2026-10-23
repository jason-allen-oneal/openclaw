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
  agents: { ownership: 'explicit', entries: { main: {} }, defaults: { workspace: dirs.workspace, skipBootstrap: true, model: { primary: 'ollama/qwen3:0.6b', fallbacks: [] }, thinkingDefault: 'off', timeoutSeconds: 180 } },
  models: { providers: { ollama: { baseUrl: process.env.PROOF_REAL_MODEL_URL, api: 'ollama', timeoutSeconds: 120, maxTokens: 128, models: [{ id: 'qwen3:0.6b', name: 'qwen3:0.6b', reasoning: false, input: ['text'], contextTokens: 16384, params: { num_ctx: 16384, thinking: false } }] } } },
  tools: { deny: ['*'] },
  messages: { visibleReplies: 'automatic' },
  plugins: { enabled: true, allow: ['delivery-reset-proof', 'ollama'], load: { paths: [pluginRoot] }, entries: { 'delivery-reset-proof': { enabled: true }, ollama: { enabled: true } }, slots: { memory: 'none' } },
  discovery: { mdns: { mode: 'off' } }, cron: { enabled: false },
  logging: { file: path.join(artifactRoot, 'gateway-runtime.jsonl') },
};
await fs.writeFile(configPath, JSON.stringify(config, null, 2));
const env = { PATH: process.env.PATH, HOME: dirs.home, LANG: 'C.UTF-8', TZ: 'UTC',
  OPENCLAW_STATE_DIR: dirs.state, OPENCLAW_CONFIG_PATH: configPath,
  OPENCLAW_SKIP_BROWSER_CONTROL_SERVER: '1', OPENCLAW_SKIP_CANVAS_HOST: '1',
  OPENCLAW_SKIP_CHANNELS: '1', OPENCLAW_SKIP_CRON: '1', OPENCLAW_SKIP_GMAIL_WATCHER: '1', OLLAMA_API_KEY: 'ollama-local' };
const receipt = { model: 'ollama/qwen3:0.6b', providerBaseUrl: process.env.PROOF_REAL_MODEL_URL, producer: 'default agent reply resolver; no injected replyResolver', sourceHead: process.env.PROOF_SOURCE_HEAD, buildRoot, calls: [], requests: [], stages: [], passed: false };
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
    const entry = { text, acceptedAt: new Date().toISOString() };
    receipt.requests.push(entry);
    assert.ok(activeReceipt, 'unexpected receiver request');
    const current = activeReceipt;
    current.accepted();
    await current.release;
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ messageId: current.messageId }));
    entry.receiptAt = new Date().toISOString();
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
const exercise = async (label, reset) => {
  const sessionKey = `agent:main:delivery-reset-${label}`;
  const messageId = `receipt-${label}`;
  const text = `ACCEPTED-REPLY-${label}-ONLY`;
  const created = await call('sessions.create', { key: sessionKey, agentId: 'main' });
  await call('chat.inject', { sessionKey, agentId: 'main', message: `seed-${label}` });
  let accept, release;
  const accepted = new Promise(resolve => { accept = resolve; });
  activeReceipt = { messageId, accepted: accept, release: new Promise(resolve => { release = resolve; }) };
  const dispatch = call('delivery-reset-proof.dispatch', { sessionKey, messageId, text, receiver: `http://127.0.0.1:${claim.port + 1}/reply` });
  let resetCall, timer;
  try {
    await Promise.race([accepted, dispatch.then(() => { throw new Error('dispatch ended before transport acceptance'); }), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('transport acceptance deadline')), 120000); })]);
    clearTimeout(timer);
    if (reset) {
      const logPath = path.join(artifactRoot, 'gateway-runtime.jsonl');
      const logOffset = (await fs.readFile(logPath)).length;
      resetCall = call('sessions.delete', { key: sessionKey, agentId: 'main', deleteTranscript: false });
      let mutationSettled = false;
      resetCall.then(() => { mutationSettled = true; }, () => { mutationSettled = true; });
      // Observe the existing lifecycle owner's real wait before releasing the transport.
      // No patched admission path, private owner imports, or arbitrary timing assumption.
      const deadline = Date.now() + 30000;
      let admission;
      while (Date.now() < deadline && !admission && !mutationSettled) {
        const lines = (await fs.readFile(logPath)).subarray(logOffset).toString('utf8').split('\n');
        for (const line of lines) {
          try {
            const entry = JSON.parse(line);
            if (entry['1']?.mutationKind === 'delete' && entry['2'] === 'session lifecycle queue waiting') admission = entry;
          } catch {}
        }
        if (!admission) await delay(50);
      }
      assert.ok(admission || mutationSettled, 'real delete admission or bounded terminal refusal observed before transport release');
      receipt.stages.push({ label, resetAdmission: admission });
    }
    release();
    const outcomes = await Promise.allSettled([dispatch, resetCall]);
    const rows = await inspect();
    const replies = rows.filter(row => row.message_role === 'assistant' && row.event_json?.includes(text));
    const stage = { label, deleteRecreate: reset, text, created, outcomes, replies, rows, passed: false };
    receipt.stages.push(stage);
    assert.equal(receipt.requests.filter(request => request.text === text).length, 1);
    assert.equal(replies.length, 1, 'exactly one persisted accepted reply');
    assert.equal(outcomes[0].status, 'fulfilled', 'dispatch completes');
    if (reset && outcomes[1].status === 'rejected') {
      assert.match(String(outcomes[1].reason), /could not safely stop before deletion|Session work is still active/);
      stage.retryDelete = await call('sessions.delete', { key: sessionKey, agentId: 'main', deleteTranscript: false });
    }
    if (reset) {
      stage.recreated = await call('sessions.create', { key: sessionKey, agentId: 'main' });
      assert.notEqual(stage.recreated.entry.sessionId, stage.created.entry.sessionId, 'physical session identity changed through supported delete/create');
      stage.historyAfterReset = await call('chat.history', { sessionKey, agentId: 'main', limit: 100 });
      assert.ok(!JSON.stringify(stage.historyAfterReset).includes(text), 'accepted old-context reply excluded from rebound session');
    }
    stage.passed = true;
    return { sessionKey, text };
  } finally { clearTimeout(timer); release(); await Promise.allSettled([dispatch, resetCall]); activeReceipt = undefined; }
};
try {
  await new Promise(resolve => receiver.listen(claim.port + 1, '127.0.0.1', resolve));
  await start('first');
  const control = await exercise('control', false);
  await exercise('rebind', true);
  const before = await inspect();
  receipt.firstExit = await stop();
  assert.equal(receipt.firstExit.code, 0);
  await start('restart');
  receipt.controlHistory = await call('chat.history', { sessionKey: control.sessionKey, agentId: 'main', limit: 100 });
  assert.ok(JSON.stringify(receipt.controlHistory).includes(control.text), 'retained control reply readable through Gateway');
  const after = await inspect();
  assert.ok(before.every(old => after.some(row => row.session_id === old.session_id && row.seq === old.seq && row.event_json === old.event_json)), 'retained transcript bytes unchanged');
  await exercise('after-restart', true);
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
