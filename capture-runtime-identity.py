import datetime
import hashlib
import json
import pathlib
import platform
import subprocess
import sys

build = pathlib.Path(sys.argv[1]).resolve()
artifact = pathlib.Path(sys.argv[2]).resolve()
expected = sys.argv[3]
metadata = json.loads((build / 'dist/build-info.json').read_text())
assert metadata['commit'] == expected, metadata
needles = {
    'settlementOwner': 'async function settleReplyDispatcher(',
    'dispatchAndTranscriptOwner': 'async function dispatchReplyFromConfigInner(',
}
owners = {}
for owner, needle in needles.items():
    matches = [p for p in (build / 'dist').glob('*.mjs') if needle in p.read_text()]
    assert len(matches) == 1, (owner, matches)
    owners[owner] = matches[0]
paths = [build / 'openclaw.mjs', build / 'dist/build-info.json', build / 'dist/index.js', *owners.values()]
record = {
    'capturedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'buildRoot': str(build),
    'build': metadata,
    'node': subprocess.check_output(['node', '--version'], text=True).strip(),
    'platform': platform.platform(),
    'ownerFiles': {key: str(value.relative_to(build)) for key, value in owners.items()},
    'files': {str(p.relative_to(build)): {'bytes': p.stat().st_size, 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()} for p in paths},
}
(artifact / 'runtime-identity.json').write_text(json.dumps(record, indent=2) + '\n')
print(json.dumps({'head': metadata['commit'], 'owners': record['ownerFiles'], 'files': len(paths)}))
