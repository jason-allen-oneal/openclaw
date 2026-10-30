import fs from 'node:fs';
import path from 'node:path';
const repo = '/home/runner/.local/share/openclaw-worktrees/issue-186088';
const from = (file: string) => import(`${repo}/${file}`);
const root = process.env.PROOF_ROOT!;
const stateDir = process.env.OPENCLAW_STATE_DIR!;
if (!root?.startsWith('/tmp/openclaw-186088-launcher-proof/run-') || !stateDir.startsWith(root + '/')) throw new Error('isolation required');
const sessions = path.join(stateDir, 'agents/main/sessions');
const archiveDir = path.join(stateDir, 'agents/main/session-sqlite-import-archive');
fs.mkdirSync(sessions, {recursive:true});
fs.mkdirSync(archiveDir, {recursive:true});
fs.writeFileSync(process.env.OPENCLAW_CONFIG_PATH!, JSON.stringify({agents:{defaults:{workspace:path.join(root,'workspace')}}}));
const { importSqliteSessionRows } = await from('src/config/sessions/session-accessor.sqlite-import.test-support.ts');
const { cleanupSessionStateForTest } = await from('src/test-utils/session-state-cleanup.ts');
const { resolveTargetSqlitePath } = await from('src/infra/session-sqlite-migration-readers.ts');
const { createSessionSqliteMigrationRun, writeSessionSqliteMigrationManifest } = await from('src/infra/session-sqlite-migration-manifest.ts');
const { readMigrationArtifactIdentity } = await from('src/infra/session-sqlite-migration-artifact.ts');
const target = {agentId:'main', storePath:path.join(sessions,'sessions.json')};
const events = [
 {type:'session',version:3,id:'11111111-1111-4111-8111-111111111111',timestamp:'2026-10-30T12:00:00.000Z'},
 {type:'message',id:'active-user',parentId:null,timestamp:'2026-10-30T12:00:01.000Z',message:{role:'user',content:'Synthetic live SQLite conversation; must survive archive retirement.'}},
 {type:'message',id:'active-assistant',parentId:'active-user',timestamp:'2026-10-30T12:00:02.000Z',message:{role:'assistant',content:'Synthetic preserved assistant response.'}},
];
await importSqliteSessionRows({...target,env:process.env,sessionKey:'agent:main:proof',entry:{sessionId:events[0].id,updatedAt:1793361602000,label:'Isolated retirement proof'},readTranscriptEvents:(append: (event:unknown)=>void)=>events.forEach(append)});
await cleanupSessionStateForTest({stateDir,rootPath:root});
const sqlitePath = resolveTargetSqlitePath(target,process.env);
if (!fs.existsSync(sqlitePath)) throw new Error('No real session SQLite created');
const run = createSessionSqliteMigrationRun(process.env,[{...target,sqlitePath}]);
const files = [path.join(archiveDir,'history.trajectory.jsonl.imported-1'),path.join(archiveDir,'changed.jsonl.imported-1')];
fs.writeFileSync(files[0],JSON.stringify({traceSchema:1,event:'synthetic_unique_historical_event',payload:'Not represented in active SQLite'})+'\n');
fs.writeFileSync(files[1],JSON.stringify({type:'session',version:3,id:'22222222-2222-4222-8222-222222222222'})+'\n');
const previousIdentity = readMigrationArtifactIdentity(files[1]);
const moves = files.map((archivePath,index)=>({archivePath,sourcePath:path.join(sessions,index===0?'history.trajectory.jsonl':'changed.jsonl'),kind:index===0?'trajectory':'transcript',...(index===1?{artifact:{identity:previousIdentity,classification:'imported',reason:'verified-import',dependencies:[],disposal:{state:'retained'}}}:{})}));
run.manifest.targets[0].plannedMoves = structuredClone(moves);
run.manifest.targets[0].completedMoves = structuredClone(moves);
run.manifest.targets[0].validationBeforeArchive = 'passed';
run.manifest.completedAt = run.manifest.startedAt;
writeSessionSqliteMigrationManifest(run);
fs.appendFileSync(files[1],JSON.stringify({type:'message',id:'later-unique',parentId:null,message:{role:'user',content:'Changed bytes after recorded import identity'}})+'\n');
const backupDir = path.join(root,'independent-backup');
fs.cpSync(stateDir,backupDir,{recursive:true,preserveTimestamps:true});
const fixture = {label:'SYNTHETIC ISOLATED NORMAL-LAUNCHER PROOF; NOT ORIGINAL REPORTER INSTALLATION',root,stateDir,backupDir,sqlitePath,files,manifestPath:run.manifestPath,previousIdentity};
fs.writeFileSync(path.join(root,'fixture.json'),JSON.stringify(fixture,null,2)+'\n');
console.log(JSON.stringify(fixture,null,2));
