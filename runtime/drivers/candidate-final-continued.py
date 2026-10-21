"""Correct the loopback negative expectation; preserve all previous failed receipts."""
import importlib.util,json,re
from pathlib import Path
r=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('proof',r/'candidate-proof.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
sha='4382a3109df1849e0fb0a6350c5f279d080756f8'
p=m.Proof(Path('<candidate-checkout>'),sha,'candidate-final-continued')
assert not (r/p.result_name).exists()
try:
 p.bind();before=m.files_and_profiles();m.assert_clean_catalogs(before)
 assert not any(row['matchesFixture'] in ['canonical','manual'] for row in before['profiles'])
 assert any(row['matchesFixture']=='recovered' for row in before['profiles'])
 m.save(p.name('before.json'),before)
 p.start('gateway')
 p.select('recovered');p.turn('retained-recovered-turn','recovered','What was the proof word I asked you to remember? Reply with the proof word only. Do not use tools.',recall=True)
 history=p.rpc('final-history','chat.history',{'sessionKey':m.SESSION_KEY,'agentId':'main','limit':40});m.assert_history(history,8)
 count=len(m.proxy_records('live-proxy.requests.jsonl'))
 output=p.command('logged-out-local-refusal',['agent','--agent','main','--session-id','catalog-upgrade-revocation-negative','--message','Reply with REVOKED-SHOULD-NOT-SEND.','--json','--timeout','120'],expect=None)
 requests=m.proxy_records('live-proxy.requests.jsonl')[count:]
 assert requests and all(not row['authAccepted'] and row['syntheticCredential']=='' for row in requests),'Logged-out route reused credentials'
 responses={row['sequence']:row for row in m.proxy_records('live-proxy.responses.jsonl')}
 # The proxy rejects missing auth before forwarding to Ollama; its request record
 # captures this exact predicate. There is no successful inference response.
 assert all(row['sequence'] not in responses or responses[row['sequence']].get('status')==401 for row in requests)
 assert re.search(r'401|auth|api.?key|credential',output,re.I),'Expected auth rejection'
 p.observations.append({'operation':'logged-out-local-refusal','provider':'canonical','allowed':False,'physicalRequests':len(requests),'receiverSequences':[row['sequence'] for row in requests],'authorizationHeadersAbsent':True,'upstreamInferenceRequests':0,'terminalFailure':m.parse_json_output(output),'policy':'Existing configured loopback-provider synthetic no-auth policy permits credential-free requests. The validating receiver rejects them; no revoked credential was resurrected. Zero receiver I/O was an invalid expectation for this fixture.'})
 p.stop();final=m.files_and_profiles();m.assert_clean_catalogs(final)
 assert not any(row['matchesFixture'] in ['canonical','manual'] for row in final['profiles'])
 m.save(p.name('final-state.json'),final);p.check_bindings()
 m.save(p.result_name,{'status':'passed','candidateSha':sha,'observations':p.observations,'receipts':p.receipts,'sessionId':m.SESSION_ID,'sessionKey':m.SESSION_KEY,'scope':'Final-head retained-state Gateway restart, recovered-key real inference and retained release conversation, no revoked-key resurrection after logout. Local no-auth fallback is not a zero-I/O contract.'})
 m.emit({'status':'passed','result':p.result_name})
except BaseException as error:
 cleanup=None
 try:p.stop()
 except Exception as stopped:cleanup=str(stopped)
 m.save(p.result_name,{'status':'failed','candidateSha':sha,'error':str(error),'cleanupError':cleanup,'observations':p.observations,'receipts':p.receipts});raise
