import json, os, pathlib, socket, subprocess, sys, time, urllib.request
root=pathlib.Path(sys.argv[1]).resolve()
checkout=pathlib.Path(os.environ['OPENCLAW_PROOF_CHECKOUT']).resolve()
root.mkdir(parents=True,exist_ok=True)
(root/'home').mkdir(exist_ok=True)
(root/'state').mkdir(exist_ok=True)
(root/'workspace').mkdir(exist_ok=True)
port=int(os.environ.get('OPENCLAW_PROOF_PORT','19680'))
with socket.socket() as sock: sock.bind(('127.0.0.1',port))
config={'gateway':{'port':port,'mode':'local','bind':'loopback','auth':{'mode':'token','token':'synthetic-archive-proof-token'},'controlUi':{'enabled':False}},'agents':{'defaults':{'workspace':str(root/'workspace')},'entries':{'main':{}}},'plugins':{'allow':[]},'cron':{'enabled':False}}
(root/'config.json').write_text(json.dumps(config))
env={'PATH':os.environ['PATH'],'HOME':str(root/'home'),'LANG':'C.UTF-8','OPENCLAW_STATE_DIR':str(root/'state'),'OPENCLAW_CONFIG_PATH':str(root/'config.json'),'OPENCLAW_SKIP_CHANNELS':'1','OPENCLAW_SKIP_PROVIDERS':'1','OPENCLAW_SKIP_GMAIL_WATCHER':'1','OPENCLAW_SKIP_CRON':'1','OPENCLAW_SKIP_BROWSER_CONTROL_SERVER':'1','OPENCLAW_SKIP_CANVAS_HOST':'1','OPENCLAW_PROOF_FSYNC_ROOT':str(root),'OPENCLAW_PROOF_WORKER_TRACE':str(root/'workers.jsonl'),'OPENCLAW_PROOF_PREAD_ROOT':str(root),'LD_PRELOAD':str(root.parent/'stall-fsync.so')+':'+str(root.parent/'stall-pread.so'),'NODE_OPTIONS':'--import '+str(root.parent/'observe-workers.mjs')}
command=['/usr/bin/node',str(checkout/'openclaw.mjs'),'gateway','--port',str(port),'--bind','loopback','--allow-unconfigured']
log=open(root/'gateway.log','wb')
process=subprocess.Popen(command,cwd=checkout,env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
(root/'gateway-pid').write_text(str(process.pid))
started=time.monotonic()
try:
  while time.monotonic()-started<180:
    if process.poll() is not None: raise RuntimeError('Gateway exited '+str(process.returncode))
    try:
      with urllib.request.urlopen(f'http://127.0.0.1:{port}/readyz',timeout=2) as response:
        result=json.load(response)
      if result.get('ready'):
        print(json.dumps({'pid':process.pid,'port':port,'ready':result,'elapsed_seconds':time.monotonic()-started}),flush=True)
        break
    except Exception: pass
    time.sleep(.25)
  else: raise RuntimeError('Gateway readiness timeout')
except Exception:
  process.terminate()
  try: process.wait(timeout=15)
  except subprocess.TimeoutExpired: process.kill(); process.wait()
  raise
