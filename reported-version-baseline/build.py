from pathlib import Path
import os,subprocess,time,datetime,json,hashlib
root=Path(__file__).parent
src=root/'openclaw-dbac7730a12c90e95143f23e556199ab642e639e'
for name in ['build.log','build.receipt.json']:
 if (root/name).exists():
  number=1
  while(root/f'attempt{number}-{name}').exists():number+=1
  (root/name).rename(root/f'attempt{number}-{name}')
env=os.environ.copy();env.update(ANDROID_HOME='<ANDROID_SDK>',ANDROID_SDK_ROOT='<ANDROID_SDK>',JAVA_HOME='<JDK21>')
command=['./gradlew','--no-daemon','--max-workers=1','-Dorg.gradle.jvmargs=-Xmx6g -Dfile.encoding=UTF-8 --enable-native-access=ALL-UNNAMED','-I',str(root/'diagnostic.init.gradle'),'-PopenclawBuildCommit=dbac7730a12c90e95143f23e556199ab642e639e','-PopenclawBuildTimestamp='+datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),':app:assemblePlayDebug',':app:assemblePlayDebugAndroidTest']
receipt={'command':command,'sourceCommit':'dbac7730a12c90e95143f23e556199ab642e639e','observationOnlyOverlay':str(root/'diagnostic-observation.patch'),'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()};start=time.monotonic()
with(root/'build.log').open('wb')as log:
 process=subprocess.Popen(command,cwd=src/'apps/android',env=env,stdout=log,stderr=subprocess.STDOUT)
 (root/'build.pid').write_text(str(process.pid));receipt['exitCode']=process.wait()
receipt['seconds']=time.monotonic()-start;receipt['completedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat()
receipt['apks']=[{'path':str(p.relative_to(src)),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}for p in(src/'apps/android/app/build/outputs/apk').rglob('*.apk')]
(root/'build.receipt.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt));raise SystemExit(receipt['exitCode'])
