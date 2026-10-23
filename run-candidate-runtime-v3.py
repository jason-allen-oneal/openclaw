import datetime, hashlib, json, os, pathlib, signal, socket, subprocess, sys, time, urllib.request

proof=pathlib.Path(__file__).resolve().parent
checkout=proof.parent/'candidate'
root=proof/'candidate-archive'
assert not root.exists(), 'Do not overwrite an existing proof attempt'
root.mkdir()
for name in ('home','state','workspace'): (root/name).mkdir()
head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=checkout,text=True).strip()
build=json.loads((proof/'candidate-build-v3.receipt.json').read_text())
assert build['exitCode']==0 and build['sourceHead']==head
port=19680
with socket.socket() as sock: sock.bind(('127.0.0.1',port))
config={'gateway':{'port':port,'mode':'local','bind':'loopback','auth':{'mode':'token','token':'synthetic-archive-proof-token'},'controlUi':{'enabled':False}},'agents':{'defaults':{'workspace':str(root/'workspace')},'entries':{'main':{}}},'plugins':{'allow':[]},'cron':{'enabled':False}}
(root/'config.json').write_text(json.dumps(config))
env={'PATH':'/node-runtime/node-v24.22.1-linux-x64/bin:/usr/bin:/bin','HOME':str(root/'home'),'LANG':'C.UTF-8','OPENCLAW_STATE_DIR':str(root/'state'),'OPENCLAW_CONFIG_PATH':str(root/'config.json'),'OPENCLAW_SKIP_CHANNELS':'1','OPENCLAW_SKIP_PROVIDERS':'1','OPENCLAW_SKIP_GMAIL_WATCHER':'1','OPENCLAW_SKIP_CRON':'1','OPENCLAW_SKIP_BROWSER_CONTROL_SERVER':'1','OPENCLAW_SKIP_CANVAS_HOST':'1','OPENCLAW_PROOF_FSYNC_ROOT':str(root),'OPENCLAW_PROOF_WORKER_TRACE':str(root/'workers.jsonl'),'OPENCLAW_PROOF_PREAD_ROOT':str(root),'LD_PRELOAD':str(proof/'stall-fsync.so')+':'+str(proof/'stall-pread-v2.so'),'NODE_OPTIONS':'--import '+str(proof/'observe-workers-v2.mjs')}
command=['/node-runtime/node-v24.22.1-linux-x64/bin/node',str(checkout/'openclaw.mjs'),'gateway','--port',str(port),'--bind','loopback','--allow-unconfigured']
receipt={'sourceHead':head,'command':command,'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'instrumentationSha256':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in [proof/'observe-workers-v2.mjs',proof/'stall-fsync.c',proof/'stall-pread-v2.c',proof/'run-archive-v2.mjs']}}
process=subprocess.Popen(command,cwd=checkout,env=env,stdout=open(root/'gateway.log','wb'),stderr=subprocess.STDOUT,start_new_session=True)
(root/'gateway-pid').write_text(str(process.pid))
try:
    started=time.monotonic()
    while time.monotonic()-started<180:
        if process.poll() is not None: raise RuntimeError('Gateway exited '+str(process.returncode))
        try:
            with urllib.request.urlopen(f'http://127.0.0.1:{port}/readyz',timeout=2) as response: ready=json.load(response)
            if ready.get('ready'):
                receipt['readySeconds']=time.monotonic()-started
                print('Gateway ready '+str(receipt['readySeconds']),flush=True)
                break
        except Exception: pass
        time.sleep(.25)
    else: raise RuntimeError('Gateway readiness timeout')
    client_env=dict(os.environ,OPENCLAW_PROOF_FSYNC_ROOT=str(root),OPENCLAW_PROOF_WS_URL=f'ws://127.0.0.1:{port}',OPENCLAW_PROOF_TOKEN='synthetic-archive-proof-token',OPENCLAW_PROOF_HEAD=head)
    receipt['driverExitCode']=subprocess.call(['/node-runtime/node-v24.22.1-linux-x64/bin/node',str(proof/'run-archive-v2.mjs')],env=client_env,stdout=open(root/'driver.log','wb'),stderr=subprocess.STDOUT,timeout=330)
finally:
    (root/'release').touch()
    if process.poll() is None:
        process.send_signal(signal.SIGTERM)
        try: process.wait(timeout=60)
        except subprocess.TimeoutExpired:
            receipt['shutdownForced']=True
            os.killpg(process.pid,signal.SIGKILL);process.wait()
    receipt['gatewayExitCode']=process.returncode
    receipt['finishedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat()
    (root/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
    print(json.dumps(receipt),flush=True)
raise SystemExit(receipt.get('driverExitCode',1))
