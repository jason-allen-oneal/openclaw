"""Latest-stable storage upgrade and explicit retirement; synthetic state only."""
from pathlib import Path
import json,hashlib,subprocess,shutil
root=Path(__file__).resolve().parent
# Shared command/environment owner; prefix defines functions only, never runs a fixture.
exec((root/'proof.py').read_text().split("if not (run/'seeded')")[0])
from compatibility import probe
fixture=json.loads((run/'fixture.json').read_text());state=run/'state';backup=run/'backup'
assert state.resolve()==root/'run/state' and str(state).startswith('<proof-root>/')
def hashes(directory):return {str(p.relative_to(directory)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(directory.rglob('*')) if p.is_file()}
head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip()
assert subprocess.check_output(['git','status','--porcelain'],cwd=repo,text=True)==''
build={str(p.relative_to(repo)):hashlib.sha256(p.read_bytes()).hexdigest() for p in [repo/'openclaw.mjs',repo/'dist/index.js']}
(run/'candidate-provenance.json').write_text(json.dumps({'head':head,'build':build,'stateIsolation':'synthetic fixture emitted by official v2026.11.2 CLI'},indent=2)+'\n')
if not backup.exists():shutil.copytree(state,backup,copy_function=shutil.copy2)
backup_before=hashes(backup)
start=json.loads((run/'03-stable-sqlite-before.stdout').read_text())
settings_before=json.loads((run/'03a-stable-settings.json').read_text())
stable_package=json.loads((root/'stable/package/package.json').read_text())
assert stable_package['version']=='2026.11.2'
assert start['rows']['schema_meta'][0]['schema_version']==stable_package['openclaw']['schemaVersions']['agent']
protected={p:Path(p).read_bytes() for p in fixture['files']+[fixture['manifestPath']]}
call('04-candidate-normal-doctor-upgrade',['doctor','--fix','--yes','--non-interactive'],runner=candidate,expect=0)
upgraded=call('05-upgraded-sqlite',[],runner=['node',str(root/'snapshot.mjs')],expect=0)
assert upgraded['rows']['session_nodes'][0]['session_key']==start['rows']['session_nodes'][0]['session_key']
assert upgraded['rows']['session_nodes'][0]['current_session_id']==start['rows']['session_nodes'][0]['current_session_id']
assert len(upgraded['rows']['transcript_events'])==len(start['rows']['transcript_events'])==3
for before,after in zip(start['rows']['transcript_events'],upgraded['rows']['transcript_events']):
 assert all(after.get(k)==v for k,v in before.items()),'upgrade changed pre-existing transcript fields'
assert upgraded['integrity']==[{'integrity_check':'ok'}] and upgraded['foreignKeys']==[]
assert all(Path(p).read_bytes()==b for p,b in protected.items()),'Doctor changed protected archive/receipt'
settings_upgraded=read_settings('05a-candidate-upgraded',candidate)
assert settings_upgraded==settings_before
sessions_upgraded=inspect_sessions('05b-candidate-upgraded',candidate)
ordinary=call('06-candidate-ordinary-cleanup',['update','cleanup','--yes','--json'],runner=candidate,expect=1)
assert all(Path(p).read_bytes()==b for p,b in protected.items()),'ordinary cleanup changed protected archive/receipt'
selection=['update','cleanup','--json']
for p in fixture['files']:selection+=['--retire-session-archive',p]
selection+=['--archive-backup',fixture['backupDir']]
dry_before=hashes(state)
dry=call('10-upgraded-retirement-preview',selection+['--dry-run'],runner=candidate,expect=0)
assert dry_before==hashes(state),'explicit dry-run changed state'
assert len([a for a in dry['artifacts'] if a['outcome']=='candidate'])==len(fixture['files'])==3
interrupted=call('11-interrupt-before-second-claim',[],runner=['node','--import',str(repo/'scripts/tsx.mjs'),str(root/'interrupt.mts')],expect=0)
assert interrupted['status']=='blocked'
receipt=json.loads(Path(fixture['manifestPath']).read_text());(run/'candidate-pending-manifest.json').write_text(json.dumps(receipt,indent=2)+'\n')
assert receipt['manifestVersion']==5
assert all(m['artifact']['disposal']['state']=='pending-disposal' for m in receipt['targets'][0]['completedMoves'])
assert sum(Path(m['artifact']['disposal']['claimPath']).exists() for m in receipt['targets'][0]['completedMoves'])==1
pending=probe('12-pending',run,state,fixture,call,stable)
apply=call('13-candidate-resume',selection+['--accept-history-loss','--yes'],runner=candidate,expect=0)
assert apply['status']=='complete' and apply['totals']['removedFiles']==3
assert not any(Path(p).exists() for p in fixture['files'])
after=hashes(state)
replay=call('14-candidate-replay',selection+['--accept-history-loss','--yes'],runner=candidate,expect=0)
assert replay['status']=='complete' and replay['totals']['removedFiles']==0
after_replay=hashes(state)
for p in [fixture['manifestPath'],fixture['sqlitePath']]:assert after[str(Path(p).relative_to(state))]==after_replay[str(Path(p).relative_to(state))]
receipt=json.loads(Path(fixture['manifestPath']).read_text());(run/'candidate-disposed-manifest.json').write_text(json.dumps(receipt,indent=2)+'\n')
assert all(m['artifact']['disposal']['state']=='disposed' and m.get('retirement') for m in receipt['targets'][0]['completedMoves'])
disposed=probe('15-disposed',run,state,fixture,call,stable)
reader=call('16-exact-shipped-manifest-reader',[],runner=['node',str(root/'shipped-reader.mjs')],expect=0)
final=call('17-final-sqlite',[],runner=['node',str(root/'snapshot.mjs')],expect=0)
assert upgraded==final,'retirement changed active database bytes or rows'
assert backup_before==hashes(backup),'independent backup changed'
inspect=call('18-final-inspect',['doctor','--session-sqlite','inspect','--session-sqlite-all-agents','--json'],runner=candidate,expect=0)
assert inspect['totals']['issues']==0 and inspect['totals']['sqliteEntries']==1
settings_final=read_settings('19-final',candidate)
assert settings_final==settings_before
sessions_final=inspect_sessions('20-final',candidate)
assert sessions_final==sessions_upgraded
assert head==subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip()
assert build=={p:hashlib.sha256((repo/p).read_bytes()).hexdigest() for p in build}
summary={'result':'PASS','candidateHead':head,'stableVersion':'2026.11.2','stableAgentSchema':start['rows']['schema_meta'][0]['schema_version'],'candidateAgentSchema':upgraded['rows']['schema_meta'][0]['schema_version'],'stableManifestVersion':json.loads((run/'stable-emitted-manifest.json').read_text())['manifestVersion'],'candidateManifestVersion':5,'nondefaultSettingsPreserved':settings_final,'supportedSessionInspection':sessions_final,'sessionsPreserved':1,'eventsPreserved':3,'retiredFiles':3,'replayRemovedFiles':0,'replayOtherChangedPaths':[p for p in sorted(after.keys()|after_replay.keys()) if after.get(p)!=after_replay.get(p)],'databaseUnchangedByRetirement':True,'backupFilesUnchanged':len(backup_before),'pendingOlderReader':pending['result'],'disposedOlderReader':disposed['result'],'exactShippedManifestReader':reader['result'],'limitations':['Synthetic data; not original reporter installation','Built candidate normal CLI, not package updater/service restart','Fault injection invokes exact-candidate source retirement owner using its progress callback; not OS kill','Official stable package and exact internal dependencies integrity-verified; other dependencies linked read-only from candidate install','No model/channel interaction; owning storage/update/Doctor boundaries only']}
(run/'summary.json').write_text(json.dumps(summary,indent=2)+'\n');print(json.dumps(summary,indent=2))
