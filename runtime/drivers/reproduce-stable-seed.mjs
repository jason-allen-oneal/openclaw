// ADAPTED, UNEXECUTED REPRODUCTION SOURCE. Not a receipt of the historical run.
// Seeds only synthetic fixture state through the published stable storage owners.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
const [packageArg, proofArg] = process.argv.slice(2);
const packageRoot = path.resolve(packageArg);
const root = path.resolve(proofArg);
const state = path.join(root, 'state');
const agentDir = path.join(state, 'agents/main/agent');
assert.equal(process.env.OPENCLAW_STATE_DIR, state, 'Bind selected isolated state explicitly');
const cfg = JSON.parse(fs.readFileSync(path.join(state, 'openclaw.json'), 'utf8'));
const bindings = [];
const bind = file => bindings.push({ file: path.relative(packageRoot, file), sha256: createHash('sha256').update(fs.readFileSync(file)).digest('hex') });
async function owner(name) {
  const dist = path.join(packageRoot, 'dist');
  const matches = fs.readdirSync(dist).filter(f => /\.(mjs|js)$/.test(f)).flatMap(f => {
    const text = fs.readFileSync(path.join(dist, f), 'utf8');
    return new RegExp(`(?:async )?function ${name}\\(`).test(text) ? [{ f, text }] : [];
  });
  assert.equal(matches.length, 1, `Unambiguous exported stable owner: ${name}`);
  const { f, text } = matches[0];
  const exports = [...text.matchAll(/export\s*\{([^}]+)\}/gs)].flatMap(m => m[1].split(',').map(s => s.trim()));
  const entry = exports.find(s => s === name || s.startsWith(name + ' as '));
  assert(entry, `Stable owner export: ${name}`);
  const alias = entry === name ? name : entry.slice((name + ' as ').length);
  const file = path.join(dist, f); bind(file);
  return (await import(pathToFileURL(file)))[alias];
}
const closeAgents = await owner('closeOpenClawAgentDatabasesAsync');
const closeState = await owner('closeOpenClawStateDatabaseAsync');
try {
  const sdk = path.join(packageRoot, 'dist/plugin-sdk/agent-sessions.js'); bind(sdk);
  const { AuthStorage } = await import(pathToFileURL(sdk));
  const auth = AuthStorage.forAgent(agentDir, cfg);
  auth.set('canonical', { type: 'api_key', key: 'synthetic-canonical-key' });
  assert.equal(auth.get('canonical')?.key, 'synthetic-canonical-key');
  assert.equal(auth.get('recovered'), undefined);
  const { baseUrl } = JSON.parse(fs.readFileSync(path.join(root, 'live-proxy.address.json'), 'utf8'));
  // Same legacy fixture shape as the historical seed; its model inventory is not
  // the configured runtime model. Config selects the real local qwen model.
  const model = { id: 'fixture-model', name: 'Fixture model', reasoning: false, input: ['text'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 4096, maxTokens: 128 };
  const provider = apiKey => ({ baseUrl, api: 'openai-completions', apiKey, models: [model] });
  const contents = JSON.stringify({ generatedBy: 'openclaw-plugin-model-catalog-v1', providers: {
    canonical: { ...provider('synthetic-canonical-key'), headers: { Authorization: 'Bearer synthetic-canonical-key' } },
    recovered: provider('synthetic-legacy-only-key'),
  } });
  const replace = await owner('replacePersistedPluginModelCatalogs');
  const read = await owner('loadPersistedPluginModelCatalogsReadOnly');
  await replace({ agentDir, pluginCatalogWrites: { 'plugins/proof-owner/catalog.json': contents }, env: process.env });
  assert.deepEqual(read(agentDir).map(row => ({ pluginId: row.pluginId, contents: row.contents })), [{ pluginId: 'proof-owner', contents }]);
  fs.writeFileSync(path.join(root, 'stable-fixture-seed.json'), JSON.stringify({ operation: 'synthetic fixture seeding only', bindings, canonicalProfileSeeded: true, recoveredProfileAbsent: true, generatedCredentialsPresent: true }, null, 2) + '\n');
  console.log(JSON.stringify({ fixtureSeeded: true, canonicalProfileSeeded: true, recoveredProfileAbsent: true }));
} finally {
  // Use actual published lifecycle owners, not abrupt process.exit or raw SQL writes.
  await closeAgents(state);
  await closeState();
}
