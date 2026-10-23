import pathlib,json,subprocess,os,time,datetime,urllib.request,signal,shutil,hashlib
base=pathlib.Path('/home/proof/.local/share/openclaw-176080-proof')
root=base/'stable-upgrade/fixture-v1';candidate=base/'candidate'
assert json.loads((root/'stable-seed.receipt.json').read_text())['exitCode']==0
head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=candidate,text=True).strip()
build=json.loads((base/'proof/candidate-build-v7.receipt.json').read_text())
assert build['exitCode']==0 and build['sourceHead']==head
assert json.loads((candidate/'dist/build-info.json').read_text())['commit']==head
backup=base/'stable-upgrade/stable-backup-v1';assert backup.exists()
node='/home/proof/.local/share/openclaw-134498-proof/runtime/node-v24.22.1-linux-x64/bin/node'
env=dict(os.environ,PATH=str(pathlib.Path(node).parent)+':/usr/bin:/bin',HOME=str(root/'home'),OPENCLAW_STATE_DIR=str(root/'state'),OPENCLAW_CONFIG_PATH=str(root/'config.json'),OPENCLAW_SKIP_CHANNELS='1',OPENCLAW_SKIP_PROVIDERS='1',OPENCLAW_SKIP_GMAIL_WATCHER='1',OPENCLAW_SKIP_CRON='1',OPENCLAW_SKIP_BROWSER_CONTROL_SERVER='1',OPENCLAW_SKIP_CANVAS_HOST='1',OPENCLAW_UPGRADE_ROOT=str(root),OPENCLAW_PROOF_HEAD=head)
for key in ['OPENCLAW_SYSTEMD_UNIT','LD_PRELOAD','NODE_OPTIONS']:env.pop(key,None)
receipt={'sourceHead':head,'stableBuildInfo':json.loads((root/'stable-seed.receipt.json').read_text())['stableBuildInfo'],'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'backup':str(backup),'phases':[]}
prior=json.loads((root/'upgrade.receipt.json').read_text())
assert prior['sourceHead']==head and prior['doctor']['exitCode']==0
receipt['doctor']=prior['doctor']
receipt['priorAttempt']='upgrade.receipt.json'
receipt['fixtureCorrection']='Normalize SQLite null-prototype rows to serialized JSON data before byte/field comparisons; preserve prior failed assertion and successful Doctor run.'
try:
 for phase in ['candidate-upgrade-v2','candidate-restart-v2']:
  cmd=[node,str(candidate/'openclaw.mjs'),'gateway','--port','19685','--bind','loopback','--allow-unconfigured']
  part={'phase':phase,'command':cmd};receipt['phases'].append(part)
  with (root/(phase+'-gateway.log')).open('w') as log:
   p=subprocess.Popen(cmd,cwd=candidate,env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True);part['pid']=p.pid
   try:
    start=time.monotonic()
    while time.monotonic()-start<120:
     assert p.poll() is None,'candidate exited before readiness'
     try:
      with urllib.request.urlopen('http://127.0.0.1:19685/readyz',timeout=2) as r:ready=json.load(r)
      if ready.get('ready'):break
     except Exception:pass
     time.sleep(.25)
    else:raise RuntimeError('candidate readiness timeout')
    part['readySeconds']=time.monotonic()-start
    with (root/(phase+'-verify.log')).open('w') as out:part['verifyExitCode']=subprocess.call([node,str(base/'proof/verify-stable-upgrade-v2.mjs')],env=dict(env,OPENCLAW_UPGRADE_PHASE=phase),stdout=out,stderr=subprocess.STDOUT,timeout=90)
    assert part['verifyExitCode']==0,'candidate upgrade verification failed'
   finally:
    if p.poll() is None:
     p.send_signal(signal.SIGTERM)
     try:p.wait(timeout=90)
     except subprocess.TimeoutExpired:part['cleanupForcedKill']=True;os.killpg(p.pid,signal.SIGKILL);p.wait()
    part['exitCode']=p.returncode
    assert p.returncode==0 and not part.get('cleanupForcedKill'),'candidate failed clean shutdown'
 receipt['pass']=True
finally:
 receipt['finishedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat()
 receipt['configSha256']=hashlib.sha256((root/'config.json').read_bytes()).hexdigest()
 (root/'upgrade-v2.receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
 print(json.dumps(receipt),flush=True)
