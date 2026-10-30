import fs from 'node:fs';
const repo = '/home/runner/.local/share/openclaw-worktrees/issue-186088';
const root = process.env.PROOF_ROOT!;
if (root !== '/tmp/openclaw-186088-stable-proof/run') throw new Error('isolated proof only');
const fixture = JSON.parse(fs.readFileSync(`${root}/fixture.json`, 'utf8'));
const { retireSessionSqliteRecovery } = await import(`${repo}/src/commands/doctor-session-sqlite-retirement.ts`);
const { cleanupSessionStateForTest } = await import(`${repo}/src/test-utils/session-state-cleanup.ts`);
const preview = JSON.parse(fs.readFileSync(`${root}/10-upgraded-retirement-preview.stdout`, 'utf8'));
try {
 const result = await retireSessionSqliteRecovery({
   env: process.env,
   retireSessionArchive: fixture.files,
   archiveBackup: fixture.backupDir,
   acceptHistoryLoss: true,
   preview,
   readConfig: async () => JSON.parse(fs.readFileSync(process.env.OPENCLAW_CONFIG_PATH!, 'utf8')),
   confirm: async () => true,
   onProgress: ({phase,index}) => {
      if (phase === 'claiming' && index === 2) throw new Error('proof injection: interrupted before second claim');
   },
 });
 console.log(JSON.stringify(result,null,2));
 if (result.status !== 'blocked') throw new Error('expected controlled interruption');
} finally { await cleanupSessionStateForTest({stateDir:fixture.stateDir,rootPath:root}); }
