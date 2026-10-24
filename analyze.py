"""Read-only analysis of included sanitized receipts; starts no external process."""
import collections
import json
import pathlib
import statistics
import xml.etree.ElementTree as ET

root = pathlib.Path(__file__).resolve().parent


def load(path):
    return json.loads(path.read_text())


def rows(path):
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


def owner(record):
    view = record.get('params', {}).get('view')
    return {'provider-config': 'provider-settings', 'configured': 'chat-configured'}.get(view, 'general-inventory')


def kbytes(value):
    return int(value.split()[0])


def resource_summary(samples, start, end):
    selected = [r for r in samples if start <= r['timestampMs'] < end and 'VmRSS' in r]
    if not selected:
        return None
    readiness = [r for r in selected if 'readiness' in r]
    latencies = [r['readinessElapsedMs'] for r in readiness if 'readinessElapsedMs' in r]
    return {
        'samples': len(selected),
        'rssMiBFirst': kbytes(selected[0]['VmRSS']) / 1024,
        'rssMiBLast': kbytes(selected[-1]['VmRSS']) / 1024,
        'rssMiBSampledMax': max(kbytes(r['VmRSS']) / 1024 for r in selected),
        'hwmMiBMax': max(kbytes(r['VmHWM']) / 1024 for r in selected),
        'readinessSamples': len(readiness),
        'readyResponses': sum(r['readiness'].get('body', r['readiness']).get('ready') is True for r in readiness),
        'readinessHttpStatuses': dict(collections.Counter(str(r['readiness']['status']) for r in readiness if 'status' in r['readiness'])),
        'readinessErrors': sum('error' in r['readiness'] for r in readiness),
        'readinessElapsedMs': {'min': min(latencies), 'max': max(latencies)} if latencies else None,
    }


