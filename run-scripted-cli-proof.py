import hashlib,http.server,json,os,pathlib,subprocess,threading,time
ROOT=pathlib.Path(__file__).resolve().parent
REPO=pathlib.Path(os.environ['CANDIDATE_REPO'])
RUNTIME=ROOT/'runtime';TARGET=RUNTIME/'target';COORD=RUNTIME/'coordinator'
phase='';requests=[];receipts=[]
operations=[('read',{'path':str(TARGET/'read.txt')}),('write',{'path':str(TARGET/'write.txt'),'content':'written-by-worker-194473\n'}),('edit',{'path':str(TARGET/'edit.txt'),'edits':[{'oldText':'before-edit-194473','newText':'after-edit-194473'}]}),('apply_patch',{'input':f'*** Begin Patch\n*** Update File: {TARGET}/patch.txt\n@@\n-before-patch-194473\n+after-patch-194473\n*** End Patch'})]
class Server(http.server.BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_POST(self):
  payload=json.loads(self.rfile.read(int(self.headers['content-length'])))
  messages=payload.get('messages',[]);results=[x for x in messages if x.get('role')=='tool']
  requests.append({'phase':phase,'path':self.path,'payload':payload})
  (ROOT/'scripted-provider-requests.json').write_text(json.dumps(requests,indent=2)+'\n')
  i=len(results)
  if i<len(operations):
   tool,args=operations[i];delta={'role':'assistant','tool_calls':[{'index':0,'id':f'{phase}-{tool}','type':'function','function':{'name':tool,'arguments':json.dumps(args)}}]};finish='tool_calls'
  else:
   receipts.append({'phase':phase,'toolResults':results});delta={'role':'assistant','content':'SCRIPTED_RUNTIME_PHASE_COMPLETE'};finish='stop'
  self.send_response(200);self.send_header('Content-Type','text/event-stream');self.end_headers()
  self.wfile.write(('data: '+json.dumps({'id':'synthetic-call','object':'chat.completion.chunk','created':int(time.time()),'model':'fixture-tool-model','choices':[{'index':0,'delta':delta,'finish_reason':finish}]})+'\n\ndata: [DONE]\n\n').encode())
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Server);threading.Thread(target=server.serve_forever,daemon=True).start()
config={'plugins':{'enabled':False},'env':{'shellEnv':{'enabled':False}},'agents':{'defaults':{'systemAgent':{'agentId':'main'},'contextInjection':'never','model':{'primary':'fixture/fixture-tool-model'},'models':{'fixture/fixture-tool-model':{'agentRuntime':{'id':'openclaw'}}}}},'models':{'providers':{'fixture':{'api':'openai-completions','apiKey':'synthetic-unused-key','baseUrl':f'http://127.0.0.1:{server.server_port}/v1','request':{'allowPrivateNetwork':True},'models':[{'id':'fixture-tool-model','name':'Scripted transport fixture','contextWindow':200000,'maxTokens':2048}]}}},'tools':{'profile':'full','allow':['read','write','edit','apply_patch'],'fs':{'workspaceOnly':True},'exec':{'applyPatch':{'enabled':True,'workspaceOnly':True}}}}
configpath=ROOT/'scripted-config.private.json';configpath.write_text(json.dumps(config,indent=2));configpath.chmod(0o600)
home=RUNTIME/'isolated-home';home.mkdir(exist_ok=True)
env={k:v for k,v in os.environ.items() if k in ['PATH','LANG','LC_ALL','TMPDIR']};env.update({'HOME':str(home),'OPENCLAW_SKIP_CHANNELS':'1','OPENCLAW_SKIP_GMAIL_WATCHER':'1','OPENCLAW_SKIP_CRON':'1','OPENCLAW_SKIP_BROWSER_CONTROL_SERVER':'1','OPENCLAW_SKIP_CANVAS_HOST':'1'})
def snapshot():return {str(p.relative_to(RUNTIME)):hashlib.sha256(p.read_bytes()).hexdigest() for p in [*TARGET.glob('*.txt'),*COORD.glob('*.txt')]}
summary={'head':subprocess.check_output(['git','rev-parse','HEAD'],cwd=REPO,text=True).strip(),'scriptedModel':True,'actualShippedCli':True,'phases':[]}
try:
 for current,cwd in [('rejected',COORD),('recovered',TARGET)]:
  phase=current;state=RUNTIME/f'state-{phase}';state.mkdir(exist_ok=True);before=snapshot()
  cmd=['node','openclaw.mjs','agent','exec','Exercise only the four synthetic file operations selected by the local fixture. Do not use any other tools.','--config',str(configpath),'--cwd',str(cwd),'--state-dir',str(state),'--code-mode','direct','--thinking','off','--json','--timeout','180']
  started=time.time()
  with (ROOT/f'scripted-{phase}.stdout.json').open('w') as out,(ROOT/f'scripted-{phase}.stderr.log').open('w') as err:
   proc=subprocess.run(cmd,cwd=REPO,env=env,stdout=out,stderr=err,timeout=240)
  result={'phase':phase,'exitCode':proc.returncode,'elapsedSeconds':time.time()-started,'before':before,'after':snapshot(),'command':cmd}
  summary['phases'].append(result)
  (ROOT/'scripted-summary.json').write_text(json.dumps(summary,indent=2)+'\n')
  assert proc.returncode==0,(phase,proc.returncode)
  receipt=[x for x in receipts if x['phase']==phase][-1]
  assert len(receipt['toolResults'])==4,receipt
  if phase=='rejected':
   assert result['before']==result['after']
   for x in receipt['toolResults']:
    content=json.dumps(x);assert all(t in content for t in ['Path escapes sandbox root','sessions_spawn','cwd','Changing exec workdir']),content
  else:
   assert 'read-canary-194473' in json.dumps(receipt['toolResults'][0])
   assert (TARGET/'write.txt').read_text()=='written-by-worker-194473\n'
   assert (TARGET/'edit.txt').read_text()=='after-edit-194473\n'
   assert (TARGET/'patch.txt').read_text()=='after-patch-194473\n'
  print(phase+': real CLI tool results and independent filesystem assertions passed',flush=True)
 summary['passed']=True
finally:
 server.shutdown();server.server_close()
 summary['receipts']=receipts
 (ROOT/'scripted-summary.json').write_text(json.dumps(summary,indent=2)+'\n')
