"""Bounded continuation of the stopped original legacy fixture after an incomplete native capture.
Preparation artifact: execution is explicit. Same package, data and SDK link; no seed or setup.
"""
import argparse
import hashlib
import json
import os
import pathlib
import signal
import socket
import subprocess
import sys
import time
import urllib.request

root = pathlib.Path(__file__).resolve().parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--name', required=True)
parser.add_argument('--phase', default='legacy-continuation')
parser.add_argument('--previous-phase', help='Latest completed continuation phase, required when any prior phase exists')
parser.add_argument('--package', default='<LEGACY_GATEWAY_PACKAGE>')
parser.add_argument('--node', default='<NODE_RUNTIME>/bin/node')
args = parser.parse_args()
for value in (args.name, args.phase, *([args.previous_phase] if args.previous_phase else [])):
    if pathlib.Path(value).name != value or not value.replace('-', '').isalnum():
        raise SystemExit('Case and phase must be simple path components')
if args.name != 'candidate-retained-ownerfix':
    raise SystemExit('Only the original candidate-retained-ownerfix fixture may be continued')
case = root / args.name
package = pathlib.Path(args.package).resolve()
node = pathlib.Path(args.node).resolve()
prior = json.loads((case / 'cleanup-receipt.json').read_text())
if (prior.get('status') != 'finished' or not prior.get('finishedAt') or
        {entry.get('label') for entry in prior.get('cleanup', [])} != {'gateway', 'inference', 'sampler', 'seed'} or
        any(not entry.get('processGone') for entry in prior.get('cleanup', []))):
    raise SystemExit('Legacy keeper must have terminal clean child shutdown first')
if prior.get('ports') != {'20094': 'free', '20095': 'free'}:
    raise SystemExit('Legacy terminal receipt lacks free fixture ports')
# A later continuation changes the retained state too. Never rely only on the
# original keeper's cleanup receipt when deciding that another owner may start.
prior_phases = []
for directory in sorted(case.iterdir()):
    if not directory.is_dir() or not any((directory / name).exists()
            for name in ('runtime-state.json', 'runtime-ready.json', 'cleanup-receipt.json')):
        continue
    if directory.is_symlink():
        raise SystemExit('Refuse redirected continuation evidence')
    terminal_path = directory / 'cleanup-receipt.json'
    if not terminal_path.is_file():
        raise SystemExit('Prior continuation has no terminal cleanup receipt: ' + directory.name)
    terminal = json.loads(terminal_path.read_text())
    cleanup = terminal.get('cleanup', [])
    if (terminal.get('case') != str(case) or terminal.get('phase') != directory.name or
            terminal.get('status') != 'finished' or not terminal.get('finishedAt') or
            {entry.get('label') for entry in cleanup} != {'gateway', 'inference', 'sampler'} or
            len(cleanup) != 3 or any(entry.get('processGone') is not True for entry in cleanup) or
            terminal.get('ports') != {'20094': 'free', '20095': 'free'} or
            terminal.get('configUnchanged') is not True or terminal.get('packageLinkUnchanged') is not True):
        raise SystemExit('Prior continuation lacks verified terminal cleanup: ' + directory.name)
    prior_phases.append((directory.name, terminal_path, terminal))
if prior_phases:
    latest_phase = max(prior_phases, key=lambda entry: entry[2]['finishedAt'])
    if args.previous_phase != latest_phase[0]:
        raise SystemExit('--previous-phase must name the latest completed continuation: ' + latest_phase[0])
elif args.previous_phase:
    raise SystemExit('--previous-phase does not identify a recorded continuation')
for directory in ('home', 'state', 'workspace', 'plugin', 'tmp'):
    if not (case / directory).is_dir() or (case / directory).is_symlink():
        raise SystemExit('Refuse missing or redirected original data directory')
config = json.loads((case / 'config.json').read_text())
if (config.get('plugins', {}).get('allow') != ['normal-ttl-proof'] or
        config.get('agents', {}).get('defaults', {}).get('workspace') != str(case / 'workspace') or
        config.get('agents', {}).get('defaults', {}).get('model', {}).get('primary') != 'api-00/model-0' or
        config.get('models', {}).get('providers', {}).get('api-00', {}).get('apiKey') != '<FIXTURE_CREDENTIAL_2>'):
    raise SystemExit('Only the original synthetic fixture is accepted')
package_link = case / 'node_modules/openclaw'
if not package_link.is_symlink():
    raise SystemExit('Expected original fixture package-resolution symlink')
