"""Capture an already installed, paired task APK; never build, install or start a Gateway."""
import argparse
import collections
import datetime
import json
import os
import pathlib
import re
import signal
import subprocess
import time
import urllib.request

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--out', type=pathlib.Path, required=True)
parser.add_argument('--identity', type=pathlib.Path, required=True)
parser.add_argument('--adb', default='<ANDROID_SDK>/platform-tools/adb')
parser.add_argument('--serial', default='emulator-5584')
parser.add_argument('--app', default='ai.openclaw.app.debug')
parser.add_argument('--seconds', type=int, default=60)
parser.add_argument('--proxy-url', default='http://127.0.0.1:19992')
args = parser.parse_args()
if not 10 <= args.seconds <= 140 or not re.fullmatch(r'[a-zA-Z0-9_.]+', args.app):
    raise SystemExit('Duration must be 10..140 seconds and app must be a package name')
if args.proxy_url not in ('http://127.0.0.1:19992', 'http://127.0.0.1:19792'):
    raise SystemExit('Use an explicitly reviewed task-local proxy URL')
root = args.out.resolve()
root.mkdir(parents=True, exist_ok=True, mode=0o700)
os.umask(0o077)
if (root / 'native.receipt.json').exists() or (root / 'native-instrumentation.log').exists():
    raise SystemExit('Refuse to overwrite a completed or partial native capture')
identity = json.loads(args.identity.read_text())
if identity.get('verified') is not True:
    raise SystemExit('APK identity is not verified')
adb = [args.adb, '-s', args.serial]
def run(*command, check=True, timeout=15):
    return subprocess.run(adb + list(command), capture_output=True, text=True, check=check, timeout=timeout)
def appfile(name):
    result = run('shell', 'run-as', args.app, 'cat', 'files/catalog-proof/' + name, check=False)
    return result.stdout if result.returncode == 0 else None
def save_json(name, value):
    (root / name).write_text(json.dumps(value, indent=2) + '\n')
def screenshot(name):
    result = subprocess.run(adb + ['exec-out', 'screencap', '-p'], capture_output=True, check=True, timeout=15)
    (root / (name + '.png')).write_bytes(result.stdout)
def proxy_summary():
    with urllib.request.urlopen(args.proxy_url + '/summary', timeout=5) as response:
        return json.load(response)
