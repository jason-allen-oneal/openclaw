import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const [checkout,root] = process.argv.slice(2);
const config=JSON.parse(await fs.readFile(process.env.OPENCLAW_CONFIG_PATH,'utf8'));
const {loadAuthProfileStoreForRuntimeAsync}=await import(pathToFileURL(`${checkout}/dist/plugin-sdk/provider-auth.js`));
const agentDir=`${process.env.OPENCLAW_STATE_DIR}/agents/main/agent`;
const store=await loadAuthProfileStoreForRuntimeAsync(agentDir,{allowKeychainPrompt:false});
const entries=Object.entries(store.profiles).filter(([,p])=>p.provider==='openai'&&p.type==='oauth'&&p.authFlow==='chatgpt-token-sharing');
assert.equal(entries.length,1,'must use the actual isolated SIWC grant');
const [profileId,credential]=entries[0];
assert(credential.access&&credential.refresh,'real persisted OAuth grant must be usable');
const {createCodexAppServerAgentHarness}=await import(pathToFileURL(`${checkout}/dist/extensions/codex/harness.js`));
const launchMarker=`${root}/strict-native-launch.marker`;
const launcher=`${root}/strict-native-launcher.sh`;
await fs.writeFile(launcher,`#!/bin/sh\nprintf 'unexpected native launch\\n' >> '${launchMarker}'\nexit 99\n`,{mode:0o700});
const harness=createCodexAppServerAgentHarness({pluginConfig:{appServer:{transport:'stdio',homeScope:'agent',command:launcher}}});
const expected='ChatGPT token sharing does not support explicit token or temperature limits; select an API-key model.';
let error;
try {
  await harness.runIsolatedCompletionV2({config,provider:'openai',modelId:'gpt-6-luna',agentId:'main',agentDir,workspaceDir:`${root}/home/workspace`,
    authorization:{owner:'harness',plan:{providerForAuth:'openai',authProfileProviderForAuth:'openai',forwardedAuthProfileId:profileId,
      modelRoute:{provider:'openai',modelId:'gpt-6-luna',api:'openai-responses',baseUrl:'https://api.openai.com/v1',authRequirement:'api-key',requestTransportOverrides:'none'}},authProfileStore:store},
    systemPrompt:'Reply only STRICT_CONTROL_UNEXPECTED.',prompt:'Strict limit negative control.',timeoutMs:5000,
    streamParams:{maxTokens:37,temperature:0}
  });
} catch(e) {error=e.message;} finally {await harness.dispose();}
assert.equal(error,expected);
const launched=await fs.stat(launchMarker).then(()=>true,()=>false);
assert.equal(launched,false);
const build=JSON.parse(await fs.readFile(`${checkout}/dist/build-info.json`,'utf8'));
const receipt={status:'passed',sourceHead:build.commit,entrypoint:'built Codex harness runIsolatedCompletionV2',credentialSource:'same isolated persisted real SIWC grant used by Gateway',profileIdentitySha256:createHash('sha256').update(profileId).digest('hex'),
  authFlow:credential.authFlow,provider:'openai',model:'gpt-6-luna',endpoint:'https://api.openai.com/v1',streamParams:{maxTokens:37,temperature:0},streamParamsMode:'omitted (required by default)',error,nativeLaunchMarkerPresent:launched,
  limitations:['Built harness owner boundary, not a public Gateway RPC caller.','A task-owned sentinel command detects unexpected native launch; no real provider inference is intended.'],recordedAt:new Date().toISOString()};
await fs.writeFile(`${root}/strict-real-control.receipt.json`,JSON.stringify(receipt,null,2)+'\n',{mode:0o600});
console.log(JSON.stringify(receipt));
