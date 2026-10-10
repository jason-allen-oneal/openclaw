import {createServer} from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {bindBuild,importBound,isolateDriverState,assertBuildUnchanged,proofRoot} from './build-bindings.mjs';
isolateDriverState('owner');
const buildBindings=bindBuild();
const startedAt=new Date().toISOString();
const deliverCompletionDirect=await importBound(buildBindings.modules.owner);
const setActivePluginRegistry=await importBound(buildBindings.modules.registry);
const createEmptyPluginRegistry=await importBound(buildBindings.modules.emptyRegistry);
console.log(JSON.stringify({startedAt,buildBindings,entry:'actual built deliverCompletionDirect + physical HTTP adapter'}));
const observations=[];
let active;
const server=createServer(async(req,res)=>{let raw='';for await(const c of req)raw+=c;const response={messageId:`wire-${observations.length}`,accepted:true};active.wire.push({at:new Date().toISOString(),request:{method:req.method,path:req.url,body:raw},response:{status:200,body:JSON.stringify(response)}});res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify(response));});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const endpoint=`http://127.0.0.1:${server.address().port}/completion`;
try{
 for(const channel of ['runtime-proof-alpha','runtime-proof-beta']){
  let prepare=async()=>{};
  const plugin={id:channel,meta:{id:channel,label:channel,selectionLabel:channel,docsPath:'/channels/qa-channel',blurb:'Physical HTTP proof transport'},capabilities:{chatTypes:['direct']},config:{listAccountIds:()=>[],resolveAccount:()=>({})},outbound:{deliveryMode:'direct',sendText:async({to,text,onPlatformSendDispatch})=>{await prepare();await onPlatformSendDispatch?.();const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({to,text})});const receipt=await response.json();return {channel,messageId:receipt.messageId};}}};
  const entry={pluginId:channel,source:'runtime-proof',plugin};
  const registry={...createEmptyPluginRegistry(),channels:[entry],channelSetups:[{...entry,enabled:true}]};
  setActivePluginRegistry(registry);
  for(const kind of ['completed_result','failed_notice'])for(const mode of ['unset','false','true']){
   const subagents=mode==='unset'?{}:{dmCompletionFallback:mode==='true'};
   const event={type:'task_completion',source:'subagent',childSessionKey:'agent:worker:subagent:runtime-proof',announceType:'subagent task',taskLabel:'Runtime HTTP proof',status:kind==='failed_notice'?'error':'ok',statusLabel:kind==='failed_notice'?'failed':'completed successfully',result:'RUNTIME-PROOF-CHILD-RESULT',replyInstruction:'Summarize the result.'};
   active={channel,mode,kind,sourceSha:buildBindings.sourceSha,startedAt:new Date().toISOString(),wire:[]};
   active.result=await deliverCompletionDirect({cfg:{agents:{defaults:{subagents}}},requesterSessionKey:`agent:main:${channel}:direct:recipient`,directIdempotencyKey:`runtime-${channel}-${mode}-${kind}`,deliveryTarget:{deliver:true,channel,to:'recipient'},internalEvents:[event],contentKind:kind});
   active.finishedAt=new Date().toISOString();active.result??=null;
   const expectedText=kind==='failed_notice'?'A delegated task failed before it could report a result. Please retry the task.':'RUNTIME-PROOF-CHILD-RESULT';
   active.expectationMet=mode==='false'?active.wire.length===0&&active.result===null:active.wire.length===1&&active.result?.delivered===true&&active.result?.path==='direct'&&JSON.stringify(JSON.parse(active.wire[0].request.body))===JSON.stringify({to:'recipient',text:expectedText});
   console.log(JSON.stringify(active));observations.push(active);
  }
  for(const control of ['retired-before','retired-after-prepare','cancelled-after-prepare','conflicting-agent']){
   let allowed=control!=='retired-before';const abort=new AbortController();
   prepare=async()=>{if(control==='retired-after-prepare')allowed=false;if(control==='cancelled-after-prepare')abort.abort();};
   active={channel,mode:'unset',control,sourceSha:buildBindings.sourceSha,startedAt:new Date().toISOString(),wire:[]};
   active.result=await deliverCompletionDirect({cfg:{agents:{defaults:{subagents:{}}}},requesterSessionKey:`agent:main:${channel}:direct:recipient`,...(control==='conflicting-agent'?{requesterAgentId:'other'}:{}),directIdempotencyKey:`runtime-${channel}-${control}`,deliveryTarget:{deliver:true,channel,to:'recipient'},internalEvents:[{type:'task_completion',source:'subagent',childSessionKey:'agent:worker:subagent:runtime-proof',announceType:'subagent task',taskLabel:'Runtime HTTP proof',status:'ok',statusLabel:'completed successfully',result:'RUNTIME-PROOF-CHILD-RESULT',replyInstruction:'Summarize the result.'}],contentKind:'completed_result',isSourceSessionEffectsAllowed:()=>allowed,signal:abort.signal});
   active.finishedAt=new Date().toISOString();active.result??=null;active.expectationMet=active.wire.length===0&&(control.startsWith('retired-')?active.result?.reason==='source_owner_changed'&&active.result?.terminal===true:control==='conflicting-agent'?active.result===null:active.result?.delivered===false);
   console.log(JSON.stringify(active));observations.push(active);prepare=async()=>{};
  }
 }
}finally{server.closeAllConnections();await new Promise(r=>server.close(r));await fs.writeFile(path.join(proofRoot,'owner-transport-observations.json'),JSON.stringify(observations,null,2));}
const finalBuildBindings=assertBuildUnchanged(buildBindings);
const exitStatus=observations.length!==20||observations.some(x=>!x.expectationMet)?1:0;
const receipt={command:`node ${path.join(proofRoot,'owner-transport.mjs')}`,sourceSha:buildBindings.sourceSha,startedAt,finishedAt:new Date().toISOString(),exitStatus,observedCases:observations.length,physicalPosts:observations.reduce((n,x)=>n+x.wire.length,0),buildBindings,finalBuildBindings};
await fs.writeFile(path.join(proofRoot,'owner-transport-receipt.json'),JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({terminalReceipt:receipt}));
process.exitCode=exitStatus;
