"""Own one bounded native capture's tunnel, proxy, pairing, and capture processes."""
import argparse, datetime, hashlib, json, os, pathlib, signal, socket, subprocess, time, urllib.request

p = argparse.ArgumentParser()
p.add_argument('--case', required=True)
p.add_argument('--remote-case', required=True)
p.add_argument('--identity', required=True, type=pathlib.Path)
p.add_argument('--seconds', type=int, default=90)
p.add_argument('--preserve-app-state', action='store_true', help='Reuse existing pairing/settings; never pm clear or request a setup code')
p.add_argument('--previous-case', help='Completed local capture whose retained app-state hashes must match before reuse')
p.add_argument('--resume-incomplete', action='store_true', help='Recover a failed or interrupted paired capture after explicit local cleanup reconciliation')
a = p.parse_args()
base = pathlib.Path(__file__).resolve().parent
if not a.case.replace('-', '').isalnum() or not a.remote_case.startswith('<REMOTE_PROOF_ROOT>/'):
    raise SystemExit('Only task-local cases are accepted')
if a.preserve_app_state and (not a.previous_case or not a.previous_case.replace('-', '').isalnum()):
    raise SystemExit('--preserve-app-state requires a simple --previous-case name')
if a.resume_incomplete and not a.preserve_app_state:
    raise SystemExit('--resume-incomplete requires --preserve-app-state and --previous-case')
out = base / a.case
out.mkdir(mode=0o700, exist_ok=False)
os.umask(0o077)
adb = ['<ANDROID_SDK>/platform-tools/adb', '-s', 'emulator-5584']
repo = base.parent.parent / '179075'
receipt = {'startedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'remoteCase': a.remote_case,
           'identity': str(a.identity.resolve()), 'owned': [], 'cleanup': [],
           'preserveAppState': a.preserve_app_state, 'previousCase': a.previous_case,
           'resumeIncomplete': a.resume_incomplete,
           'pmClearPerformed': False, 'setupCodeRequested': False}
children = []
reverse_installed = False
def process_start_ticks(pid):
    return (pathlib.Path('/proc') / str(pid) / 'stat').read_text().rsplit(')', 1)[1].split()[19]
def paired_wire_identities(path):
    rows = [json.loads(line) for line in path.read_text().splitlines() if line]
    requests = {(row['connection'], row['id']): row for row in rows
                if row.get('direction') == 'request' and row.get('method') == 'connect'}
    identities = set()
    for row in rows:
        if row.get('direction') != 'response' or row.get('method') != 'connect' or row.get('ok') is not True:
            continue
        request = requests.get((row['connection'], row['id']), {})
        value = tuple(request.get(key) for key in ('role', 'deviceIdentitySha256', 'devicePublicKeySha256'))
        if value[0] in ('node', 'operator') and all(isinstance(item, str) and len(item) == 64 for item in value[1:]):
            identities.add(value)
    if {value[0] for value in identities} != {'node', 'operator'}:
        raise RuntimeError('Both authenticated native roles must have captured signed device identity hashes')
    return identities
def app_storage_snapshot(label):
    files = []
    for path in ('shared_prefs/openclaw.node.xml', 'shared_prefs/openclaw.node.secure.xml',
                 'files/openclaw/identity/device.json'):
        result = subprocess.run(adb + ['shell', 'run-as', 'ai.openclaw.app.debug', 'sha256sum', path],
                                capture_output=True, text=True, timeout=15)
        row = {'path': path, 'exists': result.returncode == 0}
        if result.returncode == 0:
            digest = result.stdout.split()[0]
            if len(digest) != 64 or any(char not in '0123456789abcdef' for char in digest):
                raise RuntimeError('Unexpected Android state hash output')
            row['sha256'] = digest
        files.append(row)
    value = {'label': label, 'timestampMs': round(time.time() * 1000), 'package': 'ai.openclaw.app.debug',
             'files': files, 'contentsCollected': False,
             'note': 'Persisted settings/encrypted identity store only; cache, logs and proof outputs excluded. Secure prefs may legitimately change after authenticated reconnect.'}
    (out / ('app-storage-' + label + '.json')).write_text(json.dumps(value, indent=2))
    return value
