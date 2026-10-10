import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { bindBuild, importBound, isolateDriverState, assertBuildUnchanged, repoRoot, proofRoot } from './build-bindings.mjs';
isolateDriverState('native');
const buildBindings=bindBuild();
const YAML=(await import(pathToFileURL(path.join(repoRoot,'node_modules/yaml/dist/index.js')).href)).default;
const readQaScenarioFile=await importBound(buildBindings.modules.scenarioCatalog);
const {runQaSuite}=await import(pathToFileURL(buildBindings.provenanceFiles.qaApi.file).href);
const mode=process.argv[2]??'true';
const kind=process.argv[3]??'media';
const attempt=process.argv[4]??'optout-v1';
if(!['unset','false','true'].includes(mode)||!['media','failure'].includes(kind)) throw new Error('Invalid proof mode/kind');
const id=`native-${kind}-${mode}-${attempt}`;
const outputDir=path.join(repoRoot,'.artifacts/dm-runtime-proof-opt-out',id);
const original=YAML.parse(fs.readFileSync(`${repoRoot}/qa/scenarios/agents/subagent-completion-direct-fallback.yaml`,'utf8'));
const originalActions=original.flow.steps[0].actions;
const publish=structuredClone(originalActions.find(x=>x.set==='publishTerminalDiagnostic'));
const snap=structuredClone(originalActions.find(x=>x.set==='snapshotTerminalRequests'));
const S=(name,expr)=>({set:name,value:{expr}});
const C=(call,args,saveAs)=>({call,args,...(saveAs?{saveAs}:{} )});
const A=(expr,message)=>({assert:{expr,message}});
const E=expr=>({expr});
const R=ref=>({ref});
const task=kind==='media'
  ? 'Read `QA_KICKOFF_TASK.md`. Reply exactly `QA-NATIVE-MEDIA-OK\nMEDIA:./proof.png`'
  : 'Provider HTTP 503 after tool QA check: read QA_KICKOFF_TASK.md, then reply.';
