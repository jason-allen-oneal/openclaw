import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
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
let client=await connectGateway(process.env.OPENCLAW_PROOF_WS_URL,process.env.OPENCLAW_PROOF_TOKEN,`${root}/rpc.jsonl`);
const timeout=setTimeout(()=>{throw new Error('reconciliation proof exceeded 450 seconds');},450000);
try{
  const enteringDeadline=Date.now()+60000;
  while(!fs.existsSync(`${root}/native-reconcile.jsonl`)){
    assert(Date.now()<enteringDeadline,'real startup reconciliation did not enter native pread');
    await sleep(25);
  }
  const native=readLines('native-reconcile.jsonl')[0];
  fs.unlinkSync(`${root}/arm-reconcile`);
  const active=readLines('workers.jsonl').find(x=>x.event==='worker-dispatch'&&x.input?.mode==='disk');
  assert(active,'reconcile disk-task observation missing');
  const before=snapshot();save('before',before);
  assert(before.leases.some(x=>x.lease_id===active.input.leaseId),'durable native read lease missing');
  const started=Date.now();
  assert(Date.now()<active.time+183000,'proof observer reached native hold too late');
  await sleep(active.time+183000-Date.now());
  const workerEvents=readLines('workers.jsonl').filter(x=>x.url?.includes('session-transcript-reconcile'));
  const terminations=workerEvents.filter(x=>x.event==='worker-terminate-request'&&x.threadId===active.threadId);
  const held=snapshot();save('held',{...held,time:Date.now(),workerEvents,nativeThreadExists:fs.existsSync(`/proc/${native.pid}/task/${native.tid}`)});
  assert.equal(terminations.length,1,'three-minute reconcile termination request missing');
  // Pool arms its 180s task timer just before the observer records postMessage.
  assert(terminations[0].time-active.time>=179000&&terminations[0].time-active.time<183000,'reconciliation termination outside three-minute task window (1s observer skew)');
  assert(fs.existsSync(`/proc/${native.pid}/task/${native.tid}`),'native worker exited before release');
  assert(!workerEvents.some(x=>x.event==='worker-exit'&&x.threadId===active.threadId),'exit reported before native release');
  assert(held.leases.some(x=>x.lease_id===active.input.leaseId),'durable lease reclaimed before physical exit');
  assert(!workerEvents.some(x=>x.event==='worker-dispatch'&&x.input?.mode==='release'),'cleanup task overlaps held native worker');
  assert.deepEqual(held.events,before.events,'source transcript changed while native read held');
  client.record({event:'reconcile-held-observation',leaseRetained:true,nativeThreadExists:true,terminationRequests:terminations.length,noCleanupTask:true});
  const deathDeadline=active.time+250000;
  while(fs.existsSync(`/proc/${native.pid}`)){
    assert(Date.now()<deathDeadline,'Gateway did not recover the permanently held reconciliation worker');
    assert(!fs.existsSync(`${root}/release-reconcile`),'native fault must remain held');
    await sleep(25);
  }
  const oldProcessDeathObservedAt=Date.now();
  assert(!fs.existsSync(`/proc/${native.pid}/task/${native.tid}`));
  assert(!readLines('native-reconcile.jsonl').some(e=>e.event==='sqlite-pread-release'));
  client.close();
  const readyDeadline=Date.now()+120000;
  for (;;) {
    try {
      const ready=await (await fetch(process.env.OPENCLAW_PROOF_WS_URL.replace('ws:','http:')+'/readyz')).json();
      if(ready.ready)break;
    }catch{}
    assert(Date.now()<readyDeadline,'new Gateway did not become ready');
    await sleep(100);
  }
  client=await connectGateway(process.env.OPENCLAW_PROOF_WS_URL,process.env.OPENCLAW_PROOF_TOKEN,`${root}/rpc.jsonl`);
  const newPid=Number(execFileSync('systemctl',['--user','show',process.env.OPENCLAW_PROOF_UNIT,'--property=MainPID','--value'],{encoding:'utf8'}).trim());
  assert(newPid>0&&newPid!==native.pid,'recovery reused the wedged process');
  let after=snapshot();
  assert(!after.leases.some(x=>x.lease_id===active.input.leaseId),'dead process retained its durable lease after recovery');
  assert.deepEqual(after.events,before.events,'process recovery changed canonical transcript');
  const events=readLines('workers.jsonl').filter(x=>x.url?.includes('session-transcript-reconcile'));
  const successorWorkers=events.filter(x=>x.pid===newPid&&x.event==='worker-created');
  assert(successorWorkers.length>0,'successor must perform actual reconciliation');
  assert(successorWorkers.every(x=>x.time>=oldProcessDeathObservedAt),'successor worker preceded old process death');
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
  assert(before.index.length>0,'retained index input is nonempty');
  assert.deepEqual(after.index.map(x=>x.session_id),before.index.map(x=>x.session_id),'recovery preserves the exact projected session inventory');
  assert.deepEqual(after.quickCheck.map(row=>row.quick_check),['ok']);
  save('after-retry',after);
  save('reconcile-integrity',{sourceHead:process.env.OPENCLAW_PROOF_HEAD,leaseId:active.input.leaseId,sourceRowsUnchanged:true,leaseRetainedUntilExit:true,cleanupAfterPhysicalExit:true,historyRecovered:true,dirtyProjectionRebuilt:true,quickCheck:after.quickCheck,native:readLines('native-reconcile.jsonl'),oldPid:native.pid,newPid,oldProcessDeathObservedAt,faultReleased:false,terminationRequestedMsAfterDispatch:terminations[0].time-active.time,observerStartedMsAfterDispatch:started-active.time});
  console.log(JSON.stringify({pass:true,leaseRetainedUntilExit:true,historyRecovered:true,sourceRowsUnchanged:true}));
}finally{clearTimeout(timeout);client.close();}
