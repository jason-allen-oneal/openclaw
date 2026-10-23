import fs from 'node:fs';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { zstdDecompressSync } from 'node:zlib';
import { setTimeout as sleep } from 'node:timers/promises';
import { connectGateway } from './gateway-rpc.mjs';
const root=process.env.OPENCLAW_PROOF_PREAD_ROOT;
const state=process.env.OPENCLAW_PROOF_STATE;
const readLines=name=>fs.existsSync(`${root}/${name}`)?fs.readFileSync(`${root}/${name}`,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse):[];
const save=(name,value)=>fs.writeFileSync(`${root}/${name}.json`,JSON.stringify(value,null,2)+'\n');
const snapshot=()=>{
  const db=new DatabaseSync(`${state}/agents/main/agent/openclaw-agent.sqlite`,{readOnly:true});
  const owner=new DatabaseSync(`${state}/state/openclaw.sqlite`,{readOnly:true});
  try{return {
    events:db.prepare('SELECT session_id,seq,event_json,event_zstd FROM transcript_events ORDER BY session_id,seq').all().map(({event_json,event_zstd,...row})=>({...row,json:event_json??zstdDecompressSync(event_zstd).toString()})),
    index:db.prepare('SELECT * FROM session_transcript_index_state ORDER BY session_id').all(),
    leases:owner.prepare('SELECT * FROM agent_database_leases ORDER BY lease_id').all(),
    quickCheck:db.prepare('PRAGMA quick_check').all(),
  };}finally{db.close();owner.close();}
};
const client=await connectGateway(process.env.OPENCLAW_PROOF_WS_URL,process.env.OPENCLAW_PROOF_TOKEN,`${root}/rpc.jsonl`);
const timeout=setTimeout(()=>{fs.writeFileSync(`${root}/release-reconcile`,'');throw new Error('reconciliation proof exceeded 320 seconds');},320000);
try{
  const enteringDeadline=Date.now()+60000;
  while(!fs.existsSync(`${root}/native-reconcile.jsonl`)){
    assert(Date.now()<enteringDeadline,'real startup reconciliation did not enter native pread');
    await sleep(25);
  }
  const native=readLines('native-reconcile.jsonl')[0];
  const active=readLines('workers.jsonl').find(x=>x.event==='worker-dispatch'&&x.input?.mode==='disk');
  assert(active,'reconcile disk-task observation missing');
  const before=snapshot();save('before',before);
  assert(before.leases.some(x=>x.lease_id===active.input.leaseId),'durable native read lease missing');
  const started=Date.now();
  await sleep(185000);
  const workerEvents=readLines('workers.jsonl').filter(x=>x.url?.includes('session-transcript-reconcile'));
  const terminations=workerEvents.filter(x=>x.event==='worker-terminate-request'&&x.threadId===active.threadId);
  const held=snapshot();save('held',{...held,time:Date.now(),workerEvents,nativeThreadExists:fs.existsSync(`/proc/${native.pid}/task/${native.tid}`)});
  assert.equal(terminations.length,1,'three-minute reconcile termination request missing');
  assert(terminations[0].time-started>165000&&terminations[0].time-started<185000,'reconciliation termination outside three-minute task window');
  assert(fs.existsSync(`/proc/${native.pid}/task/${native.tid}`),'native worker exited before release');
  assert(!workerEvents.some(x=>x.event==='worker-exit'&&x.threadId===active.threadId),'exit reported before native release');
  assert(held.leases.some(x=>x.lease_id===active.input.leaseId),'durable lease reclaimed before physical exit');
  assert(!workerEvents.some(x=>x.event==='worker-dispatch'&&x.input?.mode==='release'),'cleanup task overlaps held native worker');
  assert.deepEqual(held.events,before.events,'source transcript changed while native read held');
  client.record({event:'reconcile-held-observation',leaseRetained:true,nativeThreadExists:true,terminationRequests:terminations.length,noCleanupTask:true});
  fs.writeFileSync(`${root}/release-reconcile`,'');
  const releaseDeadline=Date.now()+60000;
  let after;
  while(true){
    after=snapshot();
    if(!after.leases.some(x=>x.lease_id===active.input.leaseId))break;
    assert(Date.now()<releaseDeadline,'native lease was not released after physical worker exit');
    await sleep(50);
  }
  save('after-release',after);
  const events=readLines('workers.jsonl').filter(x=>x.url?.includes('session-transcript-reconcile'));
  const physicalExit=events.find(x=>x.event==='worker-exit'&&x.threadId===active.threadId);
  const cleanup=events.find(x=>x.event==='worker-dispatch'&&x.input?.mode==='release'&&x.input?.leaseId===active.input.leaseId);
  assert(physicalExit&&cleanup,'physical exit or release task missing');
  assert(cleanup.time>=physicalExit.time,'lease cleanup task precedes physical exit');
  assert.deepEqual(after.events,before.events,'source transcript changed after terminated read');
  const key='agent:main:reconcile-retained';
  const retryDeadline=Date.now()+60000;
  let history;
  while(true){
    try{history=await client.request('chat.history',{sessionKey:key,limit:20});}catch(error){client.record({event:'history-retry',error:String(error)});}
    after=snapshot();
    if(history&&JSON.stringify(history).includes(`synthetic retained proof ${key}`)&&after.index.every(x=>!x.needs_rebuild))break;
    assert(Date.now()<retryDeadline,'shipped history path did not recover dirty projection');
    await sleep(500);
  }
  assert.deepEqual(after.events,before.events,'retry changed canonical transcript');
  save('after-retry',after);
  save('reconcile-integrity',{sourceHead:process.env.OPENCLAW_PROOF_HEAD,leaseId:active.input.leaseId,sourceRowsUnchanged:true,leaseRetainedUntilExit:true,cleanupAfterPhysicalExit:true,historyRecovered:true,dirtyProjectionRebuilt:true,quickCheck:after.quickCheck,native:readLines('native-reconcile.jsonl'),physicalExitTime:physicalExit.time,cleanupStartTime:cleanup.time,terminationRequestedMsAfterNativeObservation:terminations[0].time-started});
  console.log(JSON.stringify({pass:true,leaseRetainedUntilExit:true,historyRecovered:true,sourceRowsUnchanged:true}));
}finally{clearTimeout(timeout);fs.writeFileSync(`${root}/release-reconcile`,'');client.close();}
