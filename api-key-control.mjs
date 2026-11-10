import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import http from 'node:http';
import net from 'node:net';
import { createRequire } from 'node:module';
import { zstdDecompressSync,gunzipSync } from 'node:zlib';
import { once } from 'node:events';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { buffer } from 'node:stream/consumers';

const checkout = path.resolve(process.argv[2]);
const root = path.dirname(fileURLToPath(import.meta.url));
const childMode = process.argv.includes('--child');
const expectedHead = '16d08c5bc9b39a67aa539e2da12a646e98421fec';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const cert = path.join(root,'fixture-cert.pem');
const key = path.join(root,'fixture-key.pem');
const native = path.join(checkout,'node_modules/.pnpm/@openai+codex@0.164.0-linux-x64/node_modules/@openai/codex/vendor/x86_64-unknown-linux-musl/bin/codex');
if (!childMode) {
  for (const dir of ['home/.codex','home/.config','state','workspace','tmp']) await fs.mkdir(path.join(root,dir),{recursive:true,mode:0o700});
  execFileSync('/usr/bin/openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-days','1','-subj','/CN=api.openai.com','-addext','subjectAltName=DNS:api.openai.com','-addext','basicConstraints=critical,CA:TRUE'],{stdio:'ignore'});
  await fs.chmod(key,0o600);
  const env = {
    PATH:'/usr/bin:/bin', HOME:path.join(root,'home'), USERPROFILE:path.join(root,'home'),
    OPENCLAW_HOME:path.join(root,'home'), OPENCLAW_STATE_DIR:path.join(root,'state'),
    OPENCLAW_CONFIG_PATH:path.join(root,'state/openclaw.json'), CODEX_HOME:path.join(root,'home/.codex'),
    TMPDIR:path.join(root,'tmp'), TMP:path.join(root,'tmp'), TEMP:path.join(root,'tmp'),
    XDG_CONFIG_HOME:path.join(root,'home/.config'), XDG_STATE_HOME:path.join(root,'home/.local/state'),
    XDG_DATA_HOME:path.join(root,'home/.local/share'), XDG_CACHE_HOME:path.join(root,'home/.cache'),
    NODE_EXTRA_CA_CERTS:cert,
  };
  const log = await fs.open(path.join(root,'execution.log'),'w',0o600);
  const child=spawn(process.execPath,[fileURLToPath(import.meta.url),checkout,'--child'],{env,stdio:['ignore',log.fd,log.fd],cwd:root});
  const [code,signal]=await once(child,'exit'); await log.close();
  await fs.writeFile(path.join(root,'exit.json'),JSON.stringify({code,signal,finishedAt:new Date().toISOString()})+'\n');
  console.log(JSON.stringify({code,signal,log:path.join(root,'execution.log'),receipt:path.join(root,'receipt.json')}));
  process.exitCode=code??1;
} else {
  const build=JSON.parse(await fs.readFile(path.join(checkout,'dist/build-info.json'),'utf8'));
  assert.equal(build.commit,expectedHead);
  const identity=async()=> {
    const entries=[];
    for(const dir of [path.join(checkout,'dist/extensions/codex/.setup'),path.join(checkout,'dist/plugin-sdk')]) {
      for(const name of (await fs.readdir(dir)).sort()) {
        if(!/\.(?:mjs|js)$/.test(name))continue;
        const f=path.join(dir,name); const s=await fs.stat(f);
        if(s.isFile())entries.push({file:path.relative(checkout,f),sha256:sha(await fs.readFile(f))});
      }
    }
    entries.push({file:path.relative(checkout,native),sha256:sha(await fs.readFile(native))});
    return entries;
  };
  const before=await identity();
  const requests=[],connections=[],results=[];
  let activeCase='startup', harness;
  const sockets=new Set();
  const tlsServer=https.createServer({key:await fs.readFile(key),cert:await fs.readFile(cert)},async(req,res)=>{
    try {
      const wire=await buffer(req);
      const raw=req.headers['content-encoding']==='zstd'?zstdDecompressSync(wire):req.headers['content-encoding']==='gzip'?gunzipSync(wire):wire;
      console.log(JSON.stringify({receiver:'http',method:req.method,url:req.url,wireBytes:wire.length,bytes:raw.length}));
      if(req.method!=='POST'){res.writeHead(426);res.end();return;}
      const body=JSON.parse(raw.toString());
      requests.push({case:activeCase,method:req.method,path:req.url,body,syntheticAuthorizationMatched:req.headers.authorization==='Bearer synthetic-api-key-control'});
      assert.equal(req.method,'POST');assert.equal(req.url,'/v1/responses');
      assert.equal(req.headers.authorization,'Bearer synthetic-api-key-control');
      const item={id:'control-answer',type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:'API_KEY_CONTROL_OK'}]};
      const response={id:'response-control',status:'completed',output:[item],usage:{input_tokens:1,output_tokens:1,total_tokens:2}};
      const events=[{type:'response.created',response:{id:response.id,status:'in_progress'}},{type:'response.output_item.done',item},{type:'response.completed',response}];
      res.writeHead(200,{'content-type':'text/event-stream'});
      res.end(events.map(e=>'data: '+JSON.stringify(e)+'\n\n').join(''));
    } catch(e) {res.writeHead(400);res.end(String(e));}
  });
  const require=createRequire(path.join(checkout,'package.json'));
  const {WebSocketServer}=require('ws');
  const wss=new WebSocketServer({noServer:true});
  tlsServer.on('upgrade',(req,socket,head)=>wss.handleUpgrade(req,socket,head,ws=>{
    ws.on('message',bytes=>{
      const body=JSON.parse(bytes.toString());
      requests.push({case:activeCase,transport:'websocket',path:req.url,body,syntheticAuthorizationMatched:req.headers.authorization==='Bearer synthetic-api-key-control'});
      assert.equal(req.url,'/v1/responses');assert.equal(req.headers.authorization,'Bearer synthetic-api-key-control');
      const item={id:'control-answer',type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:'API_KEY_CONTROL_OK'}]};
      for(const e of [{type:'response.created',response:{id:'response-control',status:'in_progress'}},{type:'response.output_item.done',item},{type:'response.completed',response:{id:'response-control',status:'completed',output:[item],usage:{input_tokens:1,output_tokens:1,total_tokens:2}}}])ws.send(JSON.stringify(e));
    });
  }));
  tlsServer.on('connection',s=>{sockets.add(s);s.once('close',()=>sockets.delete(s));});
  tlsServer.listen(0,'127.0.0.1');await once(tlsServer,'listening');
  const proxy=http.createServer((req,res)=>{connections.push({kind:'blocked-http',url:req.url});res.writeHead(403);res.end();});
  proxy.on('connect',(req,socket,head)=>{
    connections.push({kind:'connect',destination:req.url});
    if(req.url!=='api.openai.com:443'){socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');return;}
    const upstream=net.connect(tlsServer.address().port,'127.0.0.1',()=>{
      socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if(head.length)upstream.write(head);socket.pipe(upstream);upstream.pipe(socket);
    });
    for(const s of [socket,upstream]){sockets.add(s);s.once('close',()=>sockets.delete(s));s.on('error',()=>{socket.destroy();upstream.destroy();});}
  });
  proxy.listen(0,'127.0.0.1');await once(proxy,'listening');
  const proxyUrl='http://127.0.0.1:'+proxy.address().port;
  for(const k of ['HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','http_proxy','https_proxy','all_proxy'])process.env[k]=proxyUrl;
  process.env.NO_PROXY=process.env.no_proxy='127.0.0.1,localhost,::1';
  const quote=s=>"'"+s.replaceAll("'","'\\''")+"'";
  const nativePids=new Set();
  const observer=setInterval(()=>{
    try { const queue=[process.pid];for(let i=0;i<queue.length;i++){const parent=queue[i];for(const id of fsSync.readFileSync('/proc/'+parent+'/task/'+parent+'/children','utf8').trim().split(/\s+/).filter(Boolean)){queue.push(Number(id));
      const exe=fsSync.readlinkSync('/proc/'+id+'/exe');
      if(path.basename(exe)==='codex'){nativePids.add(Number(id));fsSync.writeFileSync(path.join(root,'native-pids.log'),[...nativePids].join('\n')+'\n');}
    }}}catch{}
  },50);
  const wrapper=path.join(root,'native-launcher.sh');
  await fs.writeFile(wrapper,'#!/bin/sh\nprintf "%s\\n" "$$" >> '+quote(path.join(root,'native-pids.log'))+'\nexec '+quote(native)+' "$@"\n',{mode:0o700});
  let failure;
  try {
    const {createCodexAppServerAgentHarness}=await import(pathToFileURL(path.join(checkout,'dist/extensions/codex/harness.js')));
    // Initialize the same built plugin-root owner called by Codex plugin registration.
    const setup=path.join(checkout,'dist/extensions/codex/.setup');
    const owners=[];
    for(const name of await fs.readdir(setup)){if(!name.endsWith('.mjs'))continue;const code=await fs.readFile(path.join(setup,name),'utf8');if(code.includes('function setManagedCodexPluginRoot('))owners.push({name,code});}
    assert.equal(owners.length,1);
    const alias=owners[0].code.match(/setManagedCodexPluginRoot as (\w+)/)[1];
    const managed=await import(pathToFileURL(path.join(setup,owners[0].name)));
    managed[alias](path.join(checkout,'dist/extensions/codex'));
    harness=createCodexAppServerAgentHarness({pluginConfig:{appServer:{transport:'stdio',homeScope:'agent'}}});
    for(const scenario of [
      {name:'preferred',streamParams:{maxTokens:300,temperature:0.2},streamParamsMode:'preferred'},
      {name:'required-default',streamParams:{maxTokens:37,temperature:0}}
    ]) {
      activeCase=scenario.name;
      const n=requests.length;
      const result=await harness.runIsolatedCompletionV2({
        config:{},provider:'openai',modelId:'gpt-6-luna',agentId:'control',
        agentDir:path.join(root,'state/agents/control/agent'),workspaceDir:path.join(root,'workspace'),
        systemPrompt:'Reply only API_KEY_CONTROL_OK. No tools.',prompt:'Run the bounded sampling control.',
        timeoutMs:45000,
        authorization:{owner:'host',model:{provider:'openai',id:'gpt-6-luna',api:'openai-responses',baseUrl:'https://api.openai.com/v1'},
          auth:{mode:'api-key',apiKey:'synthetic-api-key-control',profileId:'openai:synthetic-api-control',source:'profile'}},
        streamParams:scenario.streamParams,...(scenario.streamParamsMode?{streamParamsMode:scenario.streamParamsMode}:{}),
      });
      assert.deepEqual(result.assistant.content,[{type:'text',text:'API_KEY_CONTROL_OK'}]);
      assert.equal(requests.length,n+1);
      const body=requests.at(-1).body;
      assert.equal(body.max_output_tokens,scenario.streamParams.maxTokens);
      assert.equal(body.temperature,scenario.streamParams.temperature);
      assert.equal(body.model,'gpt-6-luna');assert.equal(body.tool_choice,'none');
      results.push({case:scenario.name,status:'passed',max_output_tokens:body.max_output_tokens,temperature:body.temperature,output:'API_KEY_CONTROL_OK'});
    }
  } catch(e) {failure={name:e.name,message:e.message,stack:e.stack};console.error(e);}
  finally {
    await harness?.dispose();
    clearInterval(observer);
    for(const ws of wss.clients)ws.terminate();
    wss.close();
    for(const socket of sockets)socket.destroy();
    await Promise.all([new Promise(r=>proxy.close(r)),new Promise(r=>tlsServer.close(r))]);
    const after=await identity();
    const pids=(await fs.readFile(path.join(root,'native-pids.log'),'utf8').catch(()=>'' )).trim().split(/\s+/).filter(Boolean).map(Number);
    const nativeProcesses=pids.map(pid=>{let alive=true;try{process.kill(pid,0);}catch{alive=false;}return {pid,alive};});
    const receipt={sourceHead:expectedHead,build,entrypoint:'dist/extensions/codex/harness.js:createCodexAppServerAgentHarness.runIsolatedCompletionV2',
      status:failure?'failed':'passed',results,requests,connections,nativeProcesses,artifacts:before,artifactsUnchanged:JSON.stringify(before)===JSON.stringify(after),
      nativeVersion:execFileSync(native,['--version'],{encoding:'utf8'}).trim(),
      limitations:['Synthetic API key and synthetic provider WebSocket responses; no provider service called.','Built harness API entrypoint, not a Gateway caller; built plugin-root setter initialized as plugin registration does.','Only API-key controls; no SIWC credential read or copied.'],
      ...(failure?{failure}:{}),recordedAt:new Date().toISOString()};
    await fs.writeFile(path.join(root,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');
    console.log(JSON.stringify({status:receipt.status,results,nativeProcesses,artifactsUnchanged:receipt.artifactsUnchanged}));
    process.exitCode=failure?1:0;
  }
}
