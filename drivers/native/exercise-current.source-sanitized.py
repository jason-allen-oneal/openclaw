"""Bounded phase driver: natural idle, actual turns, real provider failure/recovery."""
import argparse, json, pathlib, subprocess, time, urllib.request

p = argparse.ArgumentParser()
p.add_argument('--case', required=True)
p.add_argument('--remote-case', required=True)
a = p.parse_args()
root = pathlib.Path(__file__).resolve().parent
out = root / a.case
assert a.case == 'candidate-current-native'
assert a.remote_case == '<REMOTE_PROOF_ROOT>/native-natural/candidate-current-ef99274'
receipt_path = out / 'exercise.receipt.json'
if receipt_path.exists(): raise SystemExit('Refuse duplicate phase exercise')
ready = json.loads((out / 'native-ready.json').read_text())['timestampMs'] / 1000
deadline = ready + 138
receipt = {'startedAtMs': round(time.time()*1000), 'eventsInjected': False, 'steps': []}
def save(): receipt_path.write_text(json.dumps(receipt, indent=2))
def phase(name):
    req = urllib.request.Request('http://127.0.0.1:19992/phase', data=json.dumps({'name': name}).encode(), headers={'Content-Type':'application/json'})
    with urllib.request.urlopen(req, timeout=5) as r: json.load(r)
    receipt['steps'].append({'phase':name, 'atMs':round(time.time()*1000)})
    save(); print(name, flush=True)
def latest():
    return json.loads((out/'native-observations.json').read_text())[-1]
def wait_for(label, predicate, seconds=20):
    end = min(time.time()+seconds, deadline)
    while time.time()<end:
        if predicate(latest()):
            receipt['steps'].append({'observed':label, 'atMs':round(time.time()*1000), 'state':latest()}); save(); return
        time.sleep(.3)
    raise RuntimeError('Native observation missing: '+label)
def action(label, kind, provider=None):
    if deadline-time.time()<15: raise RuntimeError('Insufficient native window for '+label)
    cmd=['node',str(root/'gateway-action.mjs'),'--out',str(out/label),'--config',str(out/'config.private.json'),'--package',str(root.parent.parent/'179075'),'--url','ws://127.0.0.1:19990','--action',kind,'--phase',label]
    if provider: cmd += ['--provider',provider]
    result=subprocess.run(cmd,timeout=min(105,deadline-time.time()))
    receipt['steps'].append({'action':label,'exitCode':result.returncode});save()
    if result.returncode: raise RuntimeError(label+' failed; preserve receipt, do not retry')
def arm(enabled):
    command = 'python3 -c ' + __import__('shlex').quote('import pathlib,json,time;p=pathlib.Path('+repr(a.remote_case+'/warning-arm.json')+');'+('p.write_text(json.dumps({"provider":"api-01","armedAt":round(time.time()*1000)}))' if enabled else 'p.unlink(missing_ok=True)'))
    subprocess.run(['ssh','-o','BatchMode=yes','GATEWAY_HOST',command],check=True,timeout=10)
try:
    idle=json.loads((out/'phase.json').read_text()); assert idle['name']=='natural-idle'
    wait_for('healthy 732-row chat and provider catalogs',lambda s:s.get('catalogRows')==732 and s.get('providerModelCatalogRows')==732 and not s.get('refreshWarning') and not s.get('providerModelCatalogErrorText'))
    time.sleep(max(0,idle['timestampMs']/1000+45-time.time()))
    phase('idle-agent-turn'); action('idle-turn','turn')
    phase('warning-establishment');arm(True);action('warning-refresh','provider-refresh','api-01')
    wait_for('real warning retained with 732 rows in both owners',lambda s:s.get('catalogRows')==732 and s.get('providerModelCatalogRows')==732 and bool(s.get('refreshWarning')) and bool(s.get('providerModelCatalogErrorText')))
    phase('warning-observation');time.sleep(5)
    phase('warning-agent-turn');action('warning-turn','turn')
    phase('recovery-establishment');arm(False);action('recovery-refresh','provider-refresh','api-01')
    wait_for('both warnings cleared with 732 rows',lambda s:s.get('catalogRows')==732 and s.get('providerModelCatalogRows')==732 and not s.get('refreshWarning') and not s.get('providerModelCatalogErrorText'))
    phase('recovered-idle');time.sleep(8)
    receipt['passed']=True
except BaseException as error:
    receipt['passed']=False;receipt['error']=str(error)
finally:
    receipt['finishedAtMs']=round(time.time()*1000);save();(out/'finish-native').touch()
    print(json.dumps({'passed':receipt['passed'],'error':receipt.get('error')}),flush=True)
raise SystemExit(0 if receipt['passed'] else 1)
