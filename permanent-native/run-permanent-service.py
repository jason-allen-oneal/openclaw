import datetime, hashlib, json, os, pathlib, socket, sqlite3, shutil, subprocess, sys, time, urllib.request

proof = pathlib.Path(__file__).resolve().parent
checkout = proof.parent / 'candidate'
kind = sys.argv[1] if len(sys.argv) > 1 else 'archive'
attempt = sys.argv[2] if len(sys.argv) > 2 else 'v1'
root = proof / f'permanent-{kind}-{attempt}'
assert not root.exists(), 'Do not overwrite proof attempts'
root.mkdir()
for name in ('home', 'state', 'workspace'):
    (root / name).mkdir()
if kind == 'reconcile':
    archive = proof / 'candidate-archive'
    assert json.loads((archive / 'receipt.json').read_text())['gatewayExitCode'] == 0
    shutil.copytree(archive / 'state', root / 'state', dirs_exist_ok=True)
    database = sqlite3.connect(root / 'state/agents/main/agent/openclaw-agent.sqlite')
    rows = database.execute('SELECT session_id,seq,event_json,hex(event_zstd) FROM transcript_events ORDER BY session_id,seq').fetchall()
    changed = database.execute('UPDATE session_transcript_index_state SET needs_rebuild=1').rowcount
    database.commit()
    database.close()
    (root / 'retained-input.json').write_text(json.dumps({'canonicalRows': rows, 'dirtyIndexRows': changed}, indent=2) + '\n')
    (root / 'arm-reconcile').touch()
head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=checkout, text=True).strip()
build = json.loads((proof / 'candidate-build-v4.receipt.json').read_text())
assert build['exitCode'] == 0 and build['sourceHead'] == head
port = 19683 if kind == 'archive' else 19684
with socket.socket() as sock:
    sock.bind(('127.0.0.1', port))
