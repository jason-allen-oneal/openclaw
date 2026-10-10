import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const repoRoot=process.env.OPENCLAW_PROOF_REPO_ROOT??'<candidate>';
export const proofRoot=path.dirname(new URL(import.meta.url).pathname);
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
export function bindBuild(){
 const expectedSourceSha=process.env.OPENCLAW_PROOF_EXPECTED_SHA;
 if(!expectedSourceSha||!/^[0-9a-f]{40}$/.test(expectedSourceSha))throw new Error('OPENCLAW_PROOF_EXPECTED_SHA must bind the committed, rebuilt opt-out candidate');
 const sourceSha=execFileSync('git',['rev-parse','HEAD'],{cwd:repoRoot,encoding:'utf8'}).trim();
 const sourceStatus=execFileSync('git',['status','--porcelain'],{cwd:repoRoot,encoding:'utf8'});
 if(sourceSha!==expectedSourceSha||sourceStatus.trim())throw new Error('Candidate source head differs from expected SHA or checkout is dirty');
 const dist=path.join(repoRoot,'dist');
 const findExport=(prefix,localName)=>{
  const matches=[];
  for(const name of fs.readdirSync(dist).filter(name=>name.startsWith(prefix)&&name.endsWith('.mjs'))){
   const file=path.join(dist,name),source=fs.readFileSync(file,'utf8');
   // Public facades re-export these names; bind the module that actually defines
   // the owner so registry state is the same singleton used by outbound delivery.
   if(!new RegExp(`(?:function|const|let|class)\\s+${localName}\\b`).test(source))continue;
   for(const clause of source.matchAll(/export\s*\{([^}]+)\}/g))for(const entry of clause[1].split(',')){
    const parts=entry.trim().split(/\s+as\s+/);
    if(parts[0]===localName)matches.push({file,localName,exportName:parts[1]??parts[0],sha256:hash(file),bytes:fs.statSync(file).size});
   }
  }
  if(matches.length!==1)throw new Error(`Expected one built export for ${localName}; found ${matches.length}`);
  return matches[0];
 };
 const modules={owner:findExport('subagent-announce-completion-delivery-','deliverCompletionDirect'),registry:findExport('runtime-','setActivePluginRegistry'),emptyRegistry:findExport('registry-empty-','createEmptyPluginRegistry'),scenarioCatalog:findExport('scenario-catalog-','readQaScenarioFile')};
 const ownerSource=fs.readFileSync(modules.owner.file,'utf8');
 if(!/dmCompletionFallback\s*===\s*false/.test(ownerSource))throw new Error('Built owner does not contain the opt-out false guard; rebuild before proof');
 const fixedFiles={gatewayEntry:path.join(dist,'index.js'),qaApi:path.join(dist,'extensions/qa-lab/api.js'),scenario:path.join(repoRoot,'qa/scenarios/agents/subagent-completion-direct-fallback.yaml'),provider:path.join(repoRoot,'extensions/qa-lab/src/providers/mock-openai/server.ts')};
 const provenanceFiles=Object.fromEntries(Object.entries(fixedFiles).map(([key,file])=>[key,{file,sha256:hash(file),bytes:fs.statSync(file).size}]));
 return {sourceSha,sourceStatus,recordedAt:new Date().toISOString(),nodeVersion:process.version,modules,provenanceFiles};
}
export async function importBound(binding){return (await import(pathToFileURL(binding.file).href))[binding.exportName];}
export function isolateDriverState(name){
 const dir=path.join(proofRoot,'driver-state',name);fs.mkdirSync(dir,{recursive:true});
 process.env.OPENCLAW_STATE_DIR=path.join(dir,'state');
 process.env.OPENCLAW_CONFIG_PATH=path.join(dir,'config.json');
 if(!fs.existsSync(process.env.OPENCLAW_CONFIG_PATH))fs.writeFileSync(process.env.OPENCLAW_CONFIG_PATH,'{}\n');
}
export function assertBuildUnchanged(initial){
 const final=bindBuild();
 for(const [key,binding] of Object.entries(initial.modules))if(binding.sha256!==final.modules[key].sha256)throw new Error(`Built module changed during proof: ${key}`);
 for(const [key,binding] of Object.entries(initial.provenanceFiles))if(binding.sha256!==final.provenanceFiles[key].sha256)throw new Error(`Provenance input changed during proof: ${key}`);
 return final;
}
