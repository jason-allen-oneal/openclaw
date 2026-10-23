import datetime, hashlib, json, pathlib, re, sqlite3

root = pathlib.Path(__file__).resolve().parent
artifact = root / 'atomic-final'
receipt = json.loads((artifact / 'receipt.json').read_text())
assert receipt['sourceHead'] == '18ea9065fdd8c1b300a9bce1952769a998b0a016'
assert receipt['passed'] is True
prior = receipt['priorState']['artifacts']
original = json.loads((root / 'prior-input-receipt.json').read_text())['stages'][-1]['artifacts']
assert len(original) == len(prior) == 17
for old in original:
    copied = next(a for a in prior if a['name'] == old['name'])
    assert copied['hash'] == old['hash'] and copied['provenance'] == old['provenance']
stages = receipt['stages']
assert len(prior) == 17
assert [len(s['artifacts']) for s in stages] == [23, 29]
assert len(receipt['sessions']) == 12
assert all(s['shutdown']['code'] == 0 and s['previousBytesRetained'] for s in stages)
checks = []
for index, stage in enumerate(stages):
    expected_sessions = receipt['sessions'][:6 * (index + 1)]
    bindings = []
    for session in expected_sessions:
        matches = [a for a in stage['artifacts'] if session['marker'] in a['markers']]
        assert len(matches) == 1, session['key']
        item = matches[0]
        assert item['markers'] == [session['marker']], item['name']
        assert item['sessionKey'] == session['key'] == session['created']['key']
        assert item['sessionId'] == session['created']['sessionId']
        content = (artifact / 'workspace/memory' / item['name']).read_text()
        match = re.fullmatch(r'# Session: (\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC)\n\n' +
            re.escape(f"- **Session Key**: {session['key']}\n- **Session ID**: {session['created']['sessionId']}\n- **Source**: gateway:sessions.reset\n\n## Conversation Summary\n\nassistant: \"{session['marker']}\"\n"), content)
        assert match, item['name']
        observed = datetime.datetime.strptime(match[1], '%Y-%m-%d %H:%M:%S UTC').replace(tzinfo=datetime.timezone.utc)
        request = next(t for t in receipt['transcript'] if t['method'] == 'sessions.reset' and t['params']['key'] == session['key'])
        start = datetime.datetime.fromisoformat(request['startedAt'].replace('Z', '+00:00'))
        end = datetime.datetime.fromisoformat(request['finishedAt'].replace('Z', '+00:00'))
        assert start - datetime.timedelta(seconds=1) <= observed <= end
        digest = hashlib.sha256(content.encode()).hexdigest()
        assert digest == item['hash'] == item['provenance']['fileHash']
        assert item['provenance']['sessionId'] == session['created']['sessionId']
        assert item['provenance']['sessionKey'] == session['key']
        bindings.append({'file': item['name'], 'sessionKey': session['key'], 'sessionId': session['created']['sessionId'], 'sha256': digest, 'completeExpectedBody': True})
    assert len({b['file'] for b in bindings}) == len(expected_sessions)
    before = prior if index == 0 else stages[index - 1]['artifacts']
    for old in before:
        new = next(a for a in stage['artifacts'] if a['name'] == old['name'])
        assert new['hash'] == old['hash'] and new['provenance'] == old['provenance']
    checks.append({'label': stage['label'], 'artifactCount': len(stage['artifacts']), 'distinctNewCaptureFiles': len(bindings), 'priorFilesPreserved': len(before), 'priorProvenanceUnchanged': True, 'bindings': bindings})
names = {p.name for p in (artifact / 'workspace/memory').glob('*.md')}
assert names == {a['name'] for a in stages[-1]['artifacts']}
db = sqlite3.connect(f"file:{artifact / 'state/state/openclaw.sqlite'}?mode=ro", uri=True)
try:
    integrity = db.execute('PRAGMA quick_check').fetchall()
    assert integrity == [('ok',)]
finally:
    db.close()
result = {'sourceHead': receipt['sourceHead'], 'passed': True, 'priorArtifacts': len(prior), 'originalFixtureBytesAndProvenancePreserved': True, 'stageCounts': [23, 29], 'stages': checks, 'databaseQuickCheck': 'ok', 'verifiedAt': datetime.datetime.now(datetime.timezone.utc).isoformat()}
(root / 'final-independent-verification.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({'passed': True, 'sourceHead': receipt['sourceHead'], 'stageCounts': result['stageCounts'], 'completeCaptureFiles': 12, 'databaseQuickCheck': 'ok'}))