config = {'gateway': {'port': port, 'mode': 'local', 'bind': 'loopback', 'auth': {'mode': 'token', 'token': 'synthetic-permanent-proof-token'}, 'controlUi': {'enabled': False}}, 'agents': {'defaults': {'workspace': str(root / 'workspace')}, 'entries': {'main': {}}}, 'plugins': {'allow': []}, 'cron': {'enabled': False}}
(root / 'config.json').write_text(json.dumps(config))
node = '/node-runtime/node-v24.22.1-linux-x64/bin/node'
unit = f'openclaw-176080-proof-{kind}-{attempt}.service'
env = {'PATH': str(pathlib.Path(node).parent) + ':/usr/bin:/bin', 'HOME': str(root / 'home'), 'LANG': 'C.UTF-8', 'XDG_RUNTIME_DIR': f'/run/user/{os.getuid()}', 'DBUS_SESSION_BUS_ADDRESS': f'unix:path=/run/user/{os.getuid()}/bus', 'OPENCLAW_SYSTEMD_UNIT': unit, 'OPENCLAW_STATE_DIR': str(root / 'state'), 'OPENCLAW_CONFIG_PATH': str(root / 'config.json'), 'OPENCLAW_SKIP_CHANNELS': '1', 'OPENCLAW_SKIP_PROVIDERS': '1', 'OPENCLAW_SKIP_GMAIL_WATCHER': '1', 'OPENCLAW_SKIP_CRON': '1', 'OPENCLAW_SKIP_BROWSER_CONTROL_SERVER': '1', 'OPENCLAW_SKIP_CANVAS_HOST': '1', 'OPENCLAW_PROOF_FSYNC_ROOT': str(root), 'OPENCLAW_PROOF_PREAD_ROOT': str(root), 'OPENCLAW_PROOF_WORKER_TRACE': str(root / 'workers.jsonl'), 'LD_PRELOAD': str(proof / 'stall-fsync.so') + ':' + str(proof / 'stall-pread-v2.so'), 'NODE_OPTIONS': '--import ' + str(proof / 'observe-workers-v2.mjs')}
command = [node, str(checkout / 'openclaw.mjs'), 'gateway', '--port', str(port), '--bind', 'loopback', '--allow-unconfigured']
unit_dir = root / 'home/.config/systemd/user'
unit_dir.mkdir(parents=True)
unit_path = unit_dir / unit
unit_path.write_text('\n'.join(['[Unit]', 'Description=Isolated OpenClaw issue 176080 permanent native worker recovery proof', '[Service]', 'Type=simple', f'WorkingDirectory={checkout}', 'ExecStart=' + ' '.join(command), 'Restart=always', 'RestartSec=5', 'TimeoutStopSec=330', 'KillMode=control-group', f'StandardOutput=append:{root / "gateway.log"}', f'StandardError=append:{root / "gateway.log"}'] + ['Environment=' + json.dumps(k + '=' + v) for k, v in env.items()]) + '\n')
receipt = {'sourceHead': head, 'command': command, 'unit': unit, 'startedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'instrumentationSha256': {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in [proof / 'observe-workers-v2.mjs', proof / 'stall-fsync.c', proof / 'stall-pread-v2.c', proof / f'run-{kind}-permanent.mjs']}}
linked = False
def systemctl(*args, **kwargs):
    return subprocess.run(['systemctl', '--user', *args], text=True, capture_output=True, **kwargs)
try:
    result = systemctl('link', str(unit_path), check=True)
    linked = True
    systemctl('start', unit, check=True)
    receipt['initialService'] = systemctl('show', unit, '--property=MainPID,ActiveState,SubState,NRestarts,FragmentPath,ExecStart').stdout
    (root / 'service-start.json').write_text(json.dumps(receipt, indent=2) + '\n')
    started = time.monotonic()
    while time.monotonic() - started < 180:
        try:
            with urllib.request.urlopen(f'http://127.0.0.1:{port}/readyz', timeout=2) as response:
                ready = json.load(response)
            if ready.get('ready'):
                receipt['readySeconds'] = time.monotonic() - started
                print(f'{kind} service ready after {receipt["readySeconds"]:.2f}s', flush=True)
                break
        except Exception:
            pass
        time.sleep(.25)
    else:
        raise RuntimeError('Gateway readiness timeout')
    with open(root / 'service-status-before.json', 'wb') as status_log:
        receipt['serviceStatusExitCode'] = subprocess.call([node, str(checkout / 'openclaw.mjs'), 'gateway', 'status', '--json'], cwd=checkout, env=env, stdout=status_log, stderr=open(root / 'service-status-before.stderr', 'wb'), timeout=60)
    client_env = dict(os.environ, OPENCLAW_PROOF_FSYNC_ROOT=str(root), OPENCLAW_PROOF_PREAD_ROOT=str(root), OPENCLAW_PROOF_WS_URL=f'ws://127.0.0.1:{port}', OPENCLAW_PROOF_TOKEN='synthetic-permanent-proof-token', OPENCLAW_PROOF_HEAD=head, OPENCLAW_PROOF_UNIT=unit, OPENCLAW_PROOF_STATE=str(root / 'state'))
    receipt['driverExitCode'] = subprocess.call([node, str(proof / f'run-{kind}-permanent.mjs')], env=client_env, stdout=open(root / 'driver.log', 'wb'), stderr=subprocess.STDOUT, timeout=480)
    receipt['finalService'] = systemctl('show', unit, '--property=MainPID,ActiveState,SubState,NRestarts,FragmentPath,ExecStart').stdout
finally:
    receipt['releaseExistedBeforeCleanup'] = (root / 'release').exists() or (root / 'release-reconcile').exists()
    # This is only fixture cleanup after the verdict; never release the native fault to obtain it.
    if linked:
        systemctl('kill', '--kill-whom=all', '--signal=SIGKILL', unit)
        stopped = systemctl('stop', unit, timeout=30)
        receipt['stopExitCode'] = stopped.returncode
        receipt['stoppedService'] = systemctl('show', unit, '--property=MainPID,ActiveState,SubState,NRestarts').stdout
        disabled = systemctl('disable', unit)
        receipt['unlinkExitCode'] = disabled.returncode
        systemctl('reset-failed', unit)
    receipt['finishedAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    (root / 'receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
    print(json.dumps(receipt), flush=True)
raise SystemExit(receipt.get('driverExitCode', 1))
