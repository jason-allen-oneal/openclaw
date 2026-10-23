import fs from 'node:fs';
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
const client=await connectGateway(process.env.OPENCLAW_PROOF_WS_URL,process.env.OPENCLAW_PROOF_TOKEN,`${root}/rpc.jsonl`);
const first='agent:main:archive-stall-first',next='agent:main:archive-stall-next',retained='agent:main:reconcile-retained';
const timeout=setTimeout(()=>{fs.writeFileSync(`${root}/release`,'');throw new Error('proof exceeded 300 seconds');},300000);
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
  const heldStart=Date.now();
  const following=client.request('sessions.delete',{key:next,deleteTranscript:true}).finally(()=>{nextSettled=true;});
  const followingOutcome=Promise.allSettled([following]);
  await sleep(185000);
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
  fs.writeFileSync(`${root}/release`,'');
  const [[firstResult],[nextResult]]=await Promise.all([activeOutcome,followingOutcome]);
  client.record({event:'settled-after-native-release',firstResult:firstResult.status==='rejected'?{status:firstResult.status,error:String(firstResult.reason)}:firstResult,nextResult});
  assert.equal(firstResult.status,'rejected');assert.equal(nextResult.status,'fulfilled');
  assert(!fs.existsSync(native.path),'terminated staging file was not removed');
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
  assert(after.events.length>0&&after.nodes.length===1,'unrelated retained session missing');
  const retainedHistory=await client.request('chat.history',{sessionKey:retained,limit:20});
  assert(JSON.stringify(retainedHistory).includes(`synthetic retained proof ${retained}`));
  const events=readLines('workers.jsonl').filter(x=>x.url?.includes('session-accessor.sqlite-archive'));
  const exit=events.find(x=>x.event==='worker-exit'&&x.threadId===activeWorker.threadId);
  assert(exit,'terminated worker exit missing');
  assert(events.filter(x=>x.event==='worker-created'&&x.threadId!==activeWorker.threadId).every(x=>x.time>=exit.time),'successor preceded physical worker exit');
  save('archive-integrity',{sourceHead:process.env.OPENCLAW_PROOF_HEAD,archives,quickCheck:after.quickCheck,stagingRemoved:true,failedSourcePreserved:true,retrySucceeded:true,retainedHistoryRead:true,terminationRequestedMsAfterNativeObservation:terminations[0].time-heldStart,physicalExitTime:exit.time,native:readLines('native.jsonl')});
  console.log(JSON.stringify({pass:true,archives:archives.length,retrySucceeded:true,stagingRemoved:true}));
}finally{clearTimeout(timeout);fs.writeFileSync(`${root}/release`,'');client.close();}