def start(label, command):
    log = (out / (label + '.log')).open('wb')
    process = subprocess.Popen(command, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
    children.append((label, process, log))
    receipt['owned'].append({'label': label, 'pid': process.pid, 'startTicks': process_start_ticks(process.pid), 'command': command})
    (out / 'local.running.json').write_text(json.dumps(receipt, indent=2))
    return process
def file_sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()
def incomplete_recovery_preflight():
    # Reconcile before starting any replacement processes. Missing receipts are unknown,
    # never an implicit failed/completed capture or permission to replay a live owner.
    previous = base / a.previous_case
    running_path = previous / 'local.running.json'
    previous_receipt = json.loads(running_path.read_text())
    reconciliation_path = previous / 'local.reconciliation.receipt.json'
    reconciliation = json.loads(reconciliation_path.read_text())
    cleanup = reconciliation.get('ownedReconciliation', [])
    expected_pids = {item['pid'] for item in previous_receipt['owned']}
    reverse_absent = (reconciliation.get('reverseAbsent') is True and
                      isinstance(reconciliation.get('reverseListAfter'), str) and
                      'tcp:19992' not in reconciliation['reverseListAfter'])
    if (previous_receipt.get('remoteCase') != a.remote_case or
            reconciliation.get('remoteCase') != a.remote_case or
            not reconciliation.get('finishedAtMs') or
            {item.get('pid') for item in cleanup} != expected_pids or
            len(cleanup) != len(expected_pids) or
            any(item.get('processGone') is not True for item in cleanup) or
            reconciliation.get('ports') != {'19990': 'free', '19992': 'free'} or
            (reconciliation.get('reverseRemoveExit') != 0 and not reverse_absent)):
        raise RuntimeError('Incomplete capture requires complete task-local cleanup reconciliation')
    native_path = previous / 'native.receipt.json'
    if native_path.exists():
        native_receipt = json.loads(native_path.read_text())
        if (native_receipt.get('captureComplete') is not False or not native_receipt.get('finishedAtMs') or
                reconciliation.get('nativeCaptureComplete') is not False):
            raise RuntimeError('Existing terminal native receipt must record an incomplete capture')
        prior_outcome = 'terminal-incomplete'
        receipt.update(priorCaptureComplete=False, priorCaptureWasSuccessful=False,
                       priorNativeReceiptSha256=file_sha(native_path))
    else:
        native_running_path = previous / 'native.running.json'
        native_running = json.loads(native_running_path.read_text())
        native_cleanup = reconciliation.get('nativeOwnedReconciliation', [])
        native_expected = native_running.get('ownedProcessIds', {})
        expected_owned = {(item['label'], item['pid'], str(item['startTicks']))
                          for item in previous_receipt['owned']}
        actual_owned = {(item.get('label'), item.get('pid'), str(item.get('startTicks')))
                        for item in cleanup}
        if ((previous / 'local.receipt.json').exists() or
                previous_receipt.get('preserveAppState') is not True or
                previous_receipt.get('pmClearPerformed') is not False or
                previous_receipt.get('setupCodeRequested') is not False or
                reconciliation.get('nativeTerminalOutcome') != 'unknown-interrupted' or
                reconciliation.get('originalExitsUnknown') is not True or
                'nativeCaptureComplete' not in reconciliation or reconciliation['nativeCaptureComplete'] is not None or
                'wrapperExitCode' not in reconciliation or reconciliation['wrapperExitCode'] is not None or
                reconciliation.get('emulatorRecovery', {}).get('sameAvd') is not True or
                any(reconciliation.get('emulatorRecovery', {}).get(key) is not False
                    for key in ('dataWipe', 'appReinstalled', 'appCleared')) or
                reconciliation.get('localRunningSha256') != file_sha(running_path) or
                reconciliation.get('nativeRunningSha256') != file_sha(native_running_path) or
                reconciliation.get('nativeWireSha256') != file_sha(previous / 'native-wire.jsonl') or
                actual_owned != expected_owned or
                not native_expected or len(native_cleanup) != len(native_expected) or
                {(item.get('label'), item.get('pid')) for item in native_cleanup} != set(native_expected.items()) or
                any(item.get('processGone') is not True for item in native_cleanup)):
            raise RuntimeError('Interrupted capture requires explicit unknown outcomes, bound evidence, and process reconciliation')
        for item in native_cleanup:
            # The old native driver did not record startTicks: absent PIDs are required,
            # rather than claiming that a possibly reused PID has a verified identity.
            if pathlib.Path('/proc', str(item['pid'])).exists():
                raise RuntimeError('Prior native helper PID still exists; inspect before continuation')
        prior_outcome = 'unknown-interrupted'
        receipt.update(priorCaptureComplete=None, priorCaptureWasSuccessful=None,
                       priorLocalRunningSha256=file_sha(running_path),
                       priorNativeRunningSha256=file_sha(native_running_path))
    for item in previous_receipt['owned']:
        try:
            if process_start_ticks(item['pid']) == str(item['startTicks']):
                raise RuntimeError('Previous local capture process still exists')
        except FileNotFoundError:
            pass
    identities = paired_wire_identities(previous / 'native-wire.jsonl')
    inspected_path = previous / 'app-storage-after-recovery-inspection.json'
    inspected = json.loads(inspected_path.read_text())
    previous_storage_path = previous / 'app-storage-after.json'
    if not previous_storage_path.exists() and prior_outcome == 'unknown-interrupted':
        previous_storage_path = previous / 'app-storage-before.json'
    previous_storage = json.loads(previous_storage_path.read_text())
    if (not inspected.get('reason') or inspected.get('package') != 'ai.openclaw.app.debug' or
            inspected.get('timestampMs', 0) <= previous_storage.get('timestampMs', 0) or
            (prior_outcome == 'unknown-interrupted' and
             (inspected.get('timestampMs', 0) < reconciliation['finishedAtMs'] or
              inspected.get('contentsCollected') is not False))):
        raise RuntimeError('Recovery inspection requires an explicit reason and a fresh post-reconciliation snapshot')
    receipt.update(recoveryKind='incomplete-paired-capture-continuation', priorNativeOutcome=prior_outcome,
                   priorReconciliationSha256=file_sha(reconciliation_path),
                   priorWireSha256=file_sha(previous / 'native-wire.jsonl'),
                   priorAppStorageSnapshot=str(previous_storage_path),
                   recoveryInspectionReason=inspected['reason'],
                   recoveryInspectionSnapshotSha256=file_sha(inspected_path),
                   pairedIdentityVerificationRequired=True)
    return identities, previous_storage, inspected
try:
    if a.resume_incomplete:
        previous_paired_identities, previous_storage, recovery_storage = incomplete_recovery_preflight()
    for port in (19990, 19992):
        with socket.socket() as s:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            s.bind(('127.0.0.1', port))
    subprocess.run(['scp', '-q', 'GATEWAY_HOST:' + a.remote_case + '/config.json', str(out / 'config.private.json')], check=True)
    os.chmod(out / 'config.private.json', 0o600)
    receipt['configSha256'] = hashlib.sha256((out / 'config.private.json').read_bytes()).hexdigest()
    identity = json.loads(a.identity.read_text())
    baseline = identity['sourceCommit'] == 'dbac7730a12c90e95143f23e556199ab642e639e'
    instrumentation = pathlib.Path(identity['observationOnlySource']) if identity.get('observationOnlySource') else base.parent / ('reported-baseline/instrumentation/CatalogRefreshProofTest.kt' if baseline else 'native-instrumentation/CatalogRefreshProofTest.kt')
    build_overlay = pathlib.Path(identity['observationOnlyOverlay']) if identity.get('observationOnlyOverlay') else base.parent / ('reported-baseline/diagnostic.init.gradle' if baseline else 'native-proof.init.gradle')
    if identity.get('overlayManifest'):
        overlay = json.loads(pathlib.Path(identity['overlayManifest']).read_text())
        expected = {pathlib.Path(item.get('snapshot', item['source'])).name: item['sha256'] for item in overlay['files']}
        for source in (instrumentation, build_overlay):
            if hashlib.sha256(source.read_bytes()).hexdigest() != expected.get(source.name):
                raise RuntimeError('Observation source no longer matches the APK input manifest')
    subprocess.run(['python3', str(base / 'snapshot-drivers.py'), '--out', str(out),
                    str(base / 'proxy.mjs'), str(base / 'capture-native.py'), str(base / 'run-local.py'),
                    str(a.identity.resolve()), str(instrumentation), str(build_overlay)], check=True, capture_output=True)
    pinned = out / 'driver-snapshot'
    tunnel = start('tunnel', ['ssh', '-N', '-o', 'BatchMode=yes', '-o', 'ExitOnForwardFailure=yes',
                              '-L', '127.0.0.1:19990:127.0.0.1:20094', 'GATEWAY_HOST'])
    for _ in range(100):
        if tunnel.poll() is not None:
            raise RuntimeError('Tunnel exited')
        try:
            with urllib.request.urlopen('http://127.0.0.1:19990/readyz', timeout=2) as response:
                ready = json.load(response)
            if ready.get('ready'):
                break
        except Exception:
            pass
        time.sleep(.2)
    else:
        raise RuntimeError('Tunnel readiness failed')
    proxy = start('proxy', ['node', str(pinned / 'proxy.mjs'), '--out', str(out), '--config',
                            str(out / 'config.private.json'), '--package', str(repo), '--protocol', '4'] +
                            (['--forbid-setup'] if a.preserve_app_state else []))
    for _ in range(100):
        if proxy.poll() is not None:
            raise RuntimeError('Proxy exited')
        if (out / 'proxy-ready.json').exists():
            break
        time.sleep(.1)
    else:
        raise RuntimeError('Proxy readiness failed')
    subprocess.run(adb + ['shell', 'am', 'force-stop', 'ai.openclaw.app.debug'], check=True)
    if a.preserve_app_state:
        previous = base / a.previous_case
        if not a.resume_incomplete:
            previous_receipt = json.loads((previous / 'local.receipt.json').read_text())
            if previous_receipt.get('remoteCase') != a.remote_case or previous_receipt.get('captureExit') != 0:
                raise RuntimeError('Previous capture is not terminal or belongs to different fixture state')
        previous_installed = json.loads((previous / 'installed-identity.json').read_text())
        expected_app = next(item['sha256'] for item in identity['apks'] if item['role'] == 'app')
        if next(item['sha256'] for item in previous_installed['artifacts'] if item['package'] == 'ai.openclaw.app.debug') != expected_app:
            raise RuntimeError('Retained-state upgrade requires the same production Android APK')
        before = app_storage_snapshot('before')
        if a.resume_incomplete:
            receipt.update(retainedAppStateMatchesPrevious=before['files'] == previous_storage['files'],
                           retainedAppStateMatchesRecoveryInspection=before['files'] == recovery_storage['files'])
            previous_after = recovery_storage
        else:
            previous_after = json.loads((previous / 'app-storage-after.json').read_text())
        if before['files'] != previous_after['files']:
            raise RuntimeError('Persisted Android state changed between legacy completion and upgrade; inspect before continuing')
        if not next(item['exists'] for item in before['files'] if item['path'] == 'shared_prefs/openclaw.node.secure.xml'):
            raise RuntimeError('No persisted encrypted pairing/identity store exists to reuse')
        if not a.resume_incomplete:
            receipt['retainedAppStateMatchesPrevious'] = True
    else:
        subprocess.run(adb + ['shell', 'pm', 'clear', 'ai.openclaw.app.debug'], check=True, capture_output=True)
        receipt['pmClearPerformed'] = True
    subprocess.run(adb + ['reverse', 'tcp:19992', 'tcp:19992'], check=True)
    reverse_installed = True
    if not a.preserve_app_state:
        with urllib.request.urlopen('http://127.0.0.1:19992/setup', timeout=35) as response:
            setup = json.load(response)
        receipt['setupCodeRequested'] = True
        (out / 'setup.private.json').write_text(json.dumps(setup))
        subprocess.run(adb + ['shell', 'run-as', 'ai.openclaw.app.debug', 'mkdir', '-p', 'files'], check=True)
        subprocess.run(adb + ['shell', 'run-as', 'ai.openclaw.app.debug', 'tee', 'files/release-setup-code'],
                       input=setup['setupCode'].encode(), check=True, capture_output=True)
    capture = start('capture', ['python3', str(pinned / 'capture-native.py'), '--out', str(out),
                                '--identity', str(pinned / a.identity.name), '--seconds', str(a.seconds)])
    receipt['captureExit'] = capture.wait(timeout=360)
    if a.resume_incomplete:
        resumed_paired_identities = paired_wire_identities(out / 'native-wire.jsonl')
        receipt['retainedPairedIdentityMatchesPrevious'] = resumed_paired_identities == previous_paired_identities
        receipt['retainedPairedIdentityHashes'] = [dict(zip(('role', 'deviceIdentitySha256', 'devicePublicKeySha256'), value))
                                                 for value in sorted(resumed_paired_identities)]
        if not receipt['retainedPairedIdentityMatchesPrevious']:
            raise RuntimeError('Authenticated device/public-key identity changed across incomplete-capture continuation')
except BaseException as error:
    receipt['error'] = str(error)
finally:
    for label, process, log in reversed(children):
        if process.poll() is None:
            expected = next(item['startTicks'] for item in receipt['owned'] if item['pid'] == process.pid)
            if process_start_ticks(process.pid) != expected:
                receipt['cleanup'].append({'label': label, 'pid': process.pid, 'identityMismatch': True})
                receipt['error'] = 'Process identity changed; refused cleanup signal'
                continue
            os.killpg(process.pid, signal.SIGTERM)
        try:
            process.wait(timeout=20)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
            process.wait(timeout=5)
        receipt['cleanup'].append({'label': label, 'pid': process.pid, 'exitCode': process.returncode,
                                   'processGone': not pathlib.Path('/proc', str(process.pid)).exists()})
        log.close()
    if reverse_installed:
        reverse = subprocess.run(adb + ['reverse', '--remove', 'tcp:19992'], capture_output=True, text=True)
        receipt['reverseRemoved'] = reverse.returncode == 0
    else:
        receipt['reverseRemovalSkipped'] = 'This invocation did not install a reverse mapping'
    try:
        app_storage_snapshot('after')
    except Exception as error:
        receipt['appStorageSnapshotError'] = str(error)
    receipt['finishedAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    (out / 'local.receipt.json').write_text(json.dumps(receipt, indent=2))
    print(json.dumps({'case': a.case, 'captureExit': receipt.get('captureExit'), 'error': receipt.get('error'),
                      'cleanup': receipt['cleanup']}), flush=True)
raise SystemExit(0 if receipt.get('captureExit') == 0 and not receipt.get('error') else 1)
