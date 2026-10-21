#!/usr/bin/env python3
"""ADAPTED, UNEXECUTED consolidated recipe; recorded historical receipts are separate.
Run only on fresh stable fixture state made by reproduce-setup.py, never live state.
"""
import argparse, importlib.util, json, os, re, subprocess, time
from pathlib import Path

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--root',type=Path,required=True)
parser.add_argument('--candidate',type=Path,required=True)
parser.add_argument('--expected-head',required=True)
a=parser.parse_args();root=a.root.resolve()
assert re.fullmatch('[0-9a-f]{40}',a.expected_head)
os.environ['PROOF_ROOT']=str(root)
spec=importlib.util.spec_from_file_location('proof',Path(__file__).with_name('candidate-proof.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
p=m.Proof(a.candidate,a.expected_head,'reproduction-candidate')
assert not (root/p.result_name).exists(),'Never replay failed mutations without inspecting state'
try:
 p.bind()
 stable=json.loads((root/'stable-final-summary.json').read_text())
 assert stable['stableVersion']=='2026.10.3' and stable['sessionId']==m.SESSION_ID
 assert m.digest(m.STATE/'openclaw.json')==stable['configSha256']
 before=m.files_and_profiles();m.save(p.name('before.json'),before)
 assert any(row['hasApiKey'] for row in before['catalogs'])
 p.command('doctor',['doctor','--fix','--non-interactive','--yes'],timeout=300)
 migrated=m.files_and_profiles();m.assert_clean_catalogs(migrated)
 assert {'canonical','manual','recovered'} <= {row['matchesFixture'] for row in migrated['profiles']}
 m.save(p.name('after-doctor.json'),migrated)
 p.start('gateway-upgrade')
 history=p.rpc('stable-history','chat.history',{'sessionKey':m.SESSION_KEY,'agentId':'main','limit':40});m.assert_history(history,2)
 p.turn('canonical-turn','canonical','What proof word did I ask you to remember? Reply with that word only.',recall=True)
 p.rpc('select-recovered-before','sessions.patch',{'key':m.SESSION_KEY,'agentId':'main','expectedSessionId':m.SESSION_ID,'model':'recovered/'+m.MODEL})
 p.turn('recovered-turn','recovered','Reply with the remembered proof word only.',recall=True)
 p.stop()
 for provider in ['canonical','manual']:
  ids=[row['id'] for row in migrated['profiles'] if row['matchesFixture']==provider]
  assert len(ids)==1
  p.command('logout-'+provider,['models','auth','logout',ids[0],'--agent','main','--yes'])
 after=m.files_and_profiles();m.assert_clean_catalogs(after)
 assert not any(row['matchesFixture'] in ['canonical','manual'] for row in after['profiles'])
 m.save(p.name('after-logout.json'),after)
 # Supplemental SDK contract, explicitly not an embedded Gateway root-only test.
 driver=Path(__file__).with_name('authored-registry-live.mjs')
 argv=['node',str(driver),str(a.candidate.resolve()),str(root)]
 start=time.time();done=subprocess.run(argv,env=m.ENV,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=120)
 (root/p.name('sdk.log')).write_bytes(done.stdout)
 m.save(p.name('sdk.receipt.json'),{'argv':argv,'startedAtUnix':start,'endedAtUnix':time.time(),'exitCode':done.returncode,'driverSha256':m.digest(driver)})
 assert done.returncode==0
 p.start('gateway-restart')
 p.select('recovered');p.turn('retained-turn','recovered','Reply with the remembered proof word only.',recall=True)
 history=p.rpc('final-history','chat.history',{'sessionKey':m.SESSION_KEY,'agentId':'main','limit':40});m.assert_history(history,8)
 count=len(m.proxy_records('live-proxy.requests.jsonl'))
 output=p.command('revoked-local-request',['agent','--agent','main','--session-id','catalog-upgrade-revocation-negative','--message','Reply with REVOKED-SHOULD-NOT-SEND.','--json','--timeout','120'],expect=None)
 requests=m.proxy_records('live-proxy.requests.jsonl')[count:]
 assert requests and all(not row['authAccepted'] and row['syntheticCredential']=='' for row in requests)
 assert re.search('401|auth|credential',output,re.I)
 p.stop();final=m.files_and_profiles();m.assert_clean_catalogs(final)
 assert not any(row['matchesFixture'] in ['canonical','manual'] for row in final['profiles'])
 m.save(p.name('final-state.json'),final);p.check_bindings()
 m.save(p.result_name,{'status':'passed','candidateSha':a.expected_head,'observations':p.observations,'receipts':p.receipts,'scope':'Actual migration and retained conversation; authored SDK fallback; local no-auth request rejected without revoked credentials, not zero HTTP I/O.'})
except BaseException as error:
 cleanup=None
 try:p.stop()
 except Exception as stopped:cleanup=str(stopped)
 m.save(p.result_name,{'status':'failed','error':str(error),'cleanupError':cleanup,'receipts':p.receipts});raise
