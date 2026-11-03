#!/usr/bin/env python3
"""Bind built entrypoints and actual definition owners, not re-export facades."""
import hashlib,json,pathlib,subprocess,sys
root=pathlib.Path(sys.argv[1])
output=pathlib.Path(sys.argv[2])
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
owners={}
for key,folder,needle in [
 ("adapter",root/"dist","function adaptCustomStream("),
 ("modelCli",root/"dist","function registerModelCapabilityCommands("),
 ("binder",root/"packages/ai/dist","function bindAssistantMessageEventStream(")]:
 matches=[p for p in folder.iterdir() if p.is_file() and p.suffix in [".mjs",".js"] and needle in p.read_text()]
 assert len(matches)==1,(key,[str(p) for p in matches])
 owners[key]=str(matches[0].relative_to(root))
files=["openclaw.mjs","dist/entry.js","dist/build-info.json","src/agents/custom-api-registry.ts","src/cli/capability-cli/model.ts",*owners.values()]
info=json.loads((root/"dist/build-info.json").read_text())
commit=subprocess.check_output(["git","rev-parse","HEAD"],cwd=root,text=True).strip()
assert info["commit"]==commit,(info,commit)
status=subprocess.check_output(["git","status","--short"],cwd=root,text=True)
assert not status,status
result={"buildInfo":info,"localGitCommit":commit,"publicPrHead":"1613f8f2a6cb38b1468ca2ac5cc9b37d601ec035","identityNote":"Local synthetic archive+verified PR delta, not remote Git SHA.","nodeVersion":subprocess.check_output(["node","--version"],text=True).strip(),"definitionOwners":owners,"files":{p:{"sha256":sha(root/p),"bytes":(root/p).stat().st_size} for p in files},"gitStatus":status}
output.write_text(json.dumps(result,indent=2)+"\n")
print(json.dumps(result,indent=2))
