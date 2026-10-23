import datetime
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

root = Path(__file__).resolve().parent.parent
proof = root / 'proof'
checkout = root / 'candidate'
expected = 'a7f5cc2f35fb2e0254207492149d52d3923c0cbc'
env = os.environ.copy()
env['PATH'] = str(root / 'runtime/node-v24.22.1-linux-x64/bin') + ':' + env['PATH']
head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=checkout, text=True).strip()
assert head == expected, head
assert not subprocess.check_output(['git', 'status', '--porcelain'], cwd=checkout, text=True).strip()
mode = sys.argv[1]
if mode == 'build':
    command = ['node', '--import', './scripts/tsx.mjs', 'scripts/build-all.mts', 'qaRuntime']
    artifact = proof / 'final-head'
    artifact.mkdir(exist_ok=True)
elif mode == 'runtime':
    artifact = proof / 'gateway-origin-rebind-candidate-v2'
    artifact.mkdir(exist_ok=False)
    subprocess.run(['python3', str(proof / 'capture-runtime-identity.py'), str(checkout), str(artifact), expected], env=env, check=True)
    env.update(PROOF_BUILD_ROOT=str(checkout), PROOF_SOURCE_ROOT=str(checkout), PROOF_ARTIFACT_ROOT=str(artifact), PROOF_PLUGIN_ROOT=str(proof / 'runtime-model-origin-plugin'), PROOF_REAL_MODEL_URL='http://127.0.0.1:21498', PROOF_SOURCE_HEAD=expected)
    command = ['node', '--import', './scripts/tsx.mjs', str(proof / 'gateway-origin-rebind-runtime-v2.mjs')]
elif mode == 'consumers':
    artifact = proof / 'final-head'
    artifact.mkdir(exist_ok=True)
    env.update(OPENCLAW_VITEST_RUNTIME='node', OPENCLAW_VITEST_FS_MODULE_CACHE_PATH=str(proof / 'consumer-vitest-cache'))
    command = ['node', 'scripts/test-projects.mts', '--maxWorkers=1', 'src/auto-reply/reply/dispatch-from-config.owner-settlement.test.ts', 'src/auto-reply/reply/dispatch-from-config.transcript.tool-authored.test.ts', 'src/auto-reply/reply/dispatch-from-config.pending-final.test.ts', 'src/auto-reply/reply/pending-final-delivery.test.ts']
else:
    raise ValueError(mode)
receipt = {'command': command, 'sourceHead': expected, 'mode': mode, 'startedAt': datetime.datetime.now(datetime.timezone.utc).isoformat()}
if mode == 'runtime':
    receipt['driverSha256'] = hashlib.sha256((proof / 'gateway-origin-rebind-runtime-v2.mjs').read_bytes()).hexdigest()
with (artifact / (mode + '.log')).open('w') as log:
    result = subprocess.run(command, cwd=checkout, env=env, stdout=log, stderr=subprocess.STDOUT)
receipt.update(exitCode=result.returncode, completedAt=datetime.datetime.now(datetime.timezone.utc).isoformat())
(artifact / (mode + '-command-receipt.json')).write_text(json.dumps(receipt, indent=2)+'\n')
print(json.dumps(receipt), flush=True)
raise SystemExit(result.returncode)
