import fs from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { connectGateway } from './gateway-rpc.mjs';
const root=process.env.OPENCLAW_PROOF_FSYNC_ROOT;
const client=await connectGateway(process.env.OPENCLAW_PROOF_WS_URL,process.env.OPENCLAW_PROOF_TOKEN,`${root}/rpc.jsonl`);
const first='agent:main:archive-stall-first';
const next='agent:main:archive-stall-next';
try {
  for(const key of [first,next]){
    await client.request('sessions.create',{key,agentId:'main',label:key.split(':').at(-1)});
    await client.request('chat.inject',{sessionKey:key,message:`synthetic retained proof ${key}`});
  }
  fs.writeFileSync(`${root}/arm`,'');
  let firstSettled=false,nextSettled=false;
  const active=client.request('sessions.delete',{key:first,deleteTranscript:true}).finally(()=>{firstSettled=true;});
  const activeOutcome=Promise.allSettled([active]);
  const waitUntil=Date.now()+60000;
  while(!fs.existsSync(`${root}/native.jsonl`)){
    if(firstSettled)throw new Error('archive settled without entering native fsync hold');
    if(Date.now()>waitUntil)throw new Error('did not reach native archive fsync');
    await sleep(25);
  }
  const following=client.request('sessions.delete',{key:next,deleteTranscript:true}).finally(()=>{nextSettled=true;});
  const followingOutcome=Promise.allSettled([following]);
  await sleep(Number(process.env.OPENCLAW_PROOF_HOLD_MS||2000));
  client.record({event:'native-held-observation',firstSettled,nextSettled,workerEvents:fs.existsSync(`${root}/workers.jsonl`)?fs.readFileSync(`${root}/workers.jsonl`,'utf8').trim().split('\n').map(JSON.parse).filter(x=>x.url.includes('archive')):[]});
  if(firstSettled||nextSettled)throw new Error('archive custody released while native operation remains held');
  fs.writeFileSync(`${root}/release`,'');
  const results=await Promise.all([activeOutcome,followingOutcome]);
  client.record({event:'settled-after-native-release',results:results.map(x=>x.map(r=>r.status==='fulfilled'?r:{status:r.status,error:String(r.reason)}))});
  console.log(JSON.stringify({firstSettled,nextSettled,results}));
} finally {
  fs.writeFileSync(`${root}/release`,'');
  client.close();
}
