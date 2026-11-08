import os,json,pathlib,subprocess,hashlib,sys,shutil,tempfile
os.umask(0o077)
root=pathlib.Path('<stable-11-2-proof>'); run=root/'run'; run.mkdir(exist_ok=True)
for n in ['home','workspace','tmp','state/agents/main/sessions']: (run/n).mkdir(parents=True,exist_ok=True)
repo=pathlib.Path('<candidate-checkout>')
safe_tmp=pathlib.Path(tempfile.mkdtemp(prefix='archive-188378-stable-',dir='/tmp'))
(run/'safe-temp-root.txt').write_text(str(safe_tmp)+'\n')
env={'PATH':os.environ['PATH'],'HOME':str(run/'home'),'OPENCLAW_HOME':str(run/'home'),'OPENCLAW_STATE_DIR':str(run/'state'),'OPENCLAW_CONFIG_PATH':str(run/'state/openclaw.json'),'TMPDIR':str(safe_tmp),'XDG_CACHE_HOME':str(safe_tmp/'cache'),'PROOF_ROOT':str(run),'NO_COLOR':'1','TERM':'dumb','TSX_DISABLE_CACHE':'1','TSX_TSCONFIG_PATH':str(repo/'tsconfig.json'),'OPENCLAW_TEST_RUNTIME_LOG':'1'}
stable=['node',str(root/'stable/package/openclaw.mjs')]
candidate=['node',str(repo/'openclaw.mjs')]
log=json.loads((run/'commands.json').read_text()) if (run/'commands.json').exists() else []
def call(name,args,runner=stable,expect=None):
 if (run/(name+'.stdout')).exists():
  p=next(x for x in log if x['name']==name); out=(run/(name+'.stdout')).read_text(); code=p['exitCode']
 else:
  p=subprocess.run(runner+args,cwd=repo,env=env,text=True,capture_output=True,timeout=180); out=p.stdout; code=p.returncode
  (run/(name+'.stdout')).write_text(out); (run/(name+'.stderr')).write_text(p.stderr); log.append({'name':name,'argv':runner+args,'exitCode':code}); (run/'commands.json').write_text(json.dumps(log,indent=2)+'\n')
 print(name,code,flush=True)
 if expect is not None: assert code==expect,(name,code)
 try: return json.loads(out)
 except:
  try: return json.loads(out[out.find("{"):]) if "{" in out else out
  except: return out
def read_settings(label,runner):
 defaults=call(label+'-agent-defaults',['config','get','agents.defaults','--json'],runner=runner,expect=0)
 update=call(label+'-update-settings',['config','get','update','--json'],runner=runner,expect=0)
 mode=call(label+'-gateway-mode',['config','get','gateway.mode','--json'],runner=runner,expect=0)
 observed={'workspace':defaults['workspace'],'userTimezone':defaults['userTimezone'],'channel':update['channel'],'checkOnStart':update['checkOnStart'],'autoEnabled':update['auto']['enabled'],'gatewayMode':mode}
 expected={'workspace':str(run/'workspace'),'userTimezone':'Pacific/Auckland','channel':'beta','checkOnStart':False,'autoEnabled':False,'gatewayMode':'local'}
 assert observed==expected,(label,observed)
 (run/(label+'-settings.json')).write_text(json.dumps(observed,indent=2)+'\n');return observed

def inspect_sessions(label,runner):
 inspect=call(label+'-doctor-inspect',['doctor','--session-sqlite','inspect','--session-sqlite-all-agents','--json'],runner=runner,expect=0)
 assert inspect['totals']['issues']==0 and inspect['totals']['sqliteEntries']==1
 assert inspect['targets'][0]['dbStats']['integrityCheck']=='ok'
 largest=inspect['targets'][0]['dbStats']['largestSessions']
 assert any(row['sessionId']=='11111111-1111-4111-8111-111111111111' and row['events']==3 for row in largest)
 listed=call(label+'-sessions-list',['sessions','--json','--agent','main','--limit','all'],runner=runner,expect=0)
 assert listed['count']==1
 row=listed['sessions'][0]
 assert row['key']=='agent:main:proof' and row['sessionId']=='11111111-1111-4111-8111-111111111111'
 return {'doctorIntegrity':'ok','doctorTranscriptEvents':3,'sessionsListCount':listed['count'],'sessionKey':row['key'],'sessionId':row['sessionId']}

