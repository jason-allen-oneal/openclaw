import os, json, tempfile, pathlib, subprocess, hashlib, sys
os.umask(0o077)
base=pathlib.Path('/tmp/openclaw-186088-launcher-proof')
base.chmod(0o700)
repo=pathlib.Path('/home/runner/.local/share/openclaw-worktrees/issue-186088')
root=pathlib.Path(sys.argv[1]) if len(sys.argv)>1 else pathlib.Path(tempfile.mkdtemp(prefix='run-',dir=base))
(root/'home').mkdir(exist_ok=True); (root/'workspace').mkdir(exist_ok=True); (root/'tmp').mkdir(exist_ok=True)
env={'PATH':os.environ['PATH'],'HOME':str(root/'home'),'OPENCLAW_HOME':str(root/'home'),'OPENCLAW_STATE_DIR':str(root/'state'),'OPENCLAW_CONFIG_PATH':str(root/'state/openclaw.json'),'TMPDIR':str(root/'tmp'),'PROOF_ROOT':str(root),'NO_COLOR':'1','TERM':'dumb','TSX_DISABLE_CACHE':'1','TSX_TSCONFIG_PATH':str(repo/'tsconfig.json'),'OPENCLAW_TEST_RUNTIME_LOG':'1'}
node=['node','--import',str(repo/'scripts/tsx.mjs')]
log=json.loads((root/'commands.json').read_text()) if (root/'commands.json').exists() else []
def run(name,script,args=(),expected=0):
 cmd=(['pnpm','--silent','openclaw']+list(args)) if script=='cli.mts' else node+[str(base/script)]+list(args)
 if (root/(name+'.stdout')).exists():
  prior=next(c for c in log if c['name']==name)
  assert prior['exitCode']==expected
  return json.loads((root/'fixture.json').read_text()) if name=='00-setup' else json.loads((root/(name+'.stdout')).read_text())
 p=subprocess.run(cmd,cwd=repo,env=env,text=True,capture_output=True,timeout=180)
 (root/(name+'.stdout')).write_text(p.stdout); (root/(name+'.stderr')).write_text(p.stderr)
 item={'name':name,'argv':cmd,'exitCode':p.returncode,'stdout':name+'.stdout','stderr':name+'.stderr'}; log.append(item)
 (root/'commands.json').write_text(json.dumps(log,indent=2)+'\n')
 print(name, 'exit='+str(p.returncode), flush=True)
 if p.returncode!=expected: print(p.stderr,p.stdout); raise AssertionError((name,p.returncode,expected))
 return json.loads((root/'fixture.json').read_text()) if name=='00-setup' else json.loads(p.stdout)
