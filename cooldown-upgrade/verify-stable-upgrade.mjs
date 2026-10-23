import fs from 'node:fs';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { connectGateway } from './gateway-rpc.mjs';
const root=process.env.OPENCLAW_UPGRADE_ROOT;
const phase=process.env.OPENCLAW_UPGRADE_PHASE;
const original=JSON.parse(fs.readFileSync(`${root}/stable-canonical-before.json`,'utf8'));
const expectedConfig=JSON.parse(fs.readFileSync(`${root}/config-before.json`,'utf8'));
const client=await connectGateway('ws://127.0.0.1:19685','SYNTHETIC_UPGRADE_TOKEN',`${root}/${phase}-rpc.jsonl`);
const snapshot=()=>{const db=new DatabaseSync(`${root}/state/agents/main/agent/openclaw-agent.sqlite`,{readOnly:true});try{return {nodes:db.prepare('SELECT session_key,current_session_id FROM session_nodes ORDER BY session_key').all(),events:db.prepare('SELECT session_id,seq,event_json,hex(event_zstd) AS zstdHex,event_utf8_bytes FROM transcript_events ORDER BY session_id,seq').all(),quickCheck:db.prepare('PRAGMA quick_check').all()};}finally{db.close();}};
try{
 const rpcConfig=await client.request('config.get');
 assert.equal(rpcConfig.valid,true);
 const cfg=rpcConfig.config;
 const settings={workspace:cfg.agents.defaults.workspace,timeoutSeconds:cfg.agents.defaults.timeoutSeconds,responsePrefix:cfg.messages.responsePrefix,pluginsAllow:cfg.plugins.allow,gatewayMode:cfg.gateway.mode,gatewayPort:cfg.gateway.port,gatewayBind:cfg.gateway.bind,controlUiEnabled:cfg.gateway.controlUi.enabled,cronEnabled:cfg.cron.enabled};
 assert.deepEqual(settings,{workspace:expectedConfig.agents.defaults.workspace,timeoutSeconds:97,responsePrefix:'stable-upgrade-preserved',pluginsAllow:[],gatewayMode:'local',gatewayPort:19685,gatewayBind:'loopback',controlUiEnabled:false,cronEnabled:false});
 for(const {session_key} of original.nodes){const history=await client.request('chat.history',{sessionKey:session_key,limit:20});assert(JSON.stringify(history).includes('synthetic'));}
 let after=snapshot();
 for(const node of original.nodes)assert.deepEqual(after.nodes.find(x=>x.session_key===node.session_key),node);
 for(const event of original.events)assert.deepEqual(after.events.find(x=>x.session_id===event.session_id&&x.seq===event.seq),event);
 const newKey='agent:main:post-upgrade-progress';
 if(phase==='candidate-upgrade'){
  await client.request('sessions.create',{key:newKey,agentId:'main',label:'post-upgrade-progress'});
  await client.request('chat.inject',{sessionKey:newKey,message:'synthetic new transcript after stable upgrade'});
 }else{
  const history=await client.request('chat.history',{sessionKey:newKey,limit:20});
  assert(JSON.stringify(history).includes('synthetic new transcript after stable upgrade'));
 }
 after=snapshot();
 if(phase==='candidate-restart'){
  const prior=JSON.parse(fs.readFileSync(`${root}/candidate-upgrade-canonical.json`,'utf8'));
  assert.deepEqual(after,prior,'retained state changed across clean candidate restart');
 }
 assert.deepEqual(after.quickCheck.map(x=>x.quick_check),['ok']);
 fs.writeFileSync(`${root}/${phase}-canonical.json`,JSON.stringify(after,null,2)+'\n');
 const result={pass:true,phase,sourceHead:process.env.OPENCLAW_PROOF_HEAD,stableVersion:'2026.10.6',settings,authenticatedRpc:true,priorSessionsPreserved:original.nodes.length,priorCanonicalRowsByteIdentical:original.events.length,retainedSessions:after.nodes.length,canonicalRows:after.events.length,quickCheck:after.quickCheck};
 fs.writeFileSync(`${root}/${phase}-integrity.json`,JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(result));
}finally{client.close();}
