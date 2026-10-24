import pathlib,subprocess,hashlib,json,time,os,socket
case=pathlib.Path('<REMOTE_PROOF_ROOT>/native-natural/candidate-retained-ownerfix')
pkg=pathlib.Path('<CURRENT_GATEWAY_PACKAGE>');node=pathlib.Path('<NODE_RUNTIME>/bin/node')
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
prior=case/'gateway-upgrade/cleanup-receipt.json';r=json.loads(prior.read_text())
assert r['status']=='failed' and r['ports']=={'20094':'free','20095':'free'} and all(x['processGone'] for x in r['cleanup'])
for v in [r['owner'],*r['cleanup']]:
 p=pathlib.Path('/proc')/str(v['pid'])
 assert not p.exists() or p.joinpath('stat').read_text().rsplit(')',1)[1].split()[19]!=v['startTicks']
for port in (20094,20095):
 with socket.socket() as s:s.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1);s.bind(('127.0.0.1',port))
assert (case/'node_modules/openclaw').resolve()==pkg
out=case/'doctor-migration';out.mkdir(mode=0o700,exist_ok=False);os.umask(0o077)
env={'PATH':str(node.parent)+':/usr/bin:/bin','HOME':str(case/'home'),'XDG_CACHE_HOME':str(case/'home/cache'),'TMPDIR':str(case/'tmp'),'LANG':'C.UTF-8','OPENCLAW_STATE_DIR':str(case/'state'),'OPENCLAW_CONFIG_PATH':str(case/'config.json'),**{k:'1' for k in ['OPENCLAW_SKIP_CHANNELS','OPENCLAW_SKIP_GMAIL_WATCHER','OPENCLAW_SKIP_CRON','OPENCLAW_SKIP_BROWSER_CONTROL_SERVER','OPENCLAW_SKIP_CANVAS_HOST']}}
cmd=[str(node),str(pkg/'openclaw.mjs'),'doctor','--fix','--non-interactive','--no-workspace-suggestions']
receipt={'case':str(case),'stateDirectory':str(case/'state'),'packageTarget':str(pkg),'buildCommit':json.loads((pkg/'dist/build-info.json').read_text())['commit'],'priorPhase':'gateway-upgrade','priorCleanupSha256':sha(prior),'command':cmd,'configSha256Before':sha(case/'config.json'),'startedAt':time.time(),'noSeed':True,'noAppChanges':True,'driverSha256':sha(pathlib.Path(__file__))}
(out/'doctor.running.json').write_text(json.dumps(receipt,indent=2))
with (out/'doctor.log').open('wb') as log:
 p=subprocess.Popen(cmd,env=env,cwd=pkg,stdout=log,stderr=subprocess.STDOUT)
 receipt['pid']=p.pid;receipt['startTicks']=(pathlib.Path('/proc')/str(p.pid)/'stat').read_text().rsplit(')',1)[1].split()[19];(out/'doctor.running.json').write_text(json.dumps(receipt,indent=2))
 try:code=p.wait(timeout=240)
 except subprocess.TimeoutExpired:p.terminate();code=p.wait(timeout=30);receipt['timedOut']=True
receipt.update(exitCode=code,processGone=not(pathlib.Path('/proc')/str(p.pid)).exists(),finishedAt=time.time(),configSha256After=sha(case/'config.json'),packageLinkUnchanged=(case/'node_modules/openclaw').resolve()==pkg,logSha256=sha(out/'doctor.log'))
(out/'doctor.receipt.json').write_text(json.dumps(receipt,indent=2));print(json.dumps(receipt));raise SystemExit(code)
