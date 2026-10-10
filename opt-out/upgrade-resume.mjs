import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import {spawn, execFileSync} from 'node:child_process';
import {createServer} from 'node:net';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {pathToFileURL} from 'node:url';
import {setTimeout as sleep} from 'node:timers/promises';
import {bindBuild, assertBuildUnchanged, repoRoot, proofRoot} from './build-bindings.mjs';

// Continue one actual stable-created, Doctor-migrated state. This never reruns
// stable or Doctor and never replaces the failed initial receipt. It refuses
// admission until all six serialized native cases have terminal PASS receipts.
const binding=bindBuild();
const original=path.join(proofRoot,`upgrade-${binding.sourceSha.slice(0,12)}-1`);
const output=path.join(proofRoot,`upgrade-${binding.sourceSha.slice(0,12)}-continuation-1`);
const originalReceiptFile=path.join(original,'receipt.json');
const originalTraceFile=path.join(original,'upgrade-trace.json');
const originalProvenanceFile=path.join(original,'provenance.json');
const originalReceipt=JSON.parse(await fs.readFile(originalReceiptFile,'utf8'));
const originalTrace=JSON.parse(await fs.readFile(originalTraceFile,'utf8'));
const originalProvenance=JSON.parse(await fs.readFile(originalProvenanceFile,'utf8'));
const nativeFile=path.join(repoRoot,'.artifacts/dm-runtime-proof-opt-out/native-matrix-verification.json');
const native=JSON.parse(await fs.readFile(nativeFile,'utf8'));
if(native.sourceSha!==binding.sourceSha||native.completedCases!==6||native.passedCases!==6||native.totalCases!==6||native.cases?.some(c=>!c.pass||c.terminalReceipt?.exitStatus!==0))throw new Error('Native Gateway matrix is not six terminal PASS cases at the bound head; do not boot another Gateway');
const activeCandidateGatewayPids=[];
for(const pid of (await fs.readdir('/proc')).filter(name=>/^\d+$/.test(name))){
 try{const args=(await fs.readFile(`/proc/${pid}/cmdline`,'utf8')).split('\0');if(args.includes(path.join(repoRoot,'dist/index.js'))&&args.includes('gateway')&&args.includes('run'))activeCandidateGatewayPids.push(Number(pid));}catch{}
}
if(activeCandidateGatewayPids.length)throw new Error(`Native Gateway processes have not stopped: ${activeCandidateGatewayPids.join(', ')}`);
if(originalReceipt.candidateSha!==binding.sourceSha||originalReceipt.exitCode!==1||originalReceipt.proofStatus!=='fail'||!String(originalReceipt.error).startsWith('Error: candidate readiness timeout:'))throw new Error('Continuation does not match the retained original readiness failure');
const doctor=originalTrace.find(e=>e.phase==='candidate-doctor');
const schemaBefore=originalTrace.find(e=>e.phase==='published-stable-shutdown-schema');
const schemaAfter=originalTrace.find(e=>e.phase==='candidate-doctor-schema');
const stableHistory=originalTrace.find(e=>e.phase==='published-stable'&&e.method==='chat.history')?.response;
const created=originalTrace.find(e=>e.phase==='published-stable'&&e.method==='sessions.reset')?.response;
const key='agent:main:opt-out-upgrade-proof';
if(doctor?.exitCode!==0||schemaBefore?.databases?.agent?.userVersion!==24||schemaAfter?.databases?.agent?.userVersion!==25||schemaBefore?.databases?.state?.userVersion!==19||schemaAfter?.databases?.state?.userVersion!==20||Object.values(schemaAfter.databases).some(db=>db.integrity!=='ok'))throw new Error('Retained actual Doctor migration evidence is incomplete');
if(!stableHistory?.sessionId||stableHistory.sessionId!==created?.entry?.sessionId||stableHistory.sessionKey!==key||!JSON.stringify(stableHistory).includes('QA-STABLE-OPT-OUT-PERSISTED-HISTORY'))throw new Error('Retained published stable did not create and read the actual expected session/history');
const hash=file=>createHash('sha256').update(fsSync.readFileSync(file)).digest('hex');
const candidateBuildInfoFile=path.join(repoRoot,'dist/build-info.json');
const candidateEntry=path.join(repoRoot,'dist/index.js');
const candidateBuildInfo=JSON.parse(await fs.readFile(candidateBuildInfoFile,'utf8'));
if(candidateBuildInfo.commit!==binding.sourceSha||hash(candidateBuildInfoFile)!==originalProvenance.buildInfoSha256||hash(candidateEntry)!==originalProvenance.gatewayEntrySha256)throw new Error('Candidate entry/build-info no longer matches the original upgrade attempt');
const rpcExports=[];
for(const name of (await fs.readdir(path.join(repoRoot,'dist'))).filter(name=>name.startsWith('gateway-rpc-client-')&&name.endsWith('.mjs'))){
 const file=path.join(repoRoot,'dist',name),source=await fs.readFile(file,'utf8');
 for(const clause of source.matchAll(/export\s*\{([^}]+)\}/g))for(const entry of clause[1].split(',')){
  const parts=entry.trim().split(/\s+as\s+/);
  if(parts[0]==='startQaGatewayRpcClient')rpcExports.push({file,exportName:parts[1]??parts[0],sha256:hash(file)});
 }
}
if(rpcExports.length!==1)throw new Error('Expected exactly one actual built QA Gateway RPC client');
const rpcBinding=rpcExports[0];
if(rpcBinding.sha256!==originalProvenance.rpcClient.sha256)throw new Error('Actual Gateway RPC client differs from the initial attempt');
const startRpc=(await import(pathToFileURL(rpcBinding.file).href))[rpcBinding.exportName];
const root=path.join(original,'isolated-state');
const configPath=path.join(root,'openclaw.json');
const before=JSON.parse(await fs.readFile(path.join(original,'config-before-doctor.json'),'utf8'));
const retainedConfig=JSON.parse(await fs.readFile(configPath,'utf8'));
const token=retainedConfig.gateway?.auth?.token;
if(typeof token!=='string'||token.length!==48)throw new Error('Actual retained local fixture token is missing');
const hasField=config=>Object.hasOwn(config.agents?.defaults?.subagents??{},'dmCompletionFallback');
if(hasField(before)||hasField(retainedConfig)||retainedConfig.messages?.responsePrefix!==before.messages?.responsePrefix||retainedConfig.agents?.defaults?.timeoutSeconds!==73||retainedConfig.agents?.defaults?.workspace!==before.agents?.defaults?.workspace)throw new Error('Retained Doctor state changed preserved settings or materialized the absent fallback field');
const env={PATH:process.env.PATH,LANG:process.env.LANG??'C.UTF-8',TZ:'UTC',HOME:path.join(root,'home'),OPENCLAW_HOME:path.join(root,'home'),OPENCLAW_STATE_DIR:path.join(root,'state'),OPENCLAW_CONFIG_PATH:configPath,OPENCLAW_GATEWAY_TOKEN:token,OPENCLAW_SKIP_CHANNELS:'1'};
const redact=value=>typeof value==='string'?value.replaceAll(token,'[REDACTED]'):JSON.stringify(value,null,2).replaceAll(token,'[REDACTED]');
await fs.mkdir(output); // Separate one-use output; preserve all original failure records.
const recordFiles=['receipt.json','upgrade-trace.json','provenance.json','config-before-doctor.json','published-stable-gateway.log','doctor.log','candidate-gateway.log'];
const originalRecordHashes=Object.fromEntries(recordFiles.map(file=>[file,hash(path.join(original,file))]));
// Preserve the exact failed-attempt state before the real candidate reopens it.
// The continuation itself uses the original real migrated state directory.
const snapshot=path.join(output,'preserved-pre-continuation-state');
await fs.cp(root,snapshot,{recursive:true,errorOnExist:true,force:false});
const trace=[];
const startedAt=new Date().toISOString();
const provenance={candidateSha:binding.sourceSha,sourceStatus:binding.sourceStatus,buildBindings:binding,buildInfo:candidateBuildInfo,buildInfoSha256:hash(candidateBuildInfoFile),gatewayEntrySha256:hash(candidateEntry),rpcClient:rpcBinding,originalAttempt:{directory:original,receipt:originalReceipt,recordHashes:originalRecordHashes,doctorMigration:{agent:{before:24,afterDoctor:25},state:{before:19,afterDoctor:20}}},nativePrerequisite:{verification:nativeFile,sha256:hash(nativeFile),completedCases:6,passedCases:6},stateDirectory:path.join(root,'state'),configPath,preservedOriginalState:snapshot,sameSessionKey:key,sameStableCreatedSessionId:stableHistory.sessionId,node:process.version,readiness:{polls:120,intervalMs:1000,unchangedFromInitial:true},scope:'Continue the same actual stable-created and Doctor-migrated state after the first candidate boot exceeded unchanged readiness bounds under concurrent native Gateway/large type-graph workload. Stable and Doctor are not rerun. The failed initial receipt remains a failure; serialization is a controlled resource-contention diagnosis, not a claimed product startup repair.'};
await fs.writeFile(path.join(output,'provenance.json'),redact(provenance));
await fs.writeFile(path.join(output,'config-before-continuation.json'),redact(retainedConfig));
const probe=createServer();
await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));
const port=probe.address().port;
await new Promise(resolve=>probe.close(resolve));

