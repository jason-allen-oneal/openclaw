#!/usr/bin/env python3
import hashlib,json,pathlib,subprocess,sys,time
ROOT=pathlib.Path(__file__).resolve().parent
REPO=pathlib.Path(sys.argv[1]).resolve(); OUT=ROOT/sys.argv[2]; OUT.mkdir(exist_ok=False)
SHA=subprocess.check_output(['git','rev-parse','HEAD'],cwd=REPO,text=True).strip()
assert not subprocess.check_output(['git','status','--porcelain','--untracked-files=no'],cwd=REPO,text=True).strip()
SERIAL='emulator-5580'
assert subprocess.check_output(['adb','-s',SERIAL,'shell','getprop','ro.hardware'],text=True).strip() in ('ranchu','goldfish')
APKDIR=REPO/'apps/android/app/build/outputs/apk/thirdParty/debug'
APK=APKDIR/json.loads((APKDIR/'output-metadata.json').read_text())['elements'][0]['outputFile']
TESTAPK=REPO/'apps/android/app/build/outputs/apk/androidTest/thirdParty/debug/app-thirdParty-debug-androidTest.apk'
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
receipts=[]; hostlog=open(OUT/'host.log','w'); host=subprocess.Popen(['node',str(ROOT/'native-driver.mjs'),str(REPO),str(OUT)],stdout=hostlog,stderr=subprocess.STDOUT,cwd=REPO)
def run(name,args,timeout=120):
 start=time.time(); result=subprocess.run(args,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,timeout=timeout)
 (OUT/(name+'.log')).write_text(result.stdout); receipts.append({'name':name,'argv':args,'exitCode':result.returncode,'seconds':round(time.time()-start,3)})
 assert result.returncode==0, name
 return result.stdout
passed=False
try:
 deadline=time.monotonic()+20
 while not (OUT/'host-ready.json').exists():
  assert host.poll() is None and time.monotonic()<deadline
  time.sleep(.1)
 port=json.loads((OUT/'host-ready.json').read_text())['port']
 installed={}
 for name,pkg,source in [('app','ai.openclaw.app.debug',APK),('test','ai.openclaw.app.debug.test',TESTAPK)]:
  run('install-'+name,['adb','-s',SERIAL,'install','-r','-t',str(source)])
  path=run('path-'+name,['adb','-s',SERIAL,'shell','pm','path',pkg]).strip().removeprefix('package:')
  dest=OUT/(name+'.apk'); run('pull-'+name,['adb','-s',SERIAL,'pull',path,str(dest)])
  assert sha(dest)==sha(source)
  installed[name]={'builtSha256':sha(source),'installedSha256':sha(dest),'bytes':source.stat().st_size}; dest.unlink()
 args=['adb','-s',SERIAL,'shell','am','instrument','-w','-r','-e','class','ai.openclaw.app.gateway.GatewaySessionInboundRecoveryNativeTest','-e','inboundRecoveryProof','true','-e','candidateSha',SHA,'-e','fixturePort',str(port),'ai.openclaw.app.debug.test/androidx.test.runner.AndroidJUnitRunner']
 result=run('native-junit',args)
 passed='OK (1 test)' in result and 'FAILURES!!!' not in result and 'INSTRUMENTATION_FAILED' not in result
 assert passed, result
 observations=json.loads((OUT/'host-observations.json').read_text())
 assert observations['connections']==2 and observations['closes']==[{'connection':1,'code':1013,'reason':'Gateway inbound backlog exceeded'}]
 health=[x for x in observations['requests'] if x['method']=='health']; assert len(health)==301 and health[0]['connection']==1 and all(x['connection']==2 for x in health[1:])
 (OUT/'summary.json').write_text(json.dumps({'status':'passed','candidateSha':SHA,'nativeTests':1,'wireCloseCode':1013,'acceptedOldResponses':1,'replacementHealthResponses':300,'connections':2,'replayedRequests':0,'installed':installed,'driverSha256':sha(ROOT/'native-driver.mjs'),'runnerSha256':sha(pathlib.Path(__file__))},indent=2)+'\n')
finally:
 host.terminate(); host.wait(timeout=15); hostlog.close()
 (OUT/'command-exits.json').write_text(json.dumps({'candidateSha':SHA,'nativePassed':passed,'hostExit':host.returncode,'commands':receipts},indent=2)+'\n')
print(json.dumps({'passed':passed,'candidateSha':SHA,'output':str(OUT)}))
