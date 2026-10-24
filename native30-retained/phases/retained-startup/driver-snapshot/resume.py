#!/usr/bin/env python3
"""Resume only an owned, cleanly stopped synthetic fixture; state/config remain intact."""
import argparse, copy, hashlib, json, os, pathlib, re, shutil, signal, socket, subprocess, sys, time, urllib.request
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--case',required=True)
p.add_argument('--phase',default='retained-startup')
p.add_argument('--seconds',type=int,default=240)
p.add_argument('--run',action='store_true')
a=p.parse_args()
if not 30<=a.seconds<=240 or not re.fullmatch(r'[a-zA-Z0-9_-]+',a.phase):p.error('bounded seconds/phase required')
base_case=pathlib.Path(a.case).resolve()
if base_case.parent!=pathlib.Path(__file__).resolve().parent:p.error('case must be a direct child of this owned fixture root')
old=json.loads((base_case/'cleanup-receipt.json').read_text())
seed=json.loads((base_case/'session-seed-receipt.json').read_text())
if old.get('status')!='finished' or old.get('survivors') or not old.get('portFree'):raise SystemExit('Prior cleanup did not pass')
if seed.get('status')!='seeded' or len(seed.get('sessions',[]))!=30:raise SystemExit('Thirty successful natural session creates required')
requested_seconds=a.seconds
a.seconds=min(a.seconds,max(0,int(480-old['elapsedSeconds']-35)))
if a.seconds<30:raise SystemExit('Insufficient room in 480-second combined runtime/cleanup budget')
def sha(path):
 h=hashlib.sha256()
 with path.open('rb') as f:
  for block in iter(lambda:f.read(1024*1024),b''):h.update(block)
 return h.hexdigest()
config_transition=None
if sha(base_case/'config.json')!=old['configSha256']:
 backup=base_case/'config.json.bak'
 if not backup.exists() or sha(backup)!=old['configSha256']:raise SystemExit('No source-bound config backup; refuse resume')
 original=json.loads(backup.read_text());retained=json.loads((base_case/'config.json').read_text());normalized=copy.deepcopy(retained)
 if normalized.pop('meta',None)!={'migrations':{'modelPolicyAllowlist':True,'utilityModelSeparation':True},'lastTouchedVersion':'2026.9.6'}:raise SystemExit('Unrecognized startup migration metadata')
 ag=normalized['agents'];defaults=ag['defaults']
 if ag.pop('ownership',None)!='explicit' or defaults.pop('heartbeat',None)!={'agentId':'main'} or defaults.pop('systemAgent',None)!={'agentId':'main'}:raise SystemExit('Unrecognized startup ownership normalization')
 if defaults.pop('modelPolicy',None)!={'allow':list(original['agents']['defaults']['models'])}:raise SystemExit('Unrecognized model-policy migration')
 if normalized!=original:raise SystemExit('Other config changes; refuse resume')
 config_transition={'reason':'Gateway 2026.9.6 automatic first-start config normalization; retained unchanged for cold restart','beforeSha256':old['configSha256'],'afterSha256':sha(base_case/'config.json'),'backupMatchesOriginal':True,'semanticDeltaVerified':True}

for ident in old.get('descendantsObserved',[]):
 try:
  stat=(pathlib.Path('/proc')/str(ident['pid'])/'stat').read_text().rsplit(')',1)[1].split()
  if stat[19]==ident['startTicks'] and stat[0]!='Z':raise SystemExit('Prior owned process remains alive; refuse resume')
 except FileNotFoundError:pass
