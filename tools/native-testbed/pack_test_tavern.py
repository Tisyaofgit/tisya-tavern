#!/usr/bin/env python3
"""Prepare a private, relocatable Linux TT snapshot only after the host stops."""
import argparse,collections,datetime,hashlib,json,os,pathlib,re,shutil,stat,subprocess,tempfile,zipfile
HERE=pathlib.Path(__file__).resolve().parent
SKIP_DIRS={'.git','.svn','node_modules','__pycache__','ui-evidence','screenshots','browser-screenshots'}
SKIP_NAMES={'lock','SingletonLock','SingletonCookie','SingletonSocket','Xauthority','.Xauthority','Cookies','cookies.sqlite','cookies.db'}
TEXT_SUFFIXES={'.json','.jsonl','.txt','.md','.log','.tap','.patch','.mjs','.py','.sha256','.sh','.tsv'}
CREDENTIAL_KEYS={'apikey','customapikey','secretkey','password','authorization','accesstoken','refreshtoken','clientsecret'}
PLACEHOLDERS={'localfakeapi','localfake','fake','test','dummy','placeholder','sk-test','test-key','local-test'}
UNUSED_MATERIALS={'char0420261023.json','78f869726412494d88d8062674b14b43-chara.json','78f869726412494d88d8062674b14b43.png'}
def sha(path):
 h=hashlib.sha256()
 with path.open('rb') as f:
  for block in iter(lambda:f.read(1024*1024),b''):h.update(block)
 return h.hexdigest()
def write(path,obj):path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n')
def running_host(source):
 target=(source/'linux-host/usr/bin/tauritavern').resolve();found=[]
 for process in pathlib.Path('/proc').glob('[0-9]*'):
  try:
   name=process.joinpath('comm').read_text().strip().lower()
   if name!='tauritavern':continue
   if ') Z ' in process.joinpath('stat').read_text():continue
   try:executable=process.joinpath('exe').readlink()
   except PermissionError:found.append(int(process.name));continue
   if pathlib.Path(executable).resolve()==target:found.append(int(process.name))
  except (OSError,RuntimeError):pass
 return found
def screenshot_command_pairs(runtime):
 excluded=set()
 for request in (runtime/'commands').glob('*.request.json'):
  try:
   value=json.loads(request.read_text());route=str(value.get('path',''))
   if 'screenshot' in route.lower() or value.get('native',[None])[0]=='xwd':excluded.update([request,request.with_name(request.name.replace('.request.json','.response.json'))])
  except (ValueError,OSError):pass
 return excluded
def excluded_path(path,rel,group,screen_pairs):
 if path in screen_pairs:return 'browser screenshot command or response'
 if any(part in SKIP_DIRS for part in rel.parts):return 'non-runtime cache/source evidence directory'
 if path.name in SKIP_NAMES or path.name.startswith('.env') or path.name.endswith(('.pid','.lock','.sock','.socket','-shm')):return 'transient state or credential/cookie cache'
 if group=='runtime' and 'extensions' in rel.parts and any(part in {'tests','docs','.github','tools','prompt-evidence','protocol-evidence','config-evidence'} for part in rel.parts):return 'non-runtime extension source/evidence'
 if group=='diagnostics' and (path.suffix.lower() not in TEXT_SUFFIXES or re.search(r'(^|[-_])(screen(?:shot)?|capture)[-_\d.]',path.name,re.I)):return 'non-text diagnostic or browser screenshot'
 if group=='materials' and path.name in UNUSED_MATERIALS:return 'inspected but not used in the KPOP/VI/Luc testbed; provenance remains in diagnostics'
 return None
