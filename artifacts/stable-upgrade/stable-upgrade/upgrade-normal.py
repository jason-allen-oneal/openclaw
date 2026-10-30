exec(open('/tmp/openclaw-186088-stable-proof/proof.py').read().split("if not (run/'seeded')")[0])
candidate=['pnpm','--silent','openclaw']
name='08c-normal-launcher-doctor-upgrade'; args=['doctor','--fix','--yes','--non-interactive'];argv=candidate+args
with open(run/(name+'.stdout'),'w') as out,open(run/(name+'.stderr'),'w') as err:
 try: p=subprocess.run(argv,cwd=repo,env=env,stdout=out,stderr=err,text=True,timeout=120);code=p.returncode
 except subprocess.TimeoutExpired:code=124
log.append({'name':name,'argv':argv,'exitCode':code,'timeoutSeconds':120});(run/'commands.json').write_text(json.dumps(log,indent=2)+'\n');print(name,code)
