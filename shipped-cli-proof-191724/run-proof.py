#!/usr/bin/env python3
"""Invoke a real built CLI, keeping state and credentials isolated.
Usage: python3 run-proof.py CHECKOUT OUTPUT_ROOT LABEL [SCENARIO ...]
"""
import hashlib,json,os,pathlib,subprocess,sys,time
checkout=pathlib.Path(sys.argv[1]).resolve()
root=pathlib.Path(sys.argv[2]).resolve()
label=sys.argv[3]
scenarios=sys.argv[4:] or ["sync-repaired","async-repaired","result-error"]
plugin=pathlib.Path(__file__).resolve().parent/"plugin"
def write_json(p,value):
 p.parent.mkdir(parents=True,exist_ok=True)
 p.write_text(json.dumps(value,indent=2)+"\n")
write_json(plugin/"package.json",{"name":"@example/readonly-proof","version":"1.0.0","openclaw":{"extensions":["./index.cjs"]}})
write_json(plugin/"openclaw.plugin.json",{"id":"readonly-proof","name":"Read-only proof","providers":["readonly-proof"],"configSchema":{"type":"object","additionalProperties":False}})
results=[]
for scenario in scenarios:
 run=root/label/scenario
 run.mkdir(parents=True,exist_ok=True)
 for d in ["home","state","workspace"]: (run/d).mkdir(exist_ok=True)
 cfg={"agents":{"defaults":{"workspace":str(run/"workspace"),"model":"readonly-proof/"+scenario}},
 "models":{"mode":"replace","providers":{"readonly-proof":{"baseUrl":"http://127.0.0.1:9/unused","api":"openai-completions","apiKey":"synthetic-not-a-credential","models":[{"id":s,"name":s,"reasoning":False,"input":["text"],"cost":{"input":0,"output":0,"cacheRead":0,"cacheWrite":0},"contextWindow":32768,"maxTokens":128} for s in scenarios]}}},
 "plugins":{"load":{"paths":[str(plugin)]},"allow":["readonly-proof"],"entries":{"readonly-proof":{"enabled":True}}}}
 write_json(run/"config.json",cfg)
 # Retain agent-execution attribution. No provider keys or inherited credential selectors.
 env={k:v for k,v in os.environ.items() if k in ["PATH","LANG","LC_ALL","TMPDIR"] or k.startswith("OPENCLAW_")}
 for k in ["OPENCLAW_PROFILE","OPENCLAW_GATEWAY_TOKEN","OPENCLAW_GATEWAY_PASSWORD","OPENCLAW_GATEWAY_URL","OPENCLAW_BUNDLED_PLUGINS_DIR"]:
  env.pop(k,None)
 env.update(HOME=str(run/"home"),OPENCLAW_HOME=str(run/"home"),OPENCLAW_STATE_DIR=str(run/"state"),OPENCLAW_CONFIG_PATH=str(run/"config.json"),OPENCLAW_DISABLE_BUNDLED_PLUGINS="1",PROOF_RUN_DIR=str(run))
 argv=["node",str(checkout/"openclaw.mjs"),"infer","model","run","--local","--model","readonly-proof/"+scenario,"--prompt","Return the deterministic fixture response.","--json"]
 start=time.time()
 proc=subprocess.run(argv,cwd=run/"workspace",env=env,capture_output=True,text=True,timeout=120)
 (run/"stdout.txt").write_text(proc.stdout)
 (run/"stderr.txt").write_text(proc.stderr)
 receipt={"argv":argv,"exitCode":proc.returncode,"elapsedSeconds":round(time.time()-start,3),"scenario":scenario,"attributionPreserved":{k:os.environ[k] for k in ["OPENCLAW_SHELL","OPENCLAW_SUBAGENT_EXEC"] if k in os.environ},"stdoutSha256":hashlib.sha256(proc.stdout.encode()).hexdigest(),"stderrSha256":hashlib.sha256(proc.stderr.encode()).hexdigest()}
 write_json(run/"receipt.json",receipt)
 results.append(receipt)
 print(json.dumps(receipt),flush=True)
write_json(root/label/"receipts.json",results)