def inventory(source):
 runtime=source/'linux-runtime-state';pairs=screenshot_command_pairs(runtime);result=[];excluded=[]
 def add(root,prefix,group):
  if not root.exists():return
  for directory,dirs,names in os.walk(root,followlinks=False):
   dirs[:]=[d for d in dirs if d not in SKIP_DIRS]
   for name in sorted(names):
    path=pathlib.Path(directory)/name;rel=path.relative_to(root);why=excluded_path(path,rel,group,pairs)
    if why:excluded.append({'path':str(path.relative_to(source)),'reason':why});continue
    if path.is_symlink():raise RuntimeError('Review symbolic link before packaging: '+str(path))
    if not path.is_file():excluded.append({'path':str(path.relative_to(source)),'reason':'not a regular file'});continue
    result.append((path,pathlib.PurePosixPath(prefix)/rel,group))
 add(source/'linux-host','app/linux-host','app')
 for name in ['data','config','cache']:add(runtime/name,'runtime/'+name,'runtime')
 add(source/'fullflow-inputs','materials','materials')
 add(runtime/'commands','diagnostics/native-commands','diagnostics')
 for queue in sorted(runtime.glob('api-queue*')):
  if queue.is_dir():add(queue,'diagnostics/'+queue.name,'diagnostics')
 for logs in sorted(runtime.glob('run-*')):
  if logs.is_dir():add(logs,'diagnostics/native-runs/'+logs.name,'diagnostics')
 for session in sorted((runtime/'sessions').glob('*')) if (runtime/'sessions').exists() else []:add(session,'diagnostics/previous-sessions/'+session.name,'diagnostics')
 add(source/'tisya-w33/docs/validation/w35-fullflow','diagnostics/fullflow','diagnostics')
 for path in sorted(runtime.iterdir()):
  if not path.is_file() or path.suffix not in TEXT_SUFFIXES:continue
  why=excluded_path(path,pathlib.Path(path.name),'diagnostics',pairs)
  if why:excluded.append({'path':str(path.relative_to(source)),'reason':why});continue
  result.append((path,pathlib.PurePosixPath('diagnostics/native-state')/path.name,'diagnostics'))
 return result,excluded

def credential_check(path,group):
 if path.name.lower()=='secrets.json':
  data=json.loads(path.read_text())
  if data!={}:raise RuntimeError('Refusing nonempty secrets file: '+str(path))
  return 'empty-secrets'
 if group=='diagnostics' and path.name.endswith('.response.json'):
  raw=path.read_text(errors='replace')
  if re.search(r'(?:data:image/[^;,]+;base64,|iVBORw0KGgo)[A-Za-z0-9+/=]{1000}',raw):return 'screenshot-response'
 # Inspect settings payloads, including native backups, without printing values.
 if group=='runtime' and path.suffix=='.json' and 'extensions' not in path.parts:
  try:data=json.loads(path.read_text())
  except (ValueError,UnicodeError):return None
  def visit(value,trail=()):
   if isinstance(value,dict):
    for key,child in value.items():
     normalized=re.sub(r'[_ -]','',key.lower())
     if normalized in CREDENTIAL_KEYS and isinstance(child,str) and child.strip():
      normalized_value=child.strip().lower().removeprefix('bearer ')
      if normalized_value not in PLACEHOLDERS:raise RuntimeError('Non-test credential field in '+str(path)+' at '+'.'.join(trail+(key,)))
     visit(child,trail+(key,))
   elif isinstance(value,list):
    for index,child in enumerate(value):visit(child,trail+(str(index),))
  visit(data)
 return None

