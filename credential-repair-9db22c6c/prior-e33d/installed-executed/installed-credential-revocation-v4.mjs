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
Object.assign(env,{HOME,USERPROFILE:HOME,OPENCLAW_HOME:HOME,OPENCLAW_STATE_DIR:path.join(HOME,'.openclaw'),OPENCLAW_CONFIG_PATH:cfgPath,NPM_CONFIG_PREFIX:PREFIX,npm_config_cache:path.join(ROOT,'npm-cache'),PATH:path.join(PREFIX,'bin')+':'+env.PATH,OPENCLAW_E2E_COMMAND_TIMEOUT:'180s',OPENCLAW_PROFILE:'image-proof-192436',OPENCLAW_DEBUG:'1'});
const receipts=[];const calls=[];let phase='setup';let gateway;
const sha=(x)=>createHash('sha256').update(x).digest('hex');
async function record(){await fs.writeFile(path.join(LOG,'installed-credential-revocation-v4-progress.json'),JSON.stringify({phase,receipts,calls},null,2)+'\n');}
async function cmd(name,args,extra={}){
 phase=name;await record();const start=Date.now();const out=await fs.open(path.join(LOG,'v4-'+name+'.log'),'w');
 const p=spawn(args[0],args.slice(1),{cwd:REPO,env:{...env,...extra},stdio:['ignore',out.fd,out.fd],detached:true});
 const timer=setTimeout(()=>{try{process.kill(-p.pid,'SIGTERM')}catch{}},180000);
 const code=await new Promise((res,rej)=>{p.on('error',rej);p.on('exit',(code,signal)=>res(code??signal))});clearTimeout(timer);await out.close();receipts.push({name,args,exit:code,seconds:(Date.now()-start)/1000});await record();if(code!==0)throw Error(name+' exit '+code);
 return fs.readFile(path.join(LOG,'v4-'+name+'.log'),'utf8');
}
function output(response,text){const msg={type:'message',id:'msg-image',role:'assistant',status:'completed',content:[{type:'output_text',text,annotations:[]}]};const ev=[{type:'response.output_item.added',output_index:0,item:{...msg,status:'in_progress',content:[]}},{type:'response.output_text.delta',item_id:msg.id,output_index:0,content_index:0,delta:text},{type:'response.output_text.done',item_id:msg.id,output_index:0,content_index:0,text},{type:'response.output_item.done',output_index:0,item:msg},{type:'response.completed',response:{id:'resp-image',status:'completed',output:[msg],usage:{input_tokens:1,output_tokens:1,total_tokens:2}}}];response.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-store'});response.end(ev.map(x=>'data: '+JSON.stringify(x)+'\n\n').join('')+'data: [DONE]\n\n');}
const preservedConfig=JSON.parse(await fs.readFile(cfgPath,"utf8"));
const servers={};
for(const owner of ['google','gemini']){
 const server=createServer((req,res)=>{void(async()=>{let raw='';for await(const c of req)raw+=c;const body=raw?JSON.parse(raw):{};const auth=req.headers.authorization;const images=[];for(const item of body.input??[])for(const c of item.content??[])if(c.type==='input_image'){const [,mime,b64]=/^data:([^;]+);base64,(.+)$/s.exec(c.image_url)??[];const buf=Buffer.from(b64??'','base64');images.push({mime,bytes:buf.length,sha256:sha(buf)});}calls.push({phase,owner,method:req.method,path:req.url,credential:auth==='Bearer synthetic-'+owner?owner:auth?'unknown':'none',model:body.model,images});await record();if(req.method==='GET'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({data:[{id:MODEL}]}));}else output(res,SUMMARY);})().catch(e=>{res.writeHead(500);res.end(String(e))})});await new Promise(r=>server.listen(Number(new URL(preservedConfig.models.providers[owner].baseUrl).port),'127.0.0.1',r));servers[owner]={server,url:'http://127.0.0.1:'+server.address().port+'/v1'};
}
try{
 const dir=path.join(ROOT,'plugin');const trace=path.join(ROOT,'credential-v4-events.jsonl');const capture=path.join(ROOT,'credential-v4-captured');const release=path.join(ROOT,'credential-v4-release');
 const originalCode=await fs.readFile(path.join(LOG,'credential-base-installed-plugin.js'),'utf8');
 for(const mode of ['model-only','native']){
  await fs.rm(capture,{force:true});await fs.rm(release,{force:true});await fs.writeFile(trace,'');
  const manifest=JSON.parse(await fs.readFile(path.join(dir,'openclaw.plugin.json'),'utf8'));manifest.providers=['synthetic-text','google','gemini'];manifest.contracts.mediaUnderstandingProviders=mode==='native'?['google','gemini']:['google'];manifest.mediaUnderstandingProviderMetadata={google:{capabilities:['image'],defaultModels:{image:MODEL}},...(mode==='native'?{gemini:{capabilities:['image'],defaultModels:{image:MODEL}}}:{})};await fs.writeFile(path.join(dir,'openclaw.plugin.json'),JSON.stringify(manifest));
  const terminal='return {terminal:{kind:"ok"},sessionIdUsed:p.sessionId,messagesSnapshot:[a],assistantTexts:[reply],toolMetas:[],lastAssistant:a,didSendViaMessagingTool:false,messagingToolSentTexts:[],messagingToolSentMediaUrls:[],messagingToolSentTargets:[],cloudCodeAssistFormatError:false,replayMetadata:{hadPotentialSideEffects:true,replaySafe:false},itemLifecycle:{startedCount:1,completedCount:1,activeCount:0}};';
  const hold=[
   'if(p.prompt.includes("CREDENTIAL_REVOCATION_PROBE")){',
   'const fs=require("node:fs");',
   'fs.writeFileSync('+JSON.stringify(capture)+',JSON.stringify({event:"captured",mode:'+JSON.stringify(mode)+',hostActive:true,sessionKey:p.sessionKey,sessionId:p.sessionId,policyHash:p.preparedModelRuntime.metadataSnapshot.policyHash,geminiOwners:[...(p.preparedModelRuntime.metadataSnapshot.declaredProviderOwners.get("gemini")??[])]}));',
   'const end=Date.now()+90000;while(!fs.existsSync('+JSON.stringify(release)+')){if(Date.now()>end)throw Error("credential release timed out");p.abortSignal?.throwIfAborted();await new Promise(r=>setTimeout(r,100));}',
   'let rejected=false,error="";try{await tool.execute("retained-after-logout",{path:'+JSON.stringify('data:image/png;base64,'+PNG)+',prompt:"Describe synthetic image"});}catch(e){rejected=true;error=String(e?.message??e).slice(0,1200);}',
   'fs.appendFileSync('+JSON.stringify(trace)+',JSON.stringify({event:"credential-result",mode:'+JSON.stringify(mode)+',rejected,error})+"\\n");',
   'if(!rejected)throw Error("retained tool sent after logout");',
   'const reply="CREDENTIAL_REVOCATION_OK";const a=createAgentHarnessAssistantMessage({api:"openai-responses",provider:p.provider,modelId:p.modelId},reply,{aborted:false});',terminal,'}'].join('\n');
  const natives=(mode==='native'?['google','gemini']:['google']).map(id=>'api.registerMediaUnderstandingProvider({id:'+JSON.stringify(id)+',capabilities:["image"],defaultModels:{image:'+JSON.stringify(MODEL)+'},describeImage(request){require("node:fs").appendFileSync('+JSON.stringify(trace)+',JSON.stringify({event:"native-entry",handler:'+JSON.stringify(id)+'})+"\\n");return describeImageWithModel(request)}});').join('\n');
  let code=originalCode.split('\n').filter(l=>!l.startsWith('api.registerMediaUnderstandingProvider(')).join('\n');code=code.replace('api.registerAgentHarness(',natives+'\napi.registerAgentHarness(').replace('const result=await tool.execute',hold+'\nconst result=await tool.execute');
  await fs.writeFile(path.join(dir,'index.js'),code);
  await cmd('credential-'+mode+'-plugin-install',['bash','-c','source scripts/lib/openclaw-e2e-instance.sh\nopenclaw_e2e_fixture_plugin_command openclaw -- plugins install "$IMAGE_PLUGIN_PATH" --force'],{IMAGE_PLUGIN_PATH:dir});
  await cmd('credential-'+mode+'-save-key',['bash','-c','printf "%s" "$IMAGE_SYNTHETIC_KEY" | openclaw models auth paste-api-key --provider gemini --profile-id gemini:proof --agent main'],{IMAGE_SYNTHETIC_KEY:'synthetic-gemini'});
  const cfg=JSON.parse(await fs.readFile(cfgPath,'utf8'));cfg.gateway.port=44932;cfg.models.providers.gemini.apiKey='gemini:proof';cfg.agents.defaults.imageModel={primary:'gemini/'+MODEL};await fs.writeFile(cfgPath,JSON.stringify(cfg,null,2)+'\n');
  const beforeControl=calls.length;
  await cmd('credential-'+mode+'-control',['openclaw','agent','--local','--agent','main','--session-id','credential-control-'+mode,'--message','Read the synthetic image before revocation','--thinking','off','--json']);
  const controlCalls=calls.slice(beforeControl);if(controlCalls.length!==1||controlCalls[0].owner!=='gemini'||controlCalls[0].credential!=='gemini'||controlCalls[0].images[0]?.sha256!=='a86fd9b9eb25dcd6531ae4a19ec3e05bcfe08acb907a5154310d5df94b8e5d1a')throw Error('credential control did not prove correct image/key');
  const controlNativeEvents=(await fs.readFile(trace,'utf8')).trim().split('\n').filter(Boolean).map(x=>JSON.parse(x)).filter(x=>x.event==='native-entry');if(mode==='native' ? JSON.stringify(controlNativeEvents)!==JSON.stringify([{event:'native-entry',handler:'gemini'}]) : controlNativeEvents.length!==0)throw Error('control native route mismatch');receipts.push({mode,controlNativeEvents});
  const pidText=await cmd('credential-'+mode+'-gateway-start',['bash','-c','set -euo pipefail\nsource scripts/lib/openclaw-e2e-instance.sh\nentry="$(openclaw_e2e_package_entrypoint "$(openclaw_e2e_package_root)")"\npid="$(openclaw_e2e_start_gateway "$entry" 44932 "$IMAGE_GATEWAY_LOG")"\nprintf "%s" "$pid" > "$IMAGE_GATEWAY_PID"\nopenclaw_e2e_wait_gateway_ready "$pid" "$IMAGE_GATEWAY_LOG" 90 44932'],{IMAGE_GATEWAY_LOG:path.join(LOG,'v4-credential-'+mode+'-gateway.log'),IMAGE_GATEWAY_PID:path.join(ROOT,'credential-gateway.pid')});
  gateway=Number(await fs.readFile(path.join(ROOT,'credential-gateway.pid'),'utf8'));
  const runId='credential-'+mode+'-'+Date.now();const sessionKey='agent:main:'+runId;
  await cmd('credential-'+mode+'-start-retained',['openclaw','gateway','call','chat.send','--json','--params',JSON.stringify({sessionKey,message:'CREDENTIAL_REVOCATION_PROBE',deliver:false,idempotencyKey:runId})]);
  const deadline=Date.now()+60000;while(!(await fs.stat(capture).catch(()=>undefined))){if(Date.now()>deadline)throw Error('retained capture unavailable');await new Promise(r=>setTimeout(r,100));}
  const captured=JSON.parse(await fs.readFile(capture,'utf8'));if(captured.sessionKey!==sessionKey)throw Error('captured another run instead of retained target');receipts.push({mode,captured});const beforeLogoutCalls=calls.length;
  const logout=await cmd('credential-'+mode+'-logout',['openclaw','gateway','call','models.authLogout','--json','--params',JSON.stringify({provider:'gemini',credentialType:'api_key',agentId:'main'})]);
  const logoutResult=JSON.parse(logout);if(!logoutResult.removedProfiles?.includes('gemini:proof')||logoutResult.abortedRunIds.length!==0)throw Error('targeted live logout completion missing or run aborted');receipts.push({mode,liveLogout:logoutResult});
  await fs.writeFile(release,'released\n');
  const terminalResult=await cmd('credential-'+mode+'-wait',['openclaw','gateway','call','agent.wait','--json','--params',JSON.stringify({runId,timeoutMs:30000}),'--timeout','35000']);
  const events=(await fs.readFile(trace,'utf8')).trim().split('\n').map(x=>JSON.parse(x));const result=events.find(x=>x.event==='credential-result');
  if(!result?.rejected||!(/"status"\s*:\s*"ok"/.test(terminalResult)))throw Error('retained credential refusal not established');
  const retainedHistory=await cmd('credential-'+mode+'-history',['openclaw','gateway','call','chat.history','--json','--params',JSON.stringify({sessionKey,limit:10})]);
  if(!retainedHistory.includes('CREDENTIAL_REVOCATION_PROBE'))throw Error('retained request not persisted');
  if(calls.length!==beforeLogoutCalls)throw Error('image or credentials reached endpoint after logout');
  receipts.push({mode,passed:true,retainedToolRefused:true,zeroHttpAfterLogout:true,nativeEntries:events.filter(x=>x.event==='native-entry'),refusal:result.error});await record();
  await cmd('credential-'+mode+'-gateway-stop',['bash','-c','source scripts/lib/openclaw-e2e-instance.sh\nopenclaw_e2e_terminate_gateways "$IMAGE_GATEWAY_PID"'],{IMAGE_GATEWAY_PID:String(gateway)});gateway=undefined;
 }
 phase='both-credential-revocation-cases-passed';await record();
}catch(e){phase='failed';receipts.push({error:String(e)});await record();process.exitCode=1;}finally{
 const terminalPhase=phase;
 if(gateway){try{await cmd('credential-final-gateway-stop',['bash','-c','source scripts/lib/openclaw-e2e-instance.sh\nopenclaw_e2e_terminate_gateways "$IMAGE_GATEWAY_PID"'],{IMAGE_GATEWAY_PID:String(gateway)})}catch{}}
 for(const {server} of Object.values(servers)){server.closeAllConnections();await new Promise(r=>server.close(r))}phase=terminalPhase;await record();
}