if not (run/'seeded').exists():
 (run/'state/openclaw.json').write_text(json.dumps({'agents':{'defaults':{'workspace':str(run/'workspace'),'userTimezone':'Pacific/Auckland'}},'gateway':{'mode':'local'},'update':{'channel':'beta','checkOnStart':False,'auto':{'enabled':False}}}))
 sessions=run/'state/agents/main/sessions'
 (sessions/'sessions.json').write_text(json.dumps({'agent:main:proof':{'sessionId':'11111111-1111-4111-8111-111111111111','updatedAt':1793361602000,'label':'Stable 11.2 retained session','sessionFile':str(sessions/'11111111-1111-4111-8111-111111111111.jsonl')}}))
 events=[{'type':'session','version':3,'id':'11111111-1111-4111-8111-111111111111','timestamp':'2026-10-30T12:00:00.000Z'},{'type':'message','id':'u1','parentId':None,'timestamp':'2026-10-30T12:00:01.000Z','message':{'role':'user','content':'Synthetic stable conversation must survive candidate retirement.'}},{'type':'message','id':'a1','parentId':'u1','timestamp':'2026-10-30T12:00:02.000Z','message':{'role':'assistant','content':'Synthetic stable response preserved.'}}]
 (sessions/'11111111-1111-4111-8111-111111111111.jsonl').write_text('\n'.join(map(json.dumps,events))+'\n')
 (sessions/'history.trajectory.jsonl').write_text(json.dumps({'type':'trajectory','uniqueHistoricalData':'Synthetic history not imported into active SQLite'})+'\n')
 (run/'seeded').write_text('yes\n')
call('00-stable-version',['--version'],expect=0)
report=call('02-stable-import-with-shipped-internal-deps',['doctor','--session-sqlite','import','--session-sqlite-all-agents','--yes','--json'],expect=0)
print(json.dumps(report,indent=2)[:5000])
state=run/'state'; manifest_path=pathlib.Path(report['migrationRun']['manifestPath'])
original_manifest=json.loads(manifest_path.read_text())
if not (run/'stable-emitted-manifest.json').exists(): shutil.copy2(manifest_path,run/'stable-emitted-manifest.json')
# Intentional fixture change after the shipped importer: same failure class as the issue.
if not (run/'fixture.json').exists():
 moves=original_manifest['targets'][0]['completedMoves']; changed=next(m for m in moves if m['kind']=='transcript')
 with open(changed['archivePath'],'a') as f:f.write(json.dumps({'type':'message','id':'post-import','parentId':None,'message':{'role':'user','content':'Synthetic unique bytes appended after stable import.'}})+'\n')
 fixture={'label':'OFFICIAL STABLE PACKAGED CLI IMPORT -> CANDIDATE BUILT NORMAL CLI, SYNTHETIC ISOLATED STATE','root':str(run),'stateDir':str(state),'backupDir':str(run/'backup'),'sqlitePath':report['targets'][0]['sqlitePath'],'files':[m['archivePath'] for m in moves],'manifestPath':str(manifest_path)}
 (run/'fixture.json').write_text(json.dumps(fixture,indent=2)+'\n')
else:fixture=json.loads((run/'fixture.json').read_text())
def hashes(directory): return {str(p.relative_to(directory)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(pathlib.Path(directory).rglob('*')) if p.is_file()}
protected=fixture['files']+[fixture['sqlitePath'],fixture['manifestPath']]
protected_before={p:hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest() for p in protected}
snapshot_runner=['node',str(root/'snapshot.mjs')]
start=call('03-stable-sqlite-before',[],runner=snapshot_runner,expect=0)
assert start['integrity']==[{'integrity_check':'ok'}] and start['foreignKeys']==[]
assert len(start['rows']['session_nodes'])==1 and len(start['rows']['transcript_events'])==3
read_settings('03a-stable',stable)
inspect_sessions('03b-stable',stable)
if '--prepare-only' in sys.argv: sys.exit(0)
