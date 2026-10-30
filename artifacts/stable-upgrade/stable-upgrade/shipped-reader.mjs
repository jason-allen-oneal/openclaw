import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { p as readSessionSqliteMigrationManifest } from './stable/package/dist/session-sqlite-migration-manifest-DJRPZECe.mjs';
const cases = [
  ['stable-emitted-manifest.json', 3],
  ['candidate-pending-manifest.json', undefined],
  ['candidate-disposed-manifest.json', undefined],
];
const results = cases.map(([file, expectedVersion]) => {
  const path = new URL('./run/' + file, import.meta.url);
  const before = fs.readFileSync(path);
  const result = readSessionSqliteMigrationManifest(path);
  assert.equal(result?.manifestVersion, expectedVersion);
  assert.deepEqual(fs.readFileSync(path), before);
  return {file, admittedVersion: result?.manifestVersion ?? null, bytesUnchanged: true, sha256: crypto.createHash('sha256').update(before).digest('hex')};
});
console.log(JSON.stringify({result: 'PASS', boundary: 'Exact published 2026.10.9 manifest reader, independent of earlier shared-state schema gate', cases: results}, null, 2));