params=old['parameters'];a.port=params['port'];a.model_delay_ms=params['model_delay_ms'];a.max_descendants=params['max_descendants'];a.native_version=params.get('native_version','0.155.1')
node=pathlib.Path(params['node']).resolve();pkg=pathlib.Path(params['package']).resolve()
build=json.loads((base_case/'identity.json').read_text())
if sha(node)!=build['nodeSha256'] or sha(pkg/'openclaw.mjs')!=build['entrySha256']:raise SystemExit('Runtime identity changed')
if json.loads((pkg/'dist/build-info.json').read_text())!=build['build']:raise SystemExit('Build identity changed')
for name,expected in old['driverHashes'].items():
 if sha(base_case/'driver-snapshot'/name)!=expected:raise SystemExit('Original driver snapshot changed')
for port in (a.port,20095):
 with socket.socket() as sock:
  sock.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1);sock.bind(('127.0.0.1',port))
case=base_case/'phases'/a.phase;case.mkdir(parents=True,mode=0o700)
(case/'driver-snapshot').mkdir(mode=0o700)
for name in ['codex-fixture.mjs','inference-server.mjs']:shutil.copy2(base_case/'driver-snapshot'/name,case/'driver-snapshot'/name)
shutil.copy2(__file__,case/'driver-snapshot/resume.py')
# Evidence copy for parent clients; Gateway still receives the original exact config path.
shutil.copy2(base_case/'config.json',case/'config.json')
def write(name,value):
 f=case/name;f.write_text(json.dumps(value,indent=2));f.chmod(0o600)
def event(name,value):
 with (case/name).open('a') as f:f.write(json.dumps(value)+'\n')
def state_inventory():
 rows=[]
 for f in sorted((base_case/'state').rglob('*')):
  if f.is_file() and not f.is_symlink():
   st=f.stat();rows.append({'path':str(f.relative_to(base_case/'state')),'bytes':st.st_size,'sha256':sha(f)})
 return rows
before=state_inventory();write('state-before.json',before)
db_agents=sorted({row['path'].split('/')[1] for row in before if row['path'].startswith('agents/') and row['path'].endswith('/agent/openclaw-agent.sqlite')})
if len(db_agents)!=30:raise SystemExit(f'Expected 30 actual agent databases, observed {len(db_agents)}; no runtime launched')
private_log=pathlib.Path(json.loads((base_case/'config.json').read_text())['logging']['file'])
private_offset=private_log.stat().st_size if private_log.exists() else 0
receipt={**{k:old[k] for k in ['syntheticProvider','realCredentials','paidInference','productModified','directDatabaseManipulation','configSha256']},'status':'prepared','case':str(case),'sourceCase':str(base_case),'parameters':params,'phase':a.phase,'seconds':a.seconds,'requestedSeconds':requested_seconds,'driverHashes':{f.name:sha(f) for f in (case/'driver-snapshot').iterdir()},'sourceCleanupSha256':sha(base_case/'cleanup-receipt.json'),'seedReceiptSha256':sha(base_case/'session-seed-receipt.json'),'stateBeforeSha256':sha(case/'state-before.json'),'agentDatabases':db_agents,'privateLogStartByte':private_offset}
receipt['retainedConfigSha256']=sha(base_case/'config.json');receipt['configTransition']=config_transition
write('identity.json',build);write('runtime-state.json',receipt)
def capture_private_log_delta():
 if private_log.exists():
  with private_log.open('rb') as src,(case/'gateway-private-phase.log').open('wb') as dest:
   src.seek(private_offset);shutil.copyfileobj(src,dest)
