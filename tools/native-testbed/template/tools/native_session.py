#!/usr/bin/env python3
"""Relocatable native TT + WebKit driver + local response queue supervisor."""
import argparse,datetime,fcntl,json,os,pathlib,secrets,shutil,signal,subprocess,sys,time,urllib.error,urllib.request
ROOT=pathlib.Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser(description=__doc__);p.add_argument('--desktop',action='store_true',help='Use the current desktop instead of WebDriver/Xvfb');p.add_argument('--hours',type=float,default=2);p.add_argument('--api-port',type=int,default=8095);p.add_argument('--driver-port',type=int,default=4444);p.add_argument('--display-number',type=int,default=91);p.add_argument('--unix-display',action='store_true',help='Use a local X socket instead of TCP; unsuitable for the original isolated executor');p.add_argument('--check',action='store_true',help='Check prerequisites without starting or changing the saved state');a=p.parse_args()
binary=ROOT/'app/linux-host/usr/bin/tauritavern';required=['node','python3']+([] if a.desktop else ['Xvfb','WebKitWebDriver','xauth']);missing=[x for x in required if not shutil.which(x)]
if not binary.is_file():missing.append(str(binary))
if missing:raise SystemExit('Missing prerequisites: '+', '.join(missing))
if a.hours<=0:raise SystemExit('--hours must be positive')
if a.check:
 result=subprocess.run(['ldd',str(binary)],text=True,capture_output=True);print(result.stdout);print(json.dumps({'requiredCommands':required,'binaryExists':True,'missingSharedLibraries':'not found' in result.stdout}));raise SystemExit(1 if 'not found' in result.stdout else 0)
runtime=ROOT/'runtime';runtime.mkdir(exist_ok=True);lock=open(runtime/'.supervisor.lock','a');
try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
except BlockingIOError:raise SystemExit('Another supervisor is already using this package runtime')
stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ');session_dir=runtime/'sessions'/stamp;session_dir.mkdir(parents=True,exist_ok=False);commands=session_dir/'commands';commands.mkdir();api_queue=session_dir/'api-queue';run=session_dir/'run';run.mkdir(mode=0o700)
for name in ['data','config','cache']:(runtime/name).mkdir(exist_ok=True)
env=dict(os.environ);env.update(XDG_DATA_HOME=str(runtime/'data'),XDG_CONFIG_HOME=str(runtime/'config'),XDG_CACHE_HOME=str(runtime/'cache'),XDG_RUNTIME_DIR=str(run));deadline=datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(hours=a.hours)
children=[];logs=[];session_id=None;stop=False
opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
def write(path,obj):path.write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n')
def launch(args,name):
 f=open(session_dir/(name+'.log'),'w');logs.append(f);child=subprocess.Popen(args,env=env,stdout=f,stderr=subprocess.STDOUT);children.append(child);return child
def request(method,path,body=None,timeout=45):
 raw=None if body is None else json.dumps(body).encode();req=urllib.request.Request('http://127.0.0.1:'+str(a.driver_port)+path,data=raw,method=method,headers={'Content-Type':'application/json'})
 try:
  with opener.open(req,timeout=timeout) as response:return {'status':response.status,'body':json.loads(response.read())}
 except urllib.error.HTTPError as error:return {'status':error.code,'body':json.loads(error.read())}
def signal_stop(*_):
 global stop;stop=True
