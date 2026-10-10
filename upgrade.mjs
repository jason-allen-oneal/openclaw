import fs from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {setTimeout as sleep} from 'node:timers/promises';
import {t as startRpc} from '<candidate>/dist/gateway-rpc-client-ze4EgkpG.mjs';
const root='<proof-workspace>/upgrade-state-2';
await fs.mkdir(root,{recursive:true});
const token=randomBytes(24).toString('hex');
const port=19864;
const cfg={gateway:{mode:'local',auth:{mode:'token',token}},agents:{defaults:{workspace:`${root}/workspace`,timeoutSeconds:73}},messages:{responsePrefix:'QA-UPGRADE-PRESERVED'}};
await fs.mkdir(`${root}/workspace`,{recursive:true});
await fs.writeFile(`${root}/openclaw.json`,JSON.stringify(cfg));
const env={...process.env,OPENCLAW_STATE_DIR:`${root}/state`,OPENCLAW_CONFIG_PATH:`${root}/openclaw.json`,OPENCLAW_GATEWAY_TOKEN:token,OPENCLAW_SKIP_CHANNELS:'1'};
const stable='<published-stable>/dist/index.js';
const candidate='<candidate>/dist/index.js';
const trace=[];
async function start(entry,label){
 let logs='';
 const proc=spawn(process.execPath,[entry,'gateway','run','--port',String(port),'--bind','loopback','--allow-unconfigured'],{env,stdio:['ignore','pipe','pipe']});
 proc.stdout.on('data',b=>logs+=b);proc.stderr.on('data',b=>logs+=b);
 let ready=false;
 for(let i=0;i<120;i++){if(proc.exitCode!==null)throw new Error(`${label} exited ${proc.exitCode}: ${logs}`);try{let r=await fetch(`[isolated HTTP endpoint]:${port}/health`);if(r.ok){ready=true;break;}}catch{}await sleep(1000);}
 if(!ready){proc.kill('SIGTERM');throw new Error(`${label} readiness timeout: ${logs}`);}
 const rpc=await startRpc({wsUrl:`[isolated WebSocket endpoint]:${port}`,token,logs:()=>logs});
 return {rpc,stop:async()=>{await rpc.stop();const ended=new Promise(r=>proc.once('exit',r));proc.kill('SIGTERM');await ended;await fs.writeFile(`<proof-workspace>/upgrade-${label}-gateway.log`,logs.replaceAll(token,'[REDACTED]'));}};
}
async function call(rpc,phase,method,params){const response=await rpc.request(method,params);trace.push({timestamp:new Date().toISOString(),phase,method,params,response});console.log(JSON.stringify({phase,method,response}).replaceAll(token,'[REDACTED]'));return response;}
const key='agent:main:upgrade-proof';
let current;
try{
 current=await start(stable,'stable');
 await call(current.rpc,'stable','sessions.reset',{key,reason:'new'});
 await call(current.rpc,'stable','chat.inject',{sessionKey:key,message:'QA-STABLE-PERSISTED-HISTORY'});
 await call(current.rpc,'stable','chat.history',{sessionKey:key,limit:30});
 await current.stop();current=null;
 const before=JSON.parse(await fs.readFile(`${root}/openclaw.json`,'utf8'));
 await new Promise((resolve,reject)=>{const repair=spawn(process.execPath,[candidate,'doctor','--fix','--non-interactive','--yes'],{env,stdio:['ignore','pipe','pipe']});let logs='';repair.stdout.on('data',b=>logs+=b);repair.stderr.on('data',b=>logs+=b);repair.once('exit',async code=>{await fs.writeFile('<proof-workspace>/upgrade-repair.log',logs.replaceAll(token,'[REDACTED]'));code===0?resolve():reject(new Error(`Upgrade repair exited ${code}`));});});
 current=await start(candidate,'candidate');
 const loaded=await call(current.rpc,'candidate','config.get',{});
 const history=await call(current.rpc,'candidate','chat.history',{sessionKey:key,limit:30});
 if(!JSON.stringify(history).includes('QA-STABLE-PERSISTED-HISTORY'))throw new Error('Stable history not loaded by candidate');
 if(!JSON.stringify(loaded).includes('QA-UPGRADE-PRESERVED'))throw new Error('Stable setting not loaded by candidate');
 await call(current.rpc,'candidate','chat.inject',{sessionKey:key,message:'QA-CANDIDATE-USES-EXISTING-SESSION'});
 const updated=await call(current.rpc,'candidate','chat.history',{sessionKey:key,limit:30});
 if(!JSON.stringify(updated).includes('QA-CANDIDATE-USES-EXISTING-SESSION'))throw new Error('Candidate did not use retained session');
 const after=JSON.parse(await fs.readFile(`${root}/openclaw.json`,'utf8'));
 if(after.messages?.responsePrefix!==before.messages?.responsePrefix||after.agents?.defaults?.timeoutSeconds!==73)throw new Error('Settings changed');
 trace.push({phase:'verdict',pass:true,settings:{responsePrefix:after.messages.responsePrefix,timeoutSeconds:after.agents.defaults.timeoutSeconds},sameSessionKey:key});
}finally{if(current)await current.stop();await fs.writeFile('<proof-workspace>/upgrade-trace.json',JSON.stringify(trace,null,2).replaceAll(token,'[REDACTED]'));}