function schemaSnapshot(phase){
 const databases={};
 for(const [name,file] of Object.entries({agent:path.join(root,'state/agents/main/agent/openclaw-agent.sqlite'),state:path.join(root,'state/state/openclaw.sqlite')})){
  const db=new DatabaseSync(file,{readOnly:true});
  try{databases[name]={file,userVersion:db.prepare('PRAGMA user_version').get().user_version,integrity:db.prepare('PRAGMA quick_check').get().quick_check,sha256:hash(file)};}finally{db.close();}
 }
 const event={timestamp:new Date().toISOString(),phase,databases};trace.push(event);console.log(redact(event));return event;
}
async function call(rpc,method,params){
 const response=await rpc.request(method,params);
 const event={timestamp:new Date().toISOString(),phase:'candidate-continuation',method,params,response};
 trace.push(event);console.log(redact(event));return response;
}
async function start(){
 let logs='';
 const spawnedAt=Date.now();
 const proc=spawn(process.execPath,[candidateEntry,'gateway','run','--port',String(port),'--bind','loopback','--allow-unconfigured'],{env,stdio:['ignore','pipe','pipe']});
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
  await fs.writeFile(path.join(output,'candidate-gateway.log'),redact(logs));
 };
 try{
  let ready=false;
  for(let i=0;i<120;i++){
   if(proc.exitCode!==null)throw new Error(`candidate exited ${proc.exitCode}: ${logs}`);
   try{const response=await fetch(`http://127.0.0.1:${port}/health`);if(response.ok){ready=true;trace.push({timestamp:new Date().toISOString(),phase:'candidate-health-ready',healthHttpStatus:response.status,elapsedMs:Date.now()-spawnedAt,poll:i+1});break;}}catch{}
   await sleep(1000);
  }
  if(!ready)throw new Error(`candidate readiness timeout: ${logs}`);
  const rpc=await startRpc({wsUrl:`ws://127.0.0.1:${port}`,token,logs:()=>logs});
  trace.push({timestamp:new Date().toISOString(),phase:'candidate-rpc-connected',evidenceIdentity:rpc.evidenceIdentity});
  return {rpc,stop:async()=>{try{await rpc.stop();}finally{await stop();}}};
 }catch(error){await stop();throw error;}
}
let current,verdict,error;
try{
 const retainedSchema=schemaSnapshot('retained-migrated-state-before-continuation');
 if(retainedSchema.databases.agent.userVersion!==25||retainedSchema.databases.state.userVersion!==20||Object.values(retainedSchema.databases).some(db=>db.integrity!=='ok'))throw new Error('The original real migrated state is no longer healthy v25/v20');
 current=await start();
 const loaded=await call(current.rpc,'config.get',{});
 const history=await call(current.rpc,'chat.history',{sessionKey:key,limit:30});
 if(history.sessionId!==stableHistory.sessionId||!JSON.stringify(history).includes('QA-STABLE-OPT-OUT-PERSISTED-HISTORY'))throw new Error('Candidate did not load the same stable Gateway-created session and history');
 if(loaded.parsed?.messages?.responsePrefix!==before.messages?.responsePrefix||loaded.parsed?.agents?.defaults?.timeoutSeconds!==73||hasField(loaded.parsed??{}))throw new Error('Candidate config RPC changed preserved settings or materialized the absent fallback field');
 await call(current.rpc,'chat.inject',{sessionKey:key,message:'QA-CANDIDATE-OPT-OUT-USES-EXISTING-SESSION'});
 const updated=await call(current.rpc,'chat.history',{sessionKey:key,limit:30});
 if(updated.sessionId!==stableHistory.sessionId||!JSON.stringify(updated).includes('QA-CANDIDATE-OPT-OUT-USES-EXISTING-SESSION')||!JSON.stringify(updated).includes('QA-STABLE-OPT-OUT-PERSISTED-HISTORY'))throw new Error('Candidate did not write/read the same retained session with both histories');
 await current.stop();current=null;
 const after=JSON.parse(await fs.readFile(configPath,'utf8'));
 await fs.writeFile(path.join(output,'config-after-candidate.json'),redact(after));
 if(after.messages?.responsePrefix!==before.messages?.responsePrefix||after.agents?.defaults?.timeoutSeconds!==73||after.agents?.defaults?.workspace!==before.agents?.defaults?.workspace||hasField(after))throw new Error('Settings changed or absent fallback field was materialized');
 const finalSchema=schemaSnapshot('candidate-continuation-shutdown-schema');
 if(finalSchema.databases.agent.userVersion!==25||finalSchema.databases.state.userVersion!==20||Object.values(finalSchema.databases).some(db=>db.integrity!=='ok'))throw new Error('Candidate changed the migrated schemas or database integrity failed');
 assertBuildUnchanged(binding);
 if(hash(candidateBuildInfoFile)!==provenance.buildInfoSha256||hash(rpcBinding.file)!==rpcBinding.sha256||recordFiles.some(file=>hash(path.join(original,file))!==originalRecordHashes[file]))throw new Error('A bound runtime input or original failure record changed during continuation');
 verdict={phase:'verdict',pass:true,candidateSha:binding.sourceSha,sameSessionKey:key,sameSessionId:stableHistory.sessionId,originalAttemptStatus:'fail',originalFailure:'candidate-readiness-timeout',continuationStatus:'pass',agentSchema:{beforeStable:24,afterDoctor:25,afterContinuation:25},stateSchema:{beforeStable:19,afterDoctor:20,afterContinuation:20},configRetained:{responsePrefix:after.messages.responsePrefix,timeoutSeconds:after.agents.defaults.timeoutSeconds,workspace:after.agents.defaults.workspace,dmCompletionFallback:'absent-before-and-after'},actualGatewayHistoryRetained:true,actualGatewayReadWriteOnRetainedSession:true,initialRecordsUnchanged:true,preservedFailedAttemptState:snapshot,readiness:trace.find(e=>e.phase==='candidate-health-ready'),remainingStartupUncertainty:'A serialized continuation within the unchanged readiness bound supports resource contention as the original cause, but does not prove startup under arbitrary concurrent workload or claim a product startup repair.'};
 trace.push(verdict);console.log(redact(verdict));
}catch(caught){error=caught;process.exitCode=1;console.error(redact(caught.stack??String(caught)));}
finally{
 if(current)try{await current.stop();}catch(stopError){error??=stopError;process.exitCode=1;}
 await fs.writeFile(path.join(output,'upgrade-trace.json'),redact(trace));
 const receipt={candidateSha:binding.sourceSha,startedAt,finishedAt:new Date().toISOString(),exitCode:process.exitCode??0,proofStatus:verdict?.pass&&!error?'pass':'fail',verdict:verdict??null,error:error?.stack??(error?String(error):null),output};
 await fs.writeFile(path.join(output,'receipt.json'),redact(receipt));
 await fs.writeFile(path.join(proofRoot,'upgrade-combined-verification.json'),redact({schemaVersion:1,candidateSha:binding.sourceSha,recordedAt:new Date().toISOString(),initialAttempt:{receiptFile:originalReceiptFile,sha256:originalRecordHashes['receipt.json'],status:'fail',exitCode:1,failure:'candidate-readiness-timeout',actualPublishedStableSessionCreated:true,actualDoctorExitCode:doctor.exitCode,agentMigration:{before:24,after:25},stateMigration:{before:19,after:20}},continuation:{receiptFile:path.join(output,'receipt.json'),...receipt},sameActualDoctorMigratedState:true,sameStableCreatedSessionId:stableHistory.sessionId,stableAndDoctorRerun:false,nativeBootSerializationPrerequisite:{verification:nativeFile,completedCases:6,passedCases:6},status:receipt.proofStatus==='pass'?'pass-after-retained-initial-failure':'fail',scopeLimitations:['Initial candidate readiness failure is retained and is not recast as a pass.','Same Doctor-migrated state is continued; the exact pre-continuation state is preserved separately.','Readiness uses the original unchanged 120 one-second poll bound.','Serialization is a controlled resource-contention diagnosis, not a source repair or proof of startup under arbitrary concurrent workload.','This lane proves real shipped stable -> Doctor -> built candidate state/config/session retention, not public-package candidate installation or fallback delivery by itself.']}));
}
