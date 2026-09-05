// Fork-only, secretless Actions proof. Never installed or run on an operator host.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [sourceArg, target, lane, evidenceArg] = process.argv.slice(2);
assert.equal(target, '5312a952799e235de79774c88182c062c294b484');
assert.ok(['cold-runtime', 'cold-declarations', 'existing-upgrade'].includes(lane));
assert.equal(process.env.GITHUB_ACTIONS, 'true', 'This proof is CI-only');
const source = fs.realpathSync(sourceArg);
const evidence = path.resolve(evidenceArg);
const fixture = path.join(evidence, 'fixture');
fs.mkdirSync(fixture, { recursive: true });
const proofEnv = {
  PATH: process.env.PATH,
  HOME: path.join(fixture, 'home'),
  XDG_CONFIG_HOME: path.join(fixture, 'xdg'),
  COREPACK_HOME: path.join(fixture, 'corepack'),
  TMPDIR: path.join(fixture, 'tmp'),
  OPENCLAW_STATE_DIR: path.join(fixture, 'state'),
  OPENCLAW_CONFIG_PATH: path.join(fixture, 'state', 'openclaw.json'),
  CI: 'true',
  LANG: 'C.UTF-8',
  GIT_TERMINAL_PROMPT: '0',
};
for (const key of ['HOME', 'XDG_CONFIG_HOME', 'COREPACK_HOME', 'TMPDIR', 'OPENCLAW_STATE_DIR']) {
  fs.mkdirSync(proofEnv[key], { recursive: true });
}
const report = {
  pr: 'https://github.com/openclaw/openclaw/pull/139392',
  targetSha: target,
  toolingSha: process.env.PROOF_TOOLING_SHA,
  lane,
  node: process.version,
  cases: [],
  result: 'in-progress',
  notTested: ['Service-manager restart is disabled; no existing Gateway is touched.',
    'No end-to-end update speedup or colleague-specific cause is claimed.',
    'Linux x64 only; no authenticated provider or channel traffic.'],
};
const save = () => fs.writeFileSync(path.join(evidence, 'summary.json'), JSON.stringify(report, null, 2) + '\n');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const redact = (text) => text.replaceAll(source, '<source>').replaceAll(fixture, '<fixture>');

async function run(bin, args, { cwd = source, env = proofEnv, log = 'setup.log', input, timeout = 60 * 60_000 } = {}) {
  const command = [bin, ...args].map((arg) => JSON.stringify(arg)).join(' ');
  fs.appendFileSync(path.join(evidence, log), `$ ${redact(command)}\n`);
  console.log(`COMMAND ${redact(command)} -> ${log}`);
  const started = performance.now();
  const child = spawn(bin, args, { cwd, env, detached: true, stdio: ['pipe', 'pipe', 'pipe'] });
  let output = '';
  let timedOut = false;
  let killer;
  const timer = setTimeout(() => {
    timedOut = true;
    try { process.kill(-child.pid, 'SIGTERM'); } catch {}
    killer = setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }, 10_000);
  }, timeout);
  for (const stream of [child.stdout, child.stderr]) {
    stream.on('data', (chunk) => {
      const text = redact(chunk.toString());
      output += text;
      fs.appendFileSync(path.join(evidence, log), text);
      for (const line of text.split('\n')) {
        if (/\[build-all\]|\[update-gateway\]|OK: All .*public plugin-sdk/.test(line)) console.log(line);
      }
    });
  }
  child.stdin.end(input);
  let code;
  try {
    code = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (exitCode) => resolve(exitCode));
    });
  } finally {
    clearTimeout(timer);
    clearTimeout(killer);
  }
  const elapsedSeconds = Math.round((performance.now() - started) / 100) / 10;
  fs.appendFileSync(path.join(evidence, log), `\nEXIT=${code} TIMEOUT=${timedOut} ELAPSED_SECONDS=${elapsedSeconds}\n`);
  if (code !== 0 || timedOut) console.error(output.slice(-6000));
  assert.equal(timedOut, false, `Timed out: ${command}`);
  assert.equal(code, 0, `Failed: ${command}`);
  return { output: output.trim(), elapsedSeconds, command: redact(command), log };
}