old_target = package_link.resolve()
old_build = json.loads((old_target / 'dist/build-info.json').read_text())
original_identity = json.loads((case / 'identity.json').read_text())
new_build = json.loads((package / 'dist/build-info.json').read_text())
if old_build.get('commit') != 'eb377ac59e6c9fd6c7705028034812becf00271b':
    raise SystemExit('Refuse already-upgraded or unexpected legacy package')
if package != old_target or new_build != old_build or old_build != original_identity.get('build'):
    raise SystemExit('Continuation requires the exact original legacy package and unchanged SDK resolution')
preflight_sha = lambda file: hashlib.file_digest(file.open('rb'), 'sha256').hexdigest()
if (preflight_sha(package / 'openclaw.mjs') != original_identity.get('entrySha256') or
        preflight_sha(node) != original_identity.get('nodeSha256') or
        preflight_sha(case / 'config.json') != original_identity.get('configSha256')):
    raise SystemExit('Original Gateway entry, Node binary, or config changed; inspect before continuation')
original_drivers = original_identity.get('driverSha256', {})
for relative, original_key in (('plugin/provider.cjs', 'plugin--provider.cjs'),
                               ('plugin/index.cjs', 'plugin--index.cjs'),
                               ('plugin/openclaw.plugin.json', 'plugin--openclaw.plugin.json'),
                               ('plugin/package.json', 'plugin--package.json'),
                               ('case.json', 'case.json'),
                               ('driver-snapshot/inference-server.mjs', 'inference-server.mjs'),
                               ('driver-snapshot/sample-process.py', 'sample-process.py')):
    if preflight_sha(case / relative) != original_drivers.get(original_key):
        raise SystemExit('Original fixture input changed: ' + relative)

def proc_identity(pid):
    base = pathlib.Path('/proc') / str(pid)
    stat = (base / 'stat').read_text().rsplit(')', 1)[1].split()
    return {'pid': pid, 'startTicks': stat[19], 'command': (base / 'cmdline').read_bytes().replace(b'\0', b' ').decode().strip()}

process_receipts = [prior, *(entry[2] for entry in prior_phases)]
for entry in [entry for saved in process_receipts
              for entry in [saved.get('owner', {}), *saved.get('cleanup', [])]]:
    if not entry.get('pid'):
        continue
    try:
        actual = proc_identity(entry['pid'])
    except FileNotFoundError:
        continue
    if actual['startTicks'] == str(entry.get('startTicks')):
        raise SystemExit('Prior fixture process still exists; refuse concurrent continuation')
for port in (20094, 20095):
    with socket.socket() as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.bind(('127.0.0.1', port))
os.umask(0o077)
out = case / args.phase
out.mkdir(mode=0o700, exist_ok=False)
(out / 'driver-snapshot').mkdir(mode=0o700)
sha = lambda file: hashlib.file_digest(file.open('rb'), 'sha256').hexdigest()

def write(name, value):
    (out / name).write_text(json.dumps(value, indent=2) + '\n')

def state_inventory(label, live):
    # Hash bytes only; do not read logical credential/session contents or copy databases.
    files = [case / 'config.json', case / 'case.json']
    for directory in ('state', 'workspace', 'plugin'):
        files.extend(p for p in (case / directory).rglob('*') if p.is_file() and not p.is_symlink())
    if len(files) > 5000 or sum(p.stat().st_size for p in files) > 512 * 1024 * 1024:
        raise RuntimeError('Fixture inventory exceeds bounded size')
    items = []
    for file in sorted(files):
        before = file.stat()
        digest = sha(file)
        after = file.stat()
        items.append({'path': str(file.relative_to(case)), 'bytes': after.st_size, 'sha256': digest,
                      'inode': after.st_ino, 'device': after.st_dev,
                      'stableDuringHash': before.st_size == after.st_size and before.st_mtime_ns == after.st_mtime_ns})
    value = {'label': label, 'timestampMs': round(time.time() * 1000), 'liveRuntime': live,
             'note': 'Hashes/inodes only; live snapshots are observational, not transactional database backups.',
             'directories': {name: {'inode': (case / name).stat().st_ino, 'device': (case / name).stat().st_dev}
                             for name in ('home', 'state', 'workspace', 'plugin')},
             'files': items, 'configSha256': sha(case / 'config.json'),
             'packageResolutionTarget': str(package_link.resolve())}
    write(label + '.json', value)
    return value

