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
const prior=JSON.parse(await fs.readFile(path.join(LOG,'installed-image-fresh-progress.json'),'utf8'));const receipts=[{continuationOf:'installed-image-fresh-progress.json',note:'Model-only fresh image already passed; resume native plugin update after correcting owned HOME mode0775 to0700'}];const calls=prior.calls;let phase='setup';let gateway;
const sha=(x)=>createHash('sha256').update(x).digest('hex');
async function record(){await fs.writeFile(path.join(LOG,'installed-image-fresh-recovery-v3-progress.json'),JSON.stringify({phase,receipts,calls},null,2)+'\n');}
async function cmd(name,args,extra={}){
 phase=name;await record();const start=Date.now();const out=await fs.open(path.join(LOG,name+'.log'),'w');
 const p=spawn(args[0],args.slice(1),{cwd:REPO,env:{...env,...extra},stdio:['ignore',out.fd,out.fd],detached:true});
 const timer=setTimeout(()=>{try{process.kill(-p.pid,'SIGTERM')}catch{}},180000);
 const code=await new Promise((res,rej)=>{p.on('error',rej);p.on('exit',(code,signal)=>res(code??signal))});clearTimeout(timer);await out.close();receipts.push({name,args,exit:code,seconds:(Date.now()-start)/1000});await record();if(code!==0)throw Error(name+' exit '+code);
 return fs.readFile(path.join(LOG,name+'.log'),'utf8');
}
function output(response,text){const msg={type:'message',id:'msg-image',role:'assistant',status:'completed',content:[{type:'output_text',text,annotations:[]}]};const ev=[{type:'response.output_item.added',output_index:0,item:{...msg,status:'in_progress',content:[]}},{type:'response.output_text.delta',item_id:msg.id,output_index:0,content_index:0,delta:text},{type:'response.output_text.done',item_id:msg.id,output_index:0,content_index:0,text},{type:'response.output_item.done',output_index:0,item:msg},{type:'response.completed',response:{id:'resp-image',status:'completed',output:[msg],usage:{input_tokens:1,output_tokens:1,total_tokens:2}}}];response.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-store'});response.end(ev.map(x=>'data: '+JSON.stringify(x)+'\n\n').join('')+'data: [DONE]\n\n');}
const preservedConfig=JSON.parse(await fs.readFile(cfgPath,'utf8'));const servers={};
for(const owner of ['google','gemini']){
 const server=createServer((req,res)=>{void(async()=>{let raw='';for await(const c of req)raw+=c;const body=raw?JSON.parse(raw):{};const auth=req.headers.authorization;const images=[];for(const item of body.input??[])for(const c of item.content??[])if(c.type==='input_image'){const [,mime,b64]=/^data:([^;]+);base64,(.+)$/s.exec(c.image_url)??[];const buf=Buffer.from(b64??'','base64');images.push({mime,bytes:buf.length,sha256:sha(buf)});}calls.push({phase,owner,method:req.method,path:req.url,credential:auth==='Bearer synthetic-'+owner?owner:auth?'unknown':'none',model:body.model,images});await record();if(req.method==='GET'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({data:[{id:MODEL}]}));}else output(res,SUMMARY);})().catch(e=>{res.writeHead(500);res.end(String(e))})});await new Promise(r=>server.listen(Number(new URL(preservedConfig.models.providers[owner].baseUrl).port),'127.0.0.1',r));servers[owner]={server,url:'http://127.0.0.1:'+server.address().port+'/v1'};
}
try{
 const dir=path.join(ROOT,'plugin');const nativeLog=path.join(ROOT,'native-calls.jsonl');
 await cmd('installed-fresh-workspace-recovery',['openclaw','doctor','--fix','--force','--non-interactive']);
 const nativeReply=await cmd('installed-fresh-native-image-v3',['openclaw','agent','--local','--agent','main','--session-id','image-fresh-native','--message','Read the synthetic image through the native Gemini handler','--thinking','off','--json']);
 if(!nativeReply.includes('INSTALLED_IMAGE_PROOF_OK'))throw Error('fresh native image result missing');
 const nativeEvents=(await fs.readFile(nativeLog,'utf8')).trim().split('\n').map(x=>JSON.parse(x));
 if(JSON.stringify(nativeEvents)!==JSON.stringify([{handler:'gemini'}]))throw Error('fresh native selected wrong image handler');
 const imageCalls=calls.filter(x=>x.method==='POST');if(imageCalls.length!==2||imageCalls.some(x=>x.owner!=='gemini'||x.credential!=='gemini'||x.images.length!==1||x.images[0].sha256!=='a86fd9b9eb25dcd6531ae4a19ec3e05bcfe08acb907a5154310d5df94b8e5d1a'))throw Error('fresh installed image/credential invariant failed');
 phase='fresh-model-only-and-native-images-passed';await record();

}catch(e){phase='failed';receipts.push({error:String(e)});await record();process.exitCode=1;}finally{for(const {server} of Object.values(servers)){server.closeAllConnections();await new Promise(r=>server.close(r))}await record()}
