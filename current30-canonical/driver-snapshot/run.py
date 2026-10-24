#!/usr/bin/env python3
"""Prepare or run a bounded, owned official Gateway/native-discovery diagnostic.

No product patch, direct SQLite access/locks, artificial RSS, real credentials, paid
inference or live service changes. Native Codex protocol implementation is synthetic.
"""
import argparse, hashlib, json, os, pathlib, re, shutil, signal, socket, subprocess, sys, time, urllib.request

BASE=pathlib.Path(__file__).resolve().parent
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--name',required=True)
p.add_argument('--run',action='store_true',help='Without this flag, prepare files only.')
p.add_argument('--package',default='/fixture-runtime/openclaw-179075-reported-gateway/runtime/node_modules/openclaw')
p.add_argument('--node',default='/fixture-runtime/openclaw-134498-proof/runtime/node-v24.22.1-linux-x64/bin/node')
p.add_argument('--agents',type=int,default=30)
p.add_argument('--native-version',default='0.155.1')
p.add_argument('--config-style',choices=['legacy','current'],default='legacy')
p.add_argument('--seconds',type=int,default=180)
p.add_argument('--model-delay-ms',type=int,default=3500)
p.add_argument('--port',type=int,default=20194)
p.add_argument('--max-descendants',type=int,default=96)
p.add_argument('--codex-mode',choices=['enabled','disabled','absent'],default='enabled')
a=p.parse_args()
if not re.fullmatch(r'[a-zA-Z0-9_-]+',a.name):p.error('name must be one safe path component')
if not (1<=a.agents<=30 and 30<=a.seconds<=240 and 0<=a.model_delay_ms<=120000 and 1<=a.max_descendants<=96):p.error('bounded limits exceeded')
case=BASE/a.name;case.mkdir(mode=0o700) # never overwrite or reuse a run
for sub in ['home','state','tmp','bin','driver-snapshot']:(case/sub).mkdir(mode=0o700)
def write(name,value):
 f=case/name;f.write_text(json.dumps(value,indent=2));f.chmod(0o600)
def event(name,value):
 with (case/name).open('a') as f:f.write(json.dumps(value)+'\n')
for name in ['run.py','codex-fixture.mjs','inference-server.mjs']:shutil.copy2(BASE/name,case/'driver-snapshot'/name)
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
node=pathlib.Path(a.node).resolve();pkg=pathlib.Path(a.package).resolve()
entries={}
for i in range(a.agents):
 name='main' if i==0 else f'agent{i:02d}'
 home=case/'state/agents'/name
 for sub in ['agent','sessions','workspace']:(home/sub).mkdir(parents=True,mode=0o700,exist_ok=True)
 entries[name]={'workspace':str(home/'workspace'),'agentDir':str(home/'agent'),'tools':{'deny':['*']}}
rows=[{'id':f'model-{i}','name':f'Static fixture model {i}','reasoning':False,'input':['text'],'contextWindow':32768,'maxTokens':4096,'cost':{'input':0,'output':0,'cacheRead':0,'cacheWrite':0}} for i in range(732)]
codex={'enabled':a.codex_mode=='enabled','config':{'appServer':{'transport':'stdio','command':str(node),'args':[str(case/'driver-snapshot/codex-fixture.mjs'),'app-server'],'homeScope':'agent'},'discovery':{'enabled':True,'timeoutMs':2500},'sessionCatalog':{'enabled':False}}}
config={'gateway':{'port':a.port,'mode':'local','bind':'loopback','auth':{'mode':'token','token':'synthetic-multiagent-fixture-only-token'},'controlUi':{'enabled':False}},'agents':{'defaults':{'model':{'primary':'fixture/model-0'},'models':{f'fixture/{r["id"]}':{} for r in rows}},'entries':entries},'models':{'mode':'merge','providers':{'fixture':{'api':'openai-completions','baseUrl':'http://127.0.0.1:20095/v1','apiKey':'synthetic-only-key','request':{'allowPrivateNetwork':True},'models':rows}}},'plugins':{'allow':['codex'],'entries':{} if a.codex_mode=='absent' else {'codex':codex}},'cron':{'enabled':False},'logging':{'file':str(case/'gateway-private.log')}}
if a.config_style=='current':
 defaults=config['agents']['defaults'];defaults['modelPolicy']={'allow':list(defaults.pop('models'))};defaults['systemAgent']={'agentId':'main'};defaults['heartbeat']={'agentId':'main'};config['agents']['ownership']='explicit'
write('config.json',config)
receipt={'status':'prepared','syntheticProvider':True,'realCredentials':False,'paidInference':False,'productModified':False,'directDatabaseManipulation':False,'parameters':vars(a),'case':str(case),'driverHashes':{f.name:sha(f) for f in (case/'driver-snapshot').iterdir()},'configSha256':sha(case/'config.json')}
write('runtime-state.json',receipt)
if not a.run:print(json.dumps({'status':'prepared-only','case':str(case)}));sys.exit(0)
if not node.is_file() or not (pkg/'openclaw.mjs').is_file():raise SystemExit('Runtime not found; prepared files retained; no process launched')
write('identity.json',{'build':json.loads((pkg/'dist/build-info.json').read_text()),'entrySha256':sha(pkg/'openclaw.mjs'),'nodeSha256':sha(node)})
for port in (a.port,20095):
 with socket.socket() as sock:
  sock.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1);sock.bind(('127.0.0.1',port))
env={'PATH':str(node.parent)+':/usr/bin:/bin','HOME':str(case/'home'),'XDG_CACHE_HOME':str(case/'home/cache'),'TMPDIR':str(case/'tmp'),'LANG':'C.UTF-8','OPENCLAW_STATE_DIR':str(case/'state'),'OPENCLAW_CONFIG_PATH':str(case/'config.json'),'CODEX_HOME':str(case/'home/codex'),'OPENAI_API_KEY':'synthetic-native-protocol-only-key','DIAGNOSTIC_CASE':str(case),'DIAGNOSTIC_MODEL_DELAY_MS':str(a.model_delay_ms),'DIAGNOSTIC_NATIVE_VERSION':a.native_version,'OPENCLAW_CODEX_APP_SERVER_BIN':str(node),'OPENCLAW_CODEX_APP_SERVER_ARGS':str(case/'driver-snapshot/codex-fixture.mjs')+' app-server',**{k:'1' for k in ['OPENCLAW_SKIP_CHANNELS','OPENCLAW_SKIP_GMAIL_WATCHER','OPENCLAW_SKIP_CRON','OPENCLAW_SKIP_BROWSER_CONTROL_SERVER','OPENCLAW_SKIP_CANVAS_HOST']}}
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
     ready_once=True;receipt['readyAt']=time.time();receipt['status']='ready';receipt['configPath']=str(case/'config.json');receipt['port']=a.port;write('runtime-ready.json',receipt)
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
 receipt.update(finishedAt=time.time(),elapsedSeconds=time.monotonic()-started,firstFailureObserved=first_failure is not None)
 write('cleanup-receipt.json',receipt);write('runtime-state.json',receipt)
 print(json.dumps({'case':str(case),'status':receipt['status'],'survivors':receipt['survivors'],'portFree':receipt['portFree'],'error':receipt.get('error')}),flush=True)
sys.exit(0 if receipt['status']=='finished' and not receipt['survivors'] else 1)