def native(case):
    path = root / 'native' / case
    wire = rows(path / 'native-wire.jsonl')
    samples = rows(path / 'gateway/sampler.log')
    observations = load(path / 'native-observations.json')
    phases = [r for r in wire if r.get('direction') == 'observer-phase']
    closes = [r for r in wire if r.get('direction') == 'client-close' and r.get('role') == 'operator']
    close = min((r['timestampMs'] for r in closes), default=None)
    start = min(r['timestampMs'] for r in wire)
    if close is None:
        raise ValueError('Cannot summarize an unterminated native capture: ' + case)
    if start < phases[0]['timestampMs']:
        phases.insert(0, {'timestampMs': start, 'phase': 'native-setup'})
    all_model_responses = [r for r in wire if r.get('direction') == 'response' and r.get('method') == 'models.list']
    out = {
        'nativeStartMs': start,
        'operatorCloseMs': close,
        'connectedWindowSeconds': (close - start) / 1000,
        'phases': {},
        'nativeObservations': observations,
        'catalogResponseSummary': {
            'responses': len(all_model_responses),
            'ok': sum(r.get('ok') is True for r in all_model_responses),
            'refreshFailed': sum(r.get('refreshFailed') is True for r in all_model_responses),
            'modelCounts': sorted({r['modelCount'] for r in all_model_responses if 'modelCount' in r}),
            'modelIdentitySha256': sorted({r['modelIdentitySha256'] for r in all_model_responses if 'modelIdentitySha256' in r}),
            'availabilityShapes': sorted({json.dumps(r['availability'], sort_keys=True) for r in all_model_responses if 'availability' in r}),
        },
        'connectedWindowResources': resource_summary(samples, start, close),
        'wholeRecordedRunResources': resource_summary(samples, min(r['timestampMs'] for r in samples), max(r['timestampMs'] for r in samples) + 1),
        'agentActions': {},
    }
    for action_path in sorted(path.glob('*/action-receipt.json')):
        action = load(action_path)
        action['completedWhileNativeConnected'] = (
            start <= action.get('startedAtMs', 0) < action.get('finishedAtMs', 0) < close
        )
        out['agentActions'][action_path.parent.name] = action
    out['agentAction'] = out['agentActions'].get('idle-turn')
    inference = rows(path / 'gateway/inference-requests.jsonl')
    out['inference'] = {
        'backend': 'Synthetic deterministic loopback OpenAI-compatible fixture; not an external model service.',
        'records': inference,
        'completedWhileNativeConnected': sum(r.get('completed') is True and start <= r['timestampMs'] < close for r in inference),
    }
    exercise_path = path / 'exercise.receipt.json'
    if exercise_path.exists():
        exercise = load(exercise_path)
        out['exerciseReceipt'] = {
            'hasTerminalPassField': 'passed' in exercise,
            'hasTerminalFinishedField': 'finishedAtMs' in exercise,
            'note': 'Do not infer wrapper success from completed steps; native/action receipts and raw observations are separate evidence.',
        }
    for index, phase in enumerate(phases):
        phase_start = phase['timestampMs']
        phase_end = phases[index + 1]['timestampMs'] if index + 1 < len(phases) else close
        selected = [r for r in wire if phase_start <= r['timestampMs'] < phase_end]
        requests = [r for r in selected if r.get('direction') == 'request' and r.get('method') == 'models.list']
        owners = {}
        for name in ['general-inventory', 'provider-settings', 'chat-configured']:
            owned = [r for r in requests if owner(r) == name]
            ids = {r['id'] for r in owned}
            responses = [r for r in all_model_responses if r['id'] in ids]
            latencies = [r['elapsedMs'] for r in responses]
            owners[name] = {
                'requests': len(owned),
                'responses': len(responses),
                'responsesBeforePhaseEnd': sum(r['timestampMs'] < phase_end for r in responses),
                'responsesBeforeDisconnect': sum(r['timestampMs'] < close for r in responses),
                'ok': sum(r.get('ok') is True for r in responses),
                'refreshFailed': sum(r.get('refreshFailed') is True for r in responses),
                'modelCounts': sorted({r['modelCount'] for r in responses if 'modelCount' in r}),
                'latencyMs': {'min': min(latencies), 'median': statistics.median(latencies), 'max': max(latencies)} if latencies else None,
            }
        phase_observations = [r for r in observations if phase_start <= r['timestampMs'] < phase_end]
        earlier_observations = [r for r in observations if r['timestampMs'] < phase_start]
        out['phases'][phase['phase']] = {
            'startMs': phase_start,
            'endMs': phase_end,
            'seconds': (phase_end - phase_start) / 1000,
            'requestsByMethod': dict(collections.Counter(r['method'] for r in selected if r.get('direction') == 'request')),
            'eventsByType': dict(collections.Counter(r['event'] for r in selected if r.get('direction') == 'gateway-event')),
            'metadataEvents': [r for r in selected if r.get('event') == 'chat.metadata.changed'],
            'catalogRequestsPerSecond': len(requests) / ((phase_end - phase_start) / 1000),
            'owners': owners,
            'resourceSamples': resource_summary(samples, phase_start, phase_end),
            'lastObservationBeforePhase': earlier_observations[-1] if earlier_observations else None,
            'changedObservationsDuringPhase': phase_observations,
        }
    return out


result = {
    'note': 'Derived read-only from included records. Responses are grouped by request-origin phase and may arrive after phase end. Native observation records are changed-state samples, not continuous assertions. Point resource probes are not continuous availability or peak-memory guarantees. No aggregate product-pass result is synthesized.',
    'native': {},
    'unit': {},
}
for case in ['baseline-legacy', 'candidate-legacy', 'candidate-current']:
    result['native'][case] = native(case)
for phase in ['red', 'green']:
    suites = []
    for path in sorted((root / 'unit' / phase).glob('*.xml')):
        element = ET.parse(path).getroot()
        suites.append({key: element.attrib[key] for key in ['name', 'tests', 'failures', 'errors', 'skipped']})
    result['unit'][phase] = suites
print(json.dumps(result, indent=2))