def stop_child(process, label, cleanup):
    if process is None:
        return
    if process.poll() is None:
        try:
            os.killpg(process.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
    try:
        process.wait(timeout=10)
    except subprocess.TimeoutExpired:
        os.killpg(process.pid, signal.SIGKILL)
        process.wait(timeout=5)
    cleanup.append({'owner': label, 'pid': process.pid, 'exitCode': process.returncode,
                    'processGone': not pathlib.Path('/proc', str(process.pid)).exists()})
def cleanup_adb(*command):
    try:
        result = run(*command, check=False)
        return {'command': list(command), 'exitCode': result.returncode, 'stdout': result.stdout.strip()}
    except Exception as error:
        return {'command': list(command), 'error': str(error)}

installed = []
for artifact in identity['apks']:
    package = args.app + ('.test' if artifact['role'] == 'instrumentation' else '')
    paths = [line.removeprefix('package:') for line in run('shell', 'pm', 'path', package).stdout.splitlines()
             if line.startswith('package:')]
    if len(paths) != 1:
        raise SystemExit('Expected one installed base APK for ' + package)
    installed_sha = run('shell', 'sha256sum', paths[0]).stdout.split()[0]
    if installed_sha != artifact['sha256']:
        raise SystemExit('Installed APK differs from verified artifact: ' + package)
    installed.append({'package': package, 'sha256': installed_sha, 'matchesBuiltArtifact': True})
save_json('installed-identity.json', {'sourceCommit': identity['sourceCommit'], 'serial': args.serial,
                                    'artifacts': installed})
command = adb + ['shell', 'am', 'instrument', '-w', '-r', '-e', 'class',
                 'ai.openclaw.app.CatalogRefreshProofTest',
                 args.app + '.test/androidx.test.runner.AndroidJUnitRunner']
receipt = {'command': command, 'sourceCommit': identity['sourceCommit'],
           'apkIdentity': str(args.identity.resolve()), 'eventsInjected': False,
           'startedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'durationRequested': args.seconds}
start = time.monotonic()
native = logcat = None
cleanup = []
last_phase = None
try:
    # Only the two task fixture packages are used. No global log clearing or adb-server shutdown.
    run('shell', 'am', 'force-stop', args.app)
    run('shell', 'run-as', args.app, 'rm', '-rf', 'files/catalog-proof')
    with (root / 'native-logcat.private.log').open('wb') as logs, \
         (root / 'native-instrumentation.log').open('wb') as instrumentation:
        logcat = subprocess.Popen(adb + ['logcat', '-v', 'epoch', '-T', '1'], stdout=logs,
                                  stderr=subprocess.STDOUT, start_new_session=True)
        native = subprocess.Popen(command, stdout=instrumentation, stderr=subprocess.STDOUT,
                                  start_new_session=True)
        receipt['ownedProcessIds'] = {'instrumentation': native.pid, 'logcat': logcat.pid}
        save_json('native.running.json', receipt)
        deadline = time.monotonic() + 140
        while time.monotonic() < deadline:
            if (appfile('ready') or '').strip() == 'ready':
                break
            if native.poll() is not None:
                raise RuntimeError('Instrumentation exited before native shell became ready')
            time.sleep(.5)
        else:
            raise RuntimeError('Native shell was not ready within 140 seconds')
        ready = time.monotonic()
        receipt['readyAtMs'] = round(time.time() * 1000)
        screenshot('native-ready')
        save_json('native-ready.json', {'timestampMs': receipt['readyAtMs'],
                                      'note': 'Inspect screenshot; open Chat if necessary, then mark measured phase through proxy /phase'})
        print(json.dumps({'ready': True, 'out': str(root), 'secondsRemaining': args.seconds}), flush=True)
        next_memory = 0
        while time.monotonic() - ready < args.seconds:
            if native.poll() is not None:
                raise RuntimeError('Instrumentation exited during bounded observation')
            raw = appfile('observations.json')
            if raw:
                # Parsing also rejects a truncated capture; retain the previous valid copy while a write completes.
                try:
                    values = json.loads(raw)
                    save_json('native-observations.json', values)
                except json.JSONDecodeError:
                    pass
            phase_path = root / 'phase.json'
            if phase_path.exists():
                phase = json.loads(phase_path.read_text())['name']
                if phase != last_phase:
                    screenshot('native-phase-' + phase)
                    last_phase = phase
            if time.monotonic() >= next_memory:
                result = run('shell', 'dumpsys', 'meminfo', args.app, check=False)
                with (root / 'app-memory.private.log').open('a') as memory:
                    memory.write(json.dumps({'timestampMs': round(time.time() * 1000), 'phase': last_phase}) + '\n')
                    memory.write(result.stdout + '\n')
                next_memory = time.monotonic() + 10
            if (root / 'native-logcat.private.log').stat().st_size > 64 * 1024 * 1024:
                raise RuntimeError('Bounded capture stopped at 64MiB logcat limit')
            if (root / 'native-wire.jsonl').exists() and (root / 'native-wire.jsonl').stat().st_size > 32 * 1024 * 1024:
                raise RuntimeError('Bounded capture stopped at 32MiB wire-log limit')
            if (root / 'finish-native').exists():
                receipt['finishedByParent'] = True
                break
            time.sleep(.5)
        receipt['observationSeconds'] = time.monotonic() - ready
        screenshot('native-final')
except BaseException as error:
    receipt['captureError'] = str(error)
finally:
    if native:
        cleanup.append(cleanup_adb('shell', 'run-as', args.app, 'touch', 'files/catalog-proof/finish'))
        try:
            receipt['instrumentationExitCode'] = native.wait(timeout=35)
        except subprocess.TimeoutExpired:
            receipt['instrumentationStopRequired'] = True
        for name in ('observations.json', 'native-ui.png'):
            try:
                result = subprocess.run(adb + ['exec-out', 'run-as', args.app, 'cat', 'files/catalog-proof/' + name],
                                        capture_output=True, timeout=15)
                if result.returncode == 0:
                    if name == 'observations.json':
                        if not isinstance(json.loads(result.stdout), list):
                            raise ValueError('Observation artifact is not an array')
                    elif not result.stdout.startswith(b'\x89PNG\r\n\x1a\n'):
                        raise ValueError('Screenshot artifact is not PNG')
                    (root / ('native-' + name if name == 'observations.json' else name)).write_bytes(result.stdout)
                else:
                    receipt.setdefault('artifactPullErrors', []).append({'name': name, 'exitCode': result.returncode})
            except subprocess.TimeoutExpired:
                receipt['artifactPullTimeout'] = True
            except (ValueError, UnicodeDecodeError) as error:
                receipt.setdefault('artifactPullErrors', []).append({'name': name, 'error': str(error)})
    stop_child(native, 'instrumentation-adb', cleanup)
    app_pid = ''
    for package in (args.app, args.app + '.test'):
        stopped = cleanup_adb('shell', 'am', 'force-stop', package)
        probe = cleanup_adb('shell', 'pidof', package)
        remaining = probe.get('stdout', '')
        app_pid += remaining
        cleanup.append({'owner': 'task-app', 'package': package, 'forceStop': stopped,
                        'remainingPids': remaining, 'probe': probe})
        if probe.get('error'):
            receipt['cleanupUnverified'] = True
    stop_child(logcat, 'logcat-adb', cleanup)
    try:
        receipt['proxyAtStop'] = proxy_summary()
    except Exception as error:
        receipt['proxyReadbackError'] = str(error)
    receipt['cleanup'] = cleanup
    receipt['parentStillOwns'] = ['Gateway', 'proxy', 'SSH tunnel', 'emulator', 'Gateway memory sampler']
    output = (root / 'native-instrumentation.log').read_text() if (root / 'native-instrumentation.log').exists() else ''
    receipt['instrumentationPassed'] = 'OK (1 test)' in output and 'FAILURES!!!' not in output
    receipt['captureComplete'] = not receipt.get('captureError') and receipt['instrumentationPassed'] and not app_pid and not receipt.get('cleanupUnverified') and not receipt.get('artifactPullErrors') and not receipt.get('artifactPullTimeout')
    receipt['totalSeconds'] = time.monotonic() - start
    receipt['finishedAtMs'] = round(time.time() * 1000)
    wire = root / 'native-wire.jsonl'
    if wire.exists():
        records = [json.loads(line) for line in wire.read_text().splitlines() if line]
        receipt['requestCountsByPhase'] = {phase: dict(collections.Counter(row['method'] for row in records
            if row.get('direction') == 'request' and row.get('phase') == phase))
            for phase in sorted({row.get('phase', '') for row in records})}
        receipt['warningResponseCount'] = sum(row.get('direction') == 'response' and row.get('refreshFailed') is True for row in records)
    save_json('native.receipt.json', receipt)
    print(json.dumps({'captureComplete': receipt['captureComplete'], 'sourceCommit': identity['sourceCommit'],
                      'captureError': receipt.get('captureError'), 'out': str(root)}), flush=True)
raise SystemExit(0 if receipt['captureComplete'] else 1)
