import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const root=process.env.PROOF_ROOT;
const previous=JSON.parse(fs.readFileSync(path.join(root,'live-proxy.address.json'),'utf8'));
const port=Number(new URL(previous.baseUrl).port);
const keys=new Set(['synthetic-canonical-key','synthetic-legacy-only-key','synthetic-authored-root-key']);
let sequence=0;
const record=(name,value)=>fs.appendFileSync(path.join(root,name),JSON.stringify(value)+'\n');
const server=http.createServer(async(req,res)=>{
 const id=`cpu-${++sequence}`; const chunks=[];for await(const chunk of req)chunks.push(chunk);
 const bytes=Buffer.concat(chunks);const auth=req.headers.authorization||'';const allowed=keys.has(auth.replace(/^Bearer /,''));
 const input=bytes.length?JSON.parse(bytes):null;
 record('live-proxy.requests.jsonl',{sequence:id,time:new Date().toISOString(),method:req.method,url:req.url,authAccepted:allowed,syntheticCredential:auth.replace(/^Bearer /,''),request:input});
 if(!allowed){res.writeHead(401,{'content-type':'application/json'});res.end(JSON.stringify({error:{message:'fixture proxy missing valid credential'}}));return;}
 if(req.url!='/v1/chat/completions'){res.writeHead(404);res.end();return;}
 const upstreamRequest={model:input.model,messages:input.messages,stream:true,think:false,options:{num_gpu:0,num_ctx:8192,num_predict:Math.min(input.max_completion_tokens||input.max_tokens||128,128)}};
 try{
  const upstream=await fetch('http://127.0.0.1:11434/api/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(upstreamRequest)});
  if(!upstream.ok){const body=await upstream.text();res.writeHead(upstream.status,{'content-type':'application/json'});res.end(body);record('live-proxy.responses.jsonl',{sequence:id,status:upstream.status,body});return;}
  res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-cache'});
  let pending='',raw='';const decoder=new TextDecoder();let content='',usage;
  for await(const part of upstream.body){const decoded=decoder.decode(part,{stream:true});pending+=decoded;raw+=decoded;
   while(pending.includes('\n')){const index=pending.indexOf('\n');const line=pending.slice(0,index);pending=pending.slice(index+1);if(!line.trim())continue;const chunk=JSON.parse(line);
    if(chunk.error)throw new Error(chunk.error);
    const token=chunk.message?.content||'';content+=token;
    const response={id,object:'chat.completion.chunk',created:Math.floor(Date.now()/1000),model:input.model,choices:[{index:0,delta:token?{content:token}:{},finish_reason:chunk.done?'stop':null}]};
    if(chunk.done){usage={prompt_tokens:chunk.prompt_eval_count||0,completion_tokens:chunk.eval_count||0,total_tokens:(chunk.prompt_eval_count||0)+(chunk.eval_count||0)};response.usage=usage;}
    res.write('data: '+JSON.stringify(response)+'\n\n');
   }
  }
  res.end('data: [DONE]\n\n');record('live-proxy.responses.jsonl',{sequence:id,time:new Date().toISOString(),status:200,upstream:'Ollama /api/chat CPU-only',upstreamRequest,raw,content,usage});
 }catch(e){if(!res.headersSent)res.writeHead(502);res.end();record('live-proxy.responses.jsonl',{sequence:id,error:String(e)});}
});
server.listen(port,'127.0.0.1',()=>{fs.writeFileSync(path.join(root,'live-proxy.address.json'),JSON.stringify({baseUrl:`http://127.0.0.1:${port}/v1`,pid:process.pid,transport:'openai-to-ollama-native-cpu'}));console.log('Local CPU model auth proxy ready');});
process.on('SIGTERM',()=>server.close(()=>process.exit(0)));
