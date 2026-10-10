import {createServer} from 'node:http';
import fs from 'node:fs/promises';
import {behaviorProofOwner as deliverCompletionDirect} from '<published-stable>/dist/proof-export-completion-owner.mjs';
import {w as setActivePluginRegistry} from '<published-stable>/dist/runtime-9cxii0oQ.mjs';
import {t as createEmptyPluginRegistry} from '<published-stable>/dist/registry-empty-BTjzcMW2.mjs';
const observations=[];
let active;
const server=createServer(async(req,res)=>{let raw='';for await(const c of req)raw+=c;const response={messageId:`wire-${observations.length}`,accepted:true};active.wire.push({at:new Date().toISOString(),request:{method:req.method,path:req.url,body:raw},response:{status:200,body:JSON.stringify(response)}});res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify(response));});
await new Promise(r=>server.listen(0,'[loopback]',r));
const endpoint=`[isolated HTTP endpoint]:${server.address().port}/completion`;
try{
 for(const channel of ['runtime-proof-alpha','runtime-proof-beta']){
  let prepare=async()=>{};
  const plugin={id:channel,meta:{id:channel,label:channel,selectionLabel:channel,docsPath:'/channels/qa-channel',blurb:'Physical HTTP proof transport'},capabilities:{chatTypes:['direct']},config:{listAccountIds:()=>[],resolveAccount:()=>({})},outbound:{deliveryMode:'direct',sendText:async({to,text,onPlatformSendDispatch})=>{await prepare();await onPlatformSendDispatch?.();const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({to,text})});const receipt=await response.json();return {channel,messageId:receipt.messageId};}}};
  const entry={pluginId:channel,source:'runtime-proof',plugin};
  const registry={...createEmptyPluginRegistry(),channels:[entry],channelSetups:[{...entry,enabled:true}]};
  setActivePluginRegistry(registry);
  for(const kind of ['completed_result','failed_notice'])for(const mode of ['unset']){
   const subagents=mode==='unset'?{}:{dmCompletionFallback:mode==='true'};
   const event={type:'task_completion',source:'subagent',childSessionKey:'agent:worker:subagent:runtime-proof',announceType:'subagent task',taskLabel:'Runtime HTTP proof',status:kind==='failed_notice'?'error':'ok',statusLabel:kind==='failed_notice'?'failed':'completed successfully',result:'RUNTIME-PROOF-CHILD-RESULT',replyInstruction:'Summarize the result.'};
   active={channel,mode,kind,startedAt:new Date().toISOString(),wire:[]};
   active.result=await deliverCompletionDirect({cfg:{agents:{defaults:{subagents}}},requesterSessionKey:`agent:main:${channel}:direct:recipient`,directIdempotencyKey:`runtime-${channel}-${mode}-${kind}`,deliveryTarget:{deliver:true,channel,to:'recipient'},internalEvents:[event],contentKind:kind});
   active.finishedAt=new Date().toISOString();active.result??=null;
   active.expectationMet=active.wire.length===1;
   console.log(JSON.stringify(active));observations.push(active);
  }
  for(const control of []){
   let allowed=control!=='retired-before';const abort=new AbortController();
   prepare=async()=>{if(control==='retired-after-prepare')allowed=false;if(control==='cancelled-after-prepare')abort.abort();};
   active={channel,mode:'true',control,startedAt:new Date().toISOString(),wire:[]};
   active.result=await deliverCompletionDirect({cfg:{agents:{defaults:{subagents:{dmCompletionFallback:true}}}},requesterSessionKey:`agent:main:${channel}:direct:recipient`,...(control==='conflicting-agent'?{requesterAgentId:'other'}:{}),directIdempotencyKey:`runtime-${channel}-${control}`,deliveryTarget:{deliver:true,channel,to:'recipient'},internalEvents:[{type:'task_completion',source:'subagent',childSessionKey:'agent:worker:subagent:runtime-proof',announceType:'subagent task',taskLabel:'Runtime HTTP proof',status:'ok',statusLabel:'completed successfully',result:'RUNTIME-PROOF-CHILD-RESULT',replyInstruction:'Summarize the result.'}],contentKind:'completed_result',isSourceSessionEffectsAllowed:()=>allowed,signal:abort.signal});
   active.finishedAt=new Date().toISOString();active.result??=null;active.expectationMet=active.wire.length===0;
   console.log(JSON.stringify(active));observations.push(active);prepare=async()=>{};
  }
 }
}finally{server.closeAllConnections();await new Promise(r=>server.close(r));await fs.writeFile('<proof-workspace>/stable-owner-transport-observations.json',JSON.stringify(observations,null,2));}
if(observations.some(x=>!x.expectationMet))process.exitCode=1;
