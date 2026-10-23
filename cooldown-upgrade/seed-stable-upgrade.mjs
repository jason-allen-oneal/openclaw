import fs from 'node:fs';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { connectGateway } from './gateway-rpc.mjs';
const root=process.env.OPENCLAW_UPGRADE_ROOT;
const client=await connectGateway('ws://127.0.0.1:19685','SYNTHETIC_UPGRADE_TOKEN',`${root}/stable-rpc.jsonl`);
try{
 for(const [key,label] of [['agent:main:reconcile-retained','reconcile-retained'],['agent:main:stable-upgrade-settings','stable-upgrade-settings']]){
  await client.request('sessions.create',{key,agentId:'main',label});
  await client.request('chat.inject',{sessionKey:key,message:key.endsWith('reconcile-retained')?`synthetic retained proof ${key}`:'synthetic stable 2026.10.6 transcript survives upgrade'});
  const history=await client.request('chat.history',{sessionKey:key,limit:20});
  assert(JSON.stringify(history).includes('synthetic'));
 }
 const config=await client.request('config.get');
 fs.writeFileSync(`${root}/stable-config-rpc.json`,JSON.stringify(config,null,2)+'\n');
 const db=new DatabaseSync(`${root}/state/agents/main/agent/openclaw-agent.sqlite`,{readOnly:true});
 try{
 const snapshot={nodes:db.prepare('SELECT session_key,current_session_id FROM session_nodes ORDER BY session_key').all(),events:db.prepare('SELECT session_id,seq,event_json,hex(event_zstd) AS zstdHex,event_utf8_bytes FROM transcript_events ORDER BY session_id,seq').all(),quickCheck:db.prepare('PRAGMA quick_check').all()};
 assert(snapshot.events.length>0&&snapshot.nodes.length===2);
 assert.deepEqual(snapshot.quickCheck.map(x=>x.quick_check),['ok']);
 fs.writeFileSync(`${root}/stable-canonical-before.json`,JSON.stringify(snapshot,null,2)+'\n');
 console.log(JSON.stringify({pass:true,sessions:snapshot.nodes.length,canonicalRows:snapshot.events.length}));
 }finally{db.close();}
}finally{client.close();}