const git = async (args, root = source, options = {}) => (await run('git', ['-C', root, ...args], options)).output;
async function mutateGit(root, args) {
  await git(['rev-parse', '--show-toplevel'], root);
  await git(['status', '-sb'], root);
  await git(['rev-parse', 'HEAD'], root);
  return git(args, root);
}
async function cleanTracked() {
  await git(['diff', '--exit-code']);
  await git(['diff', '--cached', '--exit-code']);
}
function ownedDeclarations() {
  const rows = [];
  function walk(relative) {
    const absolute = path.join(source, relative);
    if (!fs.existsSync(absolute) || fs.lstatSync(absolute).isSymbolicLink()) return;
    for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.endsWith('.app')) continue;
      const item = path.join(relative, entry.name);
      if (entry.isDirectory()) walk(item);
      else if (entry.isFile() && /\.d\.(?:ts|mts|cts)$/.test(entry.name)) {
        rows.push({ path: item, sha256: hash(fs.readFileSync(path.join(source, item))) });
      }
    }
  }
  for (const root of ['dist', 'dist-runtime']) walk(root);
  for (const entry of fs.readdirSync(path.join(source, 'packages'), { withFileTypes: true })) {
    if (entry.isDirectory()) walk(`packages/${entry.name}/dist`);
  }
  return rows.sort((a, b) => a.path.localeCompare(b.path));
}
function requireFile(relative) {
  const file = path.join(source, relative);
  assert.ok(fs.statSync(file).isFile() && fs.statSync(file).size > 0, `Missing artifact: ${relative}`);
  return fs.readFileSync(file, 'utf8');
}
async function artifacts(expected) {
  requireFile('dist/entry.js');
  requireFile('dist/cli-startup-metadata.json');
  requireFile('dist/channel-catalog.json');
  const info = JSON.parse(requireFile('dist/build-info.json'));
  assert.equal(info.commit, expected);
  for (const name of ['.buildstamp', '.runtime-postbuildstamp']) {
    assert.equal(JSON.parse(requireFile(`dist/${name}`)).head, expected);
  }
  const html = requireFile('dist/control-ui/index.html');
  const sw = requireFile('dist/control-ui/sw.js');
  requireFile('dist/control-ui/manifest.webmanifest');
  assert.ok(sw.includes(info.buildId), 'Service worker does not match build identity');
  const uiAssets = [];
  for (const match of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
    const url = match[1];
    if (/^(?:https?:|data:|#|\/\/)/.test(url)) continue;
    const name = url.split(/[?#]/)[0].replace(/^\.?\//, '');
    if (!/\.(?:js|css)$/.test(name)) continue;
    assert.ok(!name.split('/').includes('..'));
    requireFile(`dist/control-ui/${name}`);
    uiAssets.push(name);
  }
  assert.ok(uiAssets.length > 0);
  const { productionPluginSdkEntrypoints } = await import(pathToFileURL(path.join(source, 'scripts/lib/plugin-sdk-entries.mts')));
  for (const name of productionPluginSdkEntrypoints) requireFile(`dist/plugin-sdk/${name}.js`);
  return { buildCommit: info.commit, buildId: info.buildId, uiAssets, runtimeSdkEntries: productionPluginSdkEntrypoints.length };
}
const runtimePhases = ['plugins:assets:build', 'tsdown', 'external-plugins:local-dist',
  'check-cli-bootstrap-imports', 'plugins:assets:copy', 'runtime-postbuild', 'build-stamp',
  'runtime-postbuild-stamp', 'ui:build', 'write-build-info', 'write-cli-startup-metadata'];
const typedPhases = ['tsdown-ai', 'tsdown-packages', 'tsdown-unified', 'write-unified-entry-dts',
  'write-plugin-sdk-entry-dts', 'check-plugin-sdk-exports'];

async function update(name, mode, expected, { retainedDeclarations } = {}) {
  const before = await git(['rev-parse', 'HEAD']);
  const updater = fs.readFileSync(path.join(source, 'scripts/update-gateway.sh'));
  assert.equal(hash(updater), report.updaterSha256, 'Updater bytes differ from reviewed HEAD');
  const env = { ...proofEnv, OPENCLAW_UPDATE_REMOTE: 'proof', OPENCLAW_UPDATE_RESTART_CMD: '' };
  if (mode === 'declarations') env.OPENCLAW_RUN_NODE_SKIP_DTS_BUILD = '0';
  const row = { name, mode, before, expected, result: 'running', declarationOverride: env.OPENCLAW_RUN_NODE_SKIP_DTS_BUILD ?? 'unset', log: `${name}.log` };
  report.cases.push(row);
  save();
  const result = await run('bash', ['scripts/update-gateway.sh'], { env, log: row.log });
  const after = await git(['rev-parse', 'HEAD']);
  assert.equal(after, expected);
  assert.match(result.output, /\[update-gateway\] OK /);
  assert.match(result.output, /restart skipped \(OPENCLAW_UPDATE_RESTART_CMD is empty\)/);
  const done = [...result.output.matchAll(/\[build-all\] ([^\s]+) done in /g)].map((m) => m[1]);
  const observedPhases = new Set([...result.output.matchAll(/^\[build-all\] (\S+)/gm)].map((m) => m[1]));
  const expectedPhases = mode === 'runtime' ? runtimePhases : [...runtimePhases.filter((p) => p !== 'tsdown'), ...typedPhases];
  for (const phase of expectedPhases) assert.ok(done.includes(phase), `Missing completed phase: ${phase}`);
  if (mode === 'runtime') {
    for (const phase of typedPhases) assert.ok(!observedPhases.has(phase), `Unexpected declaration phase: ${phase}`);
  } else {
    assert.match(result.output, /OK: All \d+ public plugin-sdk subpaths verified/);
    assert.ok(!/\[build-all\] tsdown-(?:ai|packages) \(cache restored\)/.test(result.output), 'Typed compiler work was cached');
  }
  const declarations = ownedDeclarations();
  if (mode === 'runtime' && !retainedDeclarations) assert.equal(declarations.length, 0);
  if (retainedDeclarations) assert.deepEqual(declarations, retainedDeclarations, 'Runtime update altered retained declarations');
  if (mode === 'declarations') assert.ok(declarations.length > 0);
  fs.writeFileSync(path.join(evidence, `${name}-declarations.json`), JSON.stringify(declarations, null, 2) + '\n');
  const built = await artifacts(expected);
  await cleanTracked();
  if (expected === target) {
    const help = await run(process.execPath, ['openclaw.mjs', '--help'], { log: `${name}-cli.log`, timeout: 120_000 });
    assert.match(help.output, /Usage: openclaw/);
    await run(process.execPath, ['openclaw.mjs', '--version'], { log: `${name}-cli.log`, timeout: 120_000 });
  }
  Object.assign(row, { result: 'passed', after, ...built, elapsedSeconds: result.elapsedSeconds,
    completedPhases: done, declarationFiles: declarations.length, retainedDeclarationsUnchanged: Boolean(retainedDeclarations), exitCode: 0 });
  save();
  console.log(`PROOF ${JSON.stringify(row)}`);
  return declarations;
}

try {
  assert.equal(await git(['rev-parse', 'HEAD']), target);
  report.updaterSha256 = hash(fs.readFileSync(path.join(source, 'scripts/update-gateway.sh')));
  report.packageManager = JSON.parse(fs.readFileSync(path.join(source, 'package.json'))).packageManager;
  report.corepack = (await run('corepack', ['--version'])).output;
  assert.equal(fs.existsSync(path.join(source, 'node_modules')), false, 'Cold checkout has installed dependencies');
  assert.equal(ownedDeclarations().length, 0, 'Cold checkout has generated declarations');
  assert.equal(fs.existsSync(path.join(source, '.artifacts/build-all-cache')), false);
  await git(['config', 'user.name', 'OpenClaw CI Proof']);
  await git(['config', 'user.email', 'proof@example.invalid']);
  const remote = path.join(fixture, 'remote');
  await run('git', ['clone', '--quiet', '--no-hardlinks', source, remote]);
  await mutateGit(remote, ['switch', '--detach', target]);
  await mutateGit(remote, ['branch', '--force', 'main', target]);
  await git(['remote', 'add', 'proof', remote]);
  if (lane !== 'existing-upgrade') {
    await mutateGit(source, ['switch', '--create', 'main', target]);
    await update(lane, lane === 'cold-runtime' ? 'runtime' : 'declarations', target);
    if (lane === 'cold-runtime') {
      await run(process.execPath, ['--import', 'tsx', 'scripts/test-built-bundled-channel-entry-smoke.mts'], { log: 'built-channel-smoke.log', timeout: 10 * 60_000 });
      report.builtChannelSmoke = 'passed';
    }
  } else {
    const base = 'e90a3baabc14ca1639b68514b76a90b090ee567e';
    report.seedBase = base;
    report.runtimeSourceAdvancement = (await git(['diff', '--name-only', base, `${target}^`, '--', 'src', 'packages'])).split('\n').filter(Boolean);
    assert.ok(report.runtimeSourceAdvancement.length > 0);
    await mutateGit(source, ['switch', '--create', 'server-proof', base]);
    await mutateGit(source, ['cherry-pick', target]);
    const seed = await git(['rev-parse', 'HEAD']);
    report.seedSha = seed;
    const patchId = async (sha) => (await run('git', ['patch-id', '--stable'], { input: await git(['diff', `${sha}^`, sha]) })).output.split(' ')[0];
    assert.equal(await patchId(seed), await patchId(target));
    assert.equal(hash(fs.readFileSync(path.join(source, 'scripts/update-gateway.sh'))), report.updaterSha256);
    await git(['fetch', source, seed], remote);
    await mutateGit(remote, ['branch', '--force', 'main', seed]);
    const seedDeclarations = await update('seed-older-typed-checkout', 'declarations', seed);
    await mutateGit(remote, ['branch', '--force', 'main', target]);
    await update('existing-upgrade-runtime', 'runtime', target, { retainedDeclarations: seedDeclarations });
    const generated = ownedDeclarations();
    for (const row of generated) fs.unlinkSync(path.join(source, row.path));
    const cache = path.join(source, '.artifacts/build-all-cache');
    const removedCaches = [];
    if (fs.existsSync(cache)) {
      assert.equal(fs.lstatSync(cache).isSymbolicLink(), false);
      for (const entry of fs.readdirSync(cache, { withFileTypes: true })) {
        if (!/^tsdown-(?:ai$|packages$|unified-openclaw-dts-|plugin-sdk-openclaw-dts-)/.test(entry.name)) continue;
        assert.ok(entry.isDirectory(), `Unexpected typed cache kind: ${entry.name}`);
        fs.rmSync(path.join(cache, entry.name), { recursive: true });
        removedCaches.push(entry.name);
      }
    }
    assert.equal(ownedDeclarations().length, 0);
    report.forcedFreshDeclarations = { removedFiles: generated.length, removedCaches };
    await update('existing-explicit-declarations', 'declarations', target);
  }
  await cleanTracked();
  report.result = 'passed';
} catch (error) {
  report.result = 'failed';
  report.error = redact(String(error.stack ?? error));
  console.error(report.error);
  process.exitCode = 1;
} finally {
  save();
  console.log(`PROOF_RESULT ${JSON.stringify({ targetSha: target, lane, result: report.result })}`);
}
