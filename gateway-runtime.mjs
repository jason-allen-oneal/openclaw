import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
const run = promisify(execFile);
const buildRoot = process.env.PROOF_BUILD_ROOT;
const sourceRoot = process.env.PROOF_SOURCE_ROOT;
const artifactRoot = process.env.PROOF_ARTIFACT_ROOT;
if (!buildRoot || !sourceRoot || !artifactRoot) throw new Error('Explicit isolated roots required');
const { acquireTestPortBlock } = await import(pathToFileURL(path.join(sourceRoot, 'src/test-utils/port-claims.ts')).href);
const claim = await acquireTestPortBlock({offsets: [0,1,2,3,4]});
const stateDir = path.join(artifactRoot,'state');
const workspaceDir = path.join(artifactRoot,'workspace');
const configPath = path.join(stateDir,'openclaw.json');
const homeDir = path.join(artifactRoot,'home');
await Promise.all([fs.mkdir(stateDir,{recursive:true}),fs.mkdir(workspaceDir,{recursive:true}),fs.mkdir(homeDir,{recursive:true})]);
const config = {
 gateway:{mode:'local',port:claim.port,bind:'loopback',auth:{mode:'none'},controlUi:{enabled:false}},
 agents:{defaults:{workspace:workspaceDir,userTimezone:'UTC',skipBootstrap:true}},
 hooks:{internal:{enabled:true,entries:{'session-memory':{enabled:true,llmSlug:false}}}},
 plugins:{enabled:false},discovery:{mdns:{mode:'off'}},cron:{enabled:false},
 logging:{file:path.join(artifactRoot,'gateway-runtime.jsonl')},
};
await fs.writeFile(configPath,JSON.stringify(config,null,2));
const env = {...process.env,HOME:homeDir,OPENCLAW_STATE_DIR:stateDir,OPENCLAW_CONFIG_PATH:configPath,
 OPENCLAW_SKIP_BROWSER_CONTROL_SERVER:'1',OPENCLAW_SKIP_CANVAS_HOST:'1',OPENCLAW_SKIP_CHANNELS:'1',
 OPENCLAW_SKIP_CRON:'1',OPENCLAW_SKIP_GMAIL_WATCHER:'1',OPENCLAW_SKIP_PROVIDERS:'1',TZ:'UTC'};
