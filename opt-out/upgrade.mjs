import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import {spawn, execFileSync} from 'node:child_process';
import {createServer} from 'node:net';
import {randomBytes, createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {pathToFileURL} from 'node:url';
import {setTimeout as sleep} from 'node:timers/promises';
import {bindBuild, assertBuildUnchanged, repoRoot, proofRoot} from './build-bindings.mjs';

// Execute only after the root has committed and rebuilt the exact candidate.
// This is real published-Gateway -> Doctor -> candidate-Gateway upgrade proof,
// not a JSON parser migration test. Default fallback behavior is measured by
// the separate native/physical-transport drivers at the same candidate SHA.
const binding=bindBuild();
const candidateBuildInfoFile=path.join(repoRoot,'dist/build-info.json');
const candidateBuildInfo=JSON.parse(await fs.readFile(candidateBuildInfoFile,'utf8'));
if(candidateBuildInfo.commit!==binding.sourceSha)throw new Error('Candidate build-info commit does not match the committed source SHA');
const stableRoot=process.env.OPENCLAW_PROOF_STABLE_ROOT??'<published-stable>';
const stableTarball=process.env.OPENCLAW_PROOF_STABLE_TARBALL??'<published-stable-tarball>';
const stableEntry=path.join(stableRoot,'dist/index.js');
const candidateEntry=path.join(repoRoot,'dist/index.js');
const stablePackage=JSON.parse(await fs.readFile(path.join(stableRoot,'package.json'),'utf8'));
const stableBuildInfo=JSON.parse(await fs.readFile(path.join(stableRoot,'dist/build-info.json'),'utf8'));
const hash=file=>createHash('sha256').update(fsSync.readFileSync(file)).digest('hex');
const stableTarballHash=hash(stableTarball);
if(stablePackage.version!=='2026.9.9'||stableTarballHash!=='a46df5fc5e4d73837d5b3eeebc286e64a85dffc429c30f3a07f6398e2a9423f7')throw new Error('Retained published-stable package differs from recorded release artifact');
const packagedStableEntry=execFileSync('tar',['-xOf',stableTarball,'package/dist/index.js']);
if(createHash('sha256').update(packagedStableEntry).digest('hex')!==hash(stableEntry))throw new Error('Stable Gateway entry differs from the published tarball');

// Resolve the current QA RPC wrapper by its local export name, never an old
// content-hashed filename. The wrapper only drives actual Gateway RPC.
const rpcExports=[];
for(const name of (await fs.readdir(path.join(repoRoot,'dist'))).filter(name=>name.startsWith('gateway-rpc-client-')&&name.endsWith('.mjs'))){
 const file=path.join(repoRoot,'dist',name),source=await fs.readFile(file,'utf8');
 for(const clause of source.matchAll(/export\s*\{([^}]+)\}/g))for(const entry of clause[1].split(',')){
  const parts=entry.trim().split(/\s+as\s+/);
  if(parts[0]==='startQaGatewayRpcClient')rpcExports.push({file,exportName:parts[1]??parts[0],sha256:hash(file)});
 }
}
if(rpcExports.length!==1)throw new Error(`Expected one built QA Gateway RPC client, found ${rpcExports.length}`);
const rpcBinding=rpcExports[0];
const startRpc=(await import(pathToFileURL(rpcBinding.file).href))[rpcBinding.exportName];
const attempt=process.env.OPENCLAW_PROOF_UPGRADE_ATTEMPT??'1';
if(!/^[A-Za-z0-9_-]{1,32}$/.test(attempt))throw new Error('Invalid upgrade attempt label');
const output=path.join(proofRoot,`upgrade-${binding.sourceSha.slice(0,12)}-${attempt}`);
await fs.mkdir(output); // Refuse accidental reuse of an existing proof state.
const root=path.join(output,'isolated-state');
await fs.mkdir(path.join(root,'workspace'),{recursive:true});
await fs.mkdir(path.join(root,'home'),{recursive:true});
const token=randomBytes(24).toString('hex');
const cfg={gateway:{mode:'local',auth:{mode:'token',token}},agents:{defaults:{workspace:path.join(root,'workspace'),timeoutSeconds:73}},messages:{responsePrefix:'QA-OPT-OUT-UPGRADE-PRESERVED'}};
const configPath=path.join(root,'openclaw.json');
await fs.writeFile(configPath,JSON.stringify(cfg));
const probe=createServer();
await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));
const port=probe.address().port;
await new Promise(resolve=>probe.close(resolve));
const env={PATH:process.env.PATH,LANG:process.env.LANG??'C.UTF-8',TZ:'UTC',HOME:path.join(root,'home'),OPENCLAW_HOME:path.join(root,'home'),OPENCLAW_STATE_DIR:path.join(root,'state'),OPENCLAW_CONFIG_PATH:configPath,OPENCLAW_GATEWAY_TOKEN:token,OPENCLAW_SKIP_CHANNELS:'1'};
const redact=value=>typeof value==='string'?value.replaceAll(token,'[REDACTED]'):JSON.stringify(value,null,2).replaceAll(token,'[REDACTED]');
const trace=[];
const startedAt=new Date().toISOString();
const provenance={candidateSha:binding.sourceSha,sourceStatus:binding.sourceStatus,buildInfo:candidateBuildInfo,buildInfoSha256:hash(candidateBuildInfoFile),gatewayEntrySha256:hash(candidateEntry),rpcClient:rpcBinding,publishedStable:{version:stablePackage.version,buildInfo:stableBuildInfo,tarball:stableTarball,tarballSha256:stableTarballHash,gatewayEntrySha256:hash(stableEntry)},stateDirectory:path.join(root,'state'),configPath,node:process.version,scope:'Actual stable Gateway-created session/history retained through candidate Doctor and candidate Gateway. Unset fallback field remains absent. This lane does not itself claim fallback delivery; the separate exact-head native and HTTP lanes measure that.'};
await fs.writeFile(path.join(output,'provenance.json'),redact(provenance));

