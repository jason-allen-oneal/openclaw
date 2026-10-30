import pathlib,shutil,subprocess,sys,hashlib
root=pathlib.Path('/tmp/openclaw-186088-mutation-lwjno2jj')
source=pathlib.Path.cwd()/'src/commands/update-cleanup-session-archives.ts'
key=hashlib.sha256(source.read_bytes()).hexdigest()[:16]
shutil.copy2(source,root/'src/commands/update-cleanup-session-archives.ts')
result=subprocess.run(["node","scripts/run-vitest.mjs","src/cli/update-cli/cleanup-session-archives.test.ts","--maxWorkers=1"],cwd=root,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
(pathlib.Path('/tmp/openclaw-186088-mutation-final-runs')/(key+".log")).write_bytes(result.stdout)
sys.stdout.buffer.write(result.stdout)
sys.exit(result.returncode)
