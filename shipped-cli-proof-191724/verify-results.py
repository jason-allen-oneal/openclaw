#!/usr/bin/env python3
"""Validate captured CLI output, not mocked/in-process completion results."""
import json,pathlib,sys
root=pathlib.Path(sys.argv[1])
observations=[]
for scenario in ["sync-repaired","async-repaired","result-error"]:
 d=root/"candidate"/scenario
 receipt=json.loads((d/"receipt.json").read_text())
 output=json.loads((d/"stdout.txt").read_text())
 events=[json.loads(s) for s in (d/"provider-events.jsonl").read_text().splitlines()]
 assert events[0]["event"]=="factory"
 assert events[0]["push"]=="undefined" and events[0]["end"]=="undefined"
 assert events[0]["synchronous"]==(scenario!="async-repaired")
 assert events[1]=={"event":"terminal","text":"TERMINAL-ORIGINAL","scenario":scenario}
 if scenario=="result-error":
  assert receipt["exitCode"]!=0 and output["ok"] is False
  assert "SYNTHETIC-RESULT-ERROR" in output["error"]["message"]
  assert events[2]["event"]=="result-rejected"
  observed=output["error"]["message"]
 else:
  assert receipt["exitCode"]==0 and output["ok"] is True
  assert output["transport"]=="local" and output["provider"]=="readonly-proof"
  assert output["outputs"]==[{"text":"RESULT-REPAIRED","mediaUrl":None}]
  assert events[2]["event"]=="result-resolved" and events[2]["distinctObject"] is True
  observed=output["outputs"][0]["text"]
 observations.append({"scenario":scenario,"exitCode":receipt["exitCode"],"terminalText":"TERMINAL-ORIGINAL","observedCliResult":observed,"passed":True})
print(json.dumps({"allPassed":True,"boundary":"built shipped launcher -> plugin loader -> custom adapter -> completion -> CLI JSON", "observations":observations},indent=2))
