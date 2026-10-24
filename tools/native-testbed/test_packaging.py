import contextlib,hashlib,importlib.util,json,os,pathlib,socket,stat,subprocess,sys,tempfile,unittest,zipfile
import shutil,time,urllib.error,urllib.request
from unittest import mock
HERE=pathlib.Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('pack_test_tavern',HERE/'pack_test_tavern.py');pack=importlib.util.module_from_spec(spec);spec.loader.exec_module(pack)
def put(root,relative,text='x'):
 p=root/relative;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(text);return p
class PackagingTests(unittest.TestCase):
 def test_inventory_keeps_cards_and_state_but_not_screenshots_and_locks(self):
  with tempfile.TemporaryDirectory() as d:
   root=pathlib.Path(d);put(root,'linux-host/usr/bin/tauritavern');put(root,'linux-runtime-state/data/user/chat.json','{}');put(root,'linux-runtime-state/data/user/a.lock');put(root,'linux-runtime-state/data/user/.git/config');put(root,'fullflow-inputs/card.png');put(root,'linux-runtime-state/commands/1.request.json',json.dumps({'path':'/screenshot'}));put(root,'linux-runtime-state/commands/1.response.json','{}');put(root,'linux-runtime-state/commands/2.request.json',json.dumps({'native':['xwd','-root']}));put(root,'linux-runtime-state/commands/2.response.json','{}');put(root,'linux-runtime-state/run-2026/native.log','real text log')
   rows,excluded=pack.inventory(root);paths={str(x[1]) for x in rows};self.assertIn('materials/card.png',paths);self.assertIn('runtime/data/user/chat.json',paths);self.assertIn('diagnostics/native-runs/run-2026/native.log',paths);self.assertFalse(any('.lock' in x or '.git' in x or 'native-commands' in x for x in paths));self.assertGreaterEqual(len(excluded),5)
 def test_empty_secrets_required_and_non_test_settings_credentials_rejected(self):
  with tempfile.TemporaryDirectory() as d:
   root=pathlib.Path(d);secret=put(root,'secrets.json','{}');self.assertEqual(pack.credential_check(secret,'runtime'),'empty-secrets');secret.write_text('{"custom":"not-a-test-key"}');self.assertRaises(RuntimeError,pack.credential_check,secret,'runtime');settings=put(root,'settings.json','{"api_key":"localfakeAPI"}');pack.credential_check(settings,'runtime');settings.write_text('{"api_key":"non-test-value"}');self.assertRaises(RuntimeError,pack.credential_check,settings,'runtime')
 def test_inline_screenshot_response_detected(self):
  with tempfile.TemporaryDirectory() as d:
   p=put(pathlib.Path(d),'any.response.json',json.dumps({'body':{'value':'iVBORw0KGgo'+'A'*2000}}));self.assertEqual(pack.credential_check(p,'diagnostics'),'screenshot-response')
 def test_archive_is_extracted_and_each_payload_hash_checked(self):
  with tempfile.TemporaryDirectory() as d:
   root=pathlib.Path(d);stage=root/'demo';p=put(stage,'runtime/data/com.tauritavern.client/data/default-user/secrets.json','{}');put(stage,'MANIFEST.json',json.dumps({'files':[{'path':p.relative_to(stage).as_posix(),'size':2,'sha256':hashlib.sha256(b'{}').hexdigest()}]}));archive=root/'demo.zip'
   with zipfile.ZipFile(archive,'w') as z:
    for f in stage.rglob('*'):
     if f.is_file():z.write(f,'demo/'+f.relative_to(stage).as_posix())
   result=pack.verify_archive(archive,root/'extract');self.assertTrue(result['allPayloadHashesMatch']);self.assertTrue(result['secretsEmpty']);self.assertEqual(result['verifiedPayloadFiles'],1)
 def test_repackage_keeps_changed_state_and_history_but_excludes_live_files_and_screenshots(self):
  with tempfile.TemporaryDirectory() as d:
   root=pathlib.Path(d);put(root,'MANIFEST.json','{"files":[]}');put(root,'app/linux-host/usr/bin/tauritavern');put(root,'runtime/data/user/chat.json','{"new":true}');put(root,'runtime/active-session.json','{}');put(root,'runtime/.supervisor.lock');put(root,'runtime/sessions/current/closed.json','{}');put(root,'runtime/sessions/current/Xauthority','private');put(root,'runtime/sessions/current/commands/1.request.json','{"path":"/screenshot"}');put(root,'runtime/sessions/current/commands/1.response.json','{}');put(root,'runtime/sessions/current/commands/2.request.json','{"native":["xwd","-root"]}');put(root,'runtime/sessions/current/commands/2.response.json','{}');put(root,'runtime/sessions/current/api-queue/1.response.json','{"content":"answer"}');put(root,'diagnostics/previous-sessions/old/closed.json','{}');put(root,'materials/card.png','actual-card');put(root,'provenance/snapshot.json','{}');put(root,'tools/queue_client.py','print("tool")')
   rows,excluded=pack.inventory_package(root);paths={str(x[1]) for x in rows};self.assertIn('runtime/data/user/chat.json',paths);self.assertIn('diagnostics/previous-sessions/current/closed.json',paths);self.assertIn('diagnostics/previous-sessions/old/closed.json',paths);self.assertIn('diagnostics/previous-sessions/current/api-queue/1.response.json',paths);self.assertIn('materials/card.png',paths);self.assertIn('tools/queue_client.py',paths);self.assertFalse(any('commands/' in x or 'Xauthority' in x or '.lock' in x or 'active-session' in x for x in paths));self.assertGreaterEqual(len(excluded),5)
 def test_repackage_rejects_symlink_and_colliding_diagnostic_history(self):
  with tempfile.TemporaryDirectory() as d:
   root=pathlib.Path(d);put(root,'MANIFEST.json','{}');outside=root/'external';outside.mkdir();(root/'tools').symlink_to(outside,target_is_directory=True)
   self.assertRaises(RuntimeError,pack.inventory_package,root);(root/'tools').unlink();put(root,'runtime/sessions/same/closed.json','{}');put(root,'diagnostics/previous-sessions/same/closed.json','{}');self.assertRaises(RuntimeError,pack.inventory_package,root)
 def test_repackage_refuses_a_running_host_without_producing_archive(self):
  with tempfile.TemporaryDirectory() as d:
   root=pathlib.Path(d);source=root/'package';put(source,'MANIFEST.json','{}');output=root/'new.zip'
   with mock.patch.object(sys,'argv',['pack','--package-root',str(source),'--output',str(output),'--confirm-host-stopped']),mock.patch.object(pack,'running_host',return_value=[123]):
    with self.assertRaisesRegex(SystemExit,'still running'):pack.main()
   self.assertFalse(output.exists())
 def test_repackage_requires_the_active_session_to_have_closed(self):
  with tempfile.TemporaryDirectory() as d:
   root=pathlib.Path(d);session=root/'runtime/sessions/current';put(root,'runtime/active-session.json',json.dumps({'sessionDirectory':str(session)}));self.assertRaisesRegex(RuntimeError,'closed.json',pack.require_closed_package_session,root);put(session,'closed.json','{}');pack.require_closed_package_session(root);put(root,'runtime/active-session.json',json.dumps({'sessionDirectory':str(root/'outside')}));self.assertRaisesRegex(RuntimeError,'outside',pack.require_closed_package_session,root)
 def test_installed_extension_evidence_and_image_dependencies_are_preserved(self):
  with tempfile.TemporaryDirectory() as d:
   source=pathlib.Path(d)/'source';stage=pathlib.Path(d)/'stage';put(source,'MANIFEST.json','{}');base='runtime/data/com.tauritavern.client/data/default-user/extensions/tisya-tavern/'
   for name in ['prompt-evidence/actual-request.json','protocol-evidence/test.log','assets/screenshots/help.webp','assets/ui-evidence/icon.png','assets/capture-1.webp']:put(source,base+name,'runtime fixture')
   put(source,'diagnostics/screenshots/page.png','private screenshot');put(source,'diagnostics/screenshots/page.txt','private screenshot metadata');rows,excluded=pack.inventory_package(source);paths={str(row[1]) for row in rows};self.assertEqual(len([x for x in paths if x.startswith(base)]),5);self.assertFalse(any(x.startswith('diagnostics/screenshots/') for x in paths))
   for path,relative,_ in rows:
    target=stage/relative;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(path,target)
   comparison=pack.verify_deployed_tisya(source,stage,True);self.assertTrue(comparison['matchesDeployedRuntime']);self.assertEqual(comparison['comparedFiles'],5);(stage/base/'protocol-evidence/test.log').unlink();self.assertRaisesRegex(RuntimeError,'omitted or changed',pack.verify_deployed_tisya,source,stage,True)
 def test_installed_extension_filter_conflicts_are_explicit(self):
  with tempfile.TemporaryDirectory() as d:
   source=pathlib.Path(d)/'source';stage=pathlib.Path(d)/'stage';put(source,'runtime/data/com.tauritavern.client/data/default-user/extensions/tisya-tavern/.env','not copied');self.assertRaisesRegex(RuntimeError,'credential/screenshot exclusion conflict',pack.verify_deployed_tisya,source,stage,True)
 def test_repackage_cli_roundtrip_preserves_current_payload_and_original_source(self):
  # Synthetic package data only; this checks snapshot integrity, not native application acceptance.
  with tempfile.TemporaryDirectory() as d:
   root=pathlib.Path(d);source=root/'used package';put(source,'MANIFEST.json','{"files":[],"historical":true}');put(source,'app/linux-host/usr/bin/tauritavern','synthetic non-native fixture');state=put(source,'runtime/data/com.tauritavern.client/data/default-user/chat.json','{"turn":3}');put(source,'runtime/data/com.tauritavern.client/data/default-user/secrets.json','{}');put(source,'runtime/sessions/current/closed.json','{}');put(source,'diagnostics/old-first-failure.json','{"kept":true}');put(source,'provenance/snapshot.json','{"window":35}');put(source,'tools/agent-api-server.mjs','// synthetic');put(source,'tools/simple-sheet.mjs','// synthetic');output=root/'new.zip';before=state.read_bytes()
   result=subprocess.run([sys.executable,str(HERE/'pack_test_tavern.py'),'--package-root',str(source),'--output',str(output),'--confirm-host-stopped'],capture_output=True,text=True,timeout=30);self.assertEqual(result.returncode,0,result.stderr+result.stdout);report=json.loads(result.stdout);self.assertTrue(report['verification']['allPayloadHashesMatch']);self.assertEqual(state.read_bytes(),before)
   with zipfile.ZipFile(output) as z:
    self.assertEqual(z.read('new/runtime/data/com.tauritavern.client/data/default-user/chat.json'),before);self.assertEqual(z.read('new/diagnostics/old-first-failure.json'),b'{"kept":true}');self.assertIn('new/diagnostics/previous-sessions/current/closed.json',z.namelist());self.assertTrue(any(n.startswith('new/provenance/history/snapshot-') for n in z.namelist()));self.assertEqual(json.loads(z.read('new/provenance/repackage-input.json'))['inheritedPayloadComparison'],'not asserted; this snapshot captures current state')
 def test_local_helper_assets_serve_only_fixed_public_files_without_forwarding(self):
  with tempfile.TemporaryDirectory() as d:
   root=pathlib.Path(d);tool=put(root,'tools/local_helper_assets.py',(HERE/'template/tools/local_helper_assets.py').read_text());base='runtime/data/com.tauritavern.client/data/default-user/extensions/JS-Slash-Runner/';put(root,base+'manifest.json','{"version":"fixture"}');put(root,base+'CHANGELOG.md','public fixture changes')
   with socket.socket() as probe:probe.bind(('127.0.0.1',0));port=probe.getsockname()[1]
   server=subprocess.Popen([sys.executable,str(tool),'--port',str(port)],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True);opener=urllib.request.build_opener(urllib.request.ProxyHandler({}));prefix='http://127.0.0.1:'+str(port)
   try:
    until=time.monotonic()+5
    while True:
     try:
      with opener.open(prefix+'/helper/manifest.json',timeout=.2) as response:self.assertEqual(response.read(),b'{"version":"fixture"}');break
     except OSError:
      if server.poll() is not None or time.monotonic()>until:raise
      time.sleep(.02)
    with opener.open(prefix+'/helper/CHANGELOG.md') as response:self.assertEqual(response.read(),b'public fixture changes')
    for path,method,status in [('/helper/manifest.json?chat=private','GET',404),('/runtime/private-chat.json','GET',404),('/helper/manifest.json','POST',405),('/helper/CHANGELOG.md','PUT',405)]:
     with self.assertRaises(urllib.error.HTTPError) as caught:opener.open(urllib.request.Request(prefix+path,method=method,data=None if method=='GET' else b'private body'))
     self.assertEqual(caught.exception.code,status)
   finally:server.terminate();stdout,stderr=server.communicate(timeout=5)
   self.assertNotIn('chat=private',stdout);self.assertNotIn('private body',stdout);self.assertNotIn('private-chat',stdout);self.assertEqual(stderr,'')
 def test_local_assets_wrapper_check_does_not_start_services_and_rejects_port_collision(self):
  with tempfile.TemporaryDirectory() as d:
   root=pathlib.Path(d);tool=put(root,'tools/native_session_local_assets.py',(HERE/'template/tools/native_session_local_assets.py').read_text());put(root,'tools/native_session.py','raise SystemExit(23)\n')
   checked=subprocess.run([sys.executable,str(tool),'--check'],capture_output=True,text=True);self.assertEqual(checked.returncode,23);self.assertFalse((root/'runtime').exists())
   conflict=subprocess.run([sys.executable,str(tool),'--api-port','8096'],capture_output=True,text=True);self.assertNotEqual(conflict.returncode,0);self.assertIn('reserved',conflict.stderr);self.assertFalse((root/'runtime').exists())
 def test_relocatable_supervisor_with_protocol_stubs(self):
  # Infrastructure smoke only. These temporary executables do not claim native TT validation.
  import shutil
  with tempfile.TemporaryDirectory(prefix='tavern smoke ') as d:
   root=pathlib.Path(d);shutil.copytree(HERE/'template',root/'package');package=root/'package';binary=put(package,'app/linux-host/usr/bin/tauritavern','#!/bin/sh\nexit 0\n');binary.chmod(0o755);binpath=root/'bin';binpath.mkdir()
   for name in ['node','Xvfb']:
    p=put(binpath,name,'#!/bin/sh\nexec /bin/sleep 10\n');p.chmod(0o755)
   p=put(binpath,'xauth','#!/bin/sh\nexit 0\n');p.chmod(0o755)
   driver='''#!/usr/bin/env python3
import http.server,json,sys
port=int(sys.argv[1].split('=')[1])
class Handler(http.server.BaseHTTPRequestHandler):
 def respond(self,value):
  self.send_response(200);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(json.dumps({'value':value}).encode())
 def do_GET(self):self.respond({'ready':True})
 def do_POST(self):self.rfile.read(int(self.headers.get('Content-Length',0)));self.respond({'sessionId':'protocol-smoke'})
 def do_DELETE(self):self.respond(None)
 def log_message(self,*args):pass
http.server.HTTPServer(('127.0.0.1',port),Handler).serve_forever()
'''
   p=put(binpath,'WebKitWebDriver',driver);p.chmod(0o755)
   with socket.socket() as probe:probe.bind(('127.0.0.1',0));port=probe.getsockname()[1]
   env=dict(os.environ);env['PATH']=str(binpath)+os.pathsep+env['PATH'];result=subprocess.run([sys.executable,str(package/'tools/native_session.py'),'--driver-port',str(port),'--hours','0.0004'],env=env,capture_output=True,text=True,timeout=10);self.assertEqual(result.returncode,0,result.stderr+result.stdout);active=json.loads((package/'runtime/active-session.json').read_text());session=pathlib.Path(active['sessionDirectory']);self.assertTrue(session.is_relative_to(package));self.assertTrue((session/'closed.json').is_file());self.assertEqual(json.loads((session/'session-end.json').read_text())['status'],200)
if __name__=='__main__':unittest.main(verbosity=2)
