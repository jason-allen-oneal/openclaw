import datetime, json, pathlib, subprocess, sys, time, urllib.request, uuid, re, xml.etree.ElementTree as ET
root=pathlib.Path(__file__).parent
adb=str(pathlib.Path('ANDROID_SDK_ROOT')/'platform-tools/adb')
serial='emulator-5584'
package='ai.openclaw.app.debug'
results=[]
phase_prefix='verified-'+uuid.uuid4().hex[:8]+'-'
request_phase=None
baseline='--baseline' in sys.argv
model_count=int(sys.argv[sys.argv.index('--model-count')+1]) if '--model-count' in sys.argv else 732
def run(*args, check=True):
 return subprocess.run([adb,'-s',serial,*args],text=True,capture_output=True,check=check)
def request(route, data=None):
 body=None if data is None else json.dumps(data).encode()
 with urllib.request.urlopen(urllib.request.Request('http://LOCAL_TRACE_PROXY/'+route,data=body,headers={'Content-Type':'application/json'}),timeout=60) as response:return json.load(response)
def appfile(name):
 response=run('shell','run-as',package,'cat','files/catalog-proof/'+name,check=False)
 return response.stdout if response.returncode==0 else None
def mark(name):run('shell','run-as',package,'touch','files/catalog-proof/'+name)
def screenshot(name):
 with (root/(name+'.png')).open('wb') as output:subprocess.run([adb,'-s',serial,'exec-out','screencap','-p'],stdout=output,check=True)
def observations():
 try:return json.loads(appfile('observations.json') or '[]')
 except json.JSONDecodeError:return []
def latest():
 values=observations();return values[-1] if values else {}
def until(predicate, timeout=45):
 deadline=time.monotonic()+timeout
 while time.monotonic()<deadline:
  value=predicate()
  if value:return value
  time.sleep(.25)
 raise AssertionError('Timed out awaiting native observation')
def summary_for_current_phase():
 summary=request('summary')
 rows=[json.loads(line) for line in (root/'native-wire.jsonl').read_text().splitlines()]
 requests=[row for row in rows if row.get('phase')==summary['phase'] and row.get('direction')=='request']
 chat=[row for row in requests if row.get('method')=='chat.metadata' or (row.get('method')=='models.list' and row.get('params',{}).get('sessionKey'))]
 summary['chatCounts']={method:sum(row['method']==method for row in chat) for method in ['chat.metadata','models.list']}
 summary['settingsModelsListCount']=sum(row.get('method')=='models.list' and not row.get('params',{}).get('sessionKey') for row in requests)
 summary['chatRequests']=chat
 return summary

def open_chat():
 # The confirmed native Overview screenshot shows the Chat button at (300, 820)
 # on this fixed 1080x1920 task emulator. A second UiAutomation service conflicts
 # with the active instrumentation owner, so use Android's normal input command.
 screenshot('native-before-open-chat')
 run('shell','input','tap','300','820')
 time.sleep(1)
 screenshot('native-chat-open')

def phase(name,payload=None,count=1):
 request('phase?name='+phase_prefix+name)
 before=observations()
 if payload is not None:request('emit',{'payload':payload,'count':count,'intervalMs':500})
 else:time.sleep(2)
 summary=summary_for_current_phase()
 summary['observations']=observations()[len(before):]
 results.append(summary)
 (root/'native-results.json').write_text(json.dumps(results,indent=2)+'\n')
 return summary
request('warning?enabled=false')
request('phase?name='+phase_prefix+'startup')
until(lambda:(appfile('ready') or '').strip()=='ready',120)
open_chat()
until(lambda:any(x.get('catalogRows')==model_count for x in observations()))
phase('settled-idle')
unchanged={'agentId':'main','modelCatalogChanged':False,'authChanged':False,'commandsChanged':False}
for name,payload,count in [('usage-only',unchanged,10),('other-agent',{'agentId':'other','modelCatalogChanged':True,'authChanged':True},3)]:
 result=phase(name,payload,count)
 if baseline:
  assert result['chatCounts'].get('chat.metadata',0)>0,result
  assert result['chatCounts'].get('models.list',0)>0,result
 else:
  assert result['chatCounts'].get('chat.metadata',0)==0,result
  assert result['chatCounts'].get('models.list',0)==0,result
for name,payload in [('catalog-change',dict(unchanged,modelCatalogChanged=True)),('auth-change',dict(unchanged,authChanged=True)),('commands-change',dict(unchanged,commandsChanged=True)),('selection-change',dict(unchanged,modelSelectionChanged=True)),('legacy-event',{})]:
 result=phase(name,payload)
 assert result['chatCounts'].get('chat.metadata',0)>0,result
 assert result['chatCounts'].get('models.list',0)>0,result
request('warning?enabled=true')
result=phase('refresh-warning',dict(unchanged,modelCatalogStatusChanged=True))
until(lambda:latest().get('refreshWarning'))
screenshot('native-refresh-warning')
request('warning?enabled=false')
result=phase('status-recovery',dict(unchanged,modelCatalogStatusChanged=True))
until(lambda:latest().get('refreshWarning') is None and latest().get('catalogRows')==model_count)
screenshot('native-status-recovered')
request('warning?enabled=true')
phase('warning-before-manual-retry',dict(unchanged,modelCatalogStatusChanged=True))
until(lambda:latest().get('refreshWarning'))
request('warning?enabled=false')
request('phase?name='+phase_prefix+'manual-retry')
mark('refresh')
until(lambda:latest().get('refreshWarning') is None and latest().get('catalogRows')==model_count)
summary=summary_for_current_phase();summary['observations']=observations();results.append(summary)
assert summary['chatCounts'].get('models.list',0)>0,summary
(root/'native-results.json').write_text(json.dumps(results,indent=2)+'\n')
mark('finish')
print(json.dumps({'status':'passed','phases':len(results),'completedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}))
