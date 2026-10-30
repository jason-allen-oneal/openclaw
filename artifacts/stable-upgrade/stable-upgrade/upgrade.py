exec(open('/tmp/openclaw-186088-stable-proof/proof.py').read().split("if not (run/'seeded')")[0])
result=call('08-candidate-doctor-upgrade',['doctor','--fix','--yes','--non-interactive'],runner=candidate,expect=0)
print(result)
