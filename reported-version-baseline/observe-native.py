import collections,datetime,json,pathlib,subprocess,time
root=pathlib.Path(__file__).parent
adb=[str(root.parent.parent/'android-sdk/platform-tools/adb'),'-s','emulator-5584']
app='ai.openclaw.app.debug'
def appfile(name):
 r=subprocess.run(adb+['shell','run-as',app,'cat','files/catalog-proof/'+name],capture_output=True,text=True)
 return r.stdout if r.returncode==0 else None
command=adb+['shell','am','instrument','-w','-r','-e','class','ai.openclaw.app.CatalogRefreshProofTest',app+'.test/androidx.test.runner.AndroidJUnitRunner']
receipt={'command':command,'sourceCommit':'dbac7730a12c90e95143f23e556199ab642e639e','observationOnlyPatch':'diagnostic-observation.patch','startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'eventsInjected':False}
start=time.monotonic()
subprocess.run(adb+['shell','run-as',app,'rm','-rf','files/catalog-proof'],check=True)
subprocess.run(adb+['logcat','-c'],check=True)
with (root/'native-logcat.private.log').open('wb')as logs,(root/'native-instrumentation.log').open('wb')as native_log:
 logcat=subprocess.Popen(adb+['logcat','-v','threadtime'],stdout=logs,stderr=subprocess.STDOUT)
 native=subprocess.Popen(command,stdout=native_log,stderr=subprocess.STDOUT)
 try:
  while time.monotonic()-start<150:
   if (appfile('ready')or'').strip()=='ready':break
   if native.poll() is not None:raise RuntimeError('Instrumentation exited before ready')
   time.sleep(.5)
  else:raise RuntimeError('Native observation did not become ready')
  ready=time.monotonic();receipt['readyAt']=datetime.datetime.now(datetime.timezone.utc).isoformat()
  while time.monotonic()-ready<120:
   if native.poll() is not None:raise RuntimeError('Instrumentation exited during observation')
   time.sleep(1)
  receipt['observationSeconds']=time.monotonic()-ready
 except BaseException as error:
  receipt['captureError']=str(error)
 finally:
  subprocess.run(adb+['shell','run-as',app,'touch','files/catalog-proof/finish'],capture_output=True)
  try:receipt['instrumentationExitCode']=native.wait(timeout=40)
  except subprocess.TimeoutExpired:native.terminate();receipt['instrumentationExitCode']=native.wait(timeout=10)
  logcat.terminate();logcat.wait(timeout=10)
for name in ['observations.json','native-ui.png']:
 r=subprocess.run(adb+['exec-out','run-as',app,'cat','files/catalog-proof/'+name],capture_output=True)
 if r.returncode==0:(root/('native-'+name if name=='observations.json'else name)).write_bytes(r.stdout)
output=(root/'native-instrumentation.log').read_text()
receipt['instrumentationPassed']='OK (1 test)'in output and 'FAILURES!!!'not in output
receipt['completedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();receipt['totalSeconds']=time.monotonic()-start
records=[json.loads(line)for line in(root/'native-wire.jsonl').read_text().splitlines()]
receipt['requestCounts']=dict(collections.Counter(r['method']for r in records if r.get('direction')=='request'))
receipt['eventCounts']=dict(collections.Counter(r['event']for r in records if r.get('direction')=='gateway-event'))
receipt['captureComplete']=not receipt.get('captureError')and receipt['instrumentationPassed']
(root/'native.receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps(receipt),flush=True)
raise SystemExit(0 if receipt['captureComplete']else 1)
