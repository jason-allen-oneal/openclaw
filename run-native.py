#!/usr/bin/env python3
"""Execute only the dedicated emulator fixture; preserve actual exits and artifact identities."""
import hashlib, json, os, pathlib, re, subprocess, sys, time
ROOT = pathlib.Path(__file__).resolve().parent
REPO = pathlib.Path(os.environ['PAIRING_PROOF_REPO']).resolve()
SERIAL = 'emulator-5580'
OUT = ROOT / sys.argv[1]
SHA = subprocess.check_output(['git','rev-parse','HEAD'], cwd=REPO, text=True).strip()
OWNER = sys.argv[2]
APKDIR = REPO/'apps/android/app/build/outputs/apk/thirdParty/debug'
metadata = json.loads((APKDIR/'output-metadata.json').read_text())
assert len(metadata['elements']) == 1
APK = APKDIR/metadata['elements'][0]['outputFile']
TESTAPK = REPO/'apps/android/app/build/outputs/apk/androidTest/thirdParty/debug/app-thirdParty-debug-androidTest.apk'
assert not OUT.exists()
assert json.loads((REPO/'dist/build-info.json').read_text())['commit'] == SHA
assert subprocess.check_output(['git','status','--porcelain','--untracked-files=no'],cwd=REPO,text=True).strip() == ''
assert subprocess.check_output(['adb','-s',SERIAL,'shell','getprop','ro.hardware'],text=True).strip() in ('ranchu','goldfish')
for p in (APK, TESTAPK): assert p.is_file(), str(p)
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
cmd = ['node','--import',str(REPO/'scripts/tsx.mjs'),str(ROOT/'driver.mjs'),str(REPO),SHA,OWNER,str(OUT)]
hostout = open(ROOT/(OUT.name+'-host-command.log'), 'w')
host = subprocess.Popen(cmd, stdout=hostout, stderr=subprocess.STDOUT, cwd=REPO)
receipts=[]; logcat=None; native_ok=False
try:
    deadline=time.monotonic()+90
    argsfile=OUT/'private-runtime/native-args.json'
    while not argsfile.exists():
        assert host.poll() is None, 'Host driver failed before ready'
        assert time.monotonic()<deadline, 'Host ready timeout'
        time.sleep(.2)
    args=json.loads(argsfile.read_text()); secret=args['token']
    def run(name, argv, timeout=180):
        start=time.time()
        try:
            result=subprocess.run(argv, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, timeout=timeout)
        except subprocess.TimeoutExpired as error:
            captured=error.stdout or b''
            if isinstance(captured, bytes): captured=captured.decode(errors='replace')
            (OUT/(name+'.log')).write_text(captured.replace(secret,'[redacted]'))
            receipts.append({'name':name,'exitCode':None,'timedOutSeconds':timeout})
            raise
        (OUT/(name+'.log')).write_text(result.stdout.replace(secret,'[redacted]'))
        receipt={'name':name,'argv':[str(x).replace(secret,'[synthetic-token]') for x in argv], 'exitCode':result.returncode,'seconds':round(time.time()-start,3)}
        receipts.append(receipt)
        assert result.returncode==0, name+' command failed'
        return result.stdout
    run('install-app',['adb','-s',SERIAL,'install','-r','-t',str(APK)])
    run('install-test',['adb','-s',SERIAL,'install','-r','-t',str(TESTAPK)])
    installed={}
    for name,package,source in [('app','ai.openclaw.app.debug',APK),('test','ai.openclaw.app.debug.test',TESTAPK)]:
        remote=run('installed-'+name,['adb','-s',SERIAL,'shell','pm','path',package]).strip().removeprefix('package:')
        assert '\n' not in remote
        target=OUT/'private-runtime'/('installed-'+name+'.apk')
        run('pull-'+name,['adb','-s',SERIAL,'pull',remote,str(target)])
        assert sha(target)==sha(source)
        installed[name]={'package':package,'builtSha256':sha(source),'installedSha256':sha(target),'bytes':source.stat().st_size}
        target.unlink()
    (OUT/'android-manifest.json').write_text(json.dumps({'candidateSha':SHA,'installed':installed,'emulator':SERIAL,'runnerSha256':sha(pathlib.Path(__file__)),'nativeJUnitPassed':False},indent=2)+'\n')
    run('logcat-clear',['adb','-s',SERIAL,'logcat','-c'])
    rawlog=open(OUT/'private-runtime/native-logcat-raw.log','w')
    logcat=subprocess.Popen(['adb','-s',SERIAL,'logcat','-v','threadtime','*:W','OpenClawGateway:V','DeviceAuth:V','TestRunner:V'],stdout=rawlog,stderr=subprocess.STDOUT)
    instrument=['adb','-s',SERIAL,'shell','am','instrument','-w','-r','-e','class','ai.openclaw.app.gateway.GatewaySessionPairingRecoveryNativeTest','-e','pairingRecoveryProof','true','-e','candidateSha',SHA,'-e','gatewayPort',str(args['gatewayPort']),'-e','controlPort',str(args['controlPort']),'-e','fixtureToken',secret,'ai.openclaw.app.debug.test/androidx.test.runner.AndroidJUnitRunner']
    result=run('native-junit',instrument,timeout=180)
    native_ok='OK (1 test)' in result and 'FAILURES!!!' not in result and 'INSTRUMENTATION_FAILED' not in result
    assert native_ok, 'Native JUnit assertions did not pass'
    exitcode=host.wait(timeout=30)
    receipts.append({'name':'host-driver','exitCode':exitcode})
    assert exitcode==0
    assert json.loads((OUT/'summary.json').read_text())['status']=='passed'
    (OUT/'android-manifest.json').write_text(json.dumps({'candidateSha':SHA,'installed':installed,'emulator':SERIAL,'runnerSha256':sha(pathlib.Path(__file__)),'nativeJUnitPassed':native_ok},indent=2)+'\n')
finally:
    if logcat is not None:
        logcat.terminate(); logcat.wait(timeout=5); rawlog.close()
        raw=(OUT/'private-runtime/native-logcat-raw.log').read_text()
        (OUT/'native-logcat.log').write_text(raw.replace(secret,'[redacted]'))
    if host.poll() is None:
        host.terminate()
        try: host.wait(timeout=15)
        except subprocess.TimeoutExpired: host.kill(); host.wait()
    hostout.close()
    if OUT.exists():
        (OUT/'command-exits.json').write_text(json.dumps({'candidateSha':SHA,'nativeJUnitPassed':native_ok,'hostExitCode':host.returncode,'commands':receipts},indent=2)+'\n')
print(json.dumps({'candidateSha':SHA,'output':str(OUT),'nativeJUnitPassed':native_ok,'hostExitCode':host.returncode}))