async function start(entry,label){
 let logs='';
 const proc=spawn(process.execPath,[entry,'gateway','run','--port',String(port),'--bind','loopback','--allow-unconfigured'],{env,stdio:['ignore','pipe','pipe']});
 proc.stdout.on('data',b=>logs+=b);proc.stderr.on('data',b=>logs+=b);
 let stopped=false;
 const stop=async()=>{
  if(stopped)return;stopped=true;
  if(proc.exitCode===null){
   const ended=new Promise(resolve=>proc.once('exit',resolve));
   proc.kill('SIGTERM');
   const killTimer=setTimeout(()=>proc.kill('SIGKILL'),15000);
   try{await ended;}finally{clearTimeout(killTimer);}
  }
  await fs.writeFile(path.join(output,`${label}-gateway.log`),redact(logs));
 };
 try{
  let ready=false;
  for(let i=0;i<120;i++){
   if(proc.exitCode!==null)throw new Error(`${label} exited ${proc.exitCode}: ${logs}`);
   try{const response=await fetch(`http://127.0.0.1:${port}/health`);if(response.ok){ready=true;break;}}catch{}
   await sleep(1000);
  }
  if(!ready)throw new Error(`${label} readiness timeout: ${logs}`);
  const rpc=await startRpc({wsUrl:`ws://127.0.0.1:${port}`,token,logs:()=>logs});
  return {rpc,stop:async()=>{try{await rpc.stop();}finally{await stop();}}};
 }catch(error){await stop();throw error;}
}
async function call(rpc,phase,method,params){
 const response=await rpc.request(method,params);
 const event={timestamp:new Date().toISOString(),phase,method,params,response};
 trace.push(event);console.log(redact(event));return response;
}
function schemaSnapshot(phase){
 const databases={};
 for(const [name,file] of Object.entries({agent:path.join(root,'state/agents/main/agent/openclaw-agent.sqlite'),state:path.join(root,'state/state/openclaw.sqlite')})){
  const db=new DatabaseSync(file,{readOnly:true});
  try{databases[name]={file,userVersion:db.prepare('PRAGMA user_version').get().user_version,integrity:db.prepare('PRAGMA quick_check').get().quick_check};}finally{db.close();}
 }
 const event={timestamp:new Date().toISOString(),phase,databases};trace.push(event);console.log(redact(event));return event;
}
async function doctor(){
 const event={phase:'candidate-doctor',startedAt:new Date().toISOString(),command:['node','dist/index.js','doctor','--fix','--non-interactive','--yes']};
 const proc=spawn(process.execPath,[candidateEntry,'doctor','--fix','--non-interactive','--yes'],{env,stdio:['ignore','pipe','pipe']});
 let logs='';proc.stdout.on('data',b=>logs+=b);proc.stderr.on('data',b=>logs+=b);
 const exitCode=await new Promise((resolve,reject)=>{proc.once('error',reject);proc.once('exit',resolve);});
 Object.assign(event,{finishedAt:new Date().toISOString(),exitCode});trace.push(event);
 await fs.writeFile(path.join(output,'doctor.log'),redact(logs));
 console.log(redact(event));if(exitCode!==0)throw new Error(`Upgrade Doctor exited ${exitCode}`);
}
const hasField=config=>Object.hasOwn(config.agents?.defaults?.subagents??{},'dmCompletionFallback');
const key='agent:main:opt-out-upgrade-proof';
let current,verdict,error;
try{
 current=await start(stableEntry,'published-stable');
 const created=await call(current.rpc,'published-stable','sessions.reset',{key,reason:'new'});
 await call(current.rpc,'published-stable','chat.inject',{sessionKey:key,message:'QA-STABLE-OPT-OUT-PERSISTED-HISTORY'});
 const stableHistory=await call(current.rpc,'published-stable','chat.history',{sessionKey:key,limit:30});
 if(!stableHistory.sessionId||stableHistory.sessionId!==created.entry?.sessionId||!JSON.stringify(stableHistory).includes('QA-STABLE-OPT-OUT-PERSISTED-HISTORY'))throw new Error('Published stable did not create and read the actual persisted session/history');
 await current.stop();current=null;
 const before=JSON.parse(await fs.readFile(configPath,'utf8'));
 if(hasField(before))throw new Error('Stable fixture unexpectedly contains the new fallback field');
 await fs.writeFile(path.join(output,'config-before-doctor.json'),redact(before));
 const schemaBefore=schemaSnapshot('published-stable-shutdown-schema');
 await doctor();
 const schemaAfter=schemaSnapshot('candidate-doctor-schema');
 if(schemaBefore.databases.agent.userVersion!==24||schemaAfter.databases.agent.userVersion!==25)throw new Error('Actual expected published-stable agent schema v24 -> candidate v25 migration was not observed');
 if(Object.values(schemaAfter.databases).some(db=>db.integrity!=='ok'))throw new Error('Post-Doctor SQLite integrity check failed');
 current=await start(candidateEntry,'candidate');
 const loaded=await call(current.rpc,'candidate','config.get',{});
 const history=await call(current.rpc,'candidate','chat.history',{sessionKey:key,limit:30});
 if(history.sessionId!==stableHistory.sessionId||!JSON.stringify(history).includes('QA-STABLE-OPT-OUT-PERSISTED-HISTORY'))throw new Error('Candidate did not load the same stable Gateway-created session and history');
 if(loaded.parsed?.messages?.responsePrefix!==before.messages?.responsePrefix||loaded.parsed?.agents?.defaults?.timeoutSeconds!==73||hasField(loaded.parsed??{}))throw new Error('Candidate config RPC changed preserved settings or materialized the absent fallback field');
 await call(current.rpc,'candidate','chat.inject',{sessionKey:key,message:'QA-CANDIDATE-OPT-OUT-USES-EXISTING-SESSION'});
 const updated=await call(current.rpc,'candidate','chat.history',{sessionKey:key,limit:30});
 if(updated.sessionId!==stableHistory.sessionId||!JSON.stringify(updated).includes('QA-CANDIDATE-OPT-OUT-USES-EXISTING-SESSION')||!JSON.stringify(updated).includes('QA-STABLE-OPT-OUT-PERSISTED-HISTORY'))throw new Error('Candidate did not write/read the same retained session with both histories');
 await current.stop();current=null;
 const after=JSON.parse(await fs.readFile(configPath,'utf8'));
 await fs.writeFile(path.join(output,'config-after-candidate.json'),redact(after));
 if(after.messages?.responsePrefix!==before.messages?.responsePrefix||after.agents?.defaults?.timeoutSeconds!==73||after.agents?.defaults?.workspace!==before.agents?.defaults?.workspace||hasField(after))throw new Error('Settings changed or absent fallback field was materialized');
 assertBuildUnchanged(binding);
 if(hash(candidateBuildInfoFile)!==provenance.buildInfoSha256||hash(rpcBinding.file)!==rpcBinding.sha256||hash(stableEntry)!==provenance.publishedStable.gatewayEntrySha256)throw new Error('A bound runtime input changed during proof');
 verdict={phase:'verdict',pass:true,candidateSha:binding.sourceSha,sameSessionKey:key,sameSessionId:stableHistory.sessionId,agentSchema:{before:24,afterDoctor:25},configRetained:{responsePrefix:after.messages.responsePrefix,timeoutSeconds:after.agents.defaults.timeoutSeconds,workspace:after.agents.defaults.workspace,dmCompletionFallback:'absent-before-and-after'},actualGatewayHistoryRetained:true,actualGatewayReadWriteOnRetainedSession:true};
 trace.push(verdict);console.log(redact(verdict));
}catch(caught){error=caught;process.exitCode=1;console.error(redact(caught.stack??String(caught)));}
finally{
 if(current)try{await current.stop();}catch(stopError){error??=stopError;process.exitCode=1;}
 await fs.writeFile(path.join(output,'upgrade-trace.json'),redact(trace));
 await fs.writeFile(path.join(output,'receipt.json'),redact({candidateSha:binding.sourceSha,startedAt,finishedAt:new Date().toISOString(),exitCode:process.exitCode??0,proofStatus:verdict?.pass&&!error?'pass':'fail',verdict:verdict??null,error:error?.stack??(error?String(error):null),output}));
}
