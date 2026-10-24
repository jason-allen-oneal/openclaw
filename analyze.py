"""Read-only offline evidence summary. No test, app, Gateway or helper is started."""
from pathlib import Path
from collections import Counter, defaultdict
import json
import xml.etree.ElementTree as ET

P = Path(__file__).resolve().parent

def read(path):
    return json.loads(path.read_text())

def junit(directory):
    suites = []
    for path in sorted(directory.glob('*.xml')):
        suite = ET.parse(path).getroot()
        suites.append({'file': path.relative_to(P).as_posix(), 'name': suite.get('name'),
                       **{key: int(suite.get(key, '0')) for key in ['tests', 'failures', 'errors', 'skipped']}})
    return {'suites': suites, **{key: sum(s[key] for s in suites) for key in ['tests', 'failures', 'errors', 'skipped']}}

result = {'unit': {name: junit(P / 'unit' / name) for name in ['legacy-red', 'general-status-red', 'green']},
          'wireCases': {}, 'limits': ['Summary is descriptive and never infers missing terminal outcomes.',
              'Request-phase grouping is not a measured time window or a controlled A/B effect size.',
              'Android/host clocks are not calibrated; no subsecond UI propagation latency is asserted.']}
if result['unit']['green']['tests'] != 147 or any(result['unit']['green'][k] for k in ['failures', 'errors', 'skipped']):
    raise RuntimeError('Expected final 147-test GREEN does not match retained JUnit')
for directory in [P / 'prior-attempts', P / 'native']:
    if not directory.exists():
        continue
    for wire in sorted(directory.rglob('native-wire.jsonl')):
        rows = [json.loads(line) for line in wire.read_text().splitlines() if line.strip()]
        requests = [r for r in rows if r.get('direction') == 'request']
        replies = [r for r in rows if r.get('direction') == 'response' and r.get('method') == 'models.list']
        phases = defaultdict(Counter)
        for r in requests:
            phases[r.get('phase', 'unknown')][r.get('method', 'unknown')] += 1
        owners = defaultdict(list)
        for r in requests:
            if r.get('method') != 'models.list':
                continue
            view = r.get('params', {}).get('view')
            owner = {'provider-config': 'provider-settings', 'configured': 'chat'}.get(view, 'general')
            owners[owner].append(r['timestampMs'])
        case = {'wireRecords': len(rows), 'requestsByPhase': dict(phases),
                'chatSendRequests': sum(r.get('method') == 'chat.send' for r in requests),
                'catalogReplies': len(replies), 'successfulCatalogReplies': sum(r.get('ok') is True for r in replies),
                'warningCatalogReplies': sum(r.get('refreshFailed') is True for r in replies),
                'modelCounts': sorted({r['modelCount'] for r in replies if 'modelCount' in r}),
                'modelIdentitySha256s': sorted({r['modelIdentitySha256'] for r in replies if 'modelIdentitySha256' in r}),
                'ownerRequestTimesMs': dict(owners)}
        observations = wire.parent / 'native-observations.json'
        if observations.exists():
            obs = read(observations)
            case['observationStateChanges'] = obs
            case['lastObservedOwnerRows'] = ({key: obs[-1].get(key) for key in ['catalogRows', 'generalModelCatalogRows', 'providerModelCatalogRows']} if obs else None)
        native = wire.parent / 'native.receipt.json'
        case['terminalNativeReceiptPresent'] = native.exists()
        case['nativeCaptureComplete'] = read(native).get('captureComplete') if native.exists() else None
        result['wireCases'][wire.parent.relative_to(P).as_posix()] = case
print(json.dumps(result, indent=2))