def files(directory):
 return {str(p.relative_to(directory)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(pathlib.Path(directory).rglob('*')) if p.is_file()}
fixture=json.loads((root/'fixture.json').read_text()) if (root/'fixture.json').exists() else run('00-setup','setup.mts')
state=pathlib.Path(fixture['stateDir']); backup=pathlib.Path(fixture['backupDir'])
backup_before=files(backup); state_before=backup_before
start=run('01-sqlite-before','snapshot.mjs')
assert start['integrity']==[{'integrity_check':'ok'}] and start['foreignKeys']==[]
assert len(start['rows']['session_nodes'])==1 and len(start['rows']['transcript_events'])==3
inspect=run('02-doctor-inspect-before','cli.mts',['doctor','--session-sqlite','inspect','--session-sqlite-all-agents','--json'])
assert inspect['totals']['issues']==0 and inspect['totals']['sqliteEntries']==1
ordinary=run('03-ordinary-cleanup','cli.mts',['update','cleanup','--yes','--json'],1)
assert sorted(item['reason'] for item in ordinary['artifacts'])==['artifact-metadata-changed','historical-import-proof-unavailable']
assert all(pathlib.Path(p).exists() for p in fixture['files'])
ordinary_after=files(state)
protected_paths=[str(pathlib.Path(p).relative_to(state)) for p in fixture['files']+[fixture['manifestPath'],fixture['sqlitePath']]]
assert all(state_before[p]==ordinary_after[p] for p in protected_paths), 'refusal changed protected archive/manifest/active database bytes'
ordinary_other_changes=[p for p in sorted(state_before.keys()|ordinary_after.keys()) if state_before.get(p)!=ordinary_after.get(p)]
dry_state_before=files(state)
selection=['update','cleanup','--json']
for f in fixture['files']: selection+=['--retire-session-archive',f]
selection+=['--archive-backup',fixture['backupDir']]
dry=run('04-explicit-dry-run','cli.mts',selection+['--dry-run'])
assert sorted(item['path'] for item in dry['artifacts'] if item['outcome']=='candidate')==sorted(fixture['files'])
assert dry_state_before==files(state), 'dry-run changed state bytes'
apply=run('05-explicit-apply','cli.mts',selection+['--accept-history-loss','--yes'])
assert apply['status']=='complete' and apply['totals']['removedFiles']==2
assert not any(pathlib.Path(p).exists() for p in fixture['files'])
after_apply=files(state)
again=run('06-explicit-second-apply','cli.mts',selection+['--accept-history-loss','--yes'])
assert again['status']=='complete' and again['totals']['removedFiles']==0
after_second_apply=files(state)
second_apply_changed_paths=[p for p in sorted(after_apply.keys()|after_second_apply.keys()) if after_apply.get(p)!=after_second_apply.get(p)]
assert all(after_apply[p]==after_second_apply[p] for p in [str(pathlib.Path(fixture[k]).relative_to(state)) for k in ['manifestPath','sqlitePath']]), 'idempotent apply changed manifest/active database bytes'
finish=run('07-sqlite-after','snapshot.mjs')
assert start==finish, 'active SQLite bytes/query results changed'
inspect_after=run('08-doctor-inspect-after','cli.mts',['doctor','--session-sqlite','inspect','--session-sqlite-all-agents','--json'])
assert inspect_after['totals']['issues']==0 and inspect_after['totals']['sqliteEntries']==1
assert backup_before==files(backup), 'independent backup altered'
manifest=json.loads(pathlib.Path(fixture['manifestPath']).read_text())
assert manifest['manifestVersion']==5
moves=manifest['targets'][0]['completedMoves']
assert all(m['artifact']['disposal']['state']=='disposed' and m.get('retirement') for m in moves)
assert moves[1]['retirement']['previousArtifact']['identity']==fixture['previousIdentity']
summary={'label':fixture['label'],'result':'PASS','root':str(root),'sqliteSha256BeforeAfter':start['sha256'],'sqliteBytesBeforeAfter':start['bytes'],'sessionEntriesBeforeAfter':1,'transcriptEventsBeforeAfter':3,'ordinaryRefusalReasons':[x['reason'] for x in ordinary['artifacts']],'dryRunCandidates':len(dry['artifacts']),'removedFiles':apply['totals']['removedFiles'],'secondApplyRemovedFiles':again['totals']['removedFiles'],'independentBackupFilesUnchanged':len(backup_before),'allStateFileBytesUnchangedByExplicitDryRun':True,'ordinaryCleanupOtherChangedPaths':ordinary_other_changes,'secondApplyOtherChangedPaths':second_apply_changed_paths,'activeSqliteQueriesAndBytesUnchanged':True,'manifestVersion':manifest['manifestVersion'],'retirementProvenancePreserved':True,'gaps':['Candidate source checkout normal pnpm openclaw launcher, not an npm-installed candidate package','Synthetic isolated data, not original reporter installation','No live Gateway or model execution; no stable-version upgrade performed']}
(root/'summary.json').write_text(json.dumps(summary,indent=2)+'\n'); (base/'latest-run.txt').write_text(str(root)+'\n'); print(json.dumps(summary,indent=2))