def provider_boundary():
    ledger = case / 'provider.jsonl'
    return {'path': str(ledger), 'bytes': ledger.stat().st_size if ledger.exists() else 0,
            'lines': sum(1 for _ in ledger.open('rb')) if ledger.exists() else 0,
            'sha256': sha(ledger) if ledger.exists() else None}

started = time.time()
hard_deadline = time.monotonic() + 720
deadline = hard_deadline - 30
stopping = False
owned = []
receipt = {'case': str(case), 'phase': args.phase, 'status': 'preparing', 'startedAt': started,
           'deadlineAt': started + 720, 'activeWindowSeconds': 690, 'cleanupReserveSeconds': 30,
           'owner': proc_identity(os.getpid()), 'priorCleanupSha256': sha(case / 'cleanup-receipt.json'),
           'previousPhase': args.previous_phase,
           'priorPhaseCleanupSha256': {name: sha(path) for name, path, terminal in prior_phases},
           'retainedDataNotCopied': True, 'seedPerformed': False, 'setupCodeIssued': False,
           'recoveryKind': 'incomplete-native-capture-continuation', 'packageLinkRetargeted': False,
           'priorNativeCaptureWasSuccessful': False,
           'configWrittenByHarness': False, 'inferenceHelperRestartedUnchanged': True,
           'oldPackageTarget': str(old_target), 'newPackageTarget': str(package),
           'oldBuild': old_build, 'newBuild': new_build, 'paidInference': False}

def stop_request(sig, frame):
    global stopping
    stopping = True
    receipt['stopSignal'] = sig

signal.signal(signal.SIGTERM, stop_request)
signal.signal(signal.SIGINT, stop_request)

def spawn(label, command, env, cwd):
    with (out / (label + '.log')).open('wb') as log:
        child = subprocess.Popen(command, stdout=log, stderr=subprocess.STDOUT, start_new_session=True, env=env, cwd=cwd)
    identity = proc_identity(child.pid)
    owned.append((label, child, identity))
    receipt[label] = identity
    write('runtime-state.json', receipt)
    return child

try:
    state_inventory('state-before-continuation', False)
    receipt['providerLedgerBefore'] = provider_boundary()
    hashes = {}
    for source in [pathlib.Path(__file__).resolve(), case / 'driver-snapshot/inference-server.mjs', case / 'driver-snapshot/sample-process.py']:
        destination = out / 'driver-snapshot' / source.name
        destination.write_bytes(source.read_bytes())
        hashes[source.name] = sha(destination)
    # Deliberately retain the exact installed-package SDK symlink; this is not an upgrade.
    if not package_link.is_symlink() or package_link.resolve() != old_target:
        raise RuntimeError('Original SDK resolution changed during continuation preflight')
    write('identity.json', {'build': new_build, 'entrySha256': sha(package / 'openclaw.mjs'),
                           'priorBuild': old_build, 'priorEntrySha256': sha(old_target / 'openclaw.mjs'),
                           'nodeSha256': sha(node), 'driverSha256': hashes,
                           'configSha256': sha(case / 'config.json'),
                           'providerPluginSha256': sha(case / 'plugin/provider.cjs'),
                           'originalStateDirectory': str(case / 'state'), 'originalWorkspace': str(case / 'workspace'),
                           'packageResolutionTarget': str(package_link.resolve())})
    env = {'PATH': str(node.parent) + ':/usr/bin:/bin', 'HOME': str(case / 'home'),
           'XDG_CACHE_HOME': str(case / 'home/cache'), 'TMPDIR': str(case / 'tmp'), 'LANG': 'C.UTF-8',
           'OPENCLAW_STATE_DIR': str(case / 'state'), 'OPENCLAW_CONFIG_PATH': str(case / 'config.json'),
           **{key: '1' for key in ['OPENCLAW_SKIP_CHANNELS', 'OPENCLAW_SKIP_GMAIL_WATCHER', 'OPENCLAW_SKIP_CRON',
                                  'OPENCLAW_SKIP_BROWSER_CONTROL_SERVER', 'OPENCLAW_SKIP_CANVAS_HOST']}}
    inference = spawn('inference', [str(node), str(out / 'driver-snapshot/inference-server.mjs'), '--out', str(out), '--seconds', '720'], env, case)
    gateway = spawn('gateway', [str(node), str(package / 'openclaw.mjs'), 'gateway', '--port', '20094', '--bind', 'loopback', '--allow-unconfigured'], env, package)
    sampler = spawn('sampler', [sys.executable, str(out / 'driver-snapshot/sample-process.py'), '--pid', str(gateway.pid),
                               '--start-ticks', receipt['gateway']['startTicks'], '--seconds', '720',
                               '--ready-url', 'http://127.0.0.1:20094/readyz'], env, case)
    ready_deadline = time.monotonic() + 120
    while time.monotonic() < ready_deadline and not stopping:
        if gateway.poll() is not None or inference.poll() is not None:
            raise RuntimeError('Legacy continuation child exited before readiness')
        try:
            with urllib.request.urlopen('http://127.0.0.1:20094/readyz', timeout=2) as response:
                ready = json.load(response)
            with urllib.request.urlopen('http://127.0.0.1:20095/healthz', timeout=2) as response:
                inference_ready = json.load(response)
            if ready.get('ready') and inference_ready.get('ready'):
                break
        except Exception:
            pass
        time.sleep(.25)
    else:
        raise RuntimeError('Legacy continuation readiness timeout or stop')
    receipt.update(status='ready-for-native', readyAt=time.time(), ready=ready,
                   providerLedgerAtReady=provider_boundary())
    state_inventory('state-after-startup', True)
    write('runtime-ready.json', receipt)
    write('runtime-state.json', receipt)
    print(json.dumps({'status': receipt['status'], 'case': str(case), 'phase': args.phase,
                      'buildCommit': new_build['commit'], 'noSeed': True}), flush=True)
    # The legacy root stop-request is deliberately not reused or deleted.
    while time.monotonic() < deadline and not stopping and not (out / 'stop-request').exists():
        if gateway.poll() is not None or inference.poll() is not None:
            raise RuntimeError('Required legacy continuation child exited during observation')
        time.sleep(.25)
    receipt['stopReason'] = 'parent-stop' if stopping or (out / 'stop-request').exists() else 'bounded-active-window'
    receipt['status'] = 'finished'
