// One real seed request, then passive wait for all provider completions and natural publication.
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const root=process.argv[2], pkg=process.argv[3];
const require=createRequire(path.join(pkg,'package.json'));
const {WebSocket}=require('ws');
const config=JSON.parse(fs.readFileSync(path.join(root,'config.json'),'utf8'));
const result={startedAtMs:Date.now(),pid:process.pid,requests:[],metadataEvents:0,syntheticEvents:false,followupRequests:0};
let accepted=false,publication=0,finished=false;
const ws=new WebSocket(`ws://127.0.0.1:${config.gateway.port}`);
const providerState=()=>{
 const file=path.join(root,'provider.jsonl');
 const text=fs.existsSync(file)?fs.readFileSync(file,'utf8'):'';
 const complete=text.slice(0,text.lastIndexOf('\n')+1);
 const rows=complete.trim()?complete.trim().split('\n').map(line=>JSON.parse(line)):[];
 const live=new Set(),successful=new Set();let lastReturn=0,errors=0;
 for(const row of rows){
  if(row.kind==='catalog-start') live.add(row.call);
  if(row.kind==='catalog-return'){live.delete(row.call);successful.add(row.provider);lastReturn=row.time;}
  if(row.kind==='catalog-error'){live.delete(row.call);errors++;}
 }
 return {successfulProviders:successful.size,liveCalls:live.size,lastReturn,errors,recordCount:rows.length};
};
const finish=error=>{
 if(finished)return;finished=true;clearInterval(checkTimer);clearTimeout(deadline);
 Object.assign(result,{finishedAtMs:Date.now(),ok:!error,error,publicationAtMs:publication,provider:providerState(),seedClientExiting:true});
 fs.writeFileSync(path.join(root,'seed-receipt.json'),JSON.stringify(result,null,2),{mode:0o600});
 console.log(JSON.stringify(result));ws.close();setTimeout(()=>process.exit(error?1:0),100);
};
const check=()=>{try{const p=providerState();if(accepted&&p.successfulProviders===64&&p.liveCalls===0&&publication>=p.lastReturn)finish();}catch(error){finish(error.message);}};
const checkTimer=setInterval(check,100);
const deadline=setTimeout(()=>finish('150s seed/publication deadline'),150000);
ws.on('error',error=>finish(error.message));
ws.on('close',()=>{if(!finished)finish('Gateway closed during seed');});
ws.on('message',bytes=>{
 const frame=JSON.parse(bytes);
 if(frame.event==='connect.challenge'){
  ws.send(JSON.stringify({type:'req',id:'connect',method:'connect',params:{minProtocol:4,maxProtocol:4,client:{id:'cli',version:'native-natural-seed-only',platform:'linux',mode:'cli'},role:'operator',scopes:['operator.admin'],auth:{token:config.gateway.auth.token}}}));return;
 }
 if(frame.type==='res'&&frame.id==='connect'){
  if(!frame.ok){finish('Connect rejected');return;}
  result.requests.push({method:'models.list',params:{refresh:true},sentAtMs:Date.now()});
  ws.send(JSON.stringify({type:'req',id:'seed',method:'models.list',params:{refresh:true}}));return;
 }
 if(frame.type==='res'&&frame.id==='seed'){
  result.response={ok:frame.ok,receivedAtMs:Date.now(),modelCount:frame.payload?.models?.length,refreshFailed:frame.payload?.refreshFailed};
  if(!frame.ok){finish('Seed rejected');return;}accepted=true;check();return;
 }
 if(frame.event==='chat.metadata.changed'){publication=Date.now();result.metadataEvents++;check();}
});
