import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
const [mode, packageRoot, proofRoot] = process.argv.slice(2);
const state = path.join(proofRoot,'state');
const agentDir = path.join(state,'agents/main/agent');
const rootFile = path.join(agentDir,'models.json');
const configFile = path.join(state,'openclaw.json');
const {baseUrl}=JSON.parse(fs.readFileSync(path.join(proofRoot,'receiver-address.json'),'utf8'));
const receipts=[];
const hash=b=>createHash('sha256').update(b).digest('hex');
function bind(file) { const bytes=fs.readFileSync(file); receipts.push({file:path.relative(packageRoot,file),sha256:hash(bytes)}); }
async function owner(name) {
  const dist=path.join(packageRoot,'dist');
  const matches=fs.readdirSync(dist).filter(f=>/\.(mjs|js)$/.test(f)).flatMap(f=>{
    const text=fs.readFileSync(path.join(dist,f),'utf8');
    return new RegExp(`(?:async )?function ${name}\\(`).test(text)?[{f,text}]:[];
  });
  assert.equal(matches.length,1,`Unambiguous owner for ${name}`);
  const {f,text}=matches[0];
  const exports=[...text.matchAll(/export\s*\{([^}]+)\}/gs)].flatMap(m=>m[1].split(',').map(s=>s.trim()));
  const entry=exports.find(s=>s===name||s.startsWith(name+' as '));
  assert(entry,`Export for ${name}`);
  const alias=entry===name?name:entry.slice((name+' as ').length);
  const file=path.join(dist,f);bind(file);
  return (await import(pathToFileURL(file)))[alias];
}
const model={id:'fixture-model',name:'Fixture model',reasoning:false,input:['text'],cost:{input:0,output:0,cacheRead:0,cacheWrite:0},contextWindow:4096,maxTokens:128};
const provider=apiKey=>({baseUrl,api:'openai-completions',...(apiKey?{apiKey}:{}),models:[model]});
const config={gateway:{mode:'local'},plugins:{enabled:false},agents:{defaults:{systemAgent:{agentId:'main'},workspace:path.join(state,'workspace')},entries:{main:{}}}};
fs.mkdirSync(agentDir,{recursive:true});
if(mode==='stable-seed') {
  fs.mkdirSync(path.join(state,'workspace'),{recursive:true});
  fs.writeFileSync(configFile,JSON.stringify(config,null,2)+'\n',{mode:0o600});
  fs.writeFileSync(rootFile,'// Authored root literal and comments must survive.\n'+JSON.stringify({providers:{manual:provider('synthetic-authored-root-key')}})+'\n',{mode:0o600});
}
const sdkFile=path.join(packageRoot,'dist/plugin-sdk/agent-sessions.js');bind(sdkFile);
const {AuthStorage,ModelRegistry,SessionManager}=await import(pathToFileURL(sdkFile));
for(const name of ['AuthStorage','ModelRegistry']) {
  const files=fs.readdirSync(path.join(packageRoot,'dist')).filter(f=>/\.(mjs|js)$/.test(f)&&fs.readFileSync(path.join(packageRoot,'dist',f),'utf8').includes(`class ${name}`));
  assert.equal(files.length,1,`Unambiguous ${name} implementation`);bind(path.join(packageRoot,'dist',files[0]));
}
const auth=AuthStorage.forAgentAsync?await AuthStorage.forAgentAsync(agentDir,config):AuthStorage.forAgent(agentDir,config);
const replace=await owner('replacePersistedPluginModelCatalogs');
const read=await owner('loadPersistedPluginModelCatalogsReadOnly');
const generated=providers=>JSON.stringify({generatedBy:'openclaw-plugin-model-catalog-v1',providers});
const counts=()=>fs.existsSync(path.join(proofRoot,'receiver.jsonl'))?fs.readFileSync(path.join(proofRoot,'receiver.jsonl'),'utf8').trim().split('\n').filter(Boolean).length:0;
let registry;
async function reload() { registry=ModelRegistry.createAsync?await ModelRegistry.createAsync(auth,rootFile,{config}):ModelRegistry.create(auth,rootFile,{config}); assert.equal(registry.getError(),undefined); }
const observations=[];
async function request(providerId,expectedKey) {
  const before=counts();const selected=registry.find(providerId,'fixture-model');assert(selected,`Model ${providerId}`);
  const result=await registry.getApiKeyAndHeaders(selected);
  if(expectedKey===null) {assert.equal(result.ok,false);assert.equal(counts(),before);observations.push({provider:providerId,allowed:false,requests:0,error:result.error});return;}
  assert.equal(result.ok,true);assert.equal(result.apiKey,expectedKey);
  const response=await fetch(selected.baseUrl+'/chat/completions',{method:'POST',headers:{'content-type':'application/json',Authorization:`Bearer ${result.apiKey}`,...selected.headers,...result.headers},body:JSON.stringify({model:selected.id,messages:[{role:'user',content:`${mode}:${providerId}`}],max_tokens:8})});
  const body=await response.json();assert.equal(response.status,200);assert.equal(body.choices[0].message.content,'physical receiver acknowledged');assert.equal(counts(),before+1);
  observations.push({provider:providerId,allowed:true,requests:1,receipt:body.id,status:response.status,content:body.choices[0].message.content});
}
const target={agentId:'main',sessionId:'catalog-proof-retained-session',sessionKey:'agent:main:catalog-proof-retained-session',storePath:path.join(agentDir,'openclaw-agent.sqlite')};
if(mode==='stable-seed') {
  auth.set('canonical',{type:'api_key',key:'synthetic-canonical-key'});
  const catalog=generated({canonical:{...provider('synthetic-canonical-key'),headers:{Authorization:'Bearer synthetic-canonical-key'}},recovered:provider('synthetic-legacy-only-key')});
  await replace({agentDir,pluginCatalogWrites:{'plugins/proof-owner/catalog.json':catalog},env:process.env});
  assert.equal(read(agentDir)[0].contents,catalog);
  const upsert=await owner('upsertSessionEntryCore');
  await upsert(target,{sessionId:target.sessionId,updatedAt:1});
  const session=SessionManager.open(target,state);
  session.appendMessage({role:'user',content:'stable retained message',timestamp:1});
  assert(session.getEntries().some(e=>e.message?.content==='stable retained message'));
  fs.writeFileSync(path.join(proofRoot,'authored-root.sha256'),hash(fs.readFileSync(rootFile))+'\n');
  await reload();await request('canonical','synthetic-canonical-key');await request('recovered',null);await request('manual','synthetic-authored-root-key');
} else if(mode==='candidate-read') {
  assert.equal(hash(fs.readFileSync(rootFile)),fs.readFileSync(path.join(proofRoot,'authored-root.sha256'),'utf8').trim());
  const persisted=read(agentDir);assert.equal(persisted.length,1);
  const content=JSON.parse(persisted[0].contents);for(const p of Object.values(content.providers)){assert(!('apiKey'in p));assert(!('headers'in p));}
  await reload();await request('canonical','synthetic-canonical-key');await request('recovered','synthetic-legacy-only-key');await request('manual','synthetic-authored-root-key');
  const session=await SessionManager.openAsync(target,state);
  assert(session.getEntries().some(e=>e.message?.content==='stable retained message'));
  await session.appendMessageAsync({role:'user',content:'candidate retained message',timestamp:2});
  const reopened=await SessionManager.openAsync(target,state);
  assert(reopened.getEntries().some(e=>e.message?.content==='candidate retained message'));
  observations.push({retainedSessionReadWrite:true,authoredRootBytesUnchanged:true});
  await replace({agentDir,pluginCatalogWrites:{'plugins/proof-owner/catalog.json':generated({...content.providers,unconfigured:{...provider('synthetic-untrusted-generated-key'),headers:{Authorization:'Bearer synthetic-untrusted-generated-key'}}})},env:process.env});
  const clean=JSON.parse(read(agentDir)[0].contents);assert(!('apiKey'in clean.providers.unconfigured));assert(!('headers'in clean.providers.unconfigured));
  await reload();await request('unconfigured',null);
  await auth.removeAsync('canonical');await reload();await request('canonical',null);
} else throw new Error('Unknown proof mode');
const output={mode,version:JSON.parse(fs.readFileSync(path.join(packageRoot,'package.json'),'utf8')).version,bindings:receipts,observations};
fs.writeFileSync(path.join(proofRoot,mode+'.json'),JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({mode,observations}));
process.exit(0);
