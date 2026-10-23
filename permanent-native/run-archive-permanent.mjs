import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { zstdDecompressSync } from 'node:zlib';
import { setTimeout as sleep } from 'node:timers/promises';
import { connectGateway } from './gateway-rpc.mjs';
const root=process.env.OPENCLAW_PROOF_FSYNC_ROOT;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const save=(name,value)=>fs.writeFileSync(`${root}/${name}.json`,JSON.stringify(value,null,2)+'\n');
const readLines=name=>fs.existsSync(`${root}/${name}`)?fs.readFileSync(`${root}/${name}`,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse):[];
const snapshot=()=>{
  const database = new DatabaseSync(`${root}/state/agents/main/agent/openclaw-agent.sqlite`,{readOnly:true});
  try{return {
    nodes:database.prepare('SELECT session_key,current_session_id FROM session_nodes ORDER BY session_key').all(),
    events:database.prepare('SELECT session_id,seq,event_json,event_zstd,event_utf8_bytes FROM transcript_events ORDER BY session_id,seq').all().map(({event_json,event_zstd,...row})=>({...row,json:event_json??zstdDecompressSync(event_zstd).toString()})),
    quickCheck:database.prepare('PRAGMA quick_check').all(),
  };}finally{database.close();}
};
let client=await connectGateway(process.env.OPENCLAW_PROOF_WS_URL,process.env.OPENCLAW_PROOF_TOKEN,`${root}/rpc.jsonl`);
const first='agent:main:archive-stall-first',next='agent:main:archive-stall-next',retained='agent:main:reconcile-retained';
const timeout=setTimeout(()=>{throw new Error('proof exceeded 450 seconds');},450000);
try {
  for(const key of [first,next,retained]){
    await client.request('sessions.create',{key,agentId:'main',label:key.split(':').at(-1)});
    await client.request('chat.inject',{sessionKey:key,message:`synthetic retained proof ${key}`});
  }
  const before=snapshot();save('before',before);
  fs.writeFileSync(`${root}/arm`,'');
  let firstSettled=false,nextSettled=false;
  const active=client.request('sessions.delete',{key:first,deleteTranscript:true}).finally(()=>{firstSettled=true;});
  const activeOutcome=Promise.allSettled([active]);
  const enteredDeadline=Date.now()+60000;
  while(!fs.existsSync(`${root}/native.jsonl`)){
    assert(!firstSettled,'archive settled without entering native fsync hold');
    assert(Date.now()<enteredDeadline,'did not reach native archive fsync');
    await sleep(25);
  }
  const native=readLines('native.jsonl')[0];
  fs.unlinkSync(`${root}/arm`); // Successor cannot inherit the injected fault.
  const heldStart=Date.now();
  const following=client.request('sessions.delete',{key:next,deleteTranscript:true}).finally(()=>{nextSettled=true;});
  const followingOutcome=Promise.allSettled([following]);
  await sleep(183000);
  const workerEvents=readLines('workers.jsonl').filter(x=>x.url?.includes('session-accessor.sqlite-archive')||x.event==='worker-temporary-file');
  const terminations=workerEvents.filter(x=>x.event==='worker-terminate-request');
  const activeWorker=workerEvents.find(x=>x.event==='worker-created');
  const held={time:Date.now(),firstSettled,nextSettled,workerEvents,nativeThreadExists:fs.existsSync(`/proc/${native.pid}/task/${native.tid}`),stageExists:fs.existsSync(native.path),stageSha256:hash(fs.readFileSync(native.path)),snapshot:snapshot()};
  save('held',held);client.record({event:'native-held-observation',firstSettled,nextSettled,nativeThreadExists:held.nativeThreadExists,stageExists:held.stageExists});
  assert(!firstSettled&&!nextSettled,'archive custody released while native operation remains held');
  assert(held.nativeThreadExists&&held.stageExists,'native worker/staging disappeared while blocked');
  assert.equal(terminations.length,1,'exactly one deadline termination request expected');
  assert.equal(terminations[0].threadId,activeWorker.threadId);
  assert(terminations[0].time-heldStart>170000&&terminations[0].time-heldStart<183000,'termination request outside expected real three-minute boundary');
  assert(!workerEvents.some(x=>x.event==='worker-exit'&&x.threadId===activeWorker.threadId),'worker exit precedes native release');
  assert.equal(workerEvents.filter(x=>x.event==='worker-created').length,1,'successor worker started before native release');
  const deathDeadline=heldStart+250000;
  while(fs.existsSync(`/proc/${native.pid}`)){
    assert(Date.now()<deathDeadline,'Gateway never exited to recover the permanently blocked native worker');
    assert(!fs.existsSync(`${root}/release`),'fault must never be released to obtain recovery');
    await sleep(25);
  }
  const oldProcessDeathObservedAt=Date.now();
  assert(!fs.existsSync(`/proc/${native.pid}/task/${native.tid}`));
  assert(!readLines('native.jsonl').some(e=>e.event==='fsync-released'));
  await Promise.all([activeOutcome,followingOutcome]);
  client.close();
  const readyDeadline=Date.now()+120000;
  for (;;) {
    try {
      const ready=await (await fetch(process.env.OPENCLAW_PROOF_WS_URL.replace('ws:','http:')+'/readyz')).json();
      if(ready.ready) break;
    } catch {}
    assert(Date.now()<readyDeadline,'successor Gateway never became ready');
    await sleep(100);
  }
  client=await connectGateway(process.env.OPENCLAW_PROOF_WS_URL,process.env.OPENCLAW_PROOF_TOKEN,`${root}/rpc.jsonl`);
  const newPid=Number(execFileSync('systemctl',['--user','show',process.env.OPENCLAW_PROOF_UNIT,'--property=MainPID','--value'],{encoding:'utf8'}).trim());
  assert(newPid>0&&newPid!==native.pid,'service must recover with a fresh PID');
  const oldWorkerEvents=readLines('workers.jsonl').filter(e=>e.pid===native.pid&&e.url?.includes('session-accessor.sqlite-archive'));
  assert.equal(oldWorkerEvents.filter(e=>e.event==='worker-created').length,1,'queued successor acquired a worker before original process died');
  const nextResult={value:await client.request('sessions.delete',{key:next,deleteTranscript:true})};
  const afterFailure=snapshot();save('after-failure',afterFailure);
  const initialId=before.nodes.find(n=>n.session_key===first).current_session_id;
  assert.deepEqual(afterFailure.events.filter(e=>e.session_id===initialId),before.events.filter(e=>e.session_id===initialId),'first transcript changed on failed archive');
  const retry=await client.request('sessions.delete',{key:first,deleteTranscript:true});
  assert.equal(retry.deleted,true,'failed archive was not retryable');
  const archives=[];
  for(const archivePath of [...nextResult.value.archived,...retry.archived]){
    const bytes=fs.readFileSync(archivePath);
    const plain=archivePath.endsWith('.zst')?zstdDecompressSync(bytes):bytes;
    const entries=plain.toString().trim().split('\n').map(JSON.parse);
    const source=before.events.filter(e=>e.session_id===entries[0].id).map(e=>JSON.parse(e.json));
    assert.deepEqual(entries,source,'published archive differs from exact original canonical events');
    archives.push({name:path.basename(archivePath),compressedBytes:bytes.length,sha256:hash(bytes),plainBytes:plain.length,plainSha256:hash(plain),sessionId:entries[0].id,exactCanonicalRows:entries.length});
  }
  const after=snapshot();save('after',after);
  assert.equal(archives.length,2,'both queued and originally failed archives are published after recovery');
  const retainedId=before.nodes.find(n=>n.session_key===retained).current_session_id;
  assert.deepEqual(after.events,before.events.filter(e=>e.session_id===retainedId),'exact retained transcript rows survived recovery and both retries');
  assert.deepEqual(after.nodes,before.nodes.filter(n=>n.session_key===retained));
  assert.deepEqual(after.quickCheck.map(row=>row.quick_check),['ok']);
  assert(after.events.length>0&&after.nodes.length===1,'unrelated retained session missing');
  const retainedHistory=await client.request('chat.history',{sessionKey:retained,limit:20});
  assert(JSON.stringify(retainedHistory).includes(`synthetic retained proof ${retained}`));
  const events=readLines('workers.jsonl').filter(x=>x.url?.includes('session-accessor.sqlite-archive'));
  const exit=events.find(x=>x.event==='worker-exit'&&x.threadId===activeWorker.threadId);
  const successorWorkers=events.filter(x=>x.event==='worker-created'&&x.pid===newPid);
  assert(successorWorkers.length>0,'new process performed archive work');
  assert(successorWorkers.every(x=>x.time>=oldProcessDeathObservedAt),'successor worker preceded old process death');
  save('archive-integrity',{sourceHead:process.env.OPENCLAW_PROOF_HEAD,archives,quickCheck:after.quickCheck,stagingRemoved:!fs.existsSync(native.path),orphanedStagePreserved:fs.existsSync(native.path),failedSourcePreserved:true,retrySucceeded:true,retainedHistoryRead:true,terminationRequestedMsAfterNativeObservation:terminations[0].time-heldStart,oldPid:native.pid,newPid,oldProcessDeathObservedAt,native:readLines('native.jsonl')});
  console.log(JSON.stringify({pass:true,archives:archives.length,retrySucceeded:true,oldPid:native.pid,newPid,faultReleased:false}));
}finally{clearTimeout(timeout);client.close();}