def gather_provenance(source,stage):
 prov=stage/'provenance';prov.mkdir(exist_ok=True)
 shutil.copy2('/etc/os-release',prov/'os-release.txt')
 for args,name in [(['dpkg-query','-W','-f=${binary:Package}\t${Version}\t${Architecture}\n'],'apt-installed.tsv'),(['ldd',str(source/'linux-host/usr/bin/tauritavern')],'native-shared-libraries.txt'),(['node','--version'],'node-version.txt'),(['python3','--version'],'python-version.txt')]:
  result=subprocess.run(args,capture_output=True,text=True,check=False);(prov/name).write_text(result.stdout+result.stderr)
 extensions=source/'linux-runtime-state/data/com.tauritavern.client/data/default-user/extensions';rows=[]
 for manifest in sorted(extensions.glob('*/manifest.json')):
  value=json.loads(manifest.read_text());rows.append({'directory':manifest.parent.name,'displayName':value.get('display_name'),'version':value.get('version'),'homePage':value.get('homePage'),'manifestSha256':sha(manifest)})
 write(prov/'installed-extensions.json',rows)
 for path,name in [(source/'native-dependencies/JS-Slash-Runner-source.json','helper-source.json'),(source/'tisya-w33/docs/validation/w35-fullflow/linux-runtime/release-v2.4.0.json','tt-release-v2.4.0.json'),(source/'tisya-w33/docs/validation/w35-fullflow/native-dependencies/source-check.json','external-script-checks.json')]:
  if path.exists():shutil.copy2(path,prov/name)
 source_checkpoint=source/'w35-publish/remote-save.json'
 if source_checkpoint.is_file():shutil.copy2(source_checkpoint,prov/'tisya-source-checkpoint.json')
 freeze=source/'meta/runtime-freeze-w35-1907.json'
 if freeze.is_file():
  frozen=json.loads(freeze.read_text());installed=extensions/'tisya-tavern';differences=[]
  for member in frozen['files']:
   path=installed/member['path']
   if not path.is_file() or sha(path)!=member['sha256']:differences.append(member['path'])
  write(prov/'installed-tisya-freeze-comparison.json',{'freezeVersion':frozen.get('version'),'freezeUtc':frozen.get('utc'),'freezeManifestSha256':sha(freeze),'comparedFiles':len(frozen['files']),'differences':differences,'matchesFrozenRuntime':not differences})


def verify_archive(archive,destination):
 with zipfile.ZipFile(archive) as z:
  names=z.namelist();roots={pathlib.PurePosixPath(n).parts[0] for n in names};assert len(roots)==1,'Expected one package root';root=roots.pop()
  for item in z.infolist():
   parts=pathlib.PurePosixPath(item.filename).parts
   if item.filename.startswith('/') or '..' in parts or stat.S_ISLNK(item.external_attr>>16):raise RuntimeError('Unsafe archive member')
  z.extractall(destination)
  for item in z.infolist():
   target=destination/item.filename
   if target.is_file():target.chmod((item.external_attr>>16)&0o777 or 0o600)
 extracted=destination/root;manifest=json.loads((extracted/'MANIFEST.json').read_text());count=0
 for row in manifest['files']:
  path=extracted/row['path']
  if path.stat().st_size!=row['size'] or sha(path)!=row['sha256']:raise RuntimeError('Extracted checksum mismatch: '+row['path'])
  count+=1
 if json.loads((extracted/'runtime/data/com.tauritavern.client/data/default-user/secrets.json').read_text())!={}:raise RuntimeError('Extracted secrets are not empty')
 return {'verifiedPayloadFiles':count,'extractedRoot':str(extracted),'allPayloadHashesMatch':True,'secretsEmpty':True}


