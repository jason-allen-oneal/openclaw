import fs from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
const ROOT='$PROOF_CACHE/192436-installed';
const LOG='$PROOF_LOG';
const REPO='$PROOF_SOURCE';
const PREFIX=path.join(ROOT,'prefix');
const HOME=path.join(ROOT,'home');
const cfgPath=path.join(HOME,'.openclaw/openclaw.json');
const PLUGIN='installed-image-identity';
const MODEL='fixture-vision';
const PNG='iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAHElEQVR4nGP4z8DwnxLMMGrAsDCAQv2jBgwPAwAxtf4Q24P5oAAAAABJRU5ErkJggg==';
const SUMMARY='Installed image proof red above blue';
const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>['PATH','LANG','LC_ALL','TZ','HTTP_PROXY','HTTPS_PROXY','NO_PROXY','ALL_PROXY','http_proxy','https_proxy','no_proxy','all_proxy'].includes(k)));
Object.assign(env,{HOME,USERPROFILE:HOME,OPENCLAW_HOME:HOME,OPENCLAW_STATE_DIR:path.join(HOME,'.openclaw'),OPENCLAW_CONFIG_PATH:cfgPath,NPM_CONFIG_PREFIX:PREFIX,npm_config_cache:path.join(ROOT,'npm-cache'),PATH:path.join(PREFIX,'bin')+':'+env.PATH,OPENCLAW_E2E_COMMAND_TIMEOUT:'180s',OPENCLAW_TEST: '1'});
const receipts=[];const calls=[];let phase='setup';let gateway;
const sha=(x)=>createHash('sha256').update(x).digest('hex');
async function record(){await fs.writeFile(path.join(LOG,'installed-image-upgrade-progress.json'),JSON.stringify({phase,receipts,calls},null,2)+'\n');}
async function cmd(name,args,extra={}){
 phase=name;await record();const start=Date.now();const out=await fs.open(path.join(LOG,name+'.log'),'w');
 const p=spawn(args[0],args.slice(1),{cwd:REPO,env:{...env,...extra},stdio:['ignore',out.fd,out.fd],detached:true});
 const timer=setTimeout(()=>{try{process.kill(-p.pid,'SIGTERM')}catch{}},180000);
 const code=await new Promise((res,rej)=>{p.on('error',rej);p.on('exit',(code,signal)=>res(code??signal))});clearTimeout(timer);await out.close();receipts.push({name,args,exit:code,seconds:(Date.now()-start)/1000});await record();if(code!==0)throw Error(name+' exit '+code);
 return fs.readFile(path.join(LOG,name+'.log'),'utf8');
}
function output(response,text){const msg={type:'message',id:'msg-image',role:'assistant',status:'completed',content:[{type:'output_text',text,annotations:[]}]};const ev=[{type:'response.output_item.added',output_index:0,item:{...msg,status:'in_progress',content:[]}},{type:'response.output_text.delta',item_id:msg.id,output_index:0,content_index:0,delta:text},{type:'response.output_text.done',item_id:msg.id,output_index:0,content_index:0,text},{type:'response.output_item.done',output_index:0,item:msg},{type:'response.completed',response:{id:'resp-image',status:'completed',output:[msg],usage:{input_tokens:1,output_tokens:1,total_tokens:2}}}];response.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-store'});response.end(ev.map(x=>'data: '+JSON.stringify(x)+'\n\n').join('')+'data: [DONE]\n\n');}
const servers={};
for(const owner of ['google','gemini']){
 const server=createServer((req,res)=>{void(async()=>{let raw='';for await(const c of req)raw+=c;const body=raw?JSON.parse(raw):{};const auth=req.headers.authorization;const images=[];for(const item of body.input??[])for(const c of item.content??[])if(c.type==='input_image'){const [,mime,b64]=/^data:([^;]+);base64,(.+)$/s.exec(c.image_url)??[];const buf=Buffer.from(b64??'','base64');images.push({mime,bytes:buf.length,sha256:sha(buf)});}calls.push({phase,owner,method:req.method,path:req.url,credential:auth==='Bearer synthetic-'+owner?owner:auth?'unknown':'none',model:body.model,images});await record();if(req.method==='GET'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({data:[{id:MODEL}]}));}else output(res,SUMMARY);})().catch(e=>{res.writeHead(500);res.end(String(e))})});await new Promise(r=>server.listen(0,'127.0.0.1',r));servers[owner]={server,url:'http://127.0.0.1:'+server.address().port+'/v1'};
}
try{
 await cmd('installed-baseline-onboard',['openclaw','onboard','--non-interactive','--accept-risk','--flow','quickstart','--mode','local','--auth-choice','skip','--gateway-port','44931','--gateway-bind','loopback','--skip-daemon','--skip-ui','--skip-channels','--skip-skills','--skip-health']);
 const dir=path.join(ROOT,'plugin');await fs.mkdir(dir,{recursive:true});
 await fs.writeFile(path.join(dir,'package.json'),JSON.stringify({name:PLUGIN,version:'0.0.1',openclaw:{extensions:['./index.js']}}));
 await fs.writeFile(path.join(dir,'openclaw.plugin.json'),JSON.stringify({id:PLUGIN,activation:{onStartup:true},providers:['synthetic-text','google'],contracts:{mediaUnderstandingProviders:['google']},mediaUnderstandingProviderMetadata:{google:{capabilities:['image'],defaultModels:{image:MODEL}}},configSchema:{type:'object',additionalProperties:false,properties:{}}}));
 await fs.writeFile(path.join(dir,'index.js'),[
 'const {describeImageWithModel}=require("openclaw/plugin-sdk/media-understanding");',
 'const {createAgentHarnessAssistantMessage}=require("openclaw/plugin-sdk/agent-harness-attempt-runtime");',
 'module.exports={id:'+JSON.stringify(PLUGIN)+',register(api){',
 'api.registerMediaUnderstandingProvider({id:"google",capabilities:["image"],defaultModels:{image:'+JSON.stringify(MODEL)+'},describeImage:describeImageWithModel});',
 'api.registerAgentHarness({id:'+JSON.stringify(PLUGIN)+',label:"Installed image proof",supports:()=>({supported:true,priority:100}),async runAttempt(p){',
 'const tools=await p.hostCapabilities.createToolSurfaceAsync({config:p.config,agentDir:p.agentDir,workspaceDir:p.workspaceDir,sessionKey:p.sessionKey,sessionId:p.sessionId,agentId:p.agentId,modelProvider:p.provider,modelId:p.modelId,preparedModelRuntime:p.preparedModelRuntime,abortSignal:p.abortSignal,sandbox:p.sandbox});',
 'const tool=tools.find(t=>t.name==="view_image");if(!tool)throw Error("installed image tool absent");',
 'const result=await tool.execute("installed-image",{path:'+JSON.stringify('data:image/png;base64,'+PNG)+',prompt:"Describe synthetic image"});',
 'if(!JSON.stringify(result).includes('+JSON.stringify(SUMMARY)+'))throw Error("missing real endpoint summary");',
 'const reply="INSTALLED_IMAGE_PROOF_OK";const a=createAgentHarnessAssistantMessage({api:"openai-responses",provider:p.provider,modelId:p.modelId},reply,{aborted:false});',
 'return {terminal:{kind:"ok"},sessionIdUsed:p.sessionId,messagesSnapshot:[a],assistantTexts:[reply],toolMetas:[],lastAssistant:a,didSendViaMessagingTool:false,messagingToolSentTexts:[],messagingToolSentMediaUrls:[],messagingToolSentTargets:[],cloudCodeAssistFormatError:false,replayMetadata:{hadPotentialSideEffects:true,replaySafe:false},itemLifecycle:{startedCount:1,completedCount:1,activeCount:0}};',
 '}});}};'].join('\n'));
 await cmd('installed-baseline-plugin-install',['bash','-c','source scripts/lib/openclaw-e2e-instance.sh\nopenclaw_e2e_fixture_plugin_command openclaw -- plugins install "$IMAGE_PLUGIN_PATH" --force'],{IMAGE_PLUGIN_PATH:dir});
 const cfg=JSON.parse(await fs.readFile(cfgPath,'utf8'));cfg.models??={};cfg.models.providers??={};
 for(const owner of ['google','gemini','synthetic-text'])cfg.models.providers[owner]={api:'openai-responses',baseUrl:servers[owner==='google'?'google':'gemini'].url,apiKey:'synthetic-'+(owner==='google'?'google':'gemini'),request:{allowPrivateNetwork:true},models:[{id:owner==='synthetic-text'?'text-model':MODEL,name:owner,input:owner==='synthetic-text'?['text']:['text','image'],reasoning:false,cost:{input:0,output:0,cacheRead:0,cacheWrite:0},contextWindow:8192,maxTokens:1024}]};
 cfg.agents??={};cfg.agents.defaults??={};Object.assign(cfg.agents.defaults,{workspace:path.join(HOME,'workspace'),model:{primary:'synthetic-text/text-model',fallbacks:[]},imageModel:{primary:'gemini/'+MODEL},models:{'synthetic-text/text-model':{agentRuntime:{id:PLUGIN}}},timeoutSeconds:120});
 cfg.plugins.entries={...cfg.plugins.entries,google:{enabled:false}};cfg.tools={...cfg.tools,media:{models:[{provider:'gemini',model:MODEL,capabilities:['image']}],image:{enabled:false}}};
 await fs.writeFile(cfgPath,JSON.stringify(cfg,null,2)+'\n');
 const projection=c=>({imageModel:c.agents.defaults.imageModel,media:c.tools.media,providers:Object.fromEntries(['google','gemini','synthetic-text'].map(k=>[k,{...c.models.providers[k],apiKeySha256:sha(c.models.providers[k].apiKey),apiKey:undefined}])),workspace:c.agents.defaults.workspace,timeoutSeconds:c.agents.defaults.timeoutSeconds});
 const before=projection(cfg);await fs.writeFile(path.join(LOG,'installed-image-settings-before.json'),JSON.stringify(before,null,2)+'\n');
 const baseline=await cmd('installed-baseline-image',['openclaw','agent','--local','--agent','main','--session-id','image-upgrade-retained','--message','Read the synthetic image and retain this conversation','--thinking','off','--json']);
 if(!baseline.includes('INSTALLED_IMAGE_PROOF_OK'))throw Error('baseline image not observed');
 const inference=calls.filter(x=>x.method==='POST');if(inference.length!==1||inference[0].owner!=='gemini'||inference[0].credential!=='gemini'||!inference[0].images.length)throw Error('baseline endpoint invariant failed');
 phase='baseline-image-passed-waiting-candidate-package';await record();
 const packagePath='$PROOF_CACHE/192436-package/openclaw-current.tgz';
 const deadline=Date.now()+900000;while(!(await fs.stat(packagePath).catch(()=>undefined))){if(Date.now()>deadline)throw Error('candidate package prerequisite unavailable');await new Promise(r=>setTimeout(r,1000));}
 await cmd('installed-baseline-gateway-transition',['bash','-c',[
  'set -euo pipefail',
  'source scripts/lib/openclaw-e2e-instance.sh',
  'source scripts/e2e/lib/external-package-transition.sh',
  'package_root="$(openclaw_e2e_package_root)"',
  'entry="$(openclaw_e2e_package_entrypoint "$package_root")"',
  'gateway_pid="$(openclaw_e2e_start_gateway "$entry" 44931 "$IMAGE_LOG_ROOT/installed-baseline-gateway.log")"',
  'trap \'openclaw_e2e_terminate_gateways "${gateway_pid:-}"\' EXIT',
  'openclaw_e2e_wait_gateway_ready "$gateway_pid" "$IMAGE_LOG_ROOT/installed-baseline-gateway.log" 90 44931',
  'openclaw sessions --json > "$IMAGE_LOG_ROOT/installed-sessions-before.json"',
  'openclaw_e2e_terminate_gateways "$gateway_pid"',
  'stopped_pid="$gateway_pid"; gateway_pid=""',
  'openclaw_e2e_external_package_transition 2026.10.10 2026.10.10 "$IMAGE_LOG_ROOT/installed-transition" "$stopped_pid"',
 ].join('\n')],{IMAGE_LOG_ROOT:LOG,OPENCLAW_CURRENT_PACKAGE_TGZ:packagePath,npm_config_allow_scripts:'@google/genai,esbuild,protobufjs,openclaw'});
 const after=projection(JSON.parse(await fs.readFile(cfgPath,'utf8')));
 await fs.writeFile(path.join(LOG,'installed-image-settings-after.json'),JSON.stringify(after,null,2)+'\n');
 if(JSON.stringify(before)!==JSON.stringify(after))throw Error('image/provider/unrelated settings changed during transition');
 const candidate=await cmd('installed-candidate-image',['openclaw','agent','--local','--agent','main','--session-id','image-upgrade-retained','--message','Continue retained conversation and read the synthetic image again','--thinking','off','--json']);
 if(!candidate.includes('INSTALLED_IMAGE_PROOF_OK'))throw Error('candidate image result absent');
 const afterCalls=calls.filter(x=>x.method==='POST');if(afterCalls.length!==2||afterCalls.some(x=>x.owner!=='gemini'||x.credential!=='gemini'||!x.images.length))throw Error('upgrade image endpoint invariant failed');
 await cmd('installed-candidate-retained-history',['bash','-c',[
  'set -euo pipefail',
  'source scripts/lib/openclaw-e2e-instance.sh',
  'entry="$(openclaw_e2e_package_entrypoint "$(openclaw_e2e_package_root)")"',
  'gateway_pid="$(openclaw_e2e_start_gateway "$entry" 44931 "$IMAGE_LOG_ROOT/installed-candidate-gateway.log")"',
  'trap \'openclaw_e2e_terminate_gateways "${gateway_pid:-}"\' EXIT',
  'openclaw_e2e_wait_gateway_ready "$gateway_pid" "$IMAGE_LOG_ROOT/installed-candidate-gateway.log" 90 44931',
  'openclaw sessions --json > "$IMAGE_LOG_ROOT/installed-sessions-after.json"',
  'key="$(node scripts/e2e/lib/external-package-transition.mjs session-key "$IMAGE_LOG_ROOT/installed-sessions-after.json" image-upgrade-retained)"',
  'params="$(node -e \'console.log(JSON.stringify({sessionKey:process.argv[1],limit:20}))\' "$key")"',
  'openclaw gateway call chat.history --json --params "$params" > "$IMAGE_LOG_ROOT/installed-retained-history.json"',
 ].join('\n')],{IMAGE_LOG_ROOT:LOG});
 const history=JSON.parse(await fs.readFile(path.join(LOG,'installed-retained-history.json'),'utf8'));
 const historyText=JSON.stringify(history);if(!historyText.includes('Read the synthetic image and retain this conversation')||!historyText.includes('Continue retained conversation')||!historyText.includes('INSTALLED_IMAGE_PROOF_OK'))throw Error('retained history semantic markers missing');
 phase='upgrade-passed';await record();
}catch(e){phase='failed';receipts.push({error:String(e)});await record();process.exitCode=1;}finally{for(const {server} of Object.values(servers)){server.closeAllConnections();await new Promise(r=>server.close(r))}await record()}
