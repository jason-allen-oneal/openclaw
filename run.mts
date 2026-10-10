import fs from 'node:fs';
import YAML from '<candidate>/node_modules/yaml/dist/index.js';
import { s as readQaScenarioFile } from '<candidate>/dist/scenario-catalog-DpPUMUOS.mjs';
import { runQaSuite } from '<candidate>/dist/extensions/qa-lab/api.js';
const repoRoot='<candidate>';
const mode=process.argv[2]??'true';
const doc=YAML.parse(fs.readFileSync(`${repoRoot}/qa/scenarios/agents/subagent-completion-direct-fallback.yaml`,'utf8'));
doc.title=`Built Gateway DM completion fallback ${mode}`;
doc.scenario.id=`dm-completion-runtime-${mode}`;
doc.scenario.execution.config.cases=doc.scenario.execution.config.cases.filter(x=>x.name==='fallback');
const step=doc.flow.steps[0];
const owner=step.actions.find(x=>x.try);
const loopIndex=owner.try.actions.findIndex(x=>x.forEach);
owner.try.actions=owner.try.actions.slice(0,loopIndex+1);
step.detailsExpr="JSON.stringify({ verdicts, directFallbackProofs },null,2)";
if(mode!=='true') {
 doc.scenario.execution.config.cases[0].expectedSendCount=0;
 const reader=owner.try.actions.find(x=>x.set==='readSettledTerminalRun');
 reader.value.lambda.expr=reader.value.lambda.expr.replace(" && run.delivery?.status === 'delivered'", "");
 const actions=owner.try.actions[loopIndex].forEach.actions;
 const waiter=actions.find(x=>x.call==='waitForCondition');
 waiter.args[0].lambda.expr=waiter.args[0].lambda.expr.replace("if (terminalCase.name !== 'silent' && (await readDirectFallbackReceipts(run)).length === 0) return undefined;",'');
 const at=actions.indexOf(waiter)+1;
 actions.splice(at,0,{set:'observeRetryWindow',value:{expr:'await sleep(30000)'}});
 for(const a of actions) {
  if(a.assert?.expr?.startsWith("terminalCase.name === 'silent'")) a.assert.expr='directFallbackReceipts.length === 0';
  if(a.assert?.expr?.includes("terminalRun.delivery?.status === 'delivered'")) a.assert.expr=a.assert.expr.replace(" && terminalRun.delivery?.status === 'delivered'", "");
 }
}
const file=`<proof-workspace>/${mode}.yaml`;
fs.writeFileSync(file,YAML.stringify(doc));
const scenario=readQaScenarioFile(file);
console.log(JSON.stringify({mode,entry:`${repoRoot}/dist/index.js`,startedAt:new Date().toISOString()}));
const result=await runQaSuite({repoRoot,outputDir:`${repoRoot}/.artifacts/dm-runtime-proof/${mode}`,providerMode:'mock-openai',transportId:'qa-channel',scenarioDefinitions:[scenario],concurrency:1,sutOpenClawCommand:{executablePath:process.execPath,argsPrefix:[`${repoRoot}/dist/index.js`],cwd:repoRoot,usePackagedPlugins:mode==='true'},mutateConfig:cfg=>{cfg.agents??={};cfg.agents.defaults??={};cfg.agents.defaults.subagents??={};if(mode==='unset')delete cfg.agents.defaults.subagents.dmCompletionFallback;else cfg.agents.defaults.subagents.dmCompletionFallback=mode==='true';return cfg;}});
console.log(JSON.stringify(result,null,2));
