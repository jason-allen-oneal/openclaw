import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
const root=path.dirname(fileURLToPath(import.meta.url));
const require=createRequire('<WORKSPACE_ROOT>/package.json');
const {WebSocket,WebSocketServer}=require('ws');
const config=JSON.parse(fs.readFileSync(path.join(root,'gateway-config.private.json'),'utf8'));
const protocol=Number(process.env.PROOF_PROTOCOL || 4);
const trace=path.join(root,'native-wire.jsonl');
const record=value=>fs.appendFileSync(trace,JSON.stringify({timestampMs:Date.now(),...value})+'\n');
const clients=new Set();
async function rpc(method,params){
 const ws=new WebSocket('ws://127.0.0.1:19990');
 return await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{ws.close();reject(Error('RPC deadline'));},30000);
  ws.on('error',error=>{clearTimeout(timer);reject(error);});
  ws.on('message',bytes=>{
   const frame=JSON.parse(bytes);
   if(frame.event==='connect.challenge')ws.send(JSON.stringify({type:'req',id:'connect',method:'connect',params:{minProtocol:protocol,maxProtocol:protocol,client:{id:'cli',version:'issue179075-observer',platform:'linux',mode:'cli'},role:'operator',scopes:['operator.admin'],auth:{token:config.gateway.auth.token}}}));
   if(frame.type==='res'&&frame.id==='connect'){
    if(!frame.ok){clearTimeout(timer);ws.close();reject(Error(JSON.stringify(frame.error)));return;}
    ws.send(JSON.stringify({type:'req',id:'call',method,params}));
   }
   if(frame.type==='res'&&frame.id==='call'){clearTimeout(timer);ws.close();frame.ok?resolve(frame.payload):reject(Error(JSON.stringify(frame.error)));}
  });
 });
}
const server=http.createServer(async(req,res)=>{
 try{
  if(req.url!=='/setup'){res.writeHead(404);res.end();return;}
  const result=await rpc('device.pair.setupCode',{publicUrl:'ws://127.0.0.1:19992',includeQr:false});
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));
 }catch(error){res.writeHead(500);res.end(JSON.stringify({error:String(error)}));}
});
const wss=new WebSocketServer({server});
wss.on('connection',client=>{
 const upstream=new WebSocket('ws://127.0.0.1:19990');
 const c={id:randomUUID(),client,upstream,role:null,requests:new Map()};clients.add(c);
 record({direction:'connection-open',connection:c.id});
 client.on('message',(bytes,isBinary)=>{
  const frame=JSON.parse(bytes);if(frame.method==='connect')c.role=frame.params.role;
  if(frame.type==='req'){
   c.requests.set(frame.id,{method:frame.method,startedAt:Date.now()});
   record({direction:'request',connection:c.id,role:c.role,id:frame.id,method:frame.method,...(['models.list','chat.metadata'].includes(frame.method)?{params:frame.params}:{})});
  }
  if(upstream.readyState===WebSocket.OPEN)upstream.send(bytes,{binary:isBinary});else upstream.once('open',()=>upstream.send(bytes,{binary:isBinary}));
 });
 upstream.on('message',(bytes,isBinary)=>{
  const frame=JSON.parse(bytes);
  if(frame.type==='event')record({direction:'gateway-event',connection:c.id,role:c.role,event:frame.event,seq:frame.seq,...(frame.event==='chat.metadata.changed'?{payload:frame.payload}:{})});
  if(frame.type==='res'){
   const pending=c.requests.get(frame.id),method=pending?.method,elapsedMs=pending?Date.now()-pending.startedAt:null;c.requests.delete(frame.id);
   if(['models.list','chat.metadata'].includes(method))fs.appendFileSync(path.join(root,'catalog-payloads.private.jsonl'),JSON.stringify({timestampMs:Date.now(),method,elapsedMs,frame})+'\n');
   const models=frame.payload?.models;
   record({direction:'response',connection:c.id,role:c.role,id:frame.id,method,elapsedMs,payloadBytes:Buffer.byteLength(JSON.stringify(frame.payload??null)),ok:frame.ok,...(method==='models.list'?{modelCount:models?.length,refreshFailed:frame.payload?.refreshFailed??false,availability:models?.reduce((counts,row)=>(counts[row.available===true?'available':row.available===false?'unavailable':'indeterminate']=(counts[row.available===true?'available':row.available===false?'unavailable':'indeterminate']||0)+1,counts),{})}:{}),...(frame.ok?{}:{error:frame.error})});
  }
  // Forward original bytes: no injected events, response changes, or sequence rewriting.
  if(client.readyState===WebSocket.OPEN)client.send(bytes,{binary:isBinary});
 });
 upstream.on('error',error=>{record({direction:'upstream-error',connection:c.id,message:error.message});client.close();});
 client.on('error',error=>{record({direction:'client-error',connection:c.id,message:error.message});upstream.close();});
 client.on('close',(code,reason)=>{record({direction:'client-close',connection:c.id,code,reason:reason.toString()});upstream.close();clients.delete(c);});
 upstream.on('close',(code,reason)=>{record({direction:'upstream-close',connection:c.id,code,reason:reason.toString()});client.close();});
});
server.listen(19992,'127.0.0.1',()=>console.log('Observation-only proxy listening19992'));
process.on('SIGTERM',()=>{for(const c of clients){c.client.terminate();c.upstream.terminate();}wss.close();server.close(()=>process.exit(0));});
