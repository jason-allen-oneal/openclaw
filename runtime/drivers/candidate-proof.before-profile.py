#!/usr/bin/env python3
"""Exact-build launcher/Gateway upgrade proof. Writes only under PROOF_ROOT.
No candidate code executes without the explicit `run` subcommand.
Every invocation is single-use: failures require inspection, not automatic replay.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import socket
import sqlite3
import subprocess
import sys
import time

ROOT = Path(os.environ.get('PROOF_ROOT', Path(__file__).resolve().parent)).resolve()
STATE = ROOT / 'state'
SESSION_ID = 'catalog-upgrade-real-cpu'
SESSION_KEY = 'agent:main:explicit:' + SESSION_ID
MODEL = 'qwen3:0.6b'
KEYS = {'canonical': 'synthetic-canonical-key', 'recovered': 'synthetic-legacy-only-key', 'manual': 'synthetic-authored-root-key'}
ENV = {'PATH': os.environ['PATH'], 'HOME': str(ROOT / 'home'), 'OPENCLAW_HOME': str(ROOT / 'home'),
       'OPENCLAW_STATE_DIR': str(STATE), 'OPENCLAW_CONFIG_PATH': str(STATE / 'openclaw.json'),
       'OPENCLAW_AGENT_DIR': str(STATE / 'agents/main/agent'), 'NO_COLOR': '1',
       'OPENCLAW_NO_RESPAWN': '1', 'OPENCLAW_SKIP_UPDATE_CHECK': '1'}
PLAN = [
    'Admit clean exact-head build and unchanged stable state, bind executable hashes.',
    'Run actual candidate launcher doctor --fix --non-interactive --yes; inspect migrated auth/catalogs offline.',
    'Start candidate Gateway on the same state; retrieve stable conversation through chat.history.',
    'Run canonical-auth continuation that must recall the retained proof word; inspect actual proxy request/response.',
    'Select recovered model with sessions.patch; run real turn using migrated legacy-only credential.',
    'Read retained conversation through Gateway, then stop the candidate Gateway.',
    'Use supported offline models auth logout to remove canonical and Doctor-imported manual profiles.',
    'Verify canonical/manual profile keys absent, authored models.json unchanged, generated catalogs clean.',
    'Restart candidate Gateway; select manual provider and prove authored-root-only authentication still works.',
    'Select canonical provider and require terminal auth refusal with zero model-receiver requests.',
    'Read final retained history, stop Gateway, inspect final state and verify unchanged candidate artifact hashes.',
]

def emit(value):
    print(json.dumps(value), flush=True)

def save(name, value):
    (ROOT / name).write_text(json.dumps(value, indent=2) + '\n')

def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def parse_json_output(text):
    decoder = json.JSONDecoder()
    for match in re.finditer(r'(?m)^\s*\{', text):
        try:
            value, _ = decoder.raw_decode(text[match.start():].lstrip())
            if isinstance(value, dict):
                return value
        except json.JSONDecodeError:
            continue
    raise AssertionError('Command did not produce a JSON object; inspect its retained log')

def alive(pid):
    try:
        return Path('/proc/' + str(pid) + '/stat').read_text().split(') ')[1].split()[0] != 'Z'
    except FileNotFoundError:
        return False

def proxy_records(name):
    path = ROOT / name
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()] if path.exists() else []

def files_and_profiles():
    """Read-only observation, exclusively while task Gateways are stopped."""
    catalogs = []
    profiles = []
    for db_path in [STATE / 'agents/main/agent/openclaw-agent.sqlite', STATE / 'state/openclaw.sqlite']:
        with sqlite3.connect('file:' + str(db_path) + '?mode=ro', uri=True) as db:
            tables = {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            if 'cache_entries' in tables:
                for plugin, raw in db.execute("SELECT key,value_json FROM cache_entries WHERE scope='plugin-model-catalog-v1'"):
                    catalogs.append({'pluginId': plugin, 'contents': json.loads(raw)})
            rows = []
            if 'auth_profile_store' in tables:
                rows.extend(db.execute('SELECT store_key,store_json FROM auth_profile_store'))
            if 'auth_profile_stores' in tables:
                rows.extend(db.execute('SELECT store_key,store_json FROM auth_profile_stores'))
            if 'config_machine_state' in tables:
                rows.extend(db.execute("SELECT state_key,value_json FROM config_machine_state WHERE state_key='authProfiles.store'"))
            for store, raw in rows:
                for profile_id, profile in json.loads(raw).get('profiles', {}).items():
                    # Only known fixture matches are exported; never raw arbitrary credentials.
                    profiles.append({'id': profile_id, 'provider': profile.get('provider'), 'type': profile.get('type'),
                                     'database': str(db_path.relative_to(STATE)), 'store': store,
                                     'matchesFixture': next((p for p, key in KEYS.items() if profile.get('key') == key), None)})
    authored = STATE / 'agents/main/agent/models.json'
    expected = (ROOT / 'authored-root-before-candidate.sha256').read_text().strip()
    assert digest(authored) == expected, 'Authored models.json bytes changed'
    assert len(catalogs) == 1 and catalogs[0]['pluginId'] == 'proof-owner', 'Generated inventory missing or replaced'
    observed = []
    for catalog in catalogs:
        assert catalog['contents'].get('generatedBy') == 'openclaw-plugin-model-catalog-v1'
        for provider, data in catalog['contents']['providers'].items():
            observed.append({'pluginId': catalog['pluginId'], 'provider': provider,
                             'hasApiKey': 'apiKey' in data, 'hasHeaders': 'headers' in data,
                             'modelIds': [model['id'] for model in data.get('models', [])]})
    return {'authoredRootSha256': expected, 'profiles': profiles, 'catalogs': observed,
            'files': [{'path': str(path.relative_to(STATE)), 'sha256': digest(path),
                       'sizeBytes': path.stat().st_size, 'mode': oct(path.stat().st_mode & 0o777)}
                      for path in [STATE / 'openclaw.json', authored, STATE / 'agents/main/agent/openclaw-agent.sqlite', STATE / 'state/openclaw.sqlite']]}

def assert_clean_catalogs(snapshot):
    assert {row['provider'] for row in snapshot['catalogs']} == {'canonical', 'recovered'}
    assert all(not row['hasApiKey'] and not row['hasHeaders'] for row in snapshot['catalogs']), 'Generated credential remains'

def assert_history(history, minimum):
    assert history.get('sessionId') == SESSION_ID
    messages = history.get('messages', [])
    assert len(messages) >= minimum
    assert any(m.get('role') == 'user' and 'Remember the proof word COPPER-FINCH' in str(m.get('content')) for m in messages)
    assert any(m.get('role') == 'assistant' and 'COPPER-FINCH' in str(m.get('content')) for m in messages)
    return messages

class Proof:
    def __init__(self, candidate, sha, prefix):
        self.candidate = candidate.resolve()
        self.sha = sha
        self.prefix = prefix
        self.current = None
        self.observations = []
        self.receipts = []
        self.bound = {}
        self.result_name = prefix + '-result.json'

    def name(self, suffix):
        return self.prefix + '-' + suffix

    def bind(self):
        build_path = self.candidate / 'dist/build-info.json'
        assert build_path.exists(), 'Candidate dist/build-info.json missing: finish exact-head build first'
        build = json.loads(build_path.read_text())
        assert build.get('commit') == self.sha, f'Build commit {build.get("commit")} is not expected {self.sha}'
        head = subprocess.check_output(['git', '-C', str(self.candidate), 'rev-parse', 'HEAD'], text=True).strip()
        assert head == self.sha, 'Candidate checkout head changed'
        status = subprocess.check_output(['git', '-C', str(self.candidate), 'status', '--porcelain'], text=True)
        assert not status.strip(), 'Candidate has uncommitted source/untracked changes'
        paths = list(self.candidate.glob('*.mjs')) + [build_path]
        owners = ['maybeMigrateModelCatalogCredentials', 'stripPluginModelCatalogCredentials', 'replacePersistedPluginModelCatalogs']
        owner_files = {}
        for path in self.candidate.joinpath('dist').iterdir():
            if path.is_file() and path.suffix in ('.js', '.mjs'):
                text = path.read_text(errors='replace')
                found = [name for name in owners if re.search(r'(?:async\s+)?function\s+' + name + r'\s*\(', text)]
                if found:
                    paths.append(path)
                    for name in found:
                        owner_files.setdefault(name, []).append(str(path.relative_to(self.candidate)))
        assert all(name in owner_files for name in owners), 'Built changed owner binding missing'
        self.bound = {str(path.relative_to(self.candidate)): digest(path) for path in sorted(set(paths))}
        save(self.name('bindings.json'), {'candidateSha': self.sha, 'buildInfo': build, 'sha256': self.bound,
                                         'ownerDefinitions': owner_files, 'driverSha256': digest(__file__),
                                         'proxyDriverSha256': digest(ROOT / 'live-proxy-cpu.mjs')})
        return build

    def check_bindings(self):
        assert all(digest(self.candidate / path) == value for path, value in self.bound.items()), 'Executed artifacts changed'

    def command(self, step, args, *, expect=0, timeout=180):
        label = self.name(step)
        logpath = ROOT / (label + '.log')
        assert not logpath.exists(), 'Refusing to overwrite receipt: ' + label
        argv = ['node', str(self.candidate / 'openclaw.mjs')] + args
        started = time.time()
        emit({'step': step, 'status': 'running'})
        try:
            completed = subprocess.run(argv, env=ENV, cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=timeout)
            output, code = completed.stdout.decode(errors='replace'), completed.returncode
        except subprocess.TimeoutExpired as error:
            output, code = (error.stdout or b'').decode(errors='replace'), 124
        logpath.write_text(output)
        receipt = {'argv': argv, 'environment': ENV, 'candidateSha': self.sha, 'startedAtUnix': started,
                   'endedAtUnix': time.time(), 'exitCode': code, 'log': logpath.name}
        receipt_path = label + '.receipt.json'
        save(receipt_path, receipt)
        self.receipts.append(receipt_path)
        emit({'step': step, 'exitCode': code, 'elapsedSeconds': round(time.time() - started, 2)})
        if expect is None:
            assert code not in (0, 124), 'Expected terminal refusal, not success or harness timeout'
        else:
            assert code == expect, f'{step} exited {code}; inspect {logpath.name}'
        return output

    def rpc(self, step, method, params):
        return parse_json_output(self.command(step, ['gateway', 'call', method, '--json', '--params', json.dumps(params), '--timeout', '60000']))

    def start(self, step):
        assert self.current is None
        port = json.loads((ROOT / 'gateway-port.json').read_text())['port']
        with socket.socket() as sock:
            assert sock.connect_ex(('127.0.0.1', port)) != 0, 'Task Gateway port is already occupied'
        label = self.name(step)
        path = ROOT / (label + '.log')
        assert not path.exists(), 'Refusing to overwrite Gateway log'
        argv = ['node', str(self.candidate / 'openclaw.mjs'), 'gateway', 'run', '--port', str(port), '--bind', 'loopback', '--auth', 'none']
        log = path.open('w')
        process = subprocess.Popen(argv, env=ENV, cwd=ROOT, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
        log.close()
        self.current = (label, process)
        record = {'argv': argv, 'environment': ENV, 'candidateSha': self.sha, 'pid': process.pid, 'startedAtUnix': time.time(), 'log': path.name}
        save(label + '.process.json', record)
        emit({'step': step, 'status': 'starting', 'pid': process.pid})
        deadline = time.monotonic() + 60
        while time.monotonic() < deadline:
            assert process.poll() is None, 'Candidate Gateway exited before readiness; inspect ' + path.name
            if re.search(r'\[gateway\] (?:ready(?:\r?\n|$)|http server listening)', path.read_text()):
                record['readyAtUnix'] = time.time()
                save(label + '.process.json', record)
                health = parse_json_output(self.command(step + '-health', ['health', '--json'], timeout=90))
                assert health.get('ok') is True, 'Gateway health RPC did not report ok'
                emit({'step': step, 'status': 'ready'})
                return
            time.sleep(.25)
        record['readinessTimedOut'] = True
        save(label + '.process.json', record)
        raise AssertionError('Candidate did not reach readiness within 60 seconds; preserve failed attempt')

    def stop(self):
        if self.current is None:
            return
        label, process = self.current
        if process.poll() is None:
            process.send_signal(signal.SIGTERM)
        try:
            code = process.wait(timeout=45)
        except subprocess.TimeoutExpired:
            raise AssertionError('Task Gateway failed to settle; preserve ownership for explicit recovery')
        record = json.loads((ROOT / (label + '.process.json')).read_text())
        record.update({'stoppedAtUnix': time.time(), 'exitCode': code})
        save(label + '.process.json', record)
        self.receipts.append(label + '.process.json')
        self.current = None
        emit({'step': label, 'status': 'stopped', 'exitCode': code})

    def select(self, provider):
        result = self.rpc('select-' + provider, 'sessions.patch', {'key': SESSION_KEY, 'agentId': 'main', 'expectedSessionId': SESSION_ID, 'model': provider + '/' + MODEL})
        self.observations.append({'operation': 'model-selection', 'provider': provider, 'accepted': True})
        return result

    def turn(self, step, provider, message, *, denied=False, recall=False):
        before = len(proxy_records('live-proxy.requests.jsonl'))
        output = self.command(step, ['agent', '--agent', 'main', '--session-id', SESSION_ID, '--message', message, '--json', '--timeout', '120'], expect=None if denied else 0)
        requests = proxy_records('live-proxy.requests.jsonl')[before:]
        envelope = parse_json_output(output)
        if denied:
            assert requests == [], 'Revoked credential caused physical model I/O'
            assert re.search(r'auth|credential|api.?key|profile', output, re.I), 'Failure is not evidenced as authentication refusal'
            self.observations.append({'operation': step, 'provider': provider, 'allowed': False, 'physicalRequests': 0, 'terminalFailure': envelope})
            return envelope
        assert envelope.get('status') == 'ok', 'Agent result is not successful'
        assert requests, 'No real model request reached receiver'
        assert all(req['authAccepted'] and req['syntheticCredential'] == KEYS[provider] and req['request']['model'] == MODEL for req in requests)
        meta = envelope['result']['meta']
        text = meta.get('finalAssistantVisibleText', '')
        assert text, 'Agent produced no visible response'
        if recall:
            assert 'COPPER-FINCH' in text.upper(), 'Candidate failed to recall retained stable proof word'
            assert any('COPPER-FINCH' in str(message.get('content')) for req in requests for message in req['request']['messages'] if message.get('role') == 'assistant'), 'Stable assistant history absent from physical candidate request'
        responses = {item['sequence']: item for item in proxy_records('live-proxy.responses.jsonl')}
        for request in requests:
            response = responses[request['sequence']]
            assert response['status'] == 200 and response.get('content'), 'Receiver lacks successful real inference result'
        self.observations.append({'operation': step, 'provider': provider, 'allowed': True, 'physicalRequests': len(requests), 'receiverSequences': [r['sequence'] for r in requests], 'runId': envelope['runId'], 'response': text, 'requestShaping': meta.get('requestShaping')})
        return envelope

    def run(self, resume_after_doctor=None):
        assert not (ROOT / self.result_name).exists(), 'Existing candidate run result: inspect it instead of blind replay'
        save(self.result_name, {'status': 'running', 'candidateSha': self.sha, 'plan': PLAN})
        try:
            self.bind()
            stable = json.loads((ROOT / 'stable-final-summary.json').read_text())
            assert stable['sessionId'] == SESSION_ID
            expected_config = stable['configSha256']
            if resume_after_doctor:
                admitted = json.loads((ROOT / (resume_after_doctor + '-after-doctor.json')).read_text())
                expected_config = next(item['sha256'] for item in admitted['files'] if item['path'] == 'openclaw.json')
            assert digest(STATE / 'openclaw.json') == expected_config, 'Config changed since the admitted stable/Doctor checkpoint'
            stable_processes = list(ROOT.glob('stable-gateway*.process.json'))
            assert stable_processes, 'Missing actual stable Gateway process receipt'
            for receipt_path in stable_processes:
                assert not alive(json.loads(receipt_path.read_text())['pid']), 'Stable Gateway still owns state'
            proxy = json.loads((ROOT / 'live-proxy.address.json').read_text())
            assert alive(proxy['pid']), 'Task-owned auth proxy not running'
            if resume_after_doctor:
                previous = json.loads((ROOT / (resume_after_doctor + '-result.json')).read_text())
                assert previous['candidateSha'] == self.sha and previous['status'] == 'failed'
                assert previous['error'] == 'Candidate did not reach readiness within 60 seconds; preserve failed attempt'
                assert previous['cleanupError'] is None
                assert previous['observations'] == [{'operation': 'doctor', 'generatedCredentialsRemoved': True, 'legacyOnlyCredentialRecovered': True, 'authoredRootUnchanged': True}]
                migrated = files_and_profiles()
                expected = json.loads((ROOT / (resume_after_doctor + '-after-doctor.json')).read_text())
                assert migrated['profiles'] == expected['profiles'] and migrated['catalogs'] == expected['catalogs']
                assert_clean_catalogs(migrated)
                self.receipts.extend(previous['receipts'])
                self.observations.extend(previous['observations'])
                self.observations.append({'operation': 'resume-after-doctor', 'previousResult': resume_after_doctor + '-result.json', 'reason': 'Replaced obsolete readiness log assertion with actual health RPC; preserved post-Doctor state, no reseed or repeated migration.'})
            else:
                before = files_and_profiles()
                save(self.name('before.json'), before)
                assert any(row['hasApiKey'] for row in before['catalogs']), 'Pre-upgrade credential fixture was already cleaned'
                assert not any(p['matchesFixture'] == 'recovered' for p in before['profiles']), 'Legacy-only credential already imported'
                self.command('doctor', ['doctor', '--fix', '--non-interactive', '--yes'], timeout=300)
                migrated = files_and_profiles()
                assert_clean_catalogs(migrated)
                assert {'canonical', 'recovered', 'manual'} <= {p['matchesFixture'] for p in migrated['profiles']}
                save(self.name('after-doctor.json'), migrated)
                self.observations.append({'operation': 'doctor', 'generatedCredentialsRemoved': True, 'legacyOnlyCredentialRecovered': True, 'authoredRootUnchanged': True})
            self.start('gateway')
            original = self.rpc('retained-history', 'chat.history', {'sessionKey': SESSION_KEY, 'agentId': 'main', 'limit': 30})
            assert_history(original, 2)
            self.turn('canonical-turn', 'canonical', 'What proof word did I ask you to remember? Reply with only that proof word; do not use tools.', recall=True)
            self.select('recovered')
            self.turn('recovered-turn', 'recovered', 'Reply with the remembered proof word once more, and do not use tools.', recall=True)
            continued = self.rpc('continued-history', 'chat.history', {'sessionKey': SESSION_KEY, 'agentId': 'main', 'limit': 30})
            assert_history(continued, len(original['messages']) + 4)
            self.stop()
            manual_ids = sorted({p['id'] for p in migrated['profiles'] if p['matchesFixture'] == 'manual'})
            canonical_ids = sorted({p['id'] for p in migrated['profiles'] if p['matchesFixture'] == 'canonical'})
            assert canonical_ids == ['canonical:default'] and len(manual_ids) == 1, 'Unexpected fixture auth profile allocation'
            for profile in canonical_ids + manual_ids:
                self.command('logout-' + profile.split(':')[0], ['models', 'auth', 'logout', profile, '--agent', 'main', '--yes'])
            logged_out = files_and_profiles()
            assert_clean_catalogs(logged_out)
            assert not any(p['matchesFixture'] in ('canonical', 'manual') for p in logged_out['profiles']), 'Logout retained credential'
            assert any(p['matchesFixture'] == 'recovered' for p in logged_out['profiles']), 'Logout damaged independent credential'
            save(self.name('after-logout.json'), logged_out)
            self.start('gateway-restart')
            self.select('manual')
            self.turn('authored-root-turn', 'manual', 'Reply with ROOT-AUTH-OK and do not use tools.')
            self.select('canonical')
            self.turn('revoked-refusal', 'canonical', 'Reply with REVOKED-SHOULD-NOT-SEND.', denied=True)
            final_history = self.rpc('final-history', 'chat.history', {'sessionKey': SESSION_KEY, 'agentId': 'main', 'limit': 30})
            assert_history(final_history, len(continued['messages']) + 2)
            self.stop()
            final = files_and_profiles()
            assert_clean_catalogs(final)
            assert not any(p['matchesFixture'] == 'canonical' for p in final['profiles'])
            save(self.name('final-state.json'), final)
            self.check_bindings()
            save(self.result_name, {'status': 'passed', 'candidateSha': self.sha, 'observations': self.observations,
                                   'receipts': self.receipts, 'sessionId': SESSION_ID, 'sessionKey': SESSION_KEY,
                                   'limitations': ['Synthetic credentials and helper-seeded catalog fixture; actual launcher/Gateway/Doctor/logout/model requests are exercised.', 'Loopback proxy converts OpenAI chat streaming to CPU-only Ollama native protocol; all assistant content comes from the real local qwen3:0.6b model.']})
            emit({'status': 'passed', 'result': self.result_name})
        except BaseException as error:
            cleanup_error = None
            try:
                self.stop()
            except Exception as cleanup:
                cleanup_error = str(cleanup)
            save(self.result_name, {'status': 'failed', 'candidateSha': self.sha, 'error': str(error), 'cleanupError': cleanup_error,
                                   'observations': self.observations, 'receipts': self.receipts,
                                   'resumePolicy': 'Inspect retained failures and current state. Do not rerun Doctor or recreate stable state merely to obtain green.'})
            emit({'status': 'failed', 'error': str(error), 'cleanupError': cleanup_error})
            raise

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['plan', 'run'])
    parser.add_argument('--candidate', type=Path)
    parser.add_argument('--expected-head')
    parser.add_argument('--prefix', default='candidate')
    parser.add_argument('--resume-after-doctor')
    args = parser.parse_args()
    if args.action == 'plan':
        emit({'proofRoot': str(ROOT), 'state': str(STATE), 'steps': PLAN, 'execution': 'Not executed'})
    else:
        assert args.candidate and re.fullmatch(r'[0-9a-f]{40}', args.expected_head or ''), 'Supply candidate root and full expected head SHA'
        assert re.fullmatch(r'[a-z0-9-]+', args.prefix), 'Use a simple receipt prefix'
        Proof(args.candidate, args.expected_head, args.prefix).run(args.resume_after_doctor)