for (const key of ['OPENCLAW_GATEWAY_URL','OPENCLAW_GATEWAY_PORT','OPENCLAW_GATEWAY_TOKEN','OPENCLAW_GATEWAY_PASSWORD','OPENCLAW_HOME']) delete env[key];
const transcript = [];
const call = async (method,params={}) => {
 const args = ['openclaw.mjs','gateway','call',method,'--params',JSON.stringify(params),'--port',String(claim.port),'--timeout','120000','--json'];
 const startedAt = new Date().toISOString();
 try {
  const result = await run(process.execPath,args,{cwd:buildRoot,env,timeout:180000,maxBuffer:2*1024*1024});
  transcript.push({method,params,startedAt,finishedAt:new Date().toISOString(),...result});
  const firstBrace = result.stdout.indexOf('{');
  return JSON.parse(result.stdout.slice(firstBrace));
 } catch (error) {
  transcript.push({method,params,startedAt,error:String(error),stdout:error.stdout,stderr:error.stderr});
  throw error;
 }
};
let gateway;
let gatewayDone;
let logHandle;
const delay = (ms) => new Promise(resolve=>setTimeout(resolve,ms));
const stop = async () => {
 if (!gateway) return;
 gateway.kill('SIGTERM');
 const timer = setTimeout(()=>gateway?.kill('SIGKILL'),45000);
 const exit = await gatewayDone;
 clearTimeout(timer);
 await logHandle.close();
 gateway=undefined;
 return exit;
};
const start = async (label) => {
 logHandle = await fs.open(path.join(artifactRoot,`gateway-${label}.log`),'w');
 gateway=spawn(process.execPath,['openclaw.mjs','gateway','run','--port',String(claim.port)],{
  cwd:buildRoot,env,stdio:['ignore',logHandle.fd,logHandle.fd]});
 gatewayDone=new Promise(resolve=>gateway.once('exit',(code,signal)=>resolve({code,signal})));
 const deadline=Date.now()+180000;
 while(Date.now()<deadline) {
  if (gateway.exitCode!==null) throw new Error(`Gateway exited: ${gateway.exitCode}`);
  try {const r=await fetch(`http://127.0.0.1:${claim.port}/healthz`); if(r.ok) break;} catch {}
  await delay(250);
 }
 const health=await call('health');
 console.log(JSON.stringify({event:'gateway-ready',label,pid:gateway.pid,port:claim.port,health}));
};
const markers=[];
const sessions=[];
const capture = async (label) => {
 const contenders=6;
 for(let i=0;i<contenders;i++) {
  const key=`agent:main:memory-proof-${label}-${i+1}`;
  const marker=`CAPTURE-${label}-${i+1}-ONLY`;
  const created=await call('sessions.create',{key,agentId:'main'});
  const injected=await call('chat.inject',{sessionKey:key,agentId:'main',message:marker});
  sessions.push({key,marker,created,injected});
  markers.push(marker);
 }
 const resets=await Promise.all(sessions.slice(-contenders).map(({key})=>call('sessions.reset',{key,agentId:'main',reason:'reset'})));
 console.log(JSON.stringify({event:'resets-complete',label,count:resets.length}));
 const logPath=path.join(artifactRoot,`gateway-${label}.log`);
 const deadline=Date.now()+120000;
 while(Date.now()<deadline) {
  const content=await fs.readFile(logPath,'utf8');
  const settled=(content.match(/Session context saved to|Failed to save session memory/g)??[]).length;
  if(settled>=contenders) return {settled};
  await delay(100);
 }
 throw new Error('Memory writes did not settle within 120 seconds');
};
const inspect=async(label)=>{
 const memoryDir=path.join(workspaceDir,'memory');
 const names=(await fs.readdir(memoryDir)).filter(n=>n.endsWith('.md')).sort();
 const db=new DatabaseSync(path.join(stateDir,'state/openclaw.sqlite'),{readOnly:true});
 let provenance;
 try {provenance=db.prepare('SELECT value_json FROM plugin_state_entries WHERE plugin_id = ? AND namespace = ?').all('core:memory-artifact-provenance','workspace-files').map(r=>JSON.parse(r.value_json));} finally {db.close();}
 const artifacts=await Promise.all(names.map(async name=>{
  const text=await fs.readFile(path.join(memoryDir,name),'utf8');
  const hash=createHash('sha256').update(text).digest('hex');
  const row=provenance.find(row=>row.relativePath===`memory/${name}`);
  const sessionId=/\*\*Session ID\*\*: ([^\n]+)/.exec(text)?.[1];
  const sessionKey=/\*\*Session Key\*\*: ([^\n]+)/.exec(text)?.[1];
  return {name,hash,sessionId,sessionKey,provenance:row,matchingProvenance:row?.fileHash===hash&&row?.sessionId===sessionId&&row?.sessionKey===sessionKey,markers:markers.filter(m=>text.includes(m))};
 }));
 const retained=Object.fromEntries(markers.map(m=>[m,artifacts.filter(a=>a.markers.includes(m)).length]));
 return {label,artifacts,retained,passed:Object.values(retained).every(n=>n===1)&&artifacts.every(a=>a.matchingProvenance)};
};
const label=process.env.PROOF_LABEL??'baseline';
const receipt={label,sourceHead:process.env.PROOF_SOURCE_HEAD,buildRoot,entrypoint:'openclaw gateway call sessions.reset (real loopback WebSocket)',sessions,transcript,stages:[]};
try {
 const prior=process.env.PROOF_RETAIN_EXISTING==='1'?await inspect('before-upgrade'):undefined;
 if(prior) receipt.priorState=prior;
 await start(label);
 const writes=await capture(label);
 const shutdown=await stop();
 const firstStage=await inspect(label);
 if(prior) firstStage.previousBytesRetained=prior.artifacts.every(a=>firstStage.artifacts.some(b=>b.name===a.name&&b.hash===a.hash));
 receipt.stages.push({...firstStage,writes,shutdown});
 if (process.env.PROOF_RESTART==='1') {
  const before=receipt.stages[0].artifacts;
  await start(`${label}-restart`);
  const writes=await capture(`${label}-restart`);
  const shutdown=await stop();
  const stage=await inspect(`${label}-restart`);
  stage.previousBytesRetained=before.every(a=>stage.artifacts.some(b=>b.name===a.name&&b.hash===a.hash));
  receipt.stages.push({...stage,writes,shutdown});
 }
 receipt.passed=receipt.stages.every(stage=>stage.passed&&stage.previousBytesRetained!==false&&stage.shutdown.code===0);
} catch(error) {
 receipt.error=String(error);
 receipt.passed=false;
 throw error;
} finally {
 await stop();
 await claim.release();
 await fs.writeFile(path.join(artifactRoot,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');
 console.log(JSON.stringify({event:'result',passed:receipt.passed,stageCounts:receipt.stages.map(s=>s.artifacts.length),error:receipt.error}));
}
process.exit(receipt.passed?0:2);
