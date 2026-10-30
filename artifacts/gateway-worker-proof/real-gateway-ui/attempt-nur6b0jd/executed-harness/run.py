import hashlib, json, os, pathlib, subprocess, sys, tempfile, datetime, shutil

repo = pathlib.Path('<candidate-checkout>')
proof = pathlib.Path(__file__).resolve().parent
os.umask(0o077)
run = pathlib.Path(tempfile.mkdtemp(prefix='attempt-', dir=proof))
for name in ('home', 'tmp'):
    (run / name).mkdir()
browser_tmp = pathlib.Path(tempfile.mkdtemp(prefix='rproof-', dir='/tmp'))
env = {
    'PATH': os.environ['PATH'], 'HOME': str(run / 'home'),
    'OPENCLAW_HOME': str(run / 'home'), 'OPENCLAW_STATE_DIR': str(run / 'bootstrap-state'),
    'OPENCLAW_CONFIG_PATH': str(run / 'bootstrap-state/openclaw.json'),
    'TMPDIR': str(browser_tmp), 'NO_COLOR': '1', 'TERM': 'dumb',
    'PLAYWRIGHT_BROWSERS_PATH': '<host-home>/.cache/ms-playwright',
    'OPENCLAW_UI_E2E_ARTIFACT_DIR': str(run),
    'OPENCLAW_VITEST_FS_MODULE_CACHE_PATH': str(run / 'vitest-module-cache'),
    'RECOVERY_PROOF_ATTEMPT': str(run),
}
command = ['node', 'scripts/run-vitest.mjs', 'run', '--config', str(proof / 'vitest.config.ts'),
           '--configLoader', 'runner', '--maxWorkers=1', str(proof / 'proof.test.ts')]
def git(*args):
    return subprocess.check_output(['git', *args], cwd=repo, text=True)
def sha(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()
boundary = {
    'head': git('rev-parse', 'HEAD').strip(),
    'sourceDiffSha256': hashlib.sha256(git('diff', 'HEAD', '--').encode()).hexdigest(),
    'sourceStatus': git('status', '--short'),
    'builtEntrypointSha256': sha(repo / 'dist/index.js'),
    'builtUiIndexSha256': sha(repo / 'dist/control-ui/index.html'),
}
record = {'command': command, 'cwd': str(repo), 'environment': env, 'before': boundary,
          'startedAt': datetime.datetime.now(datetime.timezone.utc).isoformat()}
(run / 'command.json').write_text(json.dumps(record, indent=2) + '\n')
(proof / 'latest-attempt.txt').write_text(str(run) + '\n')
print('Proof attempt: ' + str(run), flush=True)
with (run / 'command.log').open('w') as output:
    completed = subprocess.run(command, cwd=repo, env=env, stdout=output, stderr=subprocess.STDOUT)
record['exitCode'] = completed.returncode
record['completedAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
record['after'] = {
    'head': git('rev-parse', 'HEAD').strip(),
    'sourceDiffSha256': hashlib.sha256(git('diff', 'HEAD', '--').encode()).hexdigest(),
    'builtEntrypointSha256': sha(repo / 'dist/index.js'),
    'builtUiIndexSha256': sha(repo / 'dist/control-ui/index.html'),
}
record['sourceAndBuildUnchanged'] = all(record['before'][key] == value for key, value in record['after'].items())
(run / 'command.json').write_text(json.dumps(record, indent=2) + '\n')
print(json.dumps({'exitCode': completed.returncode, 'sourceAndBuildUnchanged': record['sourceAndBuildUnchanged'], 'attempt': str(run)}), flush=True)
shutil.rmtree(browser_tmp)
sys.exit(completed.returncode or (0 if record['sourceAndBuildUnchanged'] else 2))
