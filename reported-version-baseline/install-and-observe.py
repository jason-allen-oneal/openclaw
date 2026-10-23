from pathlib import Path
import os,subprocess,json,urllib.request,datetime,time
root=Path(__file__).parent
source=root/'openclaw-dbac7730a12c90e95143f23e556199ab642e639e'
adb=[str(root.parent.parent/'android-sdk/platform-tools/adb'),'-s','emulator-5584']
app='ai.openclaw.app.debug'
build=json.loads((root/'build.receipt.json').read_text());assert build['exitCode']==0
for artifact in build['apks']:
 subprocess.run(adb+['install','-r','-d',str(source/artifact['path'])],check=True)
subprocess.run(adb+['shell','am','force-stop',app],check=True)
subprocess.run(adb+['shell','pm','clear',app],check=True)
subprocess.run(adb+['reverse','tcp:19992','tcp:19992'],check=True)
with urllib.request.urlopen('http://127.0.0.1:19992/setup',timeout=35)as response:setup=json.load(response)
(root/'setup.private.json').write_text(json.dumps(setup,indent=2)+'\n');os.chmod(root/'setup.private.json',0o600)
subprocess.run(adb+['shell','run-as',app,'mkdir','-p','files'],check=True)
subprocess.run(adb+['shell','run-as',app,'tee','files/release-setup-code'],input=setup['setupCode'].encode(),capture_output=True,check=True)
sampler_code='''import os,time,json,datetime,pathlib
root=pathlib.Path('<GATEWAY_TASK_DIR>')
pid=int((root/'gateway.pid').read_text())
print(json.dumps({'samplerPid':os.getpid(),'gatewayPid':pid}),flush=True)
for _ in range(180):
 status=pathlib.Path('/proc',str(pid),'status')
 if not status.exists():break
 fields={line.split(':',1)[0]:line.split(':',1)[1].strip()for line in status.read_text().splitlines()if ':'in line}
 print(json.dumps({'timestampMs':round(time.time()*1000),'gatewayPid':pid,'rss':fields.get('VmRSS'),'threads':fields.get('Threads'),'loadAverage':pathlib.Path('/proc/loadavg').read_text().strip()}),flush=True)
 time.sleep(2)
'''
with(root/'gateway-memory.jsonl').open('wb')as memory:
 sampler=subprocess.Popen(['ssh','ai2','python3','-'],stdin=subprocess.PIPE,stdout=memory,stderr=subprocess.PIPE)
 (root/'memory-sampler.pid').write_text(str(sampler.pid));sampler.stdin.write(sampler_code.encode());sampler.stdin.close()
 try:result=subprocess.run(['python3',str(root/'observe-native.py')])
 finally:
  sampler.terminate()
  try:sampler.wait(timeout=5)
  except subprocess.TimeoutExpired:sampler.kill();sampler.wait()
subprocess.run(adb+['shell','dumpsys','meminfo',app],stdout=(root/'app-memory.txt').open('wb'),check=True)
raise SystemExit(result.returncode)
