#!/usr/bin/env python3
"""ADAPTED, UNEXECUTED recipe assembled from the corrected observed fixture.
This is not historical execution evidence. `plan` is inert. `run` requires a NEW,
empty output root and never touches the retained historical proof state.
"""
import argparse
import ast
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import runpy
import shutil
import signal
import socket
import subprocess
import sys
import time
import urllib.request

SOURCE = Path(__file__).resolve().parent
VERSION = '2026.10.3'
TARBALL = 'https://registry.npmjs.org/openclaw/-/openclaw-2026.10.3.tgz'
INTEGRITY = 'sha512-ncl6LntMlf76K39LFhVrDXQTbaGNAG5j52f7PL5P8vIn0knWmCrvfAe9DHMslFq+47HeOWBH2CBYQH8zEb+UAA=='
MODEL = 'qwen3:0.6b'
SESSION_ID = 'catalog-upgrade-real-cpu'
SESSION_KEY = 'agent:main:explicit:' + SESSION_ID
COMPANIONS = ['reproduce-stable-seed.mjs', 'live-proxy-cpu.mjs', 'candidate-proof.py']

def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def free_port():
    with socket.socket() as server:
        server.bind(('127.0.0.1', 0))
        return server.getsockname()[1]

def emit(value):
    print(json.dumps(value), flush=True)

def parse_object(text):
    decoder = json.JSONDecoder()
    for match in re.finditer(r'(?m)^\s*\{', text):
        try:
            return decoder.raw_decode(text[match.start():].lstrip())[0]
        except json.JSONDecodeError:
            continue
    raise AssertionError('Missing JSON command result')

