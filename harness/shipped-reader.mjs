import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { p as readSessionSqliteMigrationManifest } from './stable/package/dist/session-sqlite-migration-manifest-iPkR--XD.mjs';
const cases = [
  ['stable-emitted-manifest.json', JSON.parse(fs.readFileSync(new URL('./run/stable-emitted-manifest.json', import.meta.url), 'utf8')).manifestVersion],
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
console.log(JSON.stringify({result: 'PASS', boundary: 'Exact published 2026.11.2 manifest reader, independent of earlier shared-state schema gate', cases: results}, null, 2));
