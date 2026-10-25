#!/usr/bin/env python3
"""Start and close the native supervisor with its two local public assets."""
import datetime,hashlib,json,signal,subprocess,sys,time,urllib.request
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
args=sys.argv[1:]
if '--check' in args:
 raise SystemExit(subprocess.run([sys.executable,str(ROOT/'tools/native_session.py'),*args]).returncode)
for index,arg in enumerate(args):
 if arg=='--api-port' and index+1<len(args) and args[index+1]=='8096' or arg=='--api-port=8096':
  raise SystemExit('Port 8096 is reserved for the two local helper assets; choose another API port')

stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
record_dir=ROOT/'runtime/helper-assets'/stamp;record_dir.mkdir(parents=True,exist_ok=False)
log=(record_dir/'server.log').open('w');assets=None;supervisor=None;result=1;error=None
def stop(*_):
 if supervisor is not None and supervisor.poll() is None:supervisor.terminate()
signal.signal(signal.SIGTERM,stop);signal.signal(signal.SIGINT,stop)
try:
 assets=subprocess.Popen([sys.executable,str(ROOT/'tools/local_helper_assets.py')],stdout=log,stderr=subprocess.STDOUT)
 expected=(ROOT/'runtime/data/com.tauritavern.client/data/default-user/extensions/JS-Slash-Runner/manifest.json').read_bytes()
 opener=urllib.request.build_opener(urllib.request.ProxyHandler({}));deadline=time.monotonic()+5
 while True:
  if assets.poll() is not None:raise RuntimeError('Local helper asset server exited before readiness; check its log')
  try:
   with opener.open('http://127.0.0.1:8096/helper/manifest.json',timeout=.3) as response:
    if response.status==200 and response.read()==expected:break
  except OSError:pass
  if time.monotonic()>deadline:raise TimeoutError('Local helper asset server was not ready with the expected fixed manifest')
  time.sleep(.05)
 # Confirm the newly launched server survived binding, rather than trusting another listener.
 time.sleep(.05)
 if assets.poll() is not None:raise RuntimeError('Local helper asset server could not retain its port')
 (record_dir/'ready.json').write_text(json.dumps({'readyUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'manifestSha256':hashlib.sha256(expected).hexdigest(),'upstreamForwarding':False})+'\n')
 supervisor=subprocess.Popen([sys.executable,str(ROOT/'tools/native_session.py'),*args]);result=supervisor.wait()
except Exception as caught:
 error=str(caught);print(error,file=sys.stderr)
finally:
 if supervisor is not None and supervisor.poll() is None:
  supervisor.terminate()
  try:supervisor.wait(timeout=30)
  except subprocess.TimeoutExpired:supervisor.kill();supervisor.wait()
 if assets is not None:
  assets.terminate()
  try:assets.wait(timeout=5)
  except subprocess.TimeoutExpired:assets.kill();assets.wait()
 log.close()
 (record_dir/'closed.json').write_text(json.dumps({'closedUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'supervisorExit':None if supervisor is None else supervisor.returncode,'assetServerExit':None if assets is None else assets.returncode,'error':error})+'\n')
raise SystemExit(result)
