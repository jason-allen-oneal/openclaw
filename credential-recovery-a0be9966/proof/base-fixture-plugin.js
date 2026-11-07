const {describeImageWithModel}=require("openclaw/plugin-sdk/media-understanding");
const {createAgentHarnessAssistantMessage}=require("openclaw/plugin-sdk/agent-harness-attempt-runtime");
module.exports={id:"installed-image-identity",register(api){
api.registerMediaUnderstandingProvider({id:"google",capabilities:["image"],defaultModels:{image:"fixture-vision"},describeImage:describeImageWithModel});
api.registerAgentHarness({id:"installed-image-identity",label:"Installed image proof",supports:()=>({supported:true,priority:100}),async runAttempt(p){
const tools=await p.hostCapabilities.createToolSurfaceAsync({config:p.config,agentDir:p.agentDir,workspaceDir:p.workspaceDir,sessionKey:p.sessionKey,sessionId:p.sessionId,agentId:p.agentId,modelProvider:p.provider,modelId:p.modelId,preparedModelRuntime:p.preparedModelRuntime,abortSignal:p.abortSignal,sandbox:p.sandbox});
const tool=tools.find(t=>t.name==="view_image");if(!tool)throw Error("installed image tool absent");
const result=await tool.execute("installed-image",{path:"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAHElEQVR4nGP4z8DwnxLMMGrAsDCAQv2jBgwPAwAxtf4Q24P5oAAAAABJRU5ErkJggg==",prompt:"Describe synthetic image"});
if(!JSON.stringify(result).includes("Installed image proof red above blue"))throw Error("missing real endpoint summary");
const reply="INSTALLED_IMAGE_PROOF_OK";const a=createAgentHarnessAssistantMessage({api:"openai-responses",provider:p.provider,modelId:p.modelId},reply,{aborted:false});
return {terminal:{kind:"ok"},sessionIdUsed:p.sessionId,messagesSnapshot:[a],assistantTexts:[reply],toolMetas:[],lastAssistant:a,didSendViaMessagingTool:false,messagingToolSentTexts:[],messagingToolSentMediaUrls:[],messagingToolSentTargets:[],cloudCodeAssistFormatError:false,replayMetadata:{hadPotentialSideEffects:true,replaySafe:false},itemLifecycle:{startedCount:1,completedCount:1,activeCount:0}};
}});}};