import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import { spawn, execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { once } from 'node:events';

const build = process.env.PROOF_BUILD_ROOT;
const root = process.env.PROOF_ARTIFACT_ROOT;
if (!build || !root) throw new Error('explicit isolated roots required');
const start = Date.now();
for (const n of ['home','state','workspace','plugin','codex-home','xdg-config','xdg-data','xdg-cache']) fs.mkdirSync(path.join(root,n),{recursive:true});
const receipt={sourceHead:'a8ead196291935d24c44a4f40b67397d88c70256',build,startedAt:new Date().toISOString(),nativeHookDeadlineMs:9000,observationAfterKillMs:20000,modelTransport:'synthetic loopback Responses fixture adapted from maintained native-hook-pressure QA',entrypoint:'node openclaw.mjs gateway run',events:[]};
const record=(kind,data={})=>{ const e={time:Date.now(),elapsedMs:Date.now()-start,kind,...data}; fs.appendFileSync(path.join(root,'events.jsonl'),JSON.stringify(e)+'\n'); console.log(JSON.stringify(e));return e; };
function proc(pid) {try { const stat=fs.readFileSync(`/proc/${pid}/stat`,'utf8');const end=stat.lastIndexOf(')');const s=stat.slice(end+2).trim().split(/\s+/);const status=fs.readFileSync(`/proc/${pid}/status`,'utf8');return {pid,comm:stat.slice(stat.indexOf('(')+1,end),state:s[0],ppid:Number(s[1]),pgrp:Number(s[2]),sid:Number(s[3]),startTicks:Number(s[19]),rssKb:Number(/VmRSS:\s+(\d+)/.exec(status)?.[1]??0),argv:fs.readFileSync(`/proc/${pid}/cmdline`,'utf8').split('\0').filter(Boolean)};}catch(e){if(['ENOENT','ESRCH'].includes(e.code))return;throw e;}}
function tree(rootPid) {const todo=[rootPid],out=[],seen=new Set();while(todo.length){const pid=todo.pop();if(seen.has(pid))continue;seen.add(pid);const p=proc(pid);if(!p)continue;out.push(p);try {for(const t of fs.readdirSync(`/proc/${pid}/task`)){try{todo.push(...fs.readFileSync(`/proc/${pid}/task/${t}/children`,'utf8').trim().split(/\s+/).filter(Boolean).map(Number));}catch(e){if(!['ENOENT','ESRCH'].includes(e.code))throw e;}}}catch(e){if(!['ENOENT','ESRCH'].includes(e.code))throw e;}}return out;}
const identity=p=>`${p.pid}:${p.startTicks}`;
const same=p=>{const now=proc(p.pid);return now?.startTicks===p.startTicks?now:undefined;};
const isRelay=p=>p.comm==='openclaw-hooks'||p.argv.some(a=>a.endsWith('/native-hook-relay/entry.js'));
const owned=new Map();
let child,ws,logfd,provider,providerRequests=0;
const pending=new Map();
function response(body) {
 const tools=(body.tools??[]).flatMap(t=>t.type==='namespace'?(t.tools??[]).map(tool=>({tool,namespace:t.name})):[{tool:t}]);
 const native=tools.find(x=>['exec_command','shell_command','shell'].includes(x.tool.name));
 record('provider-request',{number:++providerRequests,model:body.model,tools:tools.map(x=>({name:x.tool.name,type:x.tool.type,namespace:x.namespace}))});
 const id=`resp_${randomUUID()}`,mid=`msg_${randomUUID()}`;
 let item;
 if(body.model==='fixture-utility') item={type:'message',id:mid,role:'assistant',status:'completed',content:[{type:'output_text',text:'Crash proof',annotations:[]}]};
 else {
   if(!native) throw new Error('native shell tool absent');
   const props=native.tool.parameters?.properties??{};
   const args={...(Object.hasOwn(props,'cmd')?{cmd:'printf CRASH_PROOF_TOOL'}:{command:native.tool.name==='shell'?['sh','-c','printf CRASH_PROOF_TOOL']:'printf CRASH_PROOF_TOOL'}),login:false};
   item={type:'function_call',id:`fc_${randomUUID()}`,call_id:`call_${randomUUID()}`,name:native.tool.name,...(native.namespace?{namespace:native.namespace}:{}),arguments:JSON.stringify(args)};
 }
 const events=[{type:'response.created',response:{id,object:'response',status:'in_progress',output:[],created_at:Math.floor(Date.now()/1000)}},{type:'response.output_item.added',output_index:0,item},{type:'response.output_item.done',output_index:0,item},{type:'response.completed',response:{id,object:'response',status:'completed',output:[item],usage:{input_tokens:64,output_tokens:16,total_tokens:80}}}];
 return events;
}
try {
 provider=http.createServer(async(req,res)=>{try{
  if(req.method==='POST'&&req.url==='/v1/responses') {let data='';for await(const b of req)data+=b; const events=response(JSON.parse(data));res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache'});for(const e of events)res.write(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);res.end('data: [DONE]\n\n');}
  else if(req.url?.startsWith('/v1/models')) {res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({data:[{id:'gpt-5.6-luna',object:'model'}],models:catalog.models}));}
  else {record('provider-unexpected',{method:req.method,path:req.url});res.writeHead(404).end();}
 }catch(e){record('provider-error',{error:String(e)});res.writeHead(500).end();}});
 await once(provider.listen(0,'127.0.0.1'),'listening');const providerUrl=`http://127.0.0.1:${provider.address().port}/v1`;
 const listener=net.createServer();await once(listener.listen(0,'127.0.0.1'),'listening');const port=listener.address().port;await new Promise(r=>listener.close(r));
 const catalog={models:[{slug:'gpt-5.6-luna',display_name:'gpt-5.6-luna',description:'QA mock OpenAI coding model',default_reasoning_level:'medium',supported_reasoning_levels:[{effort:'low',description:'QA'},{effort:'medium',description:'QA'},{effort:'high',description:'QA'}],shell_type:'shell_command',visibility:'list',supported_in_api:true,priority:0,availability_nux:null,upgrade:null,base_instructions:'You are Codex, a coding agent.',include_skills_usage_instructions:false,supports_reasoning_summary_parameter:true,default_reasoning_summary:'none',support_verbosity:true,default_verbosity:'low',apply_patch_tool_type:'freeform',web_search_tool_type:'text_and_image',truncation_policy:{mode:'tokens',limit:10000},supports_parallel_tool_calls:true,supports_image_detail_original:true,context_window:128000,max_context_window:128000,effective_context_window_percent:95,experimental_supported_tools:[],input_modalities:['text','image'],supports_search_tool:true,tool_mode:'direct'}]};
 fs.writeFileSync(path.join(root,'catalog.json'),JSON.stringify(catalog));
 const marker=path.join(root,'policy.jsonl');
 fs.writeFileSync(path.join(root,'plugin','openclaw.plugin.json'),JSON.stringify({id:'crash-proof',activation:{onStartup:true},configSchema:{type:'object',additionalProperties:false,properties:{}}}));
 fs.writeFileSync(path.join(root,'plugin','index.js'),`import fs from 'node:fs';\nexport default {id:'crash-proof',register(api){api.on('before_tool_call',async(event)=>{fs.appendFileSync(${JSON.stringify(marker)},JSON.stringify({time:Date.now(),pid:process.pid,toolName:event.toolName})+'\\n');await new Promise(r=>setTimeout(r,60000));return undefined;},{matcher:['exec']});}};\n`);
 const model=(id)=>({id,name:id,reasoning:true,input:['text'],cost:{input:0,output:0,cacheRead:0,cacheWrite:0},contextWindow:128000,maxTokens:4096});
 const config={gateway:{mode:'local',port,bind:'loopback',auth:{mode:'token',token:'synthetic-whole-gateway-proof'},controlUi:{enabled:false}},agents:{defaults:{workspace:path.join(root,'workspace'),model:{primary:'openai/gpt-5.6-luna'},utilityModel:'fixture/fixture-utility',models:{'openai/gpt-5.6-luna':{agentRuntime:{id:'codex'}},'fixture/fixture-utility':{agentRuntime:{id:'openclaw'}}},modelPolicy:{allow:['openai/gpt-5.6-luna','fixture/fixture-utility']},skipBootstrap:true},entries:{main:{}}},tools:{profile:'coding'},models:{mode:'replace',providers:{openai:{api:'openai-responses',baseUrl:'https://api.openai.com/v1',apiKey:'synthetic-proof-key',models:[model('gpt-5.6-luna')]},fixture:{api:'openai-responses',baseUrl:providerUrl,apiKey:'synthetic-proof-key',request:{allowPrivateNetwork:true},models:[model('fixture-utility')]}}},plugins:{allow:['codex','openai','crash-proof'],slots:{memory:'none'},load:{paths:[path.join(root,'plugin')]},entries:{openai:{enabled:true},codex:{enabled:true,config:{sessionCatalog:{enabled:false},appServer:{sandbox:'workspace-write',loopDetectionPreToolUseRelay:false,args:['app-server','-c',`openai_base_url=${providerUrl}`,'-c',`model_catalog_json=${path.join(root,'catalog.json')}`,'-c','sandbox_workspace_write.exclude_tmpdir_env_var=true','-c','sandbox_workspace_write.exclude_slash_tmp=true','--listen','stdio://']}}},'crash-proof':{enabled:true}}},discovery:{mdns:{mode:'off'}},cron:{enabled:false},logging:{file:path.join(root,'gateway-runtime.log')}};
 fs.writeFileSync(path.join(root,'config.json'),JSON.stringify(config,null,2));
 fs.writeFileSync(path.join(root,'workspace','AGENTS.md'),'This is an isolated process lifecycle proof. Execute only the synthetic bounded printf command.\n');
 const env={PATH:process.env.PATH,HOME:path.join(root,'home'),LANG:'C.UTF-8',SHELL:'/bin/sh',OPENCLAW_HOME:path.join(root,'home'),OPENCLAW_STATE_DIR:path.join(root,'state'),OPENCLAW_CONFIG_PATH:path.join(root,'config.json'),OPENCLAW_OAUTH_DIR:path.join(root,'state','credentials'),CODEX_HOME:path.join(root,'codex-home'),OPENCLAW_PROFILE:`crash-proof-${process.pid}`,XDG_CONFIG_HOME:path.join(root,'xdg-config'),XDG_DATA_HOME:path.join(root,'xdg-data'),XDG_CACHE_HOME:path.join(root,'xdg-cache'),OPENCLAW_SKIP_BROWSER_CONTROL_SERVER:'1',OPENCLAW_SKIP_CANVAS_HOST:'1',OPENCLAW_SKIP_CHANNELS:'1',OPENCLAW_SKIP_CRON:'1',OPENCLAW_SKIP_GMAIL_WATCHER:'1',OPENCLAW_SKIP_STARTUP_MODEL_PREWARM:'1',OPENCLAW_NO_RESPAWN:'1',TZ:'UTC'};
 receipt.env=env;receipt.configSha256=createHash('sha256').update(JSON.stringify(config)).digest('hex');receipt.port=port;
 logfd=fs.openSync(path.join(root,'gateway.log'),'w');child=spawn(process.execPath,[path.join(build,'openclaw.mjs'),'gateway','run','--port',String(port)],{cwd:build,env,detached:true,stdio:['ignore',logfd,logfd]});
 child.on('exit',(code,signal)=>record('gateway-exit',{code,signal}));receipt.launchPid=child.pid;record('gateway-spawn',{pid:child.pid,port});
 let ready=false;const readyDeadline=Date.now()+180000;
 while(Date.now()<readyDeadline){if(child.exitCode!==null||child.signalCode)throw new Error('Gateway exited before ready');try{const r=await fetch(`http://127.0.0.1:${port}/readyz`,{signal:AbortSignal.timeout(2000)});const j=await r.json();if(j.ready){ready=true;break;}}catch{}await delay(250);}
 if(!ready)throw new Error('Gateway readiness deadline180s');record('gateway-ready',{pid:child.pid});
 ws=new WebSocket(`ws://127.0.0.1:${port}`);
 const request=(method,params)=>{const id=randomUUID();record('rpc-request',{id,method,...(method==='connect'?{}:{params})});return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(new Error(`${method} timeout`));},180000);pending.set(id,{resolve,reject,timer,method});ws.send(JSON.stringify({type:'req',id,method,params}));});};
 let connected,failed;const connection=new Promise((r,j)=>{connected=r;failed=j;});
 ws.addEventListener('message',({data})=>{const frame=JSON.parse(data);if(frame.type==='event'&&frame.event==='connect.challenge')request('connect',{minProtocol:4,maxProtocol:4,client:{id:'cli',displayName:'Whole Gateway crash proof',version:'proof',platform:'linux',mode:'cli'},role:'operator',scopes:['operator.admin'],auth:{token:'synthetic-whole-gateway-proof'}}).then(connected,failed);if(frame.type==='res'){const p=pending.get(frame.id);if(!p)return;pending.delete(frame.id);clearTimeout(p.timer);record('rpc-response',{id:frame.id,method:p.method,ok:frame.ok,...(p.method==='connect'?{}:{payload:frame.payload,error:frame.error})});if(frame.ok)p.resolve(frame.payload);else p.reject(new Error(JSON.stringify(frame.error)));}});
 ws.addEventListener('error',()=>failed(new Error('WS error')));ws.addEventListener('close',()=>{record('ws-close');for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error('WS closed'));}pending.clear();});
 await connection;
 const key=`agent:main:gateway-crash-${randomUUID()}`;await request('sessions.create',{key,agentId:'main'});
 await request('chat.send',{sessionKey:key,message:'Run the bounded native shell lifecycle fixture.',deliver:false,idempotencyKey:randomUUID()});
 const hookDeadline=Date.now()+180000;let before;
 while(Date.now()<hookDeadline){const rows=tree(child.pid);for(const p of rows)owned.set(identity(p),p);if(fs.existsSync(marker)&&rows.some(isRelay)){before=rows;break;}await delay(25);}
 if(!before)throw new Error('No real active native hook after180s');
 const policies=fs.readFileSync(marker,'utf8').trim().split('\n').map(JSON.parse);const actualGateway=policies.at(-1).pid;
 if(!before.some(p=>p.pid===actualGateway))throw new Error('policy PID outside owned Gateway tree');
 const relays=before.filter(isRelay);const codex=before.filter(p=>p.argv.includes('app-server')&&p.argv.some(a=>a.endsWith('/codex')));
 if(!codex.length)throw new Error('Native Codex app-server absent');
 for(const p of codex){p.version=execFileSync(`/proc/${p.pid}/exe`,['--version'],{encoding:'utf8',timeout:10000}).trim();}
 receipt.before=before;receipt.policies=policies;record('active-native-hook',{gatewayPid:actualGateway,relays,codex});
 if(!same(before.find(p=>p.pid===actualGateway)))throw new Error('Gateway identity changed');
 const killedAt=Date.now();process.kill(actualGateway,'SIGKILL');receipt.killedAt=killedAt;receipt.killedPid=actualGateway;record('whole-gateway-sigkill',{pid:actualGateway});
 const observations=[];
 while(Date.now()-killedAt<20000){const t=Date.now()-killedAt;const rows=[...owned.values()].map(same).filter(Boolean);observations.push({afterKillMs:t,rows});fs.appendFileSync(path.join(root,'processes.jsonl'),JSON.stringify(observations.at(-1))+'\n');await delay(t<2000?25:250);}
 receipt.final=[...owned.values()].map(same).filter(Boolean);receipt.liveSurvivors=receipt.final.filter(p=>p.state!=='Z');receipt.zombies=receipt.final.filter(p=>p.state==='Z');receipt.relayLastLiveMs=Object.fromEntries(relays.map(p=>[identity(p),Math.max(-1,...observations.filter(o=>o.rows.some(r=>identity(r)===identity(p)&&r.state!=='Z')).map(o=>o.afterKillMs))]));receipt.appServerLastLiveMs=Object.fromEntries(codex.map(p=>[identity(p),Math.max(-1,...observations.filter(o=>o.rows.some(r=>identity(r)===identity(p)&&r.state!=='Z')).map(o=>o.afterKillMs))]));receipt.boundaryReached=true;receipt.passed=receipt.liveSurvivors.length===0;record('observation-complete',{passed:receipt.passed,liveSurvivors:receipt.liveSurvivors,zombies:receipt.zombies,relayLastLiveMs:receipt.relayLastLiveMs,appServerLastLiveMs:receipt.appServerLastLiveMs});
} catch(e){receipt.error=String(e);receipt.stack=e.stack;record('failed',{error:String(e)});}
finally {
 receipt.observationEndedAt=new Date().toISOString();
 // Cleanup is deliberately after the complete observation window, never evidence of automatic cleanup.
 if(child)for(const p of tree(child.pid))owned.set(identity(p),p);
 receipt.cleanupSignals=[];
 for(const p of owned.values()){const live=same(p);if(live&&live.state!=='Z'){try{process.kill(p.pid,'SIGTERM');receipt.cleanupSignals.push({pid:p.pid,startTicks:p.startTicks,signal:'SIGTERM'});}catch(e){if(e.code!=='ESRCH')throw e;}}}
 if(child&&same(proc(child.pid)??{})){try{child.kill('SIGTERM');}catch{}}
 await delay(1500);
 for(const p of owned.values()){const live=same(p);if(live&&live.state!=='Z'){try{process.kill(p.pid,'SIGKILL');receipt.cleanupSignals.push({pid:p.pid,startTicks:p.startTicks,signal:'SIGKILL'});}catch(e){if(e.code!=='ESRCH')throw e;}}}
 if(ws)ws.close();for(const p of pending.values()){clearTimeout(p.timer);}pending.clear();provider?.closeAllConnections();if(provider)await new Promise(r=>provider.close(r));if(logfd!==undefined)fs.closeSync(logfd);
 receipt.finishedAt=new Date().toISOString();fs.writeFileSync(path.join(root,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');
}
process.exit(receipt.passed?0:2);
