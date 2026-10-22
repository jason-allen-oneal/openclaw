import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
const buildRoot=process.env.PROOF_BUILD_ROOT;
const artifactRoot=process.env.PROOF_ARTIFACT_ROOT;
if(!buildRoot||!artifactRoot||!process.env.OPENCLAW_STATE_DIR) throw new Error('Isolated roots required');
const load=relative=>import(pathToFileURL(path.join(buildRoot,relative)).href);
const loadBuiltExport=async(prefix,name)=>{
 for(const filename of (await fs.readdir(path.join(buildRoot,'dist'))).filter(f=>f.startsWith(prefix)&&f.endsWith('.mjs'))){
  const code=await fs.readFile(path.join(buildRoot,'dist',filename),'utf8');
  const match=new RegExp(`export \\{[^}]*\\b${name} as (\\w+)`).exec(code);
  if(match) return (await load(`dist/${filename}`))[match[1]];
 }
 throw new Error(`Built export not found: ${name}`);
};
const workspaceDir=path.join(artifactRoot,'workspace');
const memoryDir=path.join(workspaceDir,'memory');
await fs.mkdir(memoryDir,{recursive:true});
const label=process.env.PROOF_LABEL??'recovered';
if(process.argv[2]==='seed'){
 const {acquireFileLock}=await load('dist/plugin-sdk/file-lock.js');
 const record=await loadBuiltExport('memory-artifact-provenance-','recordMemoryArtifactWriteProvenance');
 const lock=await acquireFileLock(path.join(memoryDir,'.session-memory'),{retries:{retries:0,factor:1,minTimeout:25,maxTimeout:25},stale:30000,staleRecovery:'remove-if-definitely-stale'});
 await record({workspaceDir,relativePath:'memory/2026-10-21-2030.md',contentBefore:'',contentAfter:'INTERRUPTED-NOT-PUBLISHED',originClass:'untrusted',observedAt:Date.parse('2026-10-21T20:30:00Z'),sessionId:'interrupted-session',sessionKey:'agent:main:interrupted-session'});
 await fs.writeFile(path.join(artifactRoot,'interrupted.json'),JSON.stringify({pid:process.pid,lockPath:path.relative(artifactRoot,lock.lockPath),provenanceCommitted:true,artifactPublished:false,injection:'SIGKILL after real lock and provenance APIs; before file publication'})+'\n');
 process.kill(process.pid,'SIGKILL');
} else {
 const {default:handler}=await load('dist/bundled/session-memory/handler.js');
 const cfg={agents:{defaults:{workspace:workspaceDir,userTimezone:'UTC'}},hooks:{internal:{entries:{'session-memory':{enabled:true,llmSlug:false}}}}};
 const markers=Array.from({length:6},(_,i)=>`BUILT-${label}-${i+1}-ONLY`);
 await Promise.all(markers.map((marker,i)=>handler({type:'session',action:'auto-reset',sessionKey:`agent:main:${label}-${i+1}`,timestamp:new Date('2026-10-21T20:30:00Z'),messages:[],context:{cfg,agentId:'main',workspaceDir,reason:'idle',sessionEntry:{sessionId:`${label}-${i+1}`},previousSessionMemory:{status:'available',content:`user: ${marker}`,originClass:i%2===0?'agent':'untrusted'}}})));
 const db=new DatabaseSync(path.join(process.env.OPENCLAW_STATE_DIR,'state/openclaw.sqlite'),{readOnly:true});
 const provenance=db.prepare('SELECT value_json FROM plugin_state_entries WHERE plugin_id = ? AND namespace = ?').all('core:memory-artifact-provenance','workspace-files').map(r=>JSON.parse(r.value_json));
 db.close();
 const names=(await fs.readdir(memoryDir)).filter(f=>f.endsWith('.md')).sort();
 const artifacts=await Promise.all(names.map(async name=>{
  const text=await fs.readFile(path.join(memoryDir,name),'utf8');
  const hash=createHash('sha256').update(text).digest('hex');
  const row=provenance.find(r=>r.relativePath===`memory/${name}`);
  const sessionId=/\*\*Session ID\*\*: ([^\n]+)/.exec(text)?.[1];
  const sessionKey=/\*\*Session Key\*\*: ([^\n]+)/.exec(text)?.[1];
  return {name,hash,sessionId,sessionKey,provenance:row,matchingProvenance:row?.fileHash===hash&&row?.sessionId===sessionId&&row?.sessionKey===sessionKey,markers:markers.filter(m=>text.includes(m))};
 }));
 const retained=Object.fromEntries(markers.map(m=>[m,artifacts.filter(a=>a.markers.includes(m)).length]));
 const lockRemains=(await fs.readdir(memoryDir)).includes('.session-memory.lock');
 const result={label,sourceHead:process.env.PROOF_SOURCE_HEAD,entrypoint:'built bundled session-memory handler with synthetic captured excerpt; real FS/SQLite/lock',artifacts,retained,lockRemains,passed:Object.values(retained).every(n=>n===1)&&artifacts.every(a=>a.matchingProvenance)&&!lockRemains};
 if(label==='recovered') {
  const reused=artifacts.find(a=>a.name==='2026-10-21-2030.md');
  result.absentReservedPathReused=Boolean(reused);
  result.staleUntrustedProvenanceRemainsConservative=reused?.provenance?.originClass==='untrusted';
  result.passed &&= result.absentReservedPathReused && result.staleUntrustedProvenanceRemainsConservative;
 }
 await fs.writeFile(path.join(artifactRoot,`${label}.json`),JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(result,null,2));
 process.exit(result.passed?0:2);
}
