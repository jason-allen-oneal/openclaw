import argparse, hashlib, json, os, pathlib, signal, socket, subprocess, time, urllib.request

root = pathlib.Path(__file__).resolve().parent
parser = argparse.ArgumentParser()
parser.add_argument('--case', choices=('normal-load', 'fast-load-control'), default='normal-load')
parser.add_argument('--package', default=os.environ.get('OPENCLAW_PACKAGE'), required=not os.environ.get('OPENCLAW_PACKAGE'))
parser.add_argument('--node', default=os.environ.get('NODE_BINARY'), required=not os.environ.get('NODE_BINARY'))
parser.add_argument('--label-prefix', default='')
parser.add_argument('--warning-on-first-expired', action='store_true', help='After complete seed publication, fail one already-expired non-selected provider during its next real cache load')
args = parser.parse_args()
pkg = pathlib.Path(args.package).resolve()
node = pathlib.Path(args.node).resolve()
name = args.label_prefix + args.case + ('-warning' if args.warning_on_first_expired else '')
delay, port = (500, 20094) if args.case == 'normal-load' else (0, 20096)
case = root / name
if case.exists():
    raise RuntimeError('Refuse to overwrite existing case ' + str(case))
case.mkdir()
for directory in ('plugin', 'home', 'state', 'workspace', 'tmp'):
    (case / directory).mkdir()
plugin = case / 'plugin'
sha = lambda file: hashlib.sha256(file.read_bytes()).hexdigest()
identity = {'build': json.loads((pkg / 'dist/build-info.json').read_text()), 'entrySha256': sha(pkg / 'openclaw.mjs'), 'node': str(node), 'nodeSha256': sha(node), 'scripts': {p.name: sha(p) for p in root.iterdir() if p.is_file() and p.suffix in ('.py', '.mjs', '.cjs')}}
(case / 'identity.json').write_text(json.dumps(identity, indent=2))
(case / 'case.json').write_text(json.dumps({'name': name, 'providerCount': 64, 'configuredModelCount': 732, 'defaultTtlMs': 30000, 'loadDelayMs': delay, 'warningOnFirstExpired': args.warning_on_first_expired}))
(plugin / 'provider.cjs').write_text((root / 'provider.cjs').read_text().replace('const root = path.dirname(__dirname);', 'const root = ' + json.dumps(str(case)) + ';'))
(plugin / 'index.cjs').write_text("module.exports={id:'normal-ttl-proof',register(api){for(const provider of require('./provider.cjs'))api.registerProvider(provider);}};\n")
def make_row(index):
    return {'id': f'model-{index}', 'name': f'Normal TTL model {index}', 'reasoning': False, 'input': ['text'], 'contextWindow': 32768, 'maxTokens': 4096, 'cost': {'input': 0, 'output': 0, 'cacheRead': 0, 'cacheWrite': 0}}
