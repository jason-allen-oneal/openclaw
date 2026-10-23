import pathlib,urllib.request,json,hashlib,base64,subprocess,os,time,datetime
root=pathlib.Path('/home/proof/.local/share/openclaw-176080-proof/stable-upgrade')
root.mkdir(exist_ok=True)
for x in ['home','runtime','npm-cache','tmp','cache','config','data']:(root/x).mkdir(exist_ok=True)
version='2026.10.6'
meta=json.load(urllib.request.urlopen('https://registry.npmjs.org/openclaw/'+version))
(root/'npm-metadata.json').write_text(json.dumps(meta,indent=2)+'\n')
tar=root/('openclaw-'+version+'.tgz')
with urllib.request.urlopen(meta['dist']['tarball']) as s,tar.open('wb') as d:
 while block:=s.read(1024*1024):d.write(block)
raw=tar.read_bytes(); integrity='sha512-'+base64.b64encode(hashlib.sha512(raw).digest()).decode()
assert integrity==meta['dist']['integrity']
assert hashlib.sha1(raw).hexdigest()==meta['dist']['shasum']
nodebin='/home/proof/.local/share/openclaw-134498-proof/runtime/node-v24.22.1-linux-x64/bin'
env=dict(os.environ,PATH=nodebin+':/usr/bin:/bin',HOME=str(root/'home'),npm_config_cache=str(root/'npm-cache'),TMPDIR=str(root/'tmp'),XDG_CACHE_HOME=str(root/'cache'),XDG_CONFIG_HOME=str(root/'config'),XDG_DATA_HOME=str(root/'data'))
cmd=[nodebin+'/npm','install','--prefix',str(root/'runtime'),'--omit=dev','--no-audit','--no-fund','--save-exact',str(tar)]
started=time.monotonic()
with (root/'install.log').open('w') as log:r=subprocess.run(cmd,env=env,stdout=log,stderr=subprocess.STDOUT)
pkg=root/'runtime/node_modules/openclaw'
receipt={'version':version,'command':cmd,'integrity':integrity,'sha1':meta['dist']['shasum'],'exitCode':r.returncode,'durationSeconds':time.monotonic()-started,'completedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'package':str(pkg)}
if (pkg/'dist/build-info.json').exists():receipt['buildInfo']=json.loads((pkg/'dist/build-info.json').read_text())
(root/'install.receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps(receipt),flush=True)
raise SystemExit(r.returncode)
