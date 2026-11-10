import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { it, vi, beforeAll } from 'vitest';
let testState: Awaited<ReturnType<typeof import('../test-utils/openclaw-test-state.js').createOpenClawTestState>>;
beforeAll(async () => {
 const { createOpenClawTestState } = await import('../test-utils/openclaw-test-state.js');
 testState = await createOpenClawTestState({label:'observer-runtime-proof',scenario:'minimal',env:{OPENCLAW_DISABLE_BUNDLED_PLUGINS:'1'}});
 console.log('FIXTURE READY');
},180_000);
it('recovers the observer after actual plugin-held admission refuses twice', async () => {
const root = testState.stateDir;
await mkdir(root, { recursive: true });
const requests: unknown[] = [];
const server = http.createServer(async (req, res) => {
  let body = ''; for await (const chunk of req) body += chunk;
  requests.push({ path: req.url, body: JSON.parse(body) });
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  const message = JSON.stringify({ headline: 'Recovered after replacement', health: 'on-track' });
  res.write(`data: ${JSON.stringify({ id:'synthetic', object:'chat.completion.chunk', created:1, model:'observer-fixture', choices:[{index:0,delta:{role:'assistant',content:message},finish_reason:null}] })}\n\n`);
  res.write(`data: ${JSON.stringify({ id:'synthetic', object:'chat.completion.chunk', created:1, model:'observer-fixture', choices:[{index:0,delta:{},finish_reason:'stop'}],usage:{prompt_tokens:1,completion_tokens:1,total_tokens:2} })}\n\ndata: [DONE]\n\n`);
  res.end();
});
server.listen(0, '127.0.0.1'); await once(server,'listening');
const port = (server.address() as {port:number}).port;
const config = {
 gateway:{controlUi:{sessionObserver:true}},
 plugins:{enabled:false},
 agents:{defaults:{workspace:root+'/workspace',utilityModel:'fixture/observer-fixture',model:'fixture/observer-fixture'}},
 models:{providers:{fixture:{api:'openai-completions',baseUrl:`http://127.0.0.1:${port}/v1`,apiKey:'synthetic-proof-key',models:[{id:'observer-fixture',name:'Fixture',reasoning:false,input:['text'],cost:{input:0,output:0,cacheRead:0,cacheWrite:0},contextWindow:8192,maxTokens:1024}]}}}
};
await writeFile(process.env.OPENCLAW_CONFIG_PATH!, JSON.stringify(config));
const {captureRuntimeConfigAsyncReader} = await import('../config/config.js');
await captureRuntimeConfigAsyncReader()();
const {createSessionObserver} = await import('../gateway/session-observer.js');
const {createSessionMessageSubscriberRegistry} = await import('../gateway/server-chat-state.js');
const {PluginInstance} = await import('../plugins/plugin-instance.js');
const {beginPreparedModelRuntimePluginDrain} = await import('../agents/prepared-model-runtime.js');
const {closePreparedModelRuntimeSnapshots} = await import('../agents/prepared-model-runtime.lifecycle.js');
const {onAgentEventForRun} = await import('../infra/agent-events.js');
const {assertPreparedModelRuntimeAdmissionCanWait, readPreparedRuntimeSelfHold} = await import('../agents/prepared-model-runtime-admission.js');
const runId='runtime-recovery-proof'; const sessionKey='agent:main:runtime-recovery-proof';
const notices:unknown[]=[]; const unsub=onAgentEventForRun(runId,e=>notices.push(e));
const instance = new PluginInstance('runtime-proof-plugin');
const consumer=instance.retainConsumer();
let settle!: (x: unknown)=>void;
const operation={operationId:'runtime-proof-replacement',settled:new Promise(resolve=>{settle=resolve})};
const release=instance.reserveReplacement(operation as never);
const drain=beginPreparedModelRuntimePluginDrain();
const refusals:unknown[]=[];
for(let i=0;i<2;i++)try{consumer.run(()=>assertPreparedModelRuntimeAdmissionCanWait())}catch(e){ const fact=readPreparedRuntimeSelfHold(e); assert(fact);refusals.push({name:(e as Error).constructor.name,admissionBlocked:(e as {admissionBlocked:boolean}).admissionBlocked,operation:fact.held[0].operation.operationId}); }
const subscribers=createSessionMessageSubscriberRegistry();subscribers.subscribe('proof-conn',sessionKey)?.commit();
const broadcasts:any[]=[];
const {upsertSessionEntryCore} = await import('../config/sessions/session-accessor.sqlite-entry.js');
const {readSessionEntryReadOnlyInWorker} = await import('../config/sessions/session-entry-read-runtime.js');
await upsertSessionEntryCore({agentId:'main',sessionKey},{sessionId:'synthetic-session',updatedAt:0});
const readStored = () => readSessionEntryReadOnlyInWorker({agentId:'main',sessionKey});
let terminalRelease=()=>{};let terminalDrainRelease=()=>{};
const observerModel = await import('../gateway/session-observer-model.js');
const originalComplete = observerModel.defaultCompleteModel;
const completionCalls: any[] = [];
const completeSpy = vi.spyOn(observerModel, 'defaultCompleteModel').mockImplementation(async input => {
 const call: any = {at:Date.now(), purpose:input.purpose}; completionCalls.push(call);
 try { return await consumer.run(()=>originalComplete(input)); } catch(error) { call.error={type:(error as Error).constructor.name,admissionBlocked:(error as {admissionBlocked?:boolean}).admissionBlocked};throw error; }
});
const observer=createSessionObserver({getConfig:()=>config,subscribers,broadcastToConnIds:(name,payload)=>broadcasts.push({name,payload})});
observer.setConnectionVisibility('proof-conn',true);
let seq=0;const event=(stream:string,data:Record<string,unknown>)=>({runId,sessionKey,agentId:'main',seq:++seq,ts:Date.now(),stream,data});
const start=Date.now();
try {
 await consumer.run(async()=>{
  await observer.handleEventAsync(event('lifecycle',{phase:'start'}));
  for(let i=0;i<4;i++)await observer.handleEventAsync(event('tool',{phase:'start',name:'read',args:{path:`fixture-${i}.txt`}}));
 });
 await delay(25_000);
 console.log(JSON.stringify({stage:'blocked',elapsedMs:Date.now()-start,requests:requests.length,broadcasts:broadcasts.filter(x=>x.name==='session.observer'),notices,refusals,completionCalls}));
 assert.equal(requests.length,0,'No provider request while drain blocks admission');
 assert(completionCalls.length>=2); assert(completionCalls.slice(0,2).every(x=>x.error?.admissionBlocked===true));
 release();drain.release();settle({kind:'applied',committed:true,unavailablePluginIds:[]});
 const deadline=Date.now()+40_000;
 while(!broadcasts.some(x=>x.name==='session.observer'&&x.payload.headline==='Recovered after replacement')&&Date.now()<deadline)await delay(250);
 let stored=await readStored();
 for(let i=0;i<40&&!stored?.observerDigest;i++){await delay(50);stored=await readStored();}
 const persisted=[stored?.observerDigest];
 console.log(JSON.stringify({stage:'recovered',elapsedMs:Date.now()-start,requests,broadcasts,persisted,notices,completionCalls}));
 assert(broadcasts.some(x=>x.name==='session.observer'&&x.payload.runId===runId&&x.payload.headline==='Recovered after replacement'),'Same-run digest must resume');
 assert(persisted.some(x=>x?.runId===runId&&x.headline==='Recovered after replacement'),'Recovered digest persisted in SQLite');
 assert.equal(notices.filter((x:any)=>x.stream==='assistant'&&JSON.stringify(x).includes('assessments stopped')).length,0);
 terminalRelease=instance.reserveReplacement();terminalDrainRelease=beginPreparedModelRuntimePluginDrain().release;
 const terminalAttemptStart=completionCalls.length;
 await observer.handleEventAsync(event('lifecycle',{phase:'end',startedAt:start,endedAt:Date.now()}));
 for(let i=0;i<40;i++){stored=await readStored();if(stored?.observerDigest?.health==='done')break;await delay(50);}
 await delay(500);
 console.log(JSON.stringify({stage:'terminal-blocked',replacementStillBlocked:instance.replacementPending,attempts:completionCalls.slice(terminalAttemptStart),storedDigest:stored?.observerDigest,providerRequests:requests.length}));
 assert.equal(stored?.observerDigest?.health,'done');assert.equal(stored?.observerDigest?.runId,runId);
 assert.equal(completionCalls.length-terminalAttemptStart,1,'Terminal refusal must settle without retry loop');
 assert.equal(requests.length,1,'Blocked terminal must not dispatch provider');
 assert.equal(completionCalls.at(-1).error.admissionBlocked,true);
} finally {
 terminalRelease();terminalDrainRelease();release();drain.release();settle({kind:'applied',committed:true,unavailablePluginIds:[]});
 await observer.disposeAsync();completeSpy.mockRestore();consumer.release();unsub();await instance.dispose();await closePreparedModelRuntimeSnapshots();server.close();await once(server,'close');await testState.cleanup();
}
console.log('PROOF PASS');
}, 120_000);
