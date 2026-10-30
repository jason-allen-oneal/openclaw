exec(open('/tmp/openclaw-186088-stable-proof/proof.py').read().split("if not (run/'seeded')")[0])
from compatibility import probe
candidate=["pnpm","--silent","openclaw"]
fixture=json.loads((run/'fixture.json').read_text());state=run/'state'; backup=run/'backup'
def hashes(directory): return {str(p.relative_to(directory)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(pathlib.Path(directory).rglob('*')) if p.is_file()}
backup_before=hashes(backup)
start=json.loads((run/'03-stable-sqlite-before.stdout').read_text())
snapshot_runner=['node','/tmp/openclaw-186088-real-cli/snapshot.mjs']
upgraded=call('09b-upgraded-sqlite-after-normal-doctor',[],runner=snapshot_runner,expect=0)
assert upgraded['rows']['schema_meta'][0]['schema_version']==38,'Doctor did not upgrade agent DB'
assert upgraded['rows']['session_nodes'][0]['session_key']==start['rows']['session_nodes'][0]['session_key']
assert upgraded['rows']['session_nodes'][0]['current_session_id']==start['rows']['session_nodes'][0]['current_session_id']
assert len(upgraded['rows']['transcript_events'])==len(start['rows']['transcript_events'])
for before, after in zip(start['rows']['transcript_events'], upgraded['rows']['transcript_events']):
 assert all(after[k]==v for k,v in before.items()), 'upgrade changed existing transcript fields'
# Schema 38 adds derived navigation_display/navigation_valid columns; old content remains exact.
assert upgraded['integrity']==[{'integrity_check':'ok'}] and upgraded['foreignKeys']==[]
for p in fixture['files']+[fixture['manifestPath']]:
 assert pathlib.Path(p).read_bytes()==(backup/pathlib.Path(p).relative_to(state)).read_bytes(),'upgrade changed protected archive or original manifest'
selection=['update','cleanup','--json']
for p in fixture['files']:selection+=['--retire-session-archive',p]
selection+=['--archive-backup',fixture['backupDir']]
dry_before=hashes(state)
dry=call('10-upgraded-retirement-preview',selection+['--dry-run'],runner=candidate,expect=0)
assert dry_before==hashes(state)
# Pass current preview to the actual retirement owner for a deterministic crash checkpoint.
interrupted=call('11-interrupt-before-second-claim',[],runner=['node','--import',str(repo/'scripts/tsx.mjs'),str(root/'interrupt.mts')],expect=0)
assert interrupted['status']=='blocked'
receipt=json.loads(pathlib.Path(fixture['manifestPath']).read_text());(run/'candidate-pending-manifest.json').write_text(json.dumps(receipt,indent=2)+'\n')
assert receipt['manifestVersion']==5
assert all(m['artifact']['disposal']['state']=='pending-disposal' for m in receipt['targets'][0]['completedMoves'])
assert sum(pathlib.Path(m['artifact']['disposal']['claimPath']).exists() for m in receipt['targets'][0]['completedMoves'])==1
pending_compat=probe('12-pending',run,state,fixture,call,stable)
apply=call('13-candidate-retirement-resume',selection+['--accept-history-loss','--yes'],runner=candidate,expect=0)
assert apply['status']=='complete' and apply['totals']['removedFiles']==3
assert not any(pathlib.Path(p).exists() for p in fixture['files'])
after=hashes(state)
again=call('14-candidate-retirement-replay',selection+['--accept-history-loss','--yes'],runner=candidate,expect=0)
assert again['status']=='complete' and again['totals']['removedFiles']==0
assert after==hashes(state),'replay changed persisted bytes'
receipt=json.loads(pathlib.Path(fixture['manifestPath']).read_text());(run/'candidate-disposed-manifest.json').write_text(json.dumps(receipt,indent=2)+'\n')
assert receipt['manifestVersion']==5
assert all(m['artifact']['disposal']['state']=='disposed' and m.get('retirement') for m in receipt['targets'][0]['completedMoves'])
disposed_compat=probe('15-disposed',run,state,fixture,call,stable)
finish=call('16-final-sqlite',[],runner=snapshot_runner,expect=0)
assert upgraded==finish,'retirement altered upgraded live SQLite bytes or contents'
assert backup_before==hashes(backup),'retirement modified independent backup'
inspected=call('17-final-candidate-inspect',['doctor','--session-sqlite','inspect','--session-sqlite-all-agents','--json'],runner=candidate,expect=0)
assert inspected['totals']['issues']==0 and inspected['totals']['sqliteEntries']==1
summary={'result':'PASS','stableVersion':'2026.10.9','stableCliCommit':'8b18b55','candidateBase':'f964859d9f2bd045420271b95f6523df70285bd4','candidate':'working tree including issue186088 changes; source Doctor upgrade, normal pnpm openclaw retirement/inspect','stableManifestVersion':3,'candidateManifestVersion':5,'stableAgentSchema':25,'candidateAgentSchema':38,'sessionsPreserved':1,'transcriptEventsPreserved':3,'retiredFiles':3,'replayRemovedFiles':0,'replayAllStateBytesUnchanged':True,'afterUpgradeDatabaseBytesUnchangedByRetirement':True,'archiveAndManifestBytesPreservedByDoctorUpgrade':True,'independentBackupFilesUnchanged':len(backup_before),'pendingOlderReader':pending_compat['result'],'disposedOlderReader':disposed_compat['result'],'gaps':['Doctor migration ran registered source CLI; post-upgrade retirement/inspect used normal built pnpm openclaw launcher; no installed updater replacement or service restart','Stable top-level package and @openclaw internal dependencies downloaded and integrity-verified; remaining dependencies linked read-only from prepared candidate install','Synthetic legacy session data, not original reporter installation','No model/channel interaction; proof exercises owning storage/update/Doctor CLI boundaries','Pending checkpoint uses actual retirement owner with progress-callback exception, not OS kill'],'initialAttempts':['Stable bootstrap initially lacked shipped @openclaw/ai dist; fixed isolated dependency links by downloading exact official dependencies','First candidate attempt refused group-writable scratch ancestor; fixed scratch permissions to 0700','First source session import emitted schema-repair guidance; then real doctor --fix upgraded 25->38']}
(run/'summary.json').write_text(json.dumps(summary,indent=2)+'\n');print(json.dumps(summary,indent=2))
