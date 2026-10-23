import datetime, hashlib, json, os, pathlib, subprocess, sys, tarfile

root = pathlib.Path(__file__).resolve().parent
checkout = root.parent / 'candidate'
artifact = root / 'atomic-final'
build = json.loads((root / 'build-final-18ea.receipt.json').read_text())
head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=checkout, text=True).strip()
assert head == build['sourceHead'] == '18ea9065fdd8c1b300a9bce1952769a998b0a016'
assert build['exitCode'] == 0 and build['worktreeCleanAfter']
prepared = '--prepared-state' in sys.argv
if prepared:
    assert artifact.exists() and (artifact / 'state/openclaw.json').exists()
    assert len(list((artifact / 'workspace/memory').glob('*.md'))) == 17
else:
    assert not artifact.exists(), 'Do not overwrite a prior attempt'
    artifact.mkdir()
    with tarfile.open(root / 'prior-quiescent-fixture.tar') as tar:
        tar.extractall(artifact, filter='data')
        # data_filter intentionally discards directory modes; preserve the original
        # private fixture directories after its path/symlink safety checks.
        for member in tar.getmembers():
            if member.isdir():
                (artifact / member.name).chmod(member.mode & 0o777)
node = '<PROOF_HOME>/.local/share/openclaw-134498-proof/runtime/node-v24.22.1-linux-x64/bin/node'
env = dict(os.environ, PATH=str(pathlib.Path(node).parent) + ':/usr/bin:/bin:' + os.environ['PATH'],
           PROOF_BUILD_ROOT=str(checkout), PROOF_SOURCE_ROOT=str(checkout),
           PROOF_ARTIFACT_ROOT=str(artifact), PROOF_SOURCE_HEAD=head,
           PROOF_LABEL='atomic-final', PROOF_RESTART='1', PROOF_RETAIN_EXISTING='1')
command = [node, '--import', './scripts/tsx.mjs', str(root / 'gateway-runtime.mjs')]
receipt = {'sourceHead': head, 'command': command, 'startedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
           'fixture': {'sourceHead': '2975dedca83e94d3530fdb339077bfe040d1b560', 'priorArtifacts': 17,
                       'sha256': hashlib.sha256((root / 'prior-quiescent-fixture.tar').read_bytes()).hexdigest(),
                       'copy': 'Quiescent prior synthetic Gateway state copied to this isolated host; old files and provenance unchanged.'}}
if prepared:
    doctor_env = dict(env, HOME=str(artifact / 'home'), OPENCLAW_STATE_DIR=str(artifact / 'state'),
                      OPENCLAW_CONFIG_PATH=str(artifact / 'state/openclaw.json'))
    doctor = [node, 'openclaw.mjs', 'doctor', '--fix', '--non-interactive']
    doctor_receipt = {'command': doctor, 'startedAt': datetime.datetime.now(datetime.timezone.utc).isoformat()}
    with (root / 'doctor-relocated-fixture.log').open('wb') as log:
        doctor_code = subprocess.call(doctor, cwd=checkout, env=doctor_env, stdout=log, stderr=subprocess.STDOUT)
    doctor_receipt.update(exitCode=doctor_code, finishedAt=datetime.datetime.now(datetime.timezone.utc).isoformat())
    (root / 'doctor-relocated-fixture.receipt.json').write_text(json.dumps(doctor_receipt, indent=2) + '\n')
    assert doctor_code == 0, doctor_receipt
    receipt['doctor'] = doctor_receipt
with (root / 'gateway-final-18ea.log').open('wb') as log:
    code = subprocess.call(command, cwd=checkout, env=env, stdout=log, stderr=subprocess.STDOUT)
receipt.update(exitCode=code, finishedAt=datetime.datetime.now(datetime.timezone.utc).isoformat())
(root / 'gateway-final-18ea.command.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(receipt), flush=True)
raise SystemExit(code)
