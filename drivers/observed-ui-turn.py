"""Single native UI send from root-inspected screenshots; no second UiAutomation owner."""
import argparse, hashlib, json, pathlib, subprocess, time

p = argparse.ArgumentParser()
p.add_argument('--out', type=pathlib.Path, required=True)
p.add_argument('--label', required=True)
p.add_argument('--action', choices=['compose', 'send', 'collect'], required=True)
p.add_argument('--x', type=int)
p.add_argument('--y', type=int)
p.add_argument('--reply-rendered', action='store_true')
a = p.parse_args()
root = a.out.resolve()
out = root / ('ui-turn-' + a.label)
adb = ['<ANDROID_SDK>/platform-tools/adb', '-s', 'emulator-5584']
prompt = 'Native fixture ' + a.label + ' reply with the test marker'
def run(*args):
    return subprocess.run(adb + list(args), capture_output=True, check=True, timeout=15)
def save(name, value):
    (out / name).write_text(json.dumps(value, indent=2) + '\n')
def screenshot(name):
    (out / name).write_bytes(run('exec-out', 'screencap', '-p').stdout)
def rows():
    return [json.loads(x) for x in (root / 'native-wire.jsonl').read_text().splitlines() if x]
if a.action == 'compose':
    out.mkdir(mode=0o700, exist_ok=False)
    if a.x is None or a.y is None:
        raise SystemExit('Observed composer coordinates required')
    screenshot('before-compose.png')
    receipt = {'label': a.label, 'actualUiInput': True, 'rpcCreatedByDriver': False,
               'startedAtMs': round(time.time() * 1000), 'sendTaps': 0,
               'promptSha256': hashlib.sha256(prompt.encode()).hexdigest(),
               'composerCoordinatesFromInspectedScreenshot': [a.x, a.y],
               'driverSha256': hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest()}
    save('receipt.json', receipt)
    (out / 'observed-ui-turn.py').write_bytes(pathlib.Path(__file__).read_bytes())
    run('shell', 'input', 'tap', str(a.x), str(a.y))
    run('shell', 'input', 'text', prompt.replace(' ', '%s'))
    screenshot('composed.png')
    print('Composed only; inspect screenshot before send.')
elif a.action == 'send':
    receipt = json.loads((out / 'receipt.json').read_text())
    if a.x is None or a.y is None or any(r.get('method') == 'chat.send' and r.get('messageSha256') == receipt['promptSha256'] for r in rows()):
        raise SystemExit('Missing observed coordinates or matching send already exists')
    screenshot('before-send.png')
    intent = {'timestampMs': round(time.time() * 1000), 'promptSha256': receipt['promptSha256'],
              'observedSendCoordinates': [a.x, a.y], 'rootInspectedComposerAndSendScreenshot': True}
    with (out / 'send-intent.json').open('x') as f:
        json.dump(intent, f, indent=2)
    run('shell', 'input', 'tap', str(a.x), str(a.y))
    receipt.update(sendTaps=1, sentAtMs=round(time.time() * 1000))
    save('receipt.json', receipt)
    run('shell', 'input', 'keyevent', 'KEYCODE_BACK')
    print('One send tap recorded; no automatic retry.')
else:
    receipt = json.loads((out / 'receipt.json').read_text())
    events = rows()
    sends = [r for r in events if r.get('direction') == 'request' and r.get('method') == 'chat.send' and r.get('messageSha256') == receipt['promptSha256']]
    if len(sends) != 1:
        raise SystemExit('Expected exactly one matching native wire send')
    sent = sends[0]
    ack = next((r for r in events if r.get('direction') == 'response' and r.get('id') == sent['id'] and r.get('connection') == sent['connection']), None)
    terminal = next((r for r in events if ack and r.get('direction') == 'gateway-event' and r.get('event') == 'chat' and r.get('runId') == ack.get('runId') and r.get('state') in ('final', 'error', 'aborted')), None)
    screenshot('reply-observation.png')
    passed = bool(ack and ack.get('ok') and terminal and terminal.get('state') == 'final' and terminal.get('message', {}).get('fixtureReply') and a.reply_rendered)
    receipt.update(nativeSend=sent, sessionKeySha256=sent['sessionKeySha256'], sendResponse=ack, terminal=terminal,
                   replyRendered=a.reply_rendered, rootVisuallyVerifiedRenderedMarker=a.reply_rendered,
                   status='passed' if passed else 'not-yet-proven', collectedAtMs=round(time.time() * 1000))
    save('receipt.json', receipt)
    print(json.dumps(receipt))