providers = {f'api-{index:02}': {'api': 'openai-completions', 'baseUrl': 'http://127.0.0.1:20095/v1', 'apiKey': 'synthetic-only-key', 'models': [make_row(i) for i in range(12 if index < 28 else 11)]} for index in range(64)}
assert sum(len(p['models']) for p in providers.values()) == 732
catalog_providers = {provider: {k: v for k, v in definition.items() if k != 'apiKey'} for provider, definition in providers.items()}
(plugin / 'package.json').write_text(json.dumps({'name': 'normal-ttl-proof', 'version': '0.0.0', 'openclaw': {'extensions': ['./index.cjs']}}))
(plugin / 'openclaw.plugin.json').write_text(json.dumps({'id': 'normal-ttl-proof', 'providers': list(providers), 'providerCatalogEntry': './provider.cjs', 'modelCatalog': {'discovery': {provider: 'runtime' for provider in providers}, 'providers': catalog_providers}, 'configSchema': {'type': 'object', 'additionalProperties': False}}))
(case / 'node_modules').mkdir()
(case / 'node_modules/openclaw').symlink_to(pkg, target_is_directory=True)
config = {'gateway': {'port': port, 'mode': 'local', 'bind': 'loopback', 'auth': {'mode': 'token', 'token': 'synthetic-normal-ttl-only-token'}, 'controlUi': {'enabled': False}}, 'agents': {'defaults': {'workspace': str(case / 'workspace'), 'model': {'primary': 'api-00/model-0'}, 'models': {f'{provider}/{row["id"]}': {} for provider, definition in providers.items() for row in definition['models']}}, 'entries': {'main': {}}}, 'models': {'mode': 'merge', 'providers': providers}, 'plugins': {'allow': ['normal-ttl-proof'], 'load': {'paths': [str(plugin)]}, 'entries': {'normal-ttl-proof': {'enabled': True}}}, 'cron': {'enabled': False}, 'logging': {'file': str(case / 'gateway-private.log')}}
(case / 'config.json').write_text(json.dumps(config))
env = {'PATH': str(node.parent) + ':/usr/bin:/bin', 'HOME': str(case / 'home'), 'XDG_CACHE_HOME': str(case / 'home/cache'), 'TMPDIR': str(case / 'tmp'), 'LANG': 'C.UTF-8', 'OPENCLAW_STATE_DIR': str(case / 'state'), 'OPENCLAW_CONFIG_PATH': str(case / 'config.json'), 'OPENCLAW_SKIP_CHANNELS': '1', 'OPENCLAW_SKIP_GMAIL_WATCHER': '1', 'OPENCLAW_SKIP_CRON': '1', 'OPENCLAW_SKIP_BROWSER_CONTROL_SERVER': '1', 'OPENCLAW_SKIP_CANVAS_HOST': '1'}
with socket.socket() as sock:
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.bind(('127.0.0.1', port))
command = [str(node), str(pkg / 'openclaw.mjs'), 'gateway', '--port', str(port), '--bind', 'loopback', '--allow-unconfigured']
receipt = {'name': name, 'command': command, 'start': time.time(), 'configSha256': sha(case / 'config.json'), 'status': 'setup'}
process = None
try:
    with open(case / 'gateway.log', 'wb') as output:
        process = subprocess.Popen(command, cwd=pkg, env=env, stdout=output, stderr=subprocess.STDOUT, start_new_session=True)
    receipt['pid'] = process.pid
    (case / 'gateway.pid').write_text(str(process.pid))
    deadline = time.monotonic() + 100
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError('Gateway exited ' + str(process.returncode))
        try:
            with urllib.request.urlopen(f'http://127.0.0.1:{port}/readyz', timeout=2) as response:
                ready = json.load(response)
            if ready.get('ready'):
                break
        except Exception:
            pass
        time.sleep(.25)
    else:
        raise RuntimeError('Gateway readiness timeout100s')
    receipt.update(readyAt=time.time(), ready=ready)
    if 'failed during register' in (case / 'gateway.log').read_text():
        raise RuntimeError('Task provider registration failed; see gateway.log')
    observer = [str(node), str(root / 'observe.mjs'), str(case), str(pkg)]
    receipt['observerCommand'] = observer
    started = time.monotonic()
    with open(case / 'observe.log', 'wb') as output:
        observed = subprocess.run(observer, cwd=case, env=env, stdout=output, stderr=subprocess.STDOUT, timeout=185)
    receipt.update(observerExit=observed.returncode, observerElapsed=time.monotonic() - started, status='captured')
except Exception as error:
    receipt.update(status='failed', error=str(error))
finally:
    if process:
        if process.poll() is None:
            os.killpg(process.pid, signal.SIGTERM)
        try:
            process.wait(timeout=25)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
            process.wait(timeout=10)
            receipt['forcedCleanup'] = True
        receipt['gatewayExit'] = process.returncode
        receipt['processGone'] = not pathlib.Path('/proc', str(process.pid)).exists()
    receipt.update(finishedAt=time.time(), elapsed=time.time() - receipt['start'])
    (case / 'receipt.json').write_text(json.dumps(receipt, indent=2))
    print(json.dumps(receipt), flush=True)
raise SystemExit(0 if receipt['status'] == 'captured' and receipt.get('observerExit') == 0 else 1)
