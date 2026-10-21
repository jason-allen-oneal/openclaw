import importlib.util,json,hashlib
from pathlib import Path
r=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('proof',r/'candidate-proof.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
sha='ae73bd7e38f7f62ab85dddedcaab5c9c7ed5f421'
p=m.Proof(Path('<candidate-checkout>'),sha,'candidate-tail')
assert not (r/p.result_name).exists()
prior=json.loads((r/'candidate-continued-result.json').read_text())
assert prior['status']=='failed' and prior['candidateSha']==sha and prior['cleanupError'] is None
assert prior['error']=='logout-canonical exited 1; inspect candidate-continued-logout-canonical.log'
p.receipts=list(prior['receipts']);p.observations=list(prior['observations'])
p.bound=json.loads((r/'candidate-continued-bindings.json').read_text())['sha256'];p.check_bindings()
m.save(p.name('bindings.json'),{'candidateSha':sha,'inheritedBindings':'candidate-continued-bindings.json','driverSha256':m.digest(__file__),'librarySha256':m.digest(r/'candidate-proof.py'),'correction':'Explicit named CLI profile isolates service ownership; existing custom state/config paths are preserved. No service changes, guard bypass, repeated Doctor, or reseed.'})
try:
 before=m.files_and_profiles();m.assert_clean_catalogs(before)
 assert {'canonical','manual','recovered'} <= {row['matchesFixture'] for row in before['profiles']}
 for provider in ['canonical','manual']:
  ids=[row['id'] for row in before['profiles'] if row['matchesFixture']==provider]
  assert len(ids)==1
  p.command('logout-'+provider,['models','auth','logout',ids[0],'--agent','main','--yes'])
 after=m.files_and_profiles();m.assert_clean_catalogs(after)
 assert not any(row['matchesFixture'] in ['canonical','manual'] for row in after['profiles'])
 assert any(row['matchesFixture']=='recovered' for row in after['profiles'])
 m.save(p.name('after-logout.json'),after)
 p.start('gateway-restart')
 p.select('manual');p.turn('authored-root-turn','manual','Reply with ROOT-AUTH-OK and do not use tools.')
 p.select('canonical');p.turn('revoked-refusal','canonical','Reply with REVOKED-SHOULD-NOT-SEND.',denied=True)
 history=p.rpc('final-history','chat.history',{'sessionKey':m.SESSION_KEY,'agentId':'main','limit':30});m.assert_history(history,8)
 p.stop();final=m.files_and_profiles();m.assert_clean_catalogs(final)
 assert not any(row['matchesFixture'] in ['canonical','manual'] for row in final['profiles'])
 m.save(p.name('final-state.json'),final);p.check_bindings()
 m.save(p.result_name,{'status':'passed','candidateSha':sha,'observations':p.observations,'receipts':p.receipts,'continuedFrom':['candidate-result.json','candidate-resume-result.json','candidate-continued-result.json'],'sessionId':m.SESSION_ID,'sessionKey':m.SESSION_KEY,'limitations':['Synthetic helper-seeded auth/catalog state; actual published release and built candidate launcher/Gateway/Doctor/agent/logout.','Real CPU-only local model behind an auth-validating protocol adapter.','First Gateway readiness assertion and first resume admission assertion were harness errors. Unnamed-profile logout was correctly refused without writes; named profile isolates fixture service ownership.','One uncommitted type-only test assertion correction exists during this tail; executed build artifacts remain bound to the original clean ae73bd7e38 build and verified unchanged.']})
 m.emit({'status':'passed','result':p.result_name})
except BaseException as error:
 cleanup=None
 try:p.stop()
 except Exception as stopped:cleanup=str(stopped)
 m.save(p.result_name,{'status':'failed','candidateSha':sha,'error':str(error),'cleanupError':cleanup,'observations':p.observations,'receipts':p.receipts});raise
