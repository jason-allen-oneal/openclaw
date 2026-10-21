"""Continue retained upgraded state on the final clean build; do not reseed or repeat logout."""
import importlib.util,json
from pathlib import Path
r=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('proof',r/'candidate-proof.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
sha='4382a3109df1849e0fb0a6350c5f279d080756f8'
p=m.Proof(Path('<candidate-checkout>'),sha,'candidate-final')
assert not (r/p.result_name).exists()
try:
 p.bind()
 before=m.files_and_profiles();m.assert_clean_catalogs(before)
 assert not any(row['matchesFixture'] in ['canonical','manual'] for row in before['profiles'])
 assert any(row['matchesFixture']=='recovered' for row in before['profiles'])
 m.save(p.name('before.json'),before)
 p.start('gateway')
 p.select('canonical');p.turn('revoked-refusal','canonical','Reply with REVOKED-SHOULD-NOT-SEND.',denied=True)
 p.select('recovered');p.turn('retained-recovered-turn','recovered','What was the proof word I asked you to remember? Reply with the proof word only. Do not use tools.',recall=True)
 history=p.rpc('final-history','chat.history',{'sessionKey':m.SESSION_KEY,'agentId':'main','limit':40});m.assert_history(history,8)
 p.stop()
 final=m.files_and_profiles();m.assert_clean_catalogs(final)
 assert not any(row['matchesFixture'] in ['canonical','manual'] for row in final['profiles'])
 m.save(p.name('final-state.json'),final);p.check_bindings()
 m.save(p.result_name,{'status':'passed','candidateSha':sha,'observations':p.observations,'receipts':p.receipts,'sessionId':m.SESSION_ID,'sessionKey':m.SESSION_KEY,'scope':'Final-head Gateway restart, terminal revoked auth refusal with zero receiver I/O, recovered-key real inference and retained release conversation; not a repeat of initial upgrade or authored-root-only Gateway success.'})
 m.emit({'status':'passed','result':p.result_name})
except BaseException as error:
 cleanup=None
 try:p.stop()
 except Exception as stopped:cleanup=str(stopped)
 m.save(p.result_name,{'status':'failed','candidateSha':sha,'error':str(error),'cleanupError':cleanup,'observations':p.observations,'receipts':p.receipts});raise
