import fs from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { connectGateway } from './gateway-rpc.mjs';
const root=process.env.OPENCLAW_PROOF_FSYNC_ROOT;
const client=await connectGateway(process.env.OPENCLAW_PROOF_WS_URL,process.env.OPENCLAW_PROOF_TOKEN,`${root}/rpc.jsonl`);
let deletion;
try {
  await sleep(10000);
  const key='agent:main:diagnostic-native-archive';
  await client.request('sessions.create',{key,agentId:'main'});
  await client.request('chat.inject',{sessionKey:key,message:'synthetic diagnostic only'});
  fs.writeFileSync(`${root}/arm`,'');
  deletion=client.request('sessions.delete',{key,deleteTranscript:true}).then(value=>({value}),error=>({error:String(error)}));
  const until=Date.now()+30000;
  while(!fs.existsSync(`${root}/native.jsonl`)){if(Date.now()>until)throw Error('No native fault');await sleep(25);}
  fs.unlinkSync(`${root}/arm`);
  await sleep(16000);
  console.log(JSON.stringify({diagnosticOnly:true,native:fs.readFileSync(`${root}/native.jsonl`,'utf8')}));
} finally {client.close();}

process.exit(0);
