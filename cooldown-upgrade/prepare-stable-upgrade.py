import pathlib,json,subprocess,os,time,datetime,urllib.request,signal,hashlib
base=pathlib.Path('/home/proof/.local/share/openclaw-176080-proof')
pkg=base/'stable-upgrade/runtime/node_modules/openclaw'
root=base/'stable-upgrade/fixture-v1'
assert not root.exists()
root.mkdir()
for x in ['home','state','workspace']:(root/x).mkdir()
node='/home/proof/.local/share/openclaw-134498-proof/runtime/node-v24.22.1-linux-x64/bin/node'
env=dict(os.environ,PATH=str(pathlib.Path(node).parent)+':/usr/bin:/bin',HOME=str(root/'home'),OPENCLAW_STATE_DIR=str(root/'state'),OPENCLAW_CONFIG_PATH=str(root/'config.json'),OPENCLAW_SKIP_CHANNELS='1',OPENCLAW_SKIP_PROVIDERS='1',OPENCLAW_SKIP_GMAIL_WATCHER='1',OPENCLAW_SKIP_CRON='1',OPENCLAW_SKIP_BROWSER_CONTROL_SERVER='1',OPENCLAW_SKIP_CANVAS_HOST='1',OPENCLAW_UPGRADE_ROOT=str(root))
for key in ['OPENCLAW_SYSTEMD_UNIT','LD_PRELOAD','NODE_OPTIONS']:env.pop(key,None)
config={'gateway':{'port':19685,'mode':'local','bind':'loopback','auth':{'mode':'token','token':'SYNTHETIC_UPGRADE_TOKEN'},'controlUi':{'enabled':False}},'agents':{'defaults':{'workspace':str(root/'workspace'),'timeoutSeconds':97},'entries':{'main':{}}},'messages':{'responsePrefix':'stable-upgrade-preserved'},'plugins':{'allow':[]},'cron':{'enabled':False},'logging':{'level':'info','file':str(root/'gateway-internal.log')}}
(root/'config.json').write_text(json.dumps(config,indent=2)+'\n')
(root/'config-before.json').write_bytes((root/'config.json').read_bytes())
cmd=[node,str(pkg/'openclaw.mjs'),'gateway','--port','19685','--bind','loopback','--allow-unconfigured']
receipt={'command':cmd,'stableBuildInfo':json.loads((pkg/'dist/build-info.json').read_text()),'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}
log=(root/'stable-gateway.log').open('w')
p=subprocess.Popen(cmd,cwd=pkg,env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
receipt['pid']=p.pid
try:
 start=time.monotonic()
 while time.monotonic()-start<120:
  assert p.poll() is None,'stable Gateway exited before readiness'
  try:
   with urllib.request.urlopen('http://127.0.0.1:19685/readyz',timeout=2) as r:ready=json.load(r)
   if ready.get('ready'):break
  except Exception:pass
  time.sleep(.25)
 else:raise RuntimeError('stable readiness timeout')
 receipt['readySeconds']=time.monotonic()-start
 with (root/'stable-seed.log').open('w') as out:receipt['seedExitCode']=subprocess.call([node,str(base/'proof/seed-stable-upgrade.mjs')],env=env,stdout=out,stderr=subprocess.STDOUT,timeout=90)
 assert receipt['seedExitCode']==0,'stable state seeding failed'
finally:
 if p.poll() is None:
  p.send_signal(signal.SIGTERM)
  try:p.wait(timeout=90)
  except subprocess.TimeoutExpired:
   receipt['cleanupForcedKill']=True;os.killpg(p.pid,signal.SIGKILL);p.wait()
 receipt['exitCode']=p.returncode
 receipt['finishedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat()
 receipt['configSha256']=hashlib.sha256((root/'config.json').read_bytes()).hexdigest()
 (root/'stable-seed.receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
 print(json.dumps(receipt),flush=True)
assert receipt['seedExitCode']==0 and receipt['exitCode']==0 and not receipt.get('cleanupForcedKill')
