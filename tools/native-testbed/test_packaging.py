import contextlib,hashlib,importlib.util,json,os,pathlib,socket,stat,subprocess,sys,tempfile,unittest,zipfile
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
