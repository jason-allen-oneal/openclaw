import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
export async function connectGateway(url, token, tracePath) {
  const socket = new WebSocket(url);
  const pending = new Map();
  const record = (event) => fs.appendFileSync(tracePath, JSON.stringify({time:Date.now(),...event})+'\n');
  let connected;
  let connectionFailed;
  const ready = new Promise((resolve,reject)=>{connected=resolve;connectionFailed=reject;});
  const request = (method,params={}) => {
    const id = randomUUID();
    record({direction:'request',id,method,...(method==='connect'?{}:{params})});
    const result = new Promise((resolve,reject)=>pending.set(id,{resolve,reject,method}));
    socket.send(JSON.stringify({type:'req',id,method,params}));
    return result;
  };
  socket.addEventListener('message',({data})=>{
    const frame=JSON.parse(data);
    if(frame.type==='event' && frame.event==='connect.challenge') {
      void request('connect',{
        minProtocol:4,maxProtocol:4,
        client:{id:'cli',displayName:'Archive native-custody proof',version:'proof',platform:'linux',mode:'cli'},
        role:'operator',scopes:['operator.admin'],auth:{token}
      }).then(connected,connectionFailed);
    }
    if(frame.type==='res') {
      const waiting=pending.get(frame.id);
      if(!waiting)return;
      pending.delete(frame.id);
      record({direction:'response',id:frame.id,method:waiting.method,ok:frame.ok,...(waiting.method==='connect'?{}:{payload:frame.payload,error:frame.error})});
      if(frame.ok) waiting.resolve(frame.payload); else waiting.reject(new Error(JSON.stringify(frame.error)));
    }
  });
  socket.addEventListener('error',()=>connectionFailed(new Error('WebSocket connection failed')));
  socket.addEventListener('close',({code,reason})=>{
    record({event:'socket-close',code,reason});
    connectionFailed(new Error(`WebSocket closed: ${code} ${reason}`));
    for(const entry of pending.values())entry.reject(new Error(`WebSocket closed: ${code}`));
    pending.clear();
  });
  await ready;
  return {request,close:()=>socket.close(),record};
}
