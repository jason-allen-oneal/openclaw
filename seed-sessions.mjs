// Unmeasured ordinary RPC seed. No chat/inference, direct DB access, or retries.
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {parseArgs} from 'node:util';
import {createHash} from 'node:crypto';
const {values:a}=parseArgs({options:{case:{type:'string'},package:{type:'string'}}});
if(!a.case||!a.package)throw Error('--case and --package required');
const root=path.resolve(a.case),cfg=JSON.parse(fs.readFileSync(path.join(root,'config.json')));
const file=path.join(root,'session-seed-receipt.json');fs.closeSync(fs.openSync(file,'wx',0o600));
const model=cfg.agents.defaults.model.primary,agentIds=Object.keys(cfg.agents.entries);
if(agentIds.length!==30||!model.startsWith('fixture/'))throw Error('Expected exact 30-agent synthetic fixture');
const receipt={startedAtMs:Date.now(),sourceSha256:createHash('sha256').update(fs.readFileSync(new URL(import.meta.url))).digest('hex'),unmeasuredSeed:true,chatTurns:0,requests:[],sessions:[]};
const save=()=>fs.writeFileSync(file,JSON.stringify(receipt,null,2),{mode:0o600});save();
const {WebSocket}=createRequire(path.join(path.resolve(a.package),'package.json'))('ws');
let seq=0,connectResolve,connectReject,closing=false;
const connected=new Promise((resolve,reject)=>{connectResolve=resolve;connectReject=reject});
const pending=new Map(),ws=new WebSocket(`ws://127.0.0.1:${cfg.gateway.port}`);
const rejectAll=e=>{connectReject(e);for(const p of pending.values()){clearTimeout(p.timer);p.reject(e)}pending.clear()};
const hard=setTimeout(()=>{receipt.hardDeadline=true;save();rejectAll(Error('180-second seed cap; not retried'));ws.terminate()},180000);
function rpc(method,params){return new Promise((resolve,reject)=>{const id=String(++seq),row={id,method,params,startedAtMs:Date.now()};receipt.requests.push(row);save();const timer=setTimeout(()=>{pending.delete(id);row.outcome='unknown-timeout';save();reject(Error('RPC timeout; not replayed'))},15000);pending.set(id,{resolve,reject,timer,row});ws.send(JSON.stringify({type:'req',id,method,params}))})}
ws.on('message',bytes=>{const f=JSON.parse(bytes);if(f.event==='connect.challenge')ws.send(JSON.stringify({type:'req',id:'connect',method:'connect',params:{minProtocol:4,maxProtocol:4,client:{id:'cli',version:'multiagent-retained-seed',platform:'linux',mode:'cli'},role:'operator',scopes:['operator.admin'],auth:{token:cfg.gateway.auth.token}}}));if(f.type==='res'&&f.id==='connect'){f.ok?connectResolve():connectReject(Error(JSON.stringify(f.error)));return}const p=f.type==='res'?pending.get(f.id):undefined;if(!p)return;pending.delete(f.id);clearTimeout(p.timer);Object.assign(p.row,{finishedAtMs:Date.now(),ok:f.ok,error:f.error});save();f.ok?p.resolve(f.payload):p.reject(Error(f.error?.message??'RPC refused'))});
ws.on('error',rejectAll);ws.on('close',()=>{if(!closing)rejectAll(Error('socket closed'))});
try{
 await connected;
 for(const agentId of agentIds){
  const key=`agent:${agentId}:retained-admission-seed`;
  const c=await rpc('sessions.create',{agentId,key,model});
  if(c.ok!==true||c.key!==key)throw Error('Unexpected session identity');
  receipt.sessions.push({agentId,key,createdAtMs:Date.now(),sessionId:c.sessionId});save();
 }
 receipt.status='seeded';
}catch(e){receipt.status='failed';receipt.error=e.message}
finally{clearTimeout(hard);closing=true;receipt.finishedAtMs=Date.now();receipt.pendingMethods=[...pending.values()].map(p=>p.row.method);save();rejectAll(Error('seed settled'));ws.close();setTimeout(()=>ws.terminate(),500).unref();console.log(JSON.stringify({status:receipt.status,sessionCount:receipt.sessions.length,error:receipt.error}))}
process.exitCode=receipt.status==='seeded'?0:1;
