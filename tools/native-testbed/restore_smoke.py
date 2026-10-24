#!/usr/bin/env python3
"""Open an extracted snapshot in the real native host, inspect, then stop it."""
import argparse,datetime,json,pathlib,subprocess,time
p=argparse.ArgumentParser();p.add_argument('package_root',type=pathlib.Path);p.add_argument('--output',type=pathlib.Path,required=True);p.add_argument('--display-number',type=int,default=92);p.add_argument('--api-port',type=int,default=8097);p.add_argument('--driver-port',type=int,default=4445);a=p.parse_args();root=a.package_root.resolve()
if (root/'runtime/active-session.json').exists():raise SystemExit('Use a fresh extracted copy for this check')
record={'startedUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'packageRoot':str(root),'boundary':'Actual TauriTavern startup from extracted bytes and read-only page inspection; no generation or full-flow claim'}
check=subprocess.run(['python3',str(root/'tools/verify-package.py')],capture_output=True,text=True);record['payloadVerificationExit']=check.returncode
if check.returncode:raise SystemExit('Payload verification failed before starting the host')
a.output.parent.mkdir(parents=True,exist_ok=True);log=a.output.with_suffix('.log');session=None;host=None
try:
 with log.open('w') as stream:
  host=subprocess.Popen(['bash',str(root/'start-tavern.sh'),'--hours','0.025','--api-port',str(a.api_port),'--driver-port',str(a.driver_port),'--display-number',str(a.display_number)],stdout=stream,stderr=subprocess.STDOUT)
  until=time.monotonic()+55
  while not (root/'runtime/active-session.json').exists():
   if host.poll() is not None:raise RuntimeError('Restored native supervisor exited before readiness')
   if time.monotonic()>until:raise TimeoutError('Restored native session startup timed out')
   time.sleep(.1)
  session=json.loads((root/'runtime/active-session.json').read_text());commands=pathlib.Path(session['commands']);record['sessionId']=session.get('sessionId')
  for attempt in range(12):
   name='restore-smoke-'+str(attempt).zfill(2);request=commands/(name+'.request.json');response=commands/(name+'.response.json')
   script="return {title:document.title,state:document.readyState,tauri:typeof window.__TAURI__,tisya:typeof Tisya==='undefined'?null:Tisya.version,helper:typeof window.TavernHelper,mvu:typeof window.Mvu,cardName:typeof SillyTavern==='undefined'?null:(SillyTavern.getContext().characters?.[SillyTavern.getContext().characterId]?.name??null)};"
   request.write_text(json.dumps({'body':{'script':script,'args':[]}}));until=time.monotonic()+12
   while not response.exists():
    if host.poll() is not None:raise RuntimeError('Restored native supervisor stopped during inspection')
    if time.monotonic()>until:raise TimeoutError('Read-only native inspection timed out')
    time.sleep(.1)
   result=json.loads(response.read_text());record['inspection']=result;value=result.get('body',{}).get('value',{})
   if result.get('status')==200 and value.get('title')=='TauriTavern' and value.get('state')=='complete' and value.get('tisya'):break
   time.sleep(.4)
  else:raise RuntimeError('Restored window did not expose the expected loaded plugin')
  record['passed']=True
except Exception as error:record.update(passed=False,error=str(error))
finally:
 if session:
  directory=pathlib.Path(session['sessionDirectory']);(directory/'stop.json').write_text('{}\n')
 if host:
  try:host.wait(timeout=20)
  except subprocess.TimeoutExpired:
   host.terminate()
   try:host.wait(timeout=20)
   except subprocess.TimeoutExpired:host.kill();host.wait()
  record['supervisorExit']=host.returncode
 if session:record['closedReceipt']=(pathlib.Path(session['sessionDirectory'])/'closed.json').exists()
 record['finishedUtc']=datetime.datetime.now(datetime.timezone.utc).isoformat();a.output.write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps(record,ensure_ascii=False,indent=2))
raise SystemExit(0 if record.get('passed') and record.get('closedReceipt') else 1)
