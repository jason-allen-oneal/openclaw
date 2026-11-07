import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { writeFileSync } from 'node:fs';
import { once, EventEmitter } from 'node:events';
const signals = new EventEmitter();
const require = createRequire(`${process.argv[2]}/package.json`);
const { WebSocketServer } = require('ws');
const output = process.argv[3];
const sockets = []; const requests = []; const closes = []; const event = (name, payload = {}) => JSON.stringify({type:'event',event:name,payload});
const response = (ws,id,payload) => ws.send(JSON.stringify({type:'res',id,ok:true,payload}));
const server = createServer(async (req,res) => {
 try {
  let result = {ok:true};
  const ws = sockets[0];
  switch(req.url) {
   case '/block': ws.send(event('proof.block')); break;
   case '/overflow':
    // One handler + the accepted health response + 254 events fill the 256-frame admission budget.
    for(let i=0;i<255;i++) ws.send(event('proof.queued',{i}));
    break;
   case '/pending':
    if (!requests.some(x=>x.connection===1 && x.method==='health')) await once(signals,'health',{signal:AbortSignal.timeout(10000)});
    break;
   case '/closed':
    if (!closes.some(x=>x.connection===1)) await once(ws,'close',{signal:AbortSignal.timeout(10000)});
    result = {ok:true,closes}; break;
   case '/status': result={ok:true,closes,requests,connections:sockets.length}; break;
   case '/finish':
    writeFileSync(`${output}/host-observations.json`,JSON.stringify({closes,requests,connections:sockets.length},null,2)+'\n');
    break;
   default: throw Error('Unknown fixture route');
  }
  res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify(result));
 } catch(e) { res.writeHead(500).end(JSON.stringify({ok:false,error:e.message})); }
});
const wss = new WebSocketServer({server});
wss.on('connection', ws=>{
 sockets.push(ws); const index=sockets.length;
 ws.send(event('connect.challenge',{nonce:'backlog-native-proof',ts:Date.now()}));
 ws.on('message', raw=>{
  const frame=JSON.parse(raw.toString());
  requests.push({connection:index,method:frame.method});
  if(frame.method==='connect') response(ws,frame.id,{features:{methods:['health']},auth:{deviceToken:'synthetic-native-proof-token',role:'node',scopes:[]},snapshot:{sessionDefaults:{mainSessionKey:'main',mainKey:'main'}}});
  else if(frame.method==='health') { response(ws,frame.id,{connection:index,health:'ok'}); signals.emit('health'); }
  else response(ws,frame.id,{});
 });
 ws.on('close',(code,reason)=>closes.push({connection:index,code,reason:reason.toString()}));
});
server.listen(0,'127.0.0.1',()=>{writeFileSync(`${output}/host-ready.json`,JSON.stringify({port:server.address().port})+'\n');});
for(const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>{ for(const ws of sockets) ws.terminate(); wss.close(); server.close(()=>process.exit(0)); });
