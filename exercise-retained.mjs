// Diagnostic only: real Gateway RPCs and loopback inference, not Android UI proof.
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {parseArgs} from 'node:util';
import {randomUUID,createHash} from 'node:crypto';
const {values:a}=parseArgs({options:{case:{type:'string'},package:{type:'string'},seconds:{type:'string',default:'150'},seed:{type:'string'},discoveryCount:{type:'string',default:'15'}}});
if(!a.case||!a.package)throw Error('--case and --package required');
const root=path.resolve(a.case),cfg=JSON.parse(fs.readFileSync(path.join(root,'config.json'),'utf8'));
const secs=Number(a.seconds);
if(secs<30||secs>240)throw Error('30..240s only');
const model=typeof cfg.agents.defaults.model==='string'?cfg.agents.defaults.model:cfg.agents.defaults.model.primary;
const providerId=model.split('/')[0], provider=cfg.models.providers[providerId];
if(!provider||!new URL(provider.baseUrl).hostname.match(/^(127\.0\.0\.1|localhost)$/)||!String(provider.apiKey).includes('synthetic'))throw Error('Only synthetic loopback inference allowed');
const agentIds=a.seed?['agent15','agent16']:Object.keys(cfg.agents.entries).slice(0,2);
const require=createRequire(path.join(path.resolve(a.package),'package.json'));
const {WebSocket}=require('ws');
const wire=path.join(root,'diagnostic-wire.jsonl');fs.closeSync(fs.openSync(wire,'wx',0o600));
const receipt={startedAtMs:Date.now(),sourceSha256:createHash('sha256').update(fs.readFileSync(new URL(import.meta.url))).digest('hex'),model,agentIds,seconds:secs,syntheticInference:true,android:false,injectedEvents:false,requests:[],events:{},turns:[]};
const save=()=>fs.writeFileSync(path.join(root,'diagnostic-receipt.json'),JSON.stringify(receipt,null,2),{mode:0o600});
const record=(dir,frame)=>fs.appendFileSync(wire,JSON.stringify({atMs:Date.now(),dir,frame})+'\n');
let seq=0,connectResolve,connectReject,closing=false;
const connected=new Promise((res,rej)=>{connectResolve=res;connectReject=rej});
const pending=new Map(),socket=new WebSocket(`ws://127.0.0.1:${cfg.gateway.port}`);
const rejectAll=err=>{connectReject(err);for(const p of pending.values()){clearTimeout(p.timer);p.reject(err)}pending.clear()};
const connectionTimer=setTimeout(()=>connectReject(Error('connect timeout')),25000);
function send(frame){record('sent',frame.method==='connect'?{...frame,params:{...frame.params,auth:{token:'[synthetic-redacted]'}}}:frame);socket.send(JSON.stringify(frame))}
function rpc(method,params={},timeout=20000){return new Promise((resolve,reject)=>{const id=String(++seq),row={id,method,params,startedAtMs:Date.now()};receipt.requests.push(row);save();const timer=setTimeout(()=>{pending.delete(id);row.timeout=true;row.finishedAtMs=Date.now();save();reject(Error(method+' timed out; not replayed'))},timeout);pending.set(id,{resolve,reject,timer,row});send({type:'req',id,method,params})})}
socket.on('message',bytes=>{const f=JSON.parse(bytes);record('received',f);if(f.event){receipt.events[f.event]=(receipt.events[f.event]??0)+1}
if(f.event==='connect.challenge')send({type:'req',id:'connect',method:'connect',params:{minProtocol:4,maxProtocol:4,client:{id:'cli',version:'multiagent-admission-diagnostic',platform:'linux',mode:'cli'},role:'operator',scopes:['operator.admin'],auth:{token:cfg.gateway.auth.token}}});
if(f.type==='res'&&f.id==='connect'){clearTimeout(connectionTimer);f.ok?connectResolve(f.payload):connectReject(Error(JSON.stringify(f.error)));return}
const p=f.type==='res'?pending.get(f.id):undefined;if(!p)return;pending.delete(f.id);clearTimeout(p.timer);Object.assign(p.row,{finishedAtMs:Date.now(),ok:f.ok,error:f.error,modelCount:f.payload?.models?.length,refreshFailed:f.payload?.refreshFailed,status:f.payload?.status});save();f.ok?p.resolve(f.payload):p.reject(Error(f.error?.message??'RPC refused'))});
socket.on('error',rejectAll);socket.on('close',()=>{if(!closing)rejectAll(Error('socket closed'))});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
let sessions=[];
async function turn(session,phase){const t={phase,agentId:session.agentId,key:session.key,startedAtMs:Date.now(),idempotencyKey:randomUUID()};receipt.turns.push(t);save();try{const sent=await rpc('chat.send',{sessionKey:session.key,message:'Reply with the synthetic test marker.',idempotencyKey:t.idempotencyKey});t.runId=sent.runId;t.sendStatus=sent.status;save();if(typeof t.runId!=='string')throw Error('Missing run id');const final=await rpc('agent.wait',{runId:t.runId,timeoutMs:20000},25000);t.final=final;if(final.status==='ok'){const h=await rpc('chat.history',{sessionKey:session.key});t.assistantTexts=(h.messages??[]).filter(m=>m.role==='assistant').flatMap(m=>(m.content??[]).filter(c=>c.type==='text').map(c=>c.text));t.persistedFixtureReply=t.assistantTexts.some(s=>s.includes('NATIVE_CATALOG_TURN_OK')||s.includes('MULTIAGENT_'))}else if(!['error','aborted','cancelled'].includes(final.status)){t.abort=await rpc('chat.abort',{sessionKey:session.key,runId:t.runId},8000)}}catch(e){t.error=e.message}finally{t.finishedAtMs=Date.now();save()}}
const hard=setTimeout(()=>{receipt.hardDeadline=true;save();socket.terminate()},(secs+35)*1000);
try{await connected;receipt.connectedAtMs=Date.now();save();
// One selected-agent catalog read. No synthetic metadata events, refresh=true, or poll loop.
try{const c=await rpc('models.list',{agentId:agentIds[0],view:'configured',includeDetails:true},30000);receipt.firstCatalog={count:c.models?.length,refreshFailed:c.refreshFailed,pendingProviders:c.pendingProviders}}catch(e){receipt.firstCatalogError=e.message}save();
if(a.seed){
 const seed=JSON.parse(fs.readFileSync(a.seed,'utf8'));if(seed.status!=='seeded')throw Error('Incomplete retained seed');
 sessions=agentIds.map(agentId=>{const s=seed.sessions.find(s=>s.agentId===agentId);if(!s)throw Error('Missing retained agent');return {agentId,key:s.key}});
 const deadline=Date.now()+90000,required=Number(a.discoveryCount);
 if(!Number.isInteger(required)||required<1||required>30)throw Error('Bad discovery count');
 while(true){
  const f=path.join(root,'codex-events.jsonl');const rows=fs.existsSync(f)?fs.readFileSync(f,'utf8').trim().split('\n').filter(Boolean).flatMap(l=>{try{return [JSON.parse(l)]}catch{return []}}):[];
  const seen=new Set(rows.filter(r=>r.kind==='request'&&r.method==='model/list').map(r=>r.pid));
  if(seen.size>=required){receipt.overlapTrigger={atMs:Date.now(),required,observed:seen.size,retainedKeys:sessions.map(s=>s.key)};save();break}
  if(Date.now()>deadline)throw Error('Natural discovery overlap not observed; no turn sent');await delay(100);
 }
}else{
for(const agentId of agentIds){const key=`agent:${agentId}:admission-${randomUUID()}`;try{const c=await rpc('sessions.create',{agentId,key,model},25000);if(c.ok!==true||c.key!==key)throw Error('Unexpected session identity');sessions.push({agentId,key})}catch(e){receipt.turns.push({agentId,phase:'create',error:e.message})}save()}
}
await Promise.all(sessions.map(s=>turn(s,'initial')));
const firstElapsed=Date.now()-receipt.connectedAtMs;
if(firstElapsed<60000)await delay(60000-firstElapsed);
try{const c=await rpc('models.list',{agentId:agentIds[0],view:'configured',includeDetails:true},20000);receipt.laterCatalog={count:c.models?.length,refreshFailed:c.refreshFailed,pendingProviders:c.pendingProviders}}catch(e){receipt.laterCatalogError=e.message}
await Promise.all(sessions.map(s=>turn(s,'retained-after-discovery-deadline')));
const elapsed=Date.now()-receipt.connectedAtMs;if(elapsed<secs*1000)await delay(secs*1000-elapsed);
receipt.status='observed';
}catch(e){receipt.status='failed';receipt.error=e.message}
finally{clearTimeout(connectionTimer);clearTimeout(hard);closing=true;receipt.finishedAtMs=Date.now();receipt.pendingMethods=[...pending.values()].map(p=>p.row.method);save();rejectAll(Error('diagnostic settled'));socket.close();setTimeout(()=>socket.terminate(),1000).unref();console.log(JSON.stringify({status:receipt.status,error:receipt.error,events:receipt.events,turns:receipt.turns.map(t=>({phase:t.phase,agentId:t.agentId,status:t.final?.status,error:t.error,persistedFixtureReply:t.persistedFixtureReply}))}))}
process.exitCode=receipt.status==='observed'?0:1;
