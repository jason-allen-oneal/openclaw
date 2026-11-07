from pathlib import Path
import os,subprocess,time,json,shutil
root=Path(__file__).parent
cfg=json.loads((root/'sender-original-process.json').read_text())
sdk=Path(cfg['env']['ANDROID_HOME']); adb=str(sdk/'platform-tools/adb')
modem=Path(cfg['env']['ANDROID_AVD_HOME'])/'openclaw_pairing_194423.avd/modem_simulator'
backup=root/'self-loopback-sim-backup'
shutil.copytree(modem,backup)
args=[str(sdk/'emulator/emulator'),*cfg['args'][1:],'-phone-number','5580']
summary={'args':args,'mode':'virtual-radio self-loopback','control':None,'longMessages':None}
with (root/'self-loopback-emulator.log').open('w') as log:
 p=subprocess.Popen(args,env={**os.environ,**cfg['env']},stdout=log,stderr=subprocess.STDOUT)
summary['pid']=p.pid
(root/'self-loopback-process.json').write_text(json.dumps(summary,indent=2))
def adbcall(*args):
 return subprocess.run([adb,'-s','emulator-5580',*args],capture_output=True,text=True,timeout=20)
try:
 for _ in range(100):
  if p.poll() is not None:raise RuntimeError('emulator exited')
  if adbcall('shell','getprop','sys.boot_completed').stdout.strip()=='1':break
  time.sleep(2)
 else:raise RuntimeError('boot timeout')
 print('Emulator booted; short control starting',flush=True)
 time.sleep(5)
 summary['control']=subprocess.run(['python3',str(root/'run-self-loopback.py'),'self-loopback-control','control'],timeout=200).returncode
 if summary['control']==0:
  print('Short Inbox control passed; framework-denial long messages starting',flush=True)
  summary['longMessages']=subprocess.run(['python3',str(root/'run-self-loopback.py'),'self-loopback-denial'],timeout=200).returncode
 else:print('Short Inbox control failed; stopping before long assertions',flush=True)
 (root/'self-loopback-radio.log').write_text(adbcall('logcat','-b','radio','-d','-v','threadtime').stdout)
 (root/'self-loopback-inbox.txt').write_text(adbcall('shell','content','query','--uri','content://sms/inbox','--projection','date:body:type','--where',"body LIKE 'sms%' ").stdout)
 summary['hiddenPolicy']=adbcall('shell','settings','get','global','hidden_api_policy').stdout.strip()
finally:
 adbcall('emu','kill')
 try:p.wait(timeout=20)
 except subprocess.TimeoutExpired:p.terminate();p.wait(timeout=10)
 for saved in backup.rglob('*'):
  if saved.is_file():
   target=modem/saved.relative_to(backup);target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(saved,target)
 summary['simConfigurationRestored']=all((modem/f.relative_to(backup)).read_bytes()==f.read_bytes() for f in backup.rglob('*') if f.is_file())
 summary['emulatorStopped']=p.poll() is not None
 (root/'self-loopback-result.json').write_text(json.dumps(summary,indent=2)+'\n')
 print(json.dumps(summary),flush=True)
