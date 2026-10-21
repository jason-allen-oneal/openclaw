import os,sys,json,subprocess,time,signal,socket,hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parent
STATE=ROOT/'state'
STABLE=ROOT/'stable/runtime/node_modules/openclaw'
ENV={'PATH':os.environ['PATH'],'HOME':str(ROOT/'home'),'OPENCLAW_HOME':str(ROOT/'home'),'OPENCLAW_STATE_DIR':str(STATE),'OPENCLAW_CONFIG_PATH':str(STATE/'openclaw.json'),'OPENCLAW_AGENT_DIR':str(STATE/'agents/main/agent'),'NO_COLOR':'1','OPENCLAW_NO_RESPAWN':'1','OPENCLAW_SKIP_UPDATE_CHECK':'1'}
(ROOT/'home').mkdir(exist_ok=True)
def command(label,package,args,timeout=180):
 argv=['node',str(Path(package)/'openclaw.mjs')]+args
 start=time.time()
 try:
  p=subprocess.run(argv,env=ENV,cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=timeout)
  out=p.stdout.decode(errors='replace');code=p.returncode
 except subprocess.TimeoutExpired as e:out=(e.stdout or b'').decode(errors='replace');code=124
 (ROOT/(label+'.log')).write_text(out)
 receipt={'argv':argv,'environment':ENV,'exitCode':code,'elapsedSeconds':round(time.time()-start,2),'log':label+'.log'}
 (ROOT/(label+'.receipt.json')).write_text(json.dumps(receipt,indent=2)+'\n')
 print(json.dumps({'label':label,'exitCode':code,'elapsedSeconds':receipt['elapsedSeconds'],'tail':out[-1600:]}))
 return code,out
if __name__=='__main__':
 mode=sys.argv[1]
 if mode=='prepare':
  addr=json.loads((ROOT/'live-proxy.address.json').read_text())['baseUrl']
  with socket.socket() as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
  model={'id':'qwen3:4b-instruct-2507-q4_K_M','name':'Local credential proof model','api':'openai-completions','reasoning':False,'input':['text'],'cost':{'input':0,'output':0,'cacheRead':0,'cacheWrite':0},'contextWindow':32768,'maxTokens':128}
  provider={'baseUrl':addr,'api':'openai-completions','agentRuntime':{'id':'openclaw'},'models':[model]}
  cfg={'gateway':{'mode':'local','port':port,'bind':'loopback','auth':{'mode':'none'},'controlUi':{'enabled':False}},'plugins':{'enabled':False},'agents':{'defaults':{'systemAgent':{'agentId':'main'},'workspace':str(STATE/'workspace'),'model':{'primary':'canonical/'+model['id']},'skipBootstrap':True,'contextInjection':'never','memorySearch':{'enabled':False},'params':{'maxTokens':128},'timeoutSeconds':120},'entries':{'main':{}}},'models':{'providers':{'canonical':provider,'recovered':provider}},'tools':{'profile':'minimal','deny':['*'],'codeMode':{'enabled':False}},'update':{'checkOnStart':False}}
  (STATE/'openclaw.json').write_text(json.dumps(cfg,indent=2)+'\n')
  root={'providers':{'manual':{**provider,'apiKey':'synthetic-authored-root-key'}}}
  (STATE/'agents/main/agent/models.json').write_text('// Authored root and literal must remain supported.\n'+json.dumps(root,indent=2)+'\n')
  (ROOT/'gateway-port.json').write_text(json.dumps({'port':port}))
  print(json.dumps({'prepared':True,'port':port,'localModel':model['id']}))
 elif mode=='run':
  sys.exit(command(sys.argv[2],sys.argv[3],sys.argv[4:])[0])
 elif mode=='start':
  label,package=sys.argv[2:4]
  port=json.loads((ROOT/'gateway-port.json').read_text())['port']
  argv=['node',str(Path(package)/'openclaw.mjs'),'gateway','run','--port',str(port),'--bind','loopback','--auth','none']
  log=open(ROOT/(label+'.log'),'w')
  p=subprocess.Popen(argv,env=ENV,cwd=ROOT,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
  (ROOT/(label+'.process.json')).write_text(json.dumps({'pid':p.pid,'argv':argv,'environment':ENV,'start':time.time()},indent=2))
  print(json.dumps({'pid':p.pid,'port':port,'log':str(ROOT/(label+'.log'))}))
 elif mode=='stop':
  label=sys.argv[2];record=json.loads((ROOT/(label+'.process.json')).read_text());pid=record['pid']
  try:os.kill(pid,signal.SIGTERM)
  except ProcessLookupError:pass
  for _ in range(200):
   try:
    state=Path('/proc/'+str(pid)+'/stat').read_text().split(') ')[1].split()[0]
    if state=='Z':break
   except FileNotFoundError:break
   time.sleep(.1)
  else:raise RuntimeError('Gateway did not settle')
  record['stopped']=time.time();(ROOT/(label+'.process.json')).write_text(json.dumps(record,indent=2))
  print(json.dumps({'stopped':pid}))