signal.signal(signal.SIGTERM,signal_stop);signal.signal(signal.SIGINT,signal_stop)
try:
 api=launch(['node',str(ROOT/'tools/agent-api-server.mjs'),str(api_queue),str(a.api_port),deadline.isoformat()],'api-server')
 if a.desktop:
  if not (env.get('DISPLAY') or env.get('WAYLAND_DISPLAY')):raise RuntimeError('Desktop mode needs an existing desktop DISPLAY/WAYLAND_DISPLAY')
  host=launch([str(binary)],'tauritavern');write(runtime/'active-session.json',{'mode':'desktop','sessionDirectory':str(session_dir),'apiQueue':str(api_queue),'commands':str(commands)})
 else:
  number=':'+str(a.display_number);display=number if a.unix_display else '127.0.0.1'+number;env.update(DISPLAY=display,TAURI_WEBVIEW_AUTOMATION='true');auth=session_dir/'Xauthority';auth.touch(mode=0o600);cookie=secrets.token_hex(16)
  for address in [number,'127.0.0.1'+number]:subprocess.run(['xauth','-f',str(auth),'add',address,'MIT-MAGIC-COOKIE-1',cookie],check=True,capture_output=True)
  env['XAUTHORITY']=str(auth)
  xargs=['Xvfb',number,'-screen','0','1280x900x24','-auth',str(auth)]+(['-nolisten','tcp'] if a.unix_display else ['-nolisten','unix','-nolisten','local','-listen','tcp'])
  xvfb=launch(xargs,'xvfb');time.sleep(.6);driver=launch(['WebKitWebDriver','--port='+str(a.driver_port)],'webdriver')
  for _ in range(40):
   if driver.poll() is not None:raise RuntimeError('WebDriver exited before creating the native session')
   try:status=request('GET','/status',timeout=1);break
   except Exception:time.sleep(.2)
  else:raise RuntimeError('WebDriver was not ready')
  write(session_dir/'webdriver-status.json',status)
  if api.poll() is not None:raise RuntimeError('Local API server exited; check its log and whether the port is already in use')
  started=request('POST','/session',{'capabilities':{'alwaysMatch':{'browserName':'wry','webkitgtk:browserOptions':{'binary':str(binary),'args':[]}}}});write(session_dir/'session-start.json',started);session_id=started.get('body',{}).get('value',{}).get('sessionId')
  if not session_id:raise RuntimeError('Native session creation failed; see session-start.json')
  write(runtime/'active-session.json',{'mode':'automation','sessionId':session_id,'sessionDirectory':str(session_dir),'apiQueue':str(api_queue),'commands':str(commands),'created':datetime.datetime.now(datetime.timezone.utc).isoformat()})
 print(json.dumps({'ready':True,'mode':'desktop' if a.desktop else 'automation','sessionDirectory':str(session_dir),'apiQueue':str(api_queue),'stopFile':str(session_dir/'stop.json')}),flush=True)
 while not stop and datetime.datetime.now(datetime.timezone.utc)<deadline:
  if (session_dir/'stop.json').exists():break
  if a.desktop:
   if host.poll() is not None:break
  else:
   for path in sorted(commands.glob('*.request.json')):
    response=path.with_name(path.name.replace('.request.json','.response.json'))
    if response.exists():continue
    try:
     cmd=json.loads(path.read_text())
     if cmd.get('native'):
      argv=cmd['native']
      if not isinstance(argv,list) or not argv or argv[0] not in ['xdotool','xwininfo','xwd']:raise ValueError('Unsupported native inspection tool')
      native=subprocess.run(argv,env=env,capture_output=True,text=True,timeout=10);result={'status':native.returncode,'stdout':native.stdout,'stderr':native.stderr}
     else:
      route=cmd.get('path','/execute/sync');route=route if route.startswith('/session/') else '/session/'+session_id+route;result=request(cmd.get('method','POST'),route,cmd.get('body'),timeout=cmd.get('timeout',45))
    except Exception as error:result={'error':str(error)}
    write(response,result)
  time.sleep(.1)
except Exception as error:
 write(session_dir/'supervisor-failure.json',{'message':str(error)});print(str(error),file=sys.stderr);sys.exitcode=1
finally:
 if session_id:
  try:write(session_dir/'session-end.json',request('DELETE','/session/'+session_id,timeout=10))
  except Exception as error:write(session_dir/'session-end.json',{'error':str(error)})
 for child in reversed(children):
  if child.poll() is None:child.terminate()
 for child in reversed(children):
  try:child.wait(timeout=10)
  except subprocess.TimeoutExpired:child.kill();child.wait()
 for handle in logs:handle.close()
 write(session_dir/'closed.json',{'closedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()})
raise SystemExit(getattr(sys,'exitcode',0))
