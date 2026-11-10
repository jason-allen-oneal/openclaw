import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

// External RPC observer only. Gateway, authentication, model calls and persistence
// are provided by the separately launched unmodified stable/candidate packages.
const [sdkRoot, configPath, wsUrl, phase, outputRoot] = process.argv.slice(2);
assert(['stable', 'candidate', 'observer'].includes(phase));
const cfg = JSON.parse(await fs.readFile(configPath, 'utf8'));
const {GatewayClient, startGatewayClientWhenEventLoopReady} = await import(pathToFileURL(`${sdkRoot}/dist/plugin-sdk/gateway-runtime.js`).href);
const identityPath = `${outputRoot}/session-identity${phase==='observer'?'-observer':''}.json`;
const events = [];
let hello;
let resolveHello, rejectHello;
const helloPromise = new Promise((resolve,reject)=>{resolveHello=resolve;rejectHello=reject;});
const client = new GatewayClient({url:wsUrl, token:cfg.gateway.auth.token, deviceIdentity:null,
  clientName:'gateway-client', mode:'backend', scopes:['operator.admin'],
  onHelloOk(value){hello={protocol:value.protocol,version:value.server.version};resolveHello();},
  onConnectError(error){rejectHello(error);},
  onEvent(event){if(['session.observer','agent'].includes(event.event)) events.push(event);}
});
const timeout = setTimeout(()=>rejectHello(new Error('Gateway handshake timeout')),30000);
let runId;
try {
  await startGatewayClientWhenEventLoopReady(client,{timeoutMs:30000});
  await helloPromise;
  clearTimeout(timeout);
  let identity;
  if(phase==='stable'||phase==='observer') {
    const sessionKey=`agent:main:observer-real-proof-${randomUUID()}`;
    const created=await client.request('sessions.create',{key:sessionKey,label:`Observer token-sharing ${phase} proof`});
    identity={sessionKey,created};
    await fs.writeFile(identityPath,JSON.stringify(identity,null,2),{mode:0o600});
  } else identity=JSON.parse(await fs.readFile(identityPath,'utf8'));
  const before=await client.request('sessions.describe',{key:identity.sessionKey});
  const historyBefore=await client.request('chat.history',{sessionKey:identity.sessionKey,limit:50});
  if(phase==='candidate') {
    const stable=JSON.parse(await fs.readFile(`${outputRoot}/stable-raw-receipt.json`,'utf8'));
    assert.equal(before.session.sessionId,stable.after.session.sessionId,'session ID must survive package-only upgrade');
    assert.equal(before.session.modelProvider,stable.after.session.modelProvider,'provider must survive');
    assert.equal(before.session.model,stable.after.session.model,'model must survive');
    assert.equal(before.session.agentRuntime?.id,stable.after.session.agentRuntime?.id,'runtime selection must survive');
    const payloads=messages=>(messages??[]).map(({role,content})=>({role,content}));
    assert.deepEqual(payloads(historyBefore.messages),payloads(stable.historyAfter.messages),'stored transcript payloads must survive');
  }
  await client.request('sessions.messages.subscribe',{key:identity.sessionKey});
  await client.request('sessions.observer.visibility',{visible:true});
  const prompt='This is an isolated session-observer validation. Do not read personal files or contact services. In four separate steps, say a short commentary line naming the step, then use the shell to run: sleep 10. After the fourth step, reply exactly OBSERVER_PROOF_COMPLETE. The deliberate pauses give the background observer time to assess progress.';
  const started=await client.request('chat.send',{sessionKey:identity.sessionKey,message:prompt,deliver:false,idempotencyKey:randomUUID()});
  runId=started.runId;
  assert(runId,'chat.send must return a run ID');
  const terminal=await client.request('agent.wait',{runId,timeoutMs:180000},{timeoutMs:190000});
  const after=await client.request('sessions.describe',{key:identity.sessionKey});
  const historyAfter=await client.request('chat.history',{sessionKey:identity.sessionKey,limit:50});
  const digests=events.filter(e=>e.event==='session.observer'&&e.payload?.runId===runId).map(e=>e.payload);
  const receipt={phase,hello,sessionKey:identity.sessionKey,runId,terminal,
    before,after,historyBefore,historyAfter,digests,
    promptSha256:createHash('sha256').update(prompt).digest('hex'),
    assessments:digests.filter(d=>typeof d.assessment==='string'&&d.assessment.length>0),
    events};
  await fs.writeFile(`${outputRoot}/${phase}-raw-receipt.json`,JSON.stringify(receipt,null,2),{mode:0o600});
  console.log(JSON.stringify({phase,hello,runId,terminal,digests:digests.length,assessments:receipt.assessments.length}));
  assert.equal(terminal.status,'ok','ordinary model run must complete');
  if(phase!=='stable') assert(receipt.assessments.length>0,'candidate must produce a model-written observer assessment');
} finally {clearTimeout(timeout);await client.stopAndWait();}
