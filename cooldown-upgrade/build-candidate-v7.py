import datetime, json, os, pathlib, subprocess

root = pathlib.Path(__file__).resolve().parent
checkout = root.parent / 'candidate'
head = subprocess.check_output(['git','rev-parse','HEAD'], cwd=checkout, text=True).strip()
assert head == '989b30680025e029885e77e6aeefb3c1cc7626a5', head
assert not subprocess.check_output(['git','status','--porcelain'],cwd=checkout,text=True).strip()
command = ['/home/proof/.local/share/openclaw-134498-proof/runtime/node-v24.22.1-linux-x64/bin/node','--import','./scripts/tsx.mjs','scripts/build-all.mts','qaRuntime']
receipt = {'command':command,'sourceHead':head,'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}
env = dict(os.environ, PATH='/home/proof/.local/share/openclaw-134498-proof/runtime/node-v24.22.1-linux-x64/bin:/usr/bin:/bin:'+os.environ['PATH'])
with open(root/'candidate-build-v7.log','wb') as log:
    code = subprocess.call(command,cwd=checkout,env=env,stdout=log,stderr=subprocess.STDOUT)
receipt.update(exitCode=code, finishedAt=datetime.datetime.now(datetime.timezone.utc).isoformat())
(root/'candidate-build-v7.receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps(receipt),flush=True)
raise SystemExit(code)
