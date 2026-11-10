import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const [checkout,root]=process.argv.slice(2);
const config=JSON.parse(await fs.readFile(process.env.OPENCLAW_CONFIG_PATH,'utf8'));
const original=JSON.parse(await fs.readFile(`${root}/observer-raw-receipt.json`,'utf8'));
const {GatewayClient,startGatewayClientWhenEventLoopReady}=await import(pathToFileURL(`${checkout}/dist/plugin-sdk/gateway-runtime.js`));
let resolve,reject;
const ready=new Promise((a,b)=>{resolve=a;reject=b});
const client=new GatewayClient({url:'ws://127.0.0.1:23174',token:config.gateway.auth.token,deviceIdentity:null,clientName:'gateway-client',mode:'backend',scopes:['operator.admin'],onHelloOk:resolve,onConnectError:reject});
try{
 await startGatewayClientWhenEventLoopReady(client,{timeoutMs:30000});await ready;
 const described=await client.request('sessions.describe',{key:original.sessionKey});
 const history=await client.request('chat.history',{sessionKey:original.sessionKey,limit:50});
 await fs.writeFile(`${root}/gateway-readback.raw.json`,JSON.stringify({described,history,recordedAt:new Date().toISOString()},null,2),{mode:0o600});
 assert.equal(described.session.sessionId,original.after.session.sessionId);
 assert.equal(described.session.observerDigest.runId,original.runId);
 assert.equal(described.session.observerDigest.health,'done');
 assert.equal(described.session.observerDigest.headline,original.terminal.terminalReply.text);
 assert(described.session.observerDigest.revision>Math.max(...original.digests.map(d=>d.revision)));
 assert.deepEqual(history.sessionInfo.observerDigest,described.session.observerDigest);
 console.log(JSON.stringify({status:'passed',sessionIdPreserved:true,persistedTerminalDigestMatchesSuccessfulReply:true,digest:described.session.observerDigest}));
}finally{await client.stopAndWait();}
