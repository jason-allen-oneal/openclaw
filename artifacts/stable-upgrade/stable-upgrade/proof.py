import os,json,pathlib,subprocess,hashlib,sys,shutil
os.umask(0o077)
root=pathlib.Path('/tmp/openclaw-186088-stable-proof'); run=root/'run'; run.mkdir(exist_ok=True)
for n in ['home','workspace','tmp','state/agents/main/sessions']: (run/n).mkdir(parents=True,exist_ok=True)
repo=pathlib.Path('/home/runner/.local/share/openclaw-worktrees/issue-186088')
env={'PATH':os.environ['PATH'],'HOME':str(run/'home'),'OPENCLAW_HOME':str(run/'home'),'OPENCLAW_STATE_DIR':str(run/'state'),'OPENCLAW_CONFIG_PATH':str(run/'state/openclaw.json'),'TMPDIR':str(run/'tmp'),'PROOF_ROOT':str(run),'NO_COLOR':'1','TERM':'dumb','TSX_DISABLE_CACHE':'1','TSX_TSCONFIG_PATH':str(repo/'tsconfig.json'),'OPENCLAW_TEST_RUNTIME_LOG':'1'}
stable=['node',str(root/'stable/package/openclaw.mjs')]
candidate=['node','--import',str(repo/'scripts/tsx.mjs'),'/tmp/openclaw-186088-real-cli/cli.mts']
log=json.loads((run/'commands.json').read_text()) if (run/'commands.json').exists() else []
def call(name,args,runner=stable,expect=None):
 if (run/(name+'.stdout')).exists():
  p=next(x for x in log if x['name']==name); out=(run/(name+'.stdout')).read_text(); code=p['exitCode']
 else:
  p=subprocess.run(runner+args,cwd=repo,env=env,text=True,capture_output=True,timeout=100); out=p.stdout; code=p.returncode
  (run/(name+'.stdout')).write_text(out); (run/(name+'.stderr')).write_text(p.stderr); log.append({'name':name,'argv':runner+args,'exitCode':code}); (run/'commands.json').write_text(json.dumps(log,indent=2)+'\n')
 print(name,code,flush=True)
 if expect is not None: assert code==expect,(name,code)
 try: return json.loads(out[out.find("{"):]) if "{" in out else out
 except: return out
if not (run/'seeded').exists():
 (run/'state/openclaw.json').write_text(json.dumps({'agents':{'defaults':{'workspace':str(run/'workspace')}},'gateway':{'mode':'local'}}))
 sessions=run/'state/agents/main/sessions'
 (sessions/'sessions.json').write_text(json.dumps({'agent:main:proof':{'sessionId':'11111111-1111-4111-8111-111111111111','updatedAt':1793361602000,'sessionFile':str(sessions/'11111111-1111-4111-8111-111111111111.jsonl')}}))
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
 fixture={'label':'OFFICIAL STABLE PACKAGED CLI IMPORT -> REGISTERED CANDIDATE SOURCE CLI, SYNTHETIC ISOLATED STATE','root':str(run),'stateDir':str(state),'backupDir':str(run/'backup'),'sqlitePath':report['targets'][0]['sqlitePath'],'files':[m['archivePath'] for m in moves],'manifestPath':str(manifest_path)}
 (run/'fixture.json').write_text(json.dumps(fixture,indent=2)+'\n')
else:fixture=json.loads((run/'fixture.json').read_text())
def hashes(directory): return {str(p.relative_to(directory)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(pathlib.Path(directory).rglob('*')) if p.is_file()}
protected=fixture['files']+[fixture['sqlitePath'],fixture['manifestPath']]
protected_before={p:hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest() for p in protected}
snapshot_runner=['node','/tmp/openclaw-186088-real-cli/snapshot.mjs']
start=call('03-stable-sqlite-before',[],runner=snapshot_runner,expect=0)
assert start['integrity']==[{'integrity_check':'ok'}] and start['foreignKeys']==[]
assert len(start['rows']['session_nodes'])==1 and len(start['rows']['transcript_events'])==3
inspect=call('04b-candidate-inspect-stable-state-private-root',['doctor','--session-sqlite','inspect','--session-sqlite-all-agents','--json'],runner=candidate,expect=0)
assert inspect['totals']['issues']==0 and inspect['totals']['sqliteEntries']==1
migration=call('05-candidate-import-stable-state',['doctor','--session-sqlite','import','--session-sqlite-all-agents','--yes','--json'],runner=candidate,expect=0)
assert migration['totals']['issues']==0
assert protected_before=={p:hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest() for p in protected},'candidate import altered protected bytes'
ordinary=call('06-candidate-ordinary-cleanup',['update','cleanup','--yes','--json'],runner=candidate,expect=1)
assert all(pathlib.Path(p).exists() for p in fixture['files'])
assert protected_before=={p:hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest() for p in protected}
print('ordinary reasons',[x['reason'] for x in ordinary['artifacts']],flush=True)
if not (run/'backup').exists(): shutil.copytree(state,run/'backup',copy_function=shutil.copy2)
backup_before=hashes(run/'backup')
selection=['update','cleanup','--json']
for p in fixture['files']: selection+=['--retire-session-archive',p]
selection+=['--archive-backup',fixture['backupDir']]
dry_before=hashes(state)
dry=call('07-candidate-retirement-preview',selection+['--dry-run'],runner=candidate,expect=0)
assert dry_before==hashes(state),'preview changed state'
assert len([a for a in dry['artifacts'] if a['outcome']=='candidate'])==len(fixture['files'])
print('stable candidate flow through preview PASS',flush=True)
