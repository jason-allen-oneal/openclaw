from pathlib import Path
import subprocess, time, json, hashlib, sys
root=Path('<SMS_PROOF_ROOT>')
wt=Path('<SMS_WORKTREE>')
sdk=Path('<ANDROID_TOOLING_ROOT>/sdk')
adb=str(sdk/'platform-tools/adb')
sha=subprocess.check_output(['git','rev-parse','HEAD'],cwd=wt,text=True).strip()
dirty=subprocess.check_output(['git','status','--porcelain'],cwd=wt,text=True)
fixture_path='apps/android/app/src/androidTestThirdParty/java/ai/openclaw/app/node/SmsCarrierRecoveryNativeTest.kt'
diagnostic='diagnostic' in sys.argv[2:]
control='control' in sys.argv[2:]
if diagnostic:
 assert dirty.strip()=='M '+fixture_path
else:
 assert dirty==''
run=root/f'native-run-{sys.argv[1]}'
run.mkdir(exist_ok=False)
app=next((wt/'apps/android/app/build/outputs/apk/thirdParty/debug').glob('*.apk'))
test=next((wt/'apps/android/app/build/outputs/apk/androidTest/thirdParty/debug').glob('*.apk'))
serials=['emulator-5580','emulator-5582']
commands=[]
def call(serial,*args,timeout=180):
 r=subprocess.run([adb,'-s',serial,*args],capture_output=True,text=True,timeout=timeout)
 commands.append({'serial':serial,'args':list(args),'returncode':r.returncode,'stdout':r.stdout,'stderr':r.stderr})
 (run/'commands.json').write_text(json.dumps(commands,indent=2)+'\n')
 if r.returncode:raise RuntimeError(f'ADB command failed: {args[0]}')
 return r.stdout.strip()
for serial in serials:
 assert call(serial,'shell','getprop','ro.hardware') in ('ranchu','goldfish')
 call(serial,'install','-r','-g',str(app))
 call(serial,'install','-r',str(test))
 for permission in ['android.permission.SEND_SMS','android.permission.READ_SMS']:
  call(serial,'shell','pm','grant','ai.openclaw.app.debug',permission)
marker=f'sms{int(time.time())}'
start_ms=int(call(serials[1],'shell','date','+%s'))*1000-1000
policy=call(serials[0],'shell','settings','get','global','hidden_api_policy')
summary={'sourceSha':sha,'appSha256':hashlib.sha256(app.read_bytes()).hexdigest(),'testApkSha256':hashlib.sha256(test.read_bytes()).hexdigest(),'marker':marker,'serials':serials,'injection':'App-process EMS cache plus real context-bound TelephonyManager singleton; actual Binder phone-state denial; service state unchanged','physicalCarrierProof':False,'passed':False,'diagnosticOnly':diagnostic,'fixtureSha256':hashlib.sha256((wt/fixture_path).read_bytes()).hexdigest()}
summary['transportAdapter']={'listen':'127.0.0.1:6521','target':'127.0.0.1:33345','mode':'unchanged-byte TCP forwarding to recipient remote-modem host listener; no generated/injected SMS or PDUs'}
summary['transportAdapter']['senderGuestModemPort']=6520
summary['driverSha256']=hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
summary['shortControl']=control
if control:summary['injection']='none; normal framework division and production SmsHandler send'
common=['shell','am','instrument','-w','-r','-e','smsCarrierProof','true','-e','candidateSha',sha,'-e','fixtureMarker',marker]
if control:common+=['-e','shortControl','true']
receiver=None
try:
 if not control:call(serials[0],'shell','settings','put','global','hidden_api_policy','1')
 with (run/'recipient.txt').open('w') as out:
  receiver=subprocess.Popen([adb,'-s',serials[1],*common,'-e','startMillis',str(start_ms),'-e','class','ai.openclaw.app.node.SmsCarrierRecoveryNativeTest#virtualRadioRecipientGetsCompleteShortGsmAndUnicodeMessages','ai.openclaw.app.debug.test/androidx.test.runner.AndroidJUnitRunner'],stdout=out,stderr=subprocess.STDOUT)
 with (run/'sender.txt').open('w') as out:
  sender=subprocess.run([adb,'-s',serials[0],*common,'-e','recipientPort','6521','-e','class','ai.openclaw.app.node.SmsCarrierRecoveryNativeTest#'+('ordinaryShortMessageControl' if control else 'deniedFrameworkDividerStillSubmitsCompleteMessages'),'ai.openclaw.app.debug.test/androidx.test.runner.AndroidJUnitRunner'],stdout=out,stderr=subprocess.STDOUT,timeout=120)
 receiver.wait(timeout=90)
 summary.update(senderExit=sender.returncode,receiverExit=receiver.returncode)
 summary['passed']=all('OK (1 test)' in (run/f'{side}.txt').read_text() for side in ['sender','recipient'])
finally:
 if receiver and receiver.poll() is None:
  receiver.terminate();receiver.wait(timeout=10)
 if policy=='null':call(serials[0],'shell','settings','delete','global','hidden_api_policy')
 else:call(serials[0],'shell','settings','put','global','hidden_api_policy',policy)
 summary['restoredHiddenApiPolicy']=call(serials[0],'shell','settings','get','global','hidden_api_policy')==policy
 (run/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps(summary))
if not summary['passed']:sys.exit(1)
