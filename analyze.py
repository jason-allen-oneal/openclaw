#!/usr/bin/env python3
"""Offline only; reconstruct diagnostic observations, never infer incident closure."""
import collections
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CASES = {
    'legacy-fresh': 'native30-delayed',
    'legacy-retained': 'native30-retained/phases/retained-startup',
    'current-fresh': 'current30-validated',
}

def rows(path):
    return [json.loads(line) for line in path.read_text().splitlines() if line] if path.exists() else []

def analyze(root):
    cleanup = json.loads((root / 'cleanup-receipt.json').read_text())
    client = json.loads((root / 'diagnostic-receipt.json').read_text())
    census = rows(root / 'process-census.jsonl')
    native = rows(root / 'codex-events.jsonl')
    wire = rows(root / 'diagnostic-wire.jsonl')
    gateway_pid = cleanup['gateway']['pid']
    begin = client['connectedAtMs']
    end = client['finishedAtMs']
    window = [sample for sample in census if begin <= sample['timeMs'] <= end]
    requests = {r['frame']['id']: r['frame']['method'] for r in wire if r['dir'] == 'sent' and r['frame'].get('type') == 'req'}
    catalog = [r for r in wire if r['dir'] == 'received' and r['frame'].get('type') == 'res' and requests.get(r['frame'].get('id')) == 'models.list']
    def peak(samples, tree=False):
        values = [sample['totalRssKb'] if tree else next((p['rssKb'] for p in sample['processes'] if p['pid'] == gateway_pid), 0) for sample in samples]
        return max(values, default=0) / 1024
    return {
        'runtimeStatus': cleanup['status'],
        'clientStatus': client['status'],
        'cleanup': cleanup['cleanup'],
        'survivors': cleanup['survivors'],
        'ports': cleanup['ports'],
        'firstFailureDetectorMatched': cleanup['firstFailureObserved'],
        'clientObservationSeconds': (end - begin) / 1000,
        'gatewayPeakRssMiBWholeRuntime': peak(census),
        'treePeakRssMiBWholeRuntime': peak(census, True),
        'gatewayPeakRssMiBClientWindow': peak(window),
        'treePeakRssMiBClientWindow': peak(window, True),
        'syntheticCodexChildStarts': sum(r['kind'] == 'start' for r in native),
        'syntheticCodexChildExits': sum(r['kind'] == 'exit' for r in native),
        'modelListProtocolRequests': sum(r['kind'] == 'request' and r.get('method') == 'model/list' for r in native),
        'lateModelListReplies': sum(r['kind'] == 'model-list-reply' for r in native),
        'catalogResponses': [{'atMs': r['atMs'], 'ok': r['frame']['ok'], 'rows': len(r['frame'].get('payload', {}).get('models', [])), 'refreshFailed': r['frame'].get('payload', {}).get('refreshFailed')} for r in catalog],
        'metadataEvents': sum(r['frame'].get('event') == 'chat.metadata.changed' for r in wire if r['dir'] == 'received'),
        'overlapTrigger': client.get('overlapTrigger'),
        'turns': [{'phase': t['phase'], 'agentId': t['agentId'], 'startedAtMs': t['startedAtMs'], 'finishedAtMs': t['finishedAtMs'], 'status': t.get('final', {}).get('status'), 'error': t.get('error'), 'persistedFixtureReply': t.get('persistedFixtureReply', False)} for t in client['turns']],
    }

if __name__ == '__main__':
    print(json.dumps({label: analyze(ROOT / rel) for label, rel in CASES.items()}, indent=2))
