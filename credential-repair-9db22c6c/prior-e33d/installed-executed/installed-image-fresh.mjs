import fs from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
const ROOT='$PROOF_CACHE/192436-fresh';
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
Object.assign(env,{HOME,USERPROFILE:HOME,OPENCLAW_HOME:HOME,OPENCLAW_STATE_DIR:path.join(HOME,'.openclaw'),OPENCLAW_CONFIG_PATH:cfgPath,NPM_CONFIG_PREFIX:PREFIX,npm_config_cache:path.join(ROOT,'npm-cache'),PATH:path.join(PREFIX,'bin')+':'+env.PATH,OPENCLAW_E2E_COMMAND_TIMEOUT:'180s'});
const receipts=[];const calls=[];let phase='setup';let gateway;
const sha=(x)=>createHash('sha256').update(x).digest('hex');
async function record(){await fs.writeFile(path.join(LOG,'installed-image-fresh-progress.json'),JSON.stringify({phase,receipts,calls},null,2)+'\n');}
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
 await cmd('installed-fresh-onboard',['openclaw','onboard','--non-interactive','--accept-risk','--flow','quickstart','--mode','local','--auth-choice','skip','--gateway-port','44931','--gateway-bind','loopback','--skip-daemon','--skip-ui','--skip-channels','--skip-skills','--skip-health']);
 const dir=path.join(ROOT,'plugin');await fs.mkdir(dir,{recursive:true});
 await fs.writeFile(path.join(dir,'package.json'),JSON.stringify({name:PLUGIN,version:'0.0.1',openclaw:{extensions:['./index.js']}}));
 await fs.writeFile(path.join(dir,'openclaw.plugin.json'),JSON.stringify({id:PLUGIN,activation:{onStartup:true},providers:['synthetic-text','google','gemini'],contracts:{mediaUnderstandingProviders:['google']},mediaUnderstandingProviderMetadata:{google:{capabilities:['image'],defaultModels:{image:MODEL}}},configSchema:{type:'object',additionalProperties:false,properties:{}}}));
 await fs.writeFile(path.join(dir,'index.js'),[
 'const {describeImageWithModel}=require("openclaw/plugin-sdk/media-understanding");',
 'const {createAgentHarnessAssistantMessage}=require("openclaw/plugin-sdk/agent-harness-attempt-runtime");',
 'module.exports={id:'+JSON.stringify(PLUGIN)+',register(api){',
 'api.registerMediaUnderstandingProvider({id:"google",capabilities:["image"],defaultModels:{image:'+JSON.stringify(MODEL)+'},describeImage(request){require("node:fs").appendFileSync('+JSON.stringify(path.join(ROOT,'native-calls.jsonl'))+',JSON.stringify({handler:"google"})+"\\n");return describeImageWithModel(request)}});',
 'api.registerAgentHarness({id:'+JSON.stringify(PLUGIN)+',label:"Installed image proof",supports:()=>({supported:true,priority:100}),async runAttempt(p){',
 'const tools=await p.hostCapabilities.createToolSurfaceAsync({config:p.config,agentDir:p.agentDir,workspaceDir:p.workspaceDir,sessionKey:p.sessionKey,sessionId:p.sessionId,agentId:p.agentId,modelProvider:p.provider,modelId:p.modelId,preparedModelRuntime:p.preparedModelRuntime,abortSignal:p.abortSignal,sandbox:p.sandbox});',
 'const tool=tools.find(t=>t.name==="view_image");if(!tool)throw Error("installed image tool absent");',
 'const result=await tool.execute("installed-image",{path:'+JSON.stringify('data:image/png;base64,'+PNG)+',prompt:"Describe synthetic image"});',
 'if(!JSON.stringify(result).includes('+JSON.stringify(SUMMARY)+'))throw Error("missing real endpoint summary");',
 'const reply="INSTALLED_IMAGE_PROOF_OK";const a=createAgentHarnessAssistantMessage({api:"openai-responses",provider:p.provider,modelId:p.modelId},reply,{aborted:false});',
 'return {terminal:{kind:"ok"},sessionIdUsed:p.sessionId,messagesSnapshot:[a],assistantTexts:[reply],toolMetas:[],lastAssistant:a,didSendViaMessagingTool:false,messagingToolSentTexts:[],messagingToolSentMediaUrls:[],messagingToolSentTargets:[],cloudCodeAssistFormatError:false,replayMetadata:{hadPotentialSideEffects:true,replaySafe:false},itemLifecycle:{startedCount:1,completedCount:1,activeCount:0}};',
 '}});}};'].join('\n'));
 await cmd('installed-fresh-plugin-install',['bash','-c','source scripts/lib/openclaw-e2e-instance.sh\nopenclaw_e2e_fixture_plugin_command openclaw -- plugins install "$IMAGE_PLUGIN_PATH" --force'],{IMAGE_PLUGIN_PATH:dir});
 const cfg=JSON.parse(await fs.readFile(cfgPath,'utf8'));cfg.models??={};cfg.models.providers??={};
 for(const owner of ['google','gemini','synthetic-text'])cfg.models.providers[owner]={api:'openai-responses',baseUrl:servers[owner==='google'?'google':'gemini'].url,apiKey:'synthetic-'+(owner==='google'?'google':'gemini'),request:{allowPrivateNetwork:true},models:[{id:owner==='synthetic-text'?'text-model':MODEL,name:owner,input:owner==='synthetic-text'?['text']:['text','image'],reasoning:false,cost:{input:0,output:0,cacheRead:0,cacheWrite:0},contextWindow:8192,maxTokens:1024}]};
 cfg.agents??={};cfg.agents.defaults??={};Object.assign(cfg.agents.defaults,{workspace:path.join(HOME,'workspace'),model:{primary:'synthetic-text/text-model',fallbacks:[]},imageModel:{primary:'gemini/'+MODEL},models:{'synthetic-text/text-model':{agentRuntime:{id:PLUGIN}}},timeoutSeconds:120});
 cfg.plugins.entries={...cfg.plugins.entries,google:{enabled:false}};cfg.tools={...cfg.tools,media:{models:[{provider:'gemini',model:MODEL,capabilities:['image']}],image:{enabled:false}}};
 await fs.writeFile(cfgPath,JSON.stringify(cfg,null,2)+'\n');
 const projection=c=>({imageModel:c.agents.defaults.imageModel,media:c.tools.media,providers:Object.fromEntries(['google','gemini','synthetic-text'].map(k=>[k,{...c.models.providers[k],apiKeySha256:sha(c.models.providers[k].apiKey),apiKey:undefined}])),workspace:c.agents.defaults.workspace,timeoutSeconds:c.agents.defaults.timeoutSeconds});
 const before=projection(cfg);await fs.writeFile(path.join(LOG,'installed-image-settings-before.json'),JSON.stringify(before,null,2)+'\n');
 const baseline=await cmd('installed-fresh-image',['openclaw','agent','--local','--agent','main','--session-id','image-upgrade-retained','--message','Read the synthetic image and retain this conversation','--thinking','off','--json']);
 if(!baseline.includes('INSTALLED_IMAGE_PROOF_OK'))throw Error('baseline image not observed');
 const inference=calls.filter(x=>x.method==='POST');if(inference.length!==1||inference[0].owner!=='gemini'||inference[0].credential!=='gemini'||!inference[0].images.length)throw Error('baseline endpoint invariant failed');

 const nativeLog=path.join(ROOT,'native-calls.jsonl');
 const modelOnlyNative=await fs.readFile(nativeLog,'utf8').catch(()=>'');
 if(modelOnlyNative.trim())throw Error('model-only identity selected native Google handler');
 const manifestPath=path.join(dir,'openclaw.plugin.json');const manifest=JSON.parse(await fs.readFile(manifestPath,'utf8'));
 manifest.contracts.mediaUnderstandingProviders.push('gemini');manifest.mediaUnderstandingProviderMetadata.gemini={capabilities:['image'],defaultModels:{image:MODEL}};
 await fs.writeFile(manifestPath,JSON.stringify(manifest));
 const pluginCode=await fs.readFile(path.join(dir,'index.js'),'utf8');
 const nativeCode='api.registerMediaUnderstandingProvider({id:"gemini",capabilities:["image"],defaultModels:{image:'+JSON.stringify(MODEL)+'},describeImage(request){require("node:fs").appendFileSync('+JSON.stringify(nativeLog)+',JSON.stringify({handler:"gemini"})+"\\n");return describeImageWithModel(request)}});';
 await fs.writeFile(path.join(dir,'index.js'),pluginCode.replace('api.registerAgentHarness(',nativeCode+'\napi.registerAgentHarness('));
 await cmd('installed-fresh-native-plugin',['bash','-c','source scripts/lib/openclaw-e2e-instance.sh\nopenclaw_e2e_fixture_plugin_command openclaw -- plugins install "$IMAGE_PLUGIN_PATH" --force'],{IMAGE_PLUGIN_PATH:dir});
 const nativeReply=await cmd('installed-fresh-native-image',['openclaw','agent','--local','--agent','main','--session-id','image-fresh-native','--message','Read the synthetic image through the native Gemini handler','--thinking','off','--json']);
 if(!nativeReply.includes('INSTALLED_IMAGE_PROOF_OK'))throw Error('fresh native image result missing');
 const nativeEvents=(await fs.readFile(nativeLog,'utf8')).trim().split('\n').map(x=>JSON.parse(x));
 if(JSON.stringify(nativeEvents)!==JSON.stringify([{handler:'gemini'}]))throw Error('fresh native selected wrong image handler');
 const imageCalls=calls.filter(x=>x.method==='POST');if(imageCalls.length!==2||imageCalls.some(x=>x.owner!=='gemini'||x.credential!=='gemini'||x.images.length!==1||x.images[0].sha256!=='a86fd9b9eb25dcd6531ae4a19ec3e05bcfe08acb907a5154310d5df94b8e5d1a'))throw Error('fresh installed image/credential invariant failed');
 phase='fresh-model-only-and-native-images-passed';await record();

}catch(e){phase='failed';receipts.push({error:String(e)});await record();process.exitCode=1;}finally{for(const {server} of Object.values(servers)){server.closeAllConnections();await new Promise(r=>server.close(r))}await record()}
