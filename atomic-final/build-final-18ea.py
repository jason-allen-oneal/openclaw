import datetime, hashlib, json, os, pathlib, subprocess

root = pathlib.Path(__file__).resolve().parent
checkout = root.parent / 'candidate'
head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=checkout, text=True).strip()
assert head == '18ea9065fdd8c1b300a9bce1952769a998b0a016', head
assert not subprocess.check_output(['git', 'status', '--porcelain'], cwd=checkout, text=True).strip()
node = '<PROOF_HOME>/.local/share/openclaw-134498-proof/runtime/node-v24.22.1-linux-x64/bin/node'
command = [node, '--import', './scripts/tsx.mjs', 'scripts/build-all.mts', 'qaRuntime']
receipt = {'command': command, 'sourceHead': head, 'startedAt': datetime.datetime.now(datetime.timezone.utc).isoformat()}
env = dict(os.environ, PATH=str(pathlib.Path(node).parent) + ':/usr/bin:/bin:' + os.environ['PATH'])
with (root / 'build-final-18ea.log').open('wb') as log:
    code = subprocess.call(command, cwd=checkout, env=env, stdout=log, stderr=subprocess.STDOUT)
receipt.update(exitCode=code, finishedAt=datetime.datetime.now(datetime.timezone.utc).isoformat())
if code == 0:
    files = ['openclaw.mjs', 'dist/index.js', 'dist/bundled/session-memory/handler.js', 'package.json', 'pnpm-lock.yaml']
    files.extend(str(p.relative_to(checkout)) for p in (checkout / 'dist').glob('*memory-artifact-provenance*'))
    files.extend(str(p.relative_to(checkout)) for p in (checkout / 'dist').glob('file-lock-*'))
    receipt['files'] = {f: {'sha256': hashlib.sha256((checkout/f).read_bytes()).hexdigest(), 'bytes': (checkout/f).stat().st_size} for f in files}
    receipt['worktreeCleanAfter'] = not subprocess.check_output(['git', 'status', '--porcelain'], cwd=checkout, text=True).strip()
(root / 'build-final-18ea.receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(receipt), flush=True)
raise SystemExit(code)