class Recipe:
    def __init__(self, root):
        self.root = root.resolve()
        assert self.root != SOURCE, 'Never reseed the retained historical proof root'
        assert not self.root.exists() or not any(self.root.iterdir()), 'Use a new empty proof root'
        self.root.mkdir(parents=True, exist_ok=True)
        self.state = self.root / 'state'
        self.package = self.root / 'stable/runtime/node_modules/openclaw'
        self.env = {'PATH': os.environ['PATH'], 'HOME': str(self.root / 'home'), 'OPENCLAW_HOME': str(self.root / 'home'),
                    'OPENCLAW_STATE_DIR': str(self.state), 'OPENCLAW_CONFIG_PATH': str(self.state / 'openclaw.json'),
                    'OPENCLAW_AGENT_DIR': str(self.state / 'agents/main/agent'), 'NO_COLOR': '1',
                    'OPENCLAW_NO_RESPAWN': '1', 'OPENCLAW_SKIP_UPDATE_CHECK': '1'}
        self.gateway = None
        self.proxy = None
        self.receipts = []
        for folder in [self.root / 'home', self.state / 'agents/main/agent', self.state / 'workspace', self.root / 'stable/runtime']:
            folder.mkdir(parents=True, exist_ok=True)
        for name in COMPANIONS:
            shutil.copyfile(SOURCE / name, self.root / name)
        self.save('recipe-source-provenance.json', {'kind': 'adapted-reproduction-source', 'sourceWasExecutedPreviously': False,
                  'recipeSha256': digest(__file__), 'copiedCompanions': {name: digest(SOURCE / name) for name in COMPANIONS},
                  'note': 'These source hashes describe this new invocation, not the historical successful run.'})

    def save(self, name, obj):
        (self.root / name).write_text(json.dumps(obj, indent=2) + '\n')

    def command(self, label, argv, *, cwd=None, timeout=240):
        emit({'step': label, 'status': 'running'})
        started = time.time()
        try:
            process = subprocess.run(argv, env=self.env, cwd=cwd or self.root, stdout=subprocess.PIPE,
                                     stderr=subprocess.STDOUT, timeout=timeout)
            code, output = process.returncode, process.stdout.decode(errors='replace')
        except subprocess.TimeoutExpired as error:
            code, output = 124, (error.stdout or b'').decode(errors='replace')
        (self.root / (label + '.log')).write_text(output)
        receipt = label + '.receipt.json'
        self.save(receipt, {'argv': argv, 'environment': self.env, 'cwd': str(cwd or self.root),
                  'exitCode': code, 'startedAtUnix': started, 'endedAtUnix': time.time(), 'log': label + '.log'})
        self.receipts.append(receipt)
        emit({'step': label, 'exitCode': code})
        assert code == 0, 'Failed prerequisite/command; inspect ' + receipt
        return output

    def cli(self, label, args, timeout=180):
        return self.command(label, ['node', str(self.package / 'openclaw.mjs')] + args, timeout=timeout)

    def install_stable(self):
        target = self.root / 'stable' / ('openclaw-' + VERSION + '.tgz')
        emitted = time.time()
        with urllib.request.urlopen(TARBALL, timeout=60) as response, target.open('wb') as output:
            shutil.copyfileobj(response, output)
        integrity = 'sha512-' + base64.b64encode(hashlib.sha512(target.read_bytes()).digest()).decode()
        assert integrity == INTEGRITY, 'Published artifact integrity mismatch'
        self.save('stable/package-metadata.json', {'version': VERSION, 'dist.integrity': integrity, 'dist.tarball': TARBALL,
                                                'downloadedAtUnix': emitted})
        consumer = self.root / 'stable/runtime'
        (consumer / 'package.json').write_text(json.dumps({'private': True, 'dependencies': {'openclaw': 'file:../' + target.name}}, indent=2) + '\n')
        # Install as a consumer, not inside the extracted publisher package with devDependencies.
        self.command('stable-consumer-install', ['npm', 'install', '--omit=dev', '--no-audit', '--no-fund'], cwd=consumer, timeout=600)
        assert json.loads((self.package / 'package.json').read_text())['version'] == VERSION

    def local_model_preflight(self):
        # Never pull a model, change a daemon setting, restart a service, or use cloud inference.
        with urllib.request.urlopen('http://127.0.0.1:11434/api/tags', timeout=10) as response:
            available = json.load(response)
        assert MODEL in {model['name'] for model in available.get('models', [])}, 'Install/choose local qwen3:0.6b separately; recipe does not download models'
        payload = {'model': MODEL, 'messages': [{'role': 'user', 'content': 'Reply exactly COPPER-FINCH. /no_think'}],
                   'stream': False, 'think': False, 'options': {'num_gpu': 0, 'num_ctx': 8192, 'num_predict': 24}}
        request = urllib.request.Request('http://127.0.0.1:11434/api/chat', data=json.dumps(payload).encode(), headers={'Content-Type': 'application/json'})
        with urllib.request.urlopen(request, timeout=60) as response:
            body = json.load(response)
            status = response.status
        self.save('cpu-model-prerequisite.json', {'request': payload, 'status': status, 'body': body})
        assert status == 200 and body.get('message', {}).get('content'), 'Real local CPU model prerequisite failed'

    def configure(self):
        proxy_port, self.gateway_port = free_port(), free_port()
        assert proxy_port != self.gateway_port
        base_url = 'http://127.0.0.1:' + str(proxy_port) + '/v1'
        self.save('live-proxy.address.json', {'baseUrl': base_url, 'pid': None, 'status': 'reserved-before-process-start'})
        self.save('gateway-port.json', {'port': self.gateway_port})
        model = {'id': MODEL, 'name': 'Local credential proof model', 'api': 'openai-completions', 'reasoning': False,
                 'input': ['text'], 'cost': {'input': 0, 'output': 0, 'cacheRead': 0, 'cacheWrite': 0}, 'contextWindow': 32768, 'maxTokens': 128}
        provider = {'baseUrl': base_url, 'api': 'openai-completions', 'agentRuntime': {'id': 'openclaw'}, 'models': [model]}
        config = {'gateway': {'mode': 'local', 'port': self.gateway_port, 'bind': 'loopback', 'auth': {'mode': 'none'}, 'controlUi': {'enabled': False}},
                  'plugins': {'enabled': False}, 'agents': {'defaults': {'systemAgent': {'agentId': 'main'}, 'workspace': str(self.state / 'workspace'),
                  'model': {'primary': 'canonical/' + MODEL}, 'skipBootstrap': True, 'contextInjection': 'never', 'params': {'maxTokens': 128}, 'timeoutSeconds': 120}, 'entries': {'main': {}}},
                  'models': {'providers': {'canonical': provider, 'recovered': provider}},
                  'tools': {'profile': 'minimal', 'deny': ['*'], 'codeMode': {'enabled': False}}, 'update': {'checkOnStart': False},
                  'memory': {'search': {'enabled': False}}}
        self.save('state/openclaw.json', config)
        authored = '// Authored root and literal must remain supported.\n' + json.dumps({'providers': {'manual': {**provider, 'apiKey': 'synthetic-authored-root-key'}}}, indent=2) + '\n'
        (self.state / 'agents/main/agent/models.json').write_text(authored)
        for path in [self.state / 'openclaw.json', self.state / 'agents/main/agent/models.json']:
            path.chmod(0o600)
        log = (self.root / 'live-proxy-cpu.log').open('w')
        self.proxy = subprocess.Popen(['node', str(self.root / 'live-proxy-cpu.mjs')], cwd=self.root,
                                      env={'PATH': self.env['PATH'], 'PROOF_ROOT': str(self.root)}, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
        log.close()
        for _ in range(40):
            assert self.proxy.poll() is None, 'Proxy failed to start'
            if json.loads((self.root / 'live-proxy.address.json').read_text()).get('pid') == self.proxy.pid:
                return
            time.sleep(.1)
        raise AssertionError('Proxy did not publish its real process address')

    def start_gateway(self):
        argv = ['node', str(self.package / 'openclaw.mjs'), 'gateway', 'run', '--port', str(self.gateway_port), '--bind', 'loopback', '--auth', 'none']
        log = (self.root / 'stable-gateway-cpu.log').open('w')
        self.gateway = subprocess.Popen(argv, env=self.env, cwd=self.root, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
        log.close()
        self.gateway_record = {'pid': self.gateway.pid, 'argv': argv, 'environment': self.env, 'start': time.time()}
        self.save('stable-gateway-cpu.process.json', self.gateway_record)
        deadline = time.monotonic() + 60
        while time.monotonic() < deadline:
            assert self.gateway.poll() is None, 'Stable Gateway exited before ready'
            if re.search(r'\[gateway\] ready(?:\r?\n|$)', (self.root / 'stable-gateway-cpu.log').read_text()):
                self.gateway_record['readyAtUnix'] = time.time()
                self.save('stable-gateway-cpu.process.json', self.gateway_record)
                return
            time.sleep(.25)
        raise AssertionError('Stable readiness exceeded 60 seconds; do not relabel this attempt passing')

    def stop_gateway(self):
        if self.gateway is None:
            return
        if self.gateway.poll() is None:
            self.gateway.send_signal(signal.SIGTERM)
        self.gateway_record.update({'exitCode': self.gateway.wait(timeout=45), 'stopped': time.time()})
        self.save('stable-gateway-cpu.process.json', self.gateway_record)
        self.gateway = None

    def finish_summary(self, turn, history):
        assert turn['status'] == 'ok' and 'COPPER-FINCH' in turn['result']['meta']['finalAssistantVisibleText'].upper()
        assert history['sessionId'] == SESSION_ID and len(history['messages']) >= 2
        root_hash = digest(self.state / 'agents/main/agent/models.json')
        (self.root / 'authored-root-before-candidate.sha256').write_text(root_hash + '\n')
        previous_root = os.environ.get('PROOF_ROOT')
        os.environ['PROOF_ROOT'] = str(self.root)
        try:
            helpers = runpy.run_path(str(self.root / 'candidate-proof.py'), run_name='read_only_fixture_observation')
        finally:
            if previous_root is None:
                os.environ.pop('PROOF_ROOT', None)
            else:
                os.environ['PROOF_ROOT'] = previous_root
        snapshot = helpers['files_and_profiles']()
        assert any(row['hasApiKey'] for row in snapshot['catalogs'])
        assert {p['matchesFixture'] for p in snapshot['profiles']} == {'canonical'}
        helpers['assert_history'](history, 2)
        self.save('stable-final-state.json', snapshot)
        requests = [json.loads(line) for line in (self.root / 'live-proxy.requests.jsonl').read_text().splitlines()]
        assert requests and all(req['authAccepted'] and req['syntheticCredential'] == 'synthetic-canonical-key' for req in requests)
        responses = [json.loads(line) for line in (self.root / 'live-proxy.responses.jsonl').read_text().splitlines()]
        assert all(resp['status'] == 200 and resp['content'] for resp in responses)
        self.save('stable-final-summary.json', {'stableVersion': VERSION, 'packageIntegrityVerified': INTEGRITY,
                  'launcherSha256': digest(self.package / 'openclaw.mjs'), 'gatewayStopped': self.gateway_record['stopped'],
                  'stateDir': str(self.state), 'configSha256': digest(self.state / 'openclaw.json'), 'authoredRootSha256': root_hash,
                  'sessionId': SESSION_ID, 'sessionKey': SESSION_KEY, 'runId': turn['runId'], 'realModel': MODEL,
                  'realModelTransport': 'actual stable launcher -> Gateway -> synthetic-auth proxy -> native Ollama CPU inference',
                  'receiverSequence': requests[-1]['sequence'], 'response': turn['result']['meta']['finalAssistantVisibleText'],
                  'retainedHistoryMessages': len(history['messages']), 'generatedCatalogProviders': snapshot['catalogs'],
                  'canonicalAuthProfiles': [p['id'] for p in snapshot['profiles']], 'receipts': self.receipts + ['stable-gateway-cpu.process.json'],
                  'limitations': ['Synthetic credentials/catalog fixture seeded through stable exported storage owners, separately from actual agent proof.',
                                  'This is a new reproduction invocation of adapted source, not a rerun claimed by historical evidence.']})

    def run(self, candidate=None, expected_head=None):
        self.save('reproduction-run.json', {'status': 'running', 'startedAtUnix': time.time()})
        try:
            self.install_stable()
            self.local_model_preflight()
            self.configure()
            self.command('stable-fixture-seed', ['node', str(self.root / 'reproduce-stable-seed.mjs'), str(self.package), str(self.root)])
            self.start_gateway()
            self.cli('stable-health-cpu', ['health', '--json'])
            turn = parse_object(self.cli('stable-live-cpu-turn', ['agent', '--agent', 'main', '--session-id', SESSION_ID,
                                '--message', 'Remember the proof word COPPER-FINCH. Reply with exactly COPPER-FINCH and do not use tools.', '--json', '--timeout', '120']))
            history = parse_object(self.cli('stable-history-inflight', ['gateway', 'call', 'chat.history', '--json', '--params',
                                   json.dumps({'sessionKey': SESSION_KEY, 'agentId': 'main', 'limit': 12}), '--timeout', '60000']))
            self.stop_gateway()
            self.finish_summary(turn, history)
            self.save('reproduction-run.json', {'status': 'stable-complete', 'endedAtUnix': time.time(), 'proxyPid': self.proxy.pid,
                                               'next': 'Run candidate-proof.py against this SAME state with exact built commit.'})
            if candidate:
                argv = [sys.executable, str(self.root / 'candidate-proof.py'), 'run', '--candidate', str(candidate.resolve()), '--expected-head', expected_head]
                self.command('candidate-reproduction-dispatch', argv, timeout=1800)
                self.proxy.send_signal(signal.SIGTERM)
                self.proxy.wait(timeout=10)
                self.save('reproduction-run.json', {'status': 'stable-and-candidate-complete', 'endedAtUnix': time.time()})
            else:
                emit({'status': 'stable-complete', 'proofRoot': str(self.root), 'proxyPid': self.proxy.pid,
                      'nextCommand': 'python3 ' + str(self.root / 'candidate-proof.py') + ' run --candidate /path/to/built/candidate --expected-head FULL_SHA'})
        except BaseException as error:
            cleanup_error = None
            try:
                self.stop_gateway()
                if self.proxy and self.proxy.poll() is None:
                    self.proxy.send_signal(signal.SIGTERM)
                    self.proxy.wait(timeout=10)
            except Exception as cleanup:
                cleanup_error = str(cleanup)
            self.save('reproduction-run.json', {'status': 'failed', 'error': str(error), 'cleanupError': cleanup_error,
                                               'resumePolicy': 'Inspect retained logs and state; no automatic retry or reseed.'})
            raise

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['plan', 'run'])
    parser.add_argument('--root', type=Path, required=True, help='Fresh empty output root; never the retained proof root')
    parser.add_argument('--candidate', type=Path)
    parser.add_argument('--expected-head')
    args = parser.parse_args()
    if args.action == 'plan':
        emit({'status': 'adapted-unexecuted-plan', 'root': str(args.root.resolve()), 'stableVersion': VERSION,
              'prerequisites': ['Node 24.16+ or supported current Node, npm, Python 3', 'Existing local Ollama at 127.0.0.1:11434 with qwen3:0.6b installed', 'Three companion scripts alongside this recipe'],
              'steps': ['Download pinned published stable tarball and verify SHA-512 integrity', 'Install into an isolated consumer package',
                        'Use corrected memory.search config and CPU-only real local model', 'Create proxy and Gateway address files',
                        'Seed synthetic credentials/catalog through stable exported owners', 'Run actual stable Gateway agent and read persisted history',
                        'Stop stable, retain same state, bind hashes', 'Run supplied exact-head candidate proof without reseeding']})
    else:
        assert bool(args.candidate) == bool(args.expected_head), 'Supply both candidate and expected head, or neither'
        if args.expected_head:
            assert re.fullmatch(r'[0-9a-f]{40}', args.expected_head), 'Expected head must be full commit SHA'
        Recipe(args.root).run(args.candidate, args.expected_head)
