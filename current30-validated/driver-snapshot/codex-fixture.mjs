// SYNTHETIC LOCAL PROTOCOL FIXTURE: no network, inference, real auth or database manipulation.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
const out=process.env.DIAGNOSTIC_CASE;
const nativeVersion=process.env.DIAGNOSTIC_NATIVE_VERSION||'0.155.1';
if (!out) throw Error('DIAGNOSTIC_CASE is required');
const record=(kind,data={})=>fs.appendFileSync(path.join(out,'codex-events.jsonl'),JSON.stringify({timeMs:Date.now(),pid:process.pid,ppid:process.ppid,kind,codexHome:process.env.CODEX_HOME,...data})+'\n');
if (process.argv.includes('--version')) { console.log('codex-cli '+nativeVersion); process.exit(0); }
record('start',{argv:process.argv.slice(2)});
let stopped=false; const timers=new Set();
const reply=(id,result)=>{if(!stopped)process.stdout.write(JSON.stringify({id,result})+'\n');};
const finish=(why,code=0)=>{if(stopped)return;stopped=true;for(const t of timers)clearTimeout(t);record('exit',{why,code});process.exit(code);};
for(const s of ['SIGTERM','SIGINT','SIGHUP'])process.on(s,()=>finish(s));
process.on('exit',code=>{if(!stopped)record('exit',{why:'exit-event',code});});
process.stdout.on('error',()=>finish('stdout-closed'));
const life=setTimeout(()=>finish('hard-240s-child-cap'),240000);timers.add(life);
const rl=readline.createInterface({input:process.stdin});
rl.on('close',()=>finish('stdin-closed'));
rl.on('line',line=>{
  let m;try{m=JSON.parse(line);}catch{record('invalid-input');return;}
  record('request',{id:m.id,method:m.method}); // Deliberately never records auth values.
  if(m.id===undefined)return;
  if(m.method==='initialize')reply(m.id,{userAgent:'codex-cli/'+nativeVersion,codexHome:process.env.CODEX_HOME});
  else if(m.method==='account/read')reply(m.id,{account:{type:'apiKey'},requiresOpenaiAuth:true});
  else if(m.method==='account/login/start'){
    reply(m.id,{type:'apiKey'});
    process.stdout.write(JSON.stringify({method:'account/updated',params:{authMode:'apiKey'}})+'\n');
  } else if(m.method==='config/read')reply(m.id,{config:{}});
  else if(m.method==='model/list'){
    const delay=Number(process.env.DIAGNOSTIC_MODEL_DELAY_MS||3500);
    const t=setTimeout(()=>{timers.delete(t);record('model-list-reply',{id:m.id,delayMs:delay});reply(m.id,{data:[{id:'synthetic-model',model:'synthetic-model',displayName:'Synthetic fixture model',description:'No inference available',hidden:false,isDefault:true,inputModalities:['text'],supportedReasoningEfforts:[],defaultReasoningEffort:'low'}],nextCursor:null});},delay);
    timers.add(t);
  } else if(m.method==='thread/list')reply(m.id,{data:[],nextCursor:null});
  else {record('unsupported-method',{method:m.method});process.stdout.write(JSON.stringify({id:m.id,error:{code:-32601,message:'Synthetic discovery-only fixture: unsupported method'}})+'\n');}
});
