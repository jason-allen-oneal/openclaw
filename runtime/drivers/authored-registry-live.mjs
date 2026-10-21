// Supplemental built-SDK registry proof, not a Gateway/Doctor upgrade substitute.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const [candidate,root]=process.argv.slice(2);
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const bindings={};const bind=file=>bindings[path.relative(candidate,file)]=hash(file);
const build=path.join(candidate,'dist/build-info.json');bind(build);
assert.equal(JSON.parse(fs.readFileSync(build)).commit,'4382a3109df1849e0fb0a6350c5f279d080756f8');
const sdk=path.join(candidate,'dist/plugin-sdk/agent-sessions.js');bind(sdk);
const llm=path.join(candidate,'dist/plugin-sdk/llm.js');bind(llm);
for(const name of ['AuthStorage','ModelRegistry']){
 const files=fs.readdirSync(path.join(candidate,'dist')).filter(f=>/\.(js|mjs)$/.test(f)&&fs.readFileSync(path.join(candidate,'dist',f),'utf8').includes(`class ${name}`));
 assert.equal(files.length,1);bind(path.join(candidate,'dist',files[0]));
}
const {AuthStorage,ModelRegistry}=await import(pathToFileURL(sdk));
const {completeSimple}=await import(pathToFileURL(llm));
const authored=path.join(root,'state/agents/main/agent/models.json');
const rootHash=hash(authored);assert.equal(rootHash,fs.readFileSync(path.join(root,'authored-root-before-candidate.sha256'),'utf8').trim());
const auth=AuthStorage.inMemory({});
const registry=ModelRegistry.create(auth,authored,{pluginCatalogs:[]});
assert.equal(registry.getError(),undefined);
const model=registry.find('manual','qwen3:0.6b');assert(model);
const resolved=await registry.getApiKeyAndHeaders(model);
assert.equal(resolved.ok,true);assert.equal(resolved.apiKey,'synthetic-authored-root-key');
const result=await completeSimple(model,{messages:[{role:'user',content:'Reply with ROOT-AUTH-OK and nothing else.',timestamp:Date.now()}]}, {apiKey:resolved.apiKey,headers:resolved.headers,maxTokens:64,signal:AbortSignal.timeout(60000)});
assert.notEqual(result.stopReason,'error',result.errorMessage);
assert(result.content.some(x=>x.type==='text'&&x.text.trim()));
assert.equal(hash(authored),rootHash);
fs.writeFileSync(path.join(root,'authored-registry-live.json'),JSON.stringify({candidateSha:JSON.parse(fs.readFileSync(build)).commit,scope:'Supplemental built ModelRegistry/LLM SDK contract, not Gateway embedded-auth success',bindings,driverSha256:hash(new URL(import.meta.url)),authStore:'empty in-memory AuthStorage; no canonical profile or environment key',authoredRootSha256:rootHash,authoredRootUnchanged:true,result},null,2)+'\n');
console.log(JSON.stringify({status:'passed',stopReason:result.stopReason,response:result.content,authoredRootUnchanged:true}));
