"""Rebuild the task-owned shipped-package proof installation; never changes the source install."""
from pathlib import Path
import urllib.request,json,tarfile,hashlib,base64,io
root=Path('/tmp/openclaw-186088-stable-proof');root.mkdir(exist_ok=True);root.chmod(0o700)
repo=Path('/home/runner/.local/share/openclaw-worktrees/issue-186088')
metadata=json.load(urllib.request.urlopen('https://registry.npmjs.org/openclaw/2026.10.9'))
blob=urllib.request.urlopen(metadata['dist']['tarball']).read();assert 'sha512-'+base64.b64encode(hashlib.sha512(blob).digest()).decode()==metadata['dist']['integrity']
package=root/'stable/package'
if not package.exists():
 with tarfile.open(fileobj=io.BytesIO(blob)) as archive:archive.extractall(root/'stable',filter='data')
installed=package/'node_modules';installed.mkdir(exist_ok=True)
for entry in (repo/'node_modules').iterdir():
 if entry.name.startswith('.'):continue
 if entry.name.startswith('@'):
  (installed/entry.name).mkdir(exist_ok=True)
  for child in entry.iterdir():
   target=installed/entry.name/child.name
   if not target.exists():target.symlink_to(child.resolve(),target_is_directory=True)
 elif not (installed/entry.name).exists():(installed/entry.name).symlink_to(entry.resolve(),target_is_directory=True)
for name,version in metadata['dependencies'].items():
 if not name.startswith('@openclaw/'):continue
 target=installed/name
 if target.exists() and not target.is_symlink():continue
 dependency=json.load(urllib.request.urlopen('https://registry.npmjs.org/'+name+'/'+version));content=urllib.request.urlopen(dependency['dist']['tarball']).read();assert 'sha512-'+base64.b64encode(hashlib.sha512(content).digest()).decode()==dependency['dist']['integrity']
 if target.is_symlink():target.unlink()
 target.mkdir()
 with tarfile.open(fileobj=io.BytesIO(content)) as archive:
  for member in archive.getmembers():
   member.name=member.name.removeprefix('package/');archive.extract(member,target,filter='data')
print('Verified shipped stable package installed only at',package)