except BaseException as error:
    receipt.update(status='failed', error=str(error))
finally:
    receipt['cleanup'] = []
    for label, child, identity in reversed(owned):
        cleanup = {'label': label, **identity, 'alreadyExited': child.poll() is not None}
        if child.poll() is None:
            actual = proc_identity(child.pid)
            if actual['startTicks'] != identity['startTicks']:
                cleanup['identityMismatch'] = True
                receipt['status'] = 'failed'
                receipt['cleanup'].append(cleanup)
                continue
            os.killpg(child.pid, signal.SIGTERM)
            try:
                child.wait(timeout=min(15, max(.1, hard_deadline - time.monotonic() - 5)))
            except subprocess.TimeoutExpired:
                actual = proc_identity(child.pid)
                if actual['startTicks'] != identity['startTicks']:
                    raise RuntimeError('PID identity changed before forced cleanup')
                os.killpg(child.pid, signal.SIGKILL)
                child.wait(timeout=min(5, max(.1, hard_deadline - time.monotonic())))
                cleanup['forced'] = True
        cleanup.update(exitCode=child.returncode, processGone=not pathlib.Path('/proc', str(child.pid)).exists())
        receipt['cleanup'].append(cleanup)
    receipt['ports'] = {}
    for port in (20094, 20095):
        with socket.socket() as sock:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                sock.bind(('127.0.0.1', port))
                receipt['ports'][str(port)] = 'free'
            except OSError:
                receipt['ports'][str(port)] = 'occupied'
    receipt['providerLedgerAfter'] = provider_boundary()
    try:
        final_state = state_inventory('state-after-shutdown', False)
        receipt['configSha256After'] = final_state['configSha256']
        receipt['configUnchanged'] = final_state['configSha256'] == json.loads((out / 'state-before-continuation.json').read_text())['configSha256']
        receipt['packageLinkUnchanged'] = package_link.is_symlink() and package_link.resolve() == old_target
        if not receipt['configUnchanged'] or not receipt['packageLinkUnchanged']:
            receipt['status'] = 'failed'
    except Exception as error:
        receipt['stateInventoryError'] = str(error)
        receipt['status'] = 'failed'
    if any(value != 'free' for value in receipt['ports'].values()) or any(not item.get('processGone') for item in receipt['cleanup']):
        receipt['status'] = 'failed'
    receipt.update(finishedAt=time.time(), elapsedSeconds=time.time() - started)
    write('cleanup-receipt.json', receipt)
    write('runtime-state.json', receipt)
    print(json.dumps({'status': receipt['status'], 'phase': args.phase, 'ports': receipt['ports'],
                      'error': receipt.get('error'), 'configUnchanged': receipt.get('configUnchanged')}), flush=True)
raise SystemExit(0 if receipt['status'] == 'finished' else 1)