def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--source-root',type=pathlib.Path,default=HERE.parent);p.add_argument('--output',type=pathlib.Path);p.add_argument('--plan',action='store_true');p.add_argument('--confirm-host-stopped',action='store_true');a=p.parse_args();source=a.source_root.resolve();entries,excluded=inventory(source)
 if a.plan:
  groups=collections.defaultdict(lambda:{'files':0,'bytes':0})
  for path,_,group in entries:groups[group]['files']+=1;groups[group]['bytes']+=path.stat().st_size
  print(json.dumps({'mode':'metadata-only-plan','groups':dict(groups),'excludedCount':len(excluded),'sourceHostRunningPids':running_host(source)},indent=2));return
 if not a.confirm_host_stopped:raise SystemExit('Stop the native supervisor first, then use --confirm-host-stopped')
 if running_host(source):raise SystemExit('Native TauriTavern is still running. No snapshot was taken.')
 if not a.output:raise SystemExit('--output FILE.zip is required')
 output=a.output.resolve()
 if output.exists():raise SystemExit('Output already exists; choose a new archive name')
 output.parent.mkdir(parents=True,exist_ok=True)
 with tempfile.TemporaryDirectory(prefix='tavern-stage-',dir=output.parent) as temporary:
  stage=pathlib.Path(temporary)/output.stem;shutil.copytree(HERE/'template',stage,ignore=shutil.ignore_patterns('__pycache__','*.pyc'));counts=collections.Counter();total=0
  for path,relative,group in entries:
   verdict=credential_check(path,group)
   if verdict=='screenshot-response':excluded.append({'path':str(path.relative_to(source)),'reason':'embedded browser screenshot response'});continue
   target=stage/relative;target.parent.mkdir(parents=True,exist_ok=True);before=path.stat();shutil.copy2(path,target);after=path.stat()
   if (before.st_size,before.st_mtime_ns)!=(after.st_size,after.st_mtime_ns):raise RuntimeError('Source changed during snapshot: '+str(path))
   counts[group]+=1;total+=target.stat().st_size
  tools=stage/'tools';api=source/'tisya-w33/docs/validation/w35-fullflow/flow-driver/agent-api-server.mjs';code=api.read_text();old="from '../../../../tables/simple-sheet.js'"
  if old not in code:raise RuntimeError('Agent API import changed; review its packaging path')
  (tools/'agent-api-server.mjs').write_text(code.replace(old,"from './simple-sheet.mjs'",1));shutil.copy2(source/'tisya-w33/tables/simple-sheet.js',tools/'simple-sheet.mjs');shutil.copy2(HERE/'restore_smoke.py',tools/'restore-smoke.py');gather_provenance(source,stage)
  write(stage/'provenance/exclusions.json',excluded);write(stage/'provenance/snapshot.json',{'createdUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'hostStoppedCheckPassed':True,'groups':dict(counts),'payloadSourceBytes':total,'private':True,'offlineGuaranteed':False,'platform':'Linux x86_64 Ubuntu 24.04 testbed','credentialPolicy':'secrets.json must be {}; populated credential settings must be known test placeholders','runtimeToolTransforms':['Agent API imports colocated simple-sheet.mjs; launcher and queue client resolve package-relative paths']})
  files=[]
  for path in sorted(stage.rglob('*')):
   if path.is_file():files.append({'path':path.relative_to(stage).as_posix(),'size':path.stat().st_size,'sha256':sha(path),'mode':oct(stat.S_IMODE(path.stat().st_mode))})
  write(stage/'MANIFEST.json',{'format':'tisya.native-testbed/1','files':files,'note':'Payload hashes; this manifest is covered by the external per-member SHA list.'})
  with zipfile.ZipFile(output,'x',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
   for path in sorted(stage.rglob('*')):
    if path.is_file():z.write(path,output.stem+'/'+path.relative_to(stage).as_posix())
 member_lines=[]
 with zipfile.ZipFile(output) as z:
  if z.testzip() is not None:raise RuntimeError('ZIP CRC verification failed')
  for item in z.infolist():member_lines.append(hashlib.sha256(z.read(item)).hexdigest()+'  '+item.filename)
 output.with_suffix('.members.sha256').write_text('\n'.join(member_lines)+'\n');output.with_suffix('.zip.sha256').write_text(sha(output)+'  '+output.name+'\n')
 verify_dir=output.parent/(output.stem+'-extracted-verification');verify_dir.mkdir(exist_ok=False);verification=verify_archive(output,verify_dir);write(output.with_suffix('.verification.json'),verification)
 print(json.dumps({'archive':str(output),'bytes':output.stat().st_size,'sha256':sha(output),'members':len(member_lines),'memberSha256':str(output.with_suffix('.members.sha256')),'verification':verification},indent=2))
if __name__=='__main__':main()