const label=`qa-native-${kind}-${mode}`;
const prompt=`Call sessions_spawn task="${task}" label="${label}" mode=run context=isolated.\nThen reply exactly \`Worker started.\``;
const cfg={mode,allowFallback:mode!=='false',kind,label,prompt,sourceSha:buildBindings.sourceSha,failureNotice:'A delegated task failed before it could report a result. Please retry the task.',observationMs:30000};
const inner=[
  S('activePhase',JSON.stringify('ingress')),
  C('fs.writeFile',[E("path.join(env.gateway.workspaceDir,'proof.png')"),E('imageUnderstandingValidPngBase64'),'base64']),
  S('expectedPngBytes',"await fs.readFile(path.join(env.gateway.workspaceDir,'proof.png'))"),
  S('conversationId',"`native-proof-${config.kind}-${config.mode}-${randomUUID().slice(0,8)}`"),
  S('kickoffAt','Date.now()'),
  {sendInbound:{accountId:'default',conversation:{id:R('conversationId'),kind:'direct'},senderId:R('conversationId'),senderName:'Portable Native Proof Operator',text:E('config.prompt')},saveAs:'proofIngress'},
  S('activePhase',JSON.stringify('native-terminal')),
  C('waitOwnerCondition',[{lambda:{async:true,expr:"(await readNativeQaSubagentRuns(env)).find(run=>run.label===config.label&&run.execution.status==='terminal')"}},240000,200],'terminalRun'),
  S('terminalObservedAt','Date.now()'),
  A("terminalRun.execution.outcome?.status === (config.kind==='media'?'ok':'error')","Native child did not record the intended execution outcome"),
  S('activePhase',JSON.stringify('delivery-settlement')),
  {if:{expr:"config.allowFallback",then:[C('waitOwnerCondition',[{lambda:{async:true,expr:"(async()=>{const run=(await readNativeQaSubagentRuns(env)).find(r=>r.runId===terminalRun.runId);const history=await env.gateway.call('chat.history',{agentId:'qa',sessionKey:terminalRun.requesterSessionKey,limit:100,maxChars:65536},{timeoutMs:10000});const receipts=(history.messages??[]).filter(m=>m.provider==='openclaw'&&m.model==='delivery-mirror'&&m.__openclaw?.idempotencyKey===`announce:v1:${terminalRun.childSessionKey}:${terminalRun.runId}:text-direct`);return run?.delivery?.status==='delivered'&&receipts.length===1?run:undefined;})()"}},180000,500],'deliveredRun')],else:[]}},
  C('sleep',[E('config.observationMs')]),
  S('finishedObservationAt','Date.now()'),
  S('finalRun',"(await readNativeQaSubagentRuns(env)).find(run=>run.runId===terminalRun.runId)"),
  S('requesterHistory',"await env.gateway.call('chat.history',{agentId:'qa',sessionKey:terminalRun.requesterSessionKey,limit:100,maxChars:131072},{timeoutMs:10000})"),
  S('childTranscript',"await readSessionTranscriptSummary(env,terminalRun.childSessionKey)"),
  S('childHistory',"await env.gateway.call('chat.history',{agentId:'qa',sessionKey:terminalRun.childSessionKey,limit:100,maxChars:65536},{timeoutMs:10000})"),
  S('receipts',"(requesterHistory.messages??[]).filter(m=>m.provider==='openclaw'&&m.model==='delivery-mirror'&&m.__openclaw?.idempotencyKey===`announce:v1:${terminalRun.childSessionKey}:${terminalRun.runId}:text-direct`)"),
  S('events',"state.getSnapshot().events.filter(event=>event.cursor>suiteEventCursor&&['outbound-message','message-edited','message-deleted'].includes(event.kind))"),
  S('outbound',"state.getSnapshot().messages.filter(message=>message.direction==='outbound'&&message.conversation.id===conversationId&&!message.deleted)"),
  S('mediaDeliveries',"outbound.filter(message=>(message.attachments?.length??0)>0)"),
  S('noticeDeliveries',"outbound.filter(message=>String(message.text??'').trim()===config.failureNotice)"),
  S('parentAcknowledgments',"outbound.filter(message=>String(message.text??'').trim()==='Worker started.')"),
  S('requests',"await fetchJson(`${env.mock.baseUrl}/debug/requests?after=${suiteRequestCursor}`)"),
  S('spawnRequests',"requests.filter(request=>request.plannedToolName==='sessions_spawn'&&request.plannedToolArgs?.label===config.label)"),
  S('pngMatches',"mediaDeliveries.map(message=>message.attachments.length===1&&message.attachments[0].mimeType==='image/png'&&typeof message.attachments[0].contentBase64==='string'&&Buffer.from(message.attachments[0].contentBase64,'base64').equals(expectedPngBytes))"),
  A("requests.some(request=>request.plannedToolName==='read'&&request.plannedToolArgs?.path==='QA_KICKOFF_TASK.md')&&childTranscript.successfulToolCallCounts.read===1","Native child must actually read the intended workspace file exactly once"),
  A("spawnRequests.length===1&&spawnRequests[0].plannedToolArgs?.task===config.prompt.match(/task=\"([^\"]+)\"/)[1]","Expected exactly one real native spawn with the intended task"),
  A("receipts.length===(config.allowFallback?1:0)","Unexpected exact native direct-fallback mirror count"),
  A("mediaDeliveries.length===(config.kind==='media'&&config.allowFallback?1:0)&&pngMatches.every(Boolean)","Unexpected media count or received PNG bytes"),
  A("noticeDeliveries.length===(config.kind==='failure'&&config.allowFallback?1:0)","Unexpected native failure-notice count"),
  A("events.every(event=>event.message?.conversation.id===conversationId&&event.message?.accountId==='default')","Outbound event crossed the source account or conversation"),
  A("config.kind!=='media'||parentAcknowledgments.some(message=>message.timestamp<terminalRun.execution.endedAt)","Media child did not finish after parent acknowledgment"),
  S('verdict',"({pass:true,sourceSha:config.sourceSha,mode:config.mode,kind:config.kind,runId:finalRun.runId,childSessionKey:finalRun.childSessionKey,requesterSessionKey:finalRun.requesterSessionKey,execution:finalRun.execution,delivery:finalRun.delivery,receiptKeys:receipts.map(m=>m.__openclaw.idempotencyKey),mediaCount:mediaDeliveries.length,receivedPngByteEquality:pngMatches,expectedPngBytes:expectedPngBytes.length,failureNoticeCount:noticeDeliveries.length,acknowledgmentTimes:parentAcknowledgments.map(m=>m.timestamp),kickoffAt,terminalObservedAt,finishedObservationAt,postTerminalObservationMs:finishedObservationAt-terminalObservedAt,childEndedAt:terminalRun.execution.endedAt,ordinaryOutbound:outbound.filter(m=>!mediaDeliveries.includes(m)&&!noticeDeliveries.includes(m)).map(m=>({id:m.id,text:m.text,isError:m.isError,timestamp:m.timestamp})),providerFaultCaveat:config.kind==='failure'?'HTTP503 matcher also applies to parent post-spawn continuation; failure of requester handoff is intentional':null})"),
  S('activePhase',JSON.stringify('complete')),
];
const fin=[S('nativeProofDiagnostic',`(async()=>{
 const requests=await fetchJson(\`\${env.mock.baseUrl}/debug/requests?after=\${suiteRequestCursor}\`);
 const runs=await readNativeQaSubagentRuns(env);
 const events=state.getSnapshot().events.filter(event=>event.cursor>suiteEventCursor&&['outbound-message','message-edited','message-deleted'].includes(event.kind));
 const selected=requests.length>30?[...requests.slice(0,15),...requests.slice(-15)]:requests;
 const artifact={captureStage:'final',activePhase,config,verdict:typeof verdict==='undefined'?null:verdict,failure:typeof nativeProofError==='undefined'?null:String(nativeProofError),runCount:runs.length,runs,requestCount:requests.length,omittedRequestCount:requests.length-selected.length,requests:snapshotTerminalRequests(selected),outboundEventCount:events.length,outboundEvents:events,requesterHistory:typeof requesterHistory==='undefined'?null:requesterHistory,childHistory:typeof childHistory==='undefined'?null:childHistory,gatewayLogs:env.gateway.logs?.()};
 return await publishTerminalDiagnostic(artifact);
})()` )];
const doc={title:`Built native ${kind} fallback ${mode}`,scenario:{...original.scenario,id,surface:'subagents',objective:`Prove native ${kind} completion through built Gateway and portable channel with ${mode} setting`,successCriteria:['Native admission and authoritative terminal outcome','Exact direct-fallback receipt correlation','Portable transport captures actual delivered payload or post-terminal absence','Source account/conversation preserved'],execution:{...original.scenario.execution,timeoutMs:600000,retryCount:0,suiteIsolation:'isolated',isolationReason:'Independent native completion policy fixture',config:cfg},gatewayConfigPatch:kind==='failure'?{...original.scenario.gatewayConfigPatch,agents:{defaults:{model:{fallbacks:[]}},entries:{qa:{tools:{alsoAllow:['message']},model:{fallbacks:[]}}}}}:original.scenario.gatewayConfigPatch},flow:{steps:[{name:`native ${kind} delivery boundary`,actions:[publish,snap,{set:'waitOwnerCondition',value:{lambda:{params:['check','timeoutMs','intervalMs'],async:true,expr:"(async()=>{const deadline=Date.now()+(timeoutMs??30000);while(Date.now()<deadline){const value=await check();if(value!==undefined&&value!==null&&value!==false)return value;await sleep(intervalMs??200);}throw new Error('Native proof observation deadline exceeded');})()"}}},C('waitForGatewayHealthy',[R('env'),120000]),C('waitForQaChannelReady',[R('env'),120000]),S('suiteRequestCursor',"(await fetchJson(`${env.mock.baseUrl}/debug/request-cursor`)).cursor"),S('suiteEventCursor','state.getSnapshot().cursor'),S('activePhase',JSON.stringify('prepared')),{try:{actions:inner,catchAs:'nativeProofError',catch:[{throw:E("`[${activePhase}] ${String(nativeProofError)}`")}],finally:fin}}],detailsExpr:'JSON.stringify(verdict,null,2)'}]}};
const file=path.join(proofRoot,`${id}.yaml`);
fs.writeFileSync(file,YAML.stringify(doc));
const startedAt=new Date().toISOString();
const command=`node ${path.join(proofRoot,'native-matrix.mts')} ${mode} ${kind} ${attempt}`;
console.log(JSON.stringify({id,command,startedAt,entry:path.join(repoRoot,'dist/index.js'),sourceSha:cfg.sourceSha,sourceStatus:buildBindings.sourceStatus,buildBindings,driverSha256:crypto.createHash('sha256').update(fs.readFileSync(import.meta.filename)).digest('hex')}));
let receipt;
try{
 const result=await runQaSuite({repoRoot,outputDir,providerMode:'mock-openai',transportId:'qa-channel',scenarioDefinitions:[readQaScenarioFile(file)],concurrency:1,sutOpenClawCommand:{executablePath:process.execPath,argsPrefix:[`${repoRoot}/dist/index.js`],cwd:repoRoot,usePackagedPlugins:false},mutateConfig:cfg=>{cfg.agents??={};cfg.agents.defaults??={};cfg.agents.defaults.subagents??={};if(mode==='unset')delete cfg.agents.defaults.subagents.dmCompletionFallback;else cfg.agents.defaults.subagents.dmCompletionFallback=mode==='true';return cfg;}});
 const summaryFile=path.join(outputDir,'qa-suite-summary.json');
 const summary=JSON.parse(fs.readFileSync(summaryFile,'utf8'));
 const scenario=summary.scenarios?.find(s=>s.name===doc.title);
 const failed=summary.counts?.total!==1||summary.counts?.passed!==1||summary.counts?.failed!==0||summary.counts?.skipped!==0||scenario?.status!=='pass';
 const finalBuildBindings=assertBuildUnchanged(buildBindings);
 console.log(JSON.stringify(result,null,2));
 receipt={command,sourceSha:cfg.sourceSha,startedAt,finishedAt:new Date().toISOString(),exitStatus:failed?1:0,canonicalSummaryFile:summaryFile,canonicalCounts:summary.counts,canonicalScenarioStatus:scenario?.status??null,statusDerivedFrom:'qa-suite-summary.json',buildBindings,finalBuildBindings,outputDir,scenarioFile:file};
 process.exitCode=receipt.exitStatus;
}catch(error){console.error(error);receipt={command,sourceSha:cfg.sourceSha,startedAt,finishedAt:new Date().toISOString(),exitStatus:1,error:String(error),buildBindings,outputDir,scenarioFile:file};process.exitCode=1;}
fs.writeFileSync(path.join(proofRoot,`${id}-receipt.json`),JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({terminalReceipt:receipt}));