if not a.run:print(json.dumps({'status':'verified-prepared-only','case':str(case),'agentDatabases':len(db_agents)}));sys.exit(0)
env={'PATH':str(node.parent)+':/usr/bin:/bin','HOME':str(base_case/'home'),'XDG_CACHE_HOME':str(base_case/'home/cache'),'TMPDIR':str(base_case/'tmp'),'LANG':'C.UTF-8','OPENCLAW_STATE_DIR':str(base_case/'state'),'OPENCLAW_CONFIG_PATH':str(base_case/'config.json'),'CODEX_HOME':str(base_case/'home/codex'),'OPENAI_API_KEY':'synthetic-native-protocol-only-key','DIAGNOSTIC_CASE':str(case),'DIAGNOSTIC_MODEL_DELAY_MS':str(a.model_delay_ms),'DIAGNOSTIC_NATIVE_VERSION':a.native_version,'OPENCLAW_CODEX_APP_SERVER_BIN':str(node),'OPENCLAW_CODEX_APP_SERVER_ARGS':str(base_case/'driver-snapshot/codex-fixture.mjs')+' app-server',**{k:'1' for k in ['OPENCLAW_SKIP_CHANNELS','OPENCLAW_SKIP_GMAIL_WATCHER','OPENCLAW_SKIP_CRON','OPENCLAW_SKIP_BROWSER_CONTROL_SERVER','OPENCLAW_SKIP_CANVAS_HOST']}}
started=time.monotonic();stopping=False;owned=[];known={};log_offset=0;first_failure=None
def stop(sig,frame):
 global stopping
 stopping=True;receipt['stopSignal']=sig
signal.signal(signal.SIGTERM,stop);signal.signal(signal.SIGINT,stop)
def identity(pid):
 try:
  q=pathlib.Path('/proc')/str(pid);stat=(q/'stat').read_text().rsplit(')',1)[1].split();status=(q/'status').read_text()
  rss=re.search(r'^VmRSS:\s+(\d+)',status,re.M)
  return {'pid':pid,'ppid':int(stat[1]),'state':stat[0],'startTicks':stat[19],'rssKb':int(rss.group(1)) if rss else 0,'threads':len(list((q/'task').iterdir())),'command':(q/'cmdline').read_bytes().replace(b'\0',b' ').decode(errors='replace')}
 except (OSError,ValueError):return None
def spawn(label,cmd):
 with (case/(label+'.log')).open('wb') as out:child=subprocess.Popen(cmd,stdout=out,stderr=subprocess.STDOUT,start_new_session=True,env=env,cwd=case)
 ident=identity(child.pid);owned.append((label,child,ident));known[child.pid]=ident;receipt[label]=ident;write('runtime-state.json',receipt);return child
def census():
 allp={int(q.name):identity(int(q.name)) for q in pathlib.Path('/proc').iterdir() if q.name.isdigit()};allp={k:v for k,v in allp.items() if v}
 descendants={c.pid for _,c,_ in owned}|{pid for pid,v in known.items() if pid in allp and allp[pid]['startTicks']==v['startTicks']}
 while True:
  new={pid for pid,v in allp.items() if v['ppid'] in descendants}
  if new<=descendants:break
  descendants|=new
 rows=[allp[pid] for pid in descendants if pid in allp];known.update({r['pid']:r for r in rows});return rows
