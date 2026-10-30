# Shipped older-reader probes use separate copied state at identical absolute paths.
import pathlib,shutil,json,hashlib

def probe(label,run,state,fixture,call,stable):
 older=run/('older-reader-'+label+'-state')
 def hashes(directory):return {str(p.relative_to(directory)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(directory.rglob('*')) if p.is_file()}
 before=hashes(state)
 original_receipt=pathlib.Path(fixture['manifestPath']).read_bytes();receipt=json.loads(original_receipt)
 if not older.exists():
  saved=run/('candidate-'+label+'-state');shutil.move(state,saved);shutil.copytree(saved,state,copy_function=shutil.copy2)
  try:
   call(f'{label}-stable-cleanup',['update','cleanup','--yes','--json'],runner=stable,expect=1)
   call(f'{label}-stable-restore',['doctor','--session-sqlite','restore','--session-sqlite-all-agents','--yes','--json'],runner=stable,expect=2)
  finally:shutil.move(state,older);shutil.move(saved,state)
 after=hashes(older)
 def relocated(p):return older/pathlib.Path(p).relative_to(state)
 assert relocated(fixture['manifestPath']).read_bytes()==original_receipt,'older reader mutated v5 receipt'
 archive_root=pathlib.Path(fixture['files'][0]).parent;archive_prefix=str(archive_root.relative_to(state))+'/'
 assert {p:h for p,h in before.items() if p.startswith(archive_prefix)}=={p:h for p,h in after.items() if p.startswith(archive_prefix)},'older reader mutated pending/archive bytes'
 dbrel=str(pathlib.Path(fixture['sqlitePath']).relative_to(state));assert before[dbrel]==after[dbrel],'older reader changed live DB'
 assert not any(relocated(m['sourcePath']).exists() for m in receipt['targets'][0]['completedMoves']),'older reader restored relinquished source'
 cleanup=json.loads((run/f'{label}-stable-cleanup.stdout').read_text());restore=json.loads((run/f'{label}-stable-restore.stdout').read_text())
 assert cleanup['status']=='blocked' and cleanup['totals']['removedFiles']==0
 assert any(a['path']==fixture['manifestPath'] and a['reason']=='unreadable-manifest' for a in cleanup['artifacts'])
 assert restore['ok'] is False and 'newer schema version' in restore['error']['message']
 result={'result':'PASS','manifestVersion':receipt['manifestVersion'],'archiveFilesPreserved':len([p for p in before if p.startswith(archive_prefix)]),'receiptUnchanged':True,'liveDatabaseUnchanged':True,'noRestoredSources':True,'cleanupExitCode':1,'restoreExitCode':2,'restoreGate':'newer shared-state schema, before migration-receipt restore selection','otherChangedPaths':[p for p in sorted(before.keys()|after.keys()) if before.get(p)!=after.get(p)],'cleanup':cleanup,'restore':restore}
 (run/(label+'-compatibility-summary.json')).write_text(json.dumps(result,indent=2)+'\n');return result