try:
 receipt.update(status='running',startedAt=time.time(),hardLifetimeSeconds=a.seconds+35)
 inference=spawn('inference',[str(node),str(case/'driver-snapshot/inference-server.mjs'),'--out',str(case),'--seconds','300'])
 gateway=spawn('gateway',[str(node),str(pkg/'openclaw.mjs'),'gateway','--port',str(a.port),'--bind','loopback','--allow-unconfigured'])
 next_sample=0;ready_once=False
 failure_re=re.compile(r'SQLITE_BUSY|database is locked|agent database admission|admission.*closed|openingFailed|heartbeat.*fail|worker.*(?:lost|exit|error)|state.*lifecycle.*(?:fail|error)',re.I)
 while time.monotonic()-started<a.seconds and not stopping and not (case/'stop-request').exists():
  elapsed=time.monotonic()-started
  if elapsed>=next_sample:
   next_sample=elapsed+1;rows=census();sample={'timeMs':int(time.time()*1000),'elapsedSeconds':elapsed,'processes':rows,'descendantCount':len(rows),'totalRssKb':sum(r['rssKb'] for r in rows),'totalThreads':sum(r['threads'] for r in rows)}
   event('process-census.jsonl',sample)
   if len(rows)>a.max_descendants:raise RuntimeError('Owned descendant cap exceeded')
   if sample['totalRssKb']>6*1024*1024:raise RuntimeError('Observed total owned RSS exceeded 6 GiB experiment cap')
   if sample['totalThreads']>2048:raise RuntimeError('Owned thread cap exceeded')
   log=case/'gateway.log'
   with log.open() as f:
    f.seek(log_offset);lines=f.readlines();log_offset=f.tell()
   for line in lines:
    if failure_re.search(line):
     observation={'observedAtMs':sample['timeMs'],'line':line.rstrip(),'processes':rows};event('failures.jsonl',observation)
     if first_failure is None:first_failure=observation;write('first-failure.json',observation)
   try:
    with urllib.request.urlopen(f'http://127.0.0.1:{a.port}/readyz',timeout=.25) as response:ready=json.load(response)
    event('readiness.jsonl',{'timeMs':sample['timeMs'],'result':ready})
    with urllib.request.urlopen('http://127.0.0.1:20095/healthz',timeout=.25) as response:infer_ready=json.load(response)
    if ready.get('ready') and infer_ready.get('ready') and not ready_once:
     ready_once=True;receipt['readyAt']=time.time();receipt['status']='ready';receipt['configPath']=str(base_case/'config.json');receipt['port']=a.port;write('runtime-ready.json',receipt)
   except Exception as error:event('readiness.jsonl',{'timeMs':sample['timeMs'],'error':str(error)})
  if inference.poll() is not None:raise RuntimeError(f'Inference fixture exited {inference.returncode}')
  if gateway.poll() is not None:raise RuntimeError(f'Gateway exited {gateway.returncode}')
  time.sleep(.1)
 receipt.update(status='finished',stopReason='stop-request' if stopping or (case/'stop-request').exists() else 'bounded-window-complete',readyObserved=ready_once)
except Exception as error:receipt.update(status='failed',error=str(error))
finally:
 census();receipt['descendantsObserved']=list(known.values());receipt['cleanup']=[]
 for label,child,ident in reversed(owned):
  if child.poll() is None:
   try:os.killpg(child.pid,signal.SIGTERM)
   except ProcessLookupError:pass
 deadline=time.monotonic()+20
 while time.monotonic()<deadline and any(c.poll() is None for _,c,_ in owned):time.sleep(.1)
 # Reap every observed PID by identity, including descendants that detached.
 for pid,ident in known.items():
  actual=identity(pid)
  if actual and actual['startTicks']==ident['startTicks'] and actual['state']!='Z':
   try:os.kill(pid,signal.SIGKILL)
   except ProcessLookupError:pass
 for label,child,ident in owned:
  try:child.wait(timeout=2)
  except subprocess.TimeoutExpired:pass
  receipt['cleanup'].append({'label':label,'pid':child.pid,'exitCode':child.returncode})
 receipt['survivors']=[v for pid,ident in known.items() if (v:=identity(pid)) and v['startTicks']==ident['startTicks'] and v['state']!='Z']
 receipt['ports']={}
 for port in (a.port,20095):
  with socket.socket() as sock:
   sock.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1)
   try:sock.bind(('127.0.0.1',port));receipt['ports'][str(port)]='free'
   except OSError:receipt['ports'][str(port)]='occupied'
 receipt['portFree']=all(v=='free' for v in receipt['ports'].values())
 capture_private_log_delta()
 receipt['stateAfter']=state_inventory()
 write('state-after.json',receipt['stateAfter'])
 receipt.update(finishedAt=time.time(),elapsedSeconds=time.monotonic()-started,firstFailureObserved=first_failure is not None)
 write('cleanup-receipt.json',receipt);write('runtime-state.json',receipt)
 print(json.dumps({'case':str(case),'status':receipt['status'],'survivors':receipt['survivors'],'portFree':receipt['portFree'],'error':receipt.get('error')}),flush=True)
sys.exit(0 if receipt['status']=='finished' and not receipt['survivors'] else 1)
