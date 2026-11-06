from pathlib import Path
import concurrent.futures,hashlib,json,lzma,re,shlex,subprocess,urllib.request,sys

ROOT=Path(sys.argv[1] if len(sys.argv)>1 else 'native-deps').resolve();ROOT.mkdir(exist_ok=True)
def fetch(url,path,expected=None):
 if path.exists() and (not expected or hashlib.sha256(path.read_bytes()).hexdigest()==expected):return path.read_bytes()
 with urllib.request.urlopen(url,timeout=40) as r:data=r.read()
 if expected and hashlib.sha256(data).hexdigest()!=expected:raise RuntimeError('Package/index SHA256 mismatch: '+path.name)
 path.write_bytes(data);return data
sources=[]
for line in Path('/etc/apt/sources.list.d/caas-snapshot.list').read_text().splitlines():
 if not line.startswith('deb '):continue
 parts=shlex.split(line);i=next(i for i,x in enumerate(parts) if x.startswith(('https://','http://')))
 if parts[i+1] in ['noble','noble-updates']:sources.append((parts[i].rstrip('/'),parts[i+1]))
jobs=[]
for uri,suite in sources:
 raw=fetch(uri+'/dists/'+suite+'/InRelease',ROOT/(suite+'-InRelease'))
 subprocess.run(['gpgv','--keyring','/usr/share/keyrings/ubuntu-archive-keyring.gpg',str(ROOT/(suite+'-InRelease'))],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
 sha_section=raw.decode().split('\nSHA256:\n',1)[1].split('\nSHA512:',1)[0]
 hashes={m[3]:m[1] for line in sha_section.splitlines() if (m:=re.match(r'^ ([0-9a-f]{64}) +(\d+) +(.+)$',line))}
 for component in ['main','universe']:
  name=component+'/binary-amd64/Packages.xz';jobs.append((uri,suite,name,hashes[name]))
def index(job):
 uri,suite,name,sha=job;data=fetch(uri+'/dists/'+suite+'/'+name,ROOT/(suite+'-'+name.replace('/','_')),sha)
 return uri,lzma.decompress(data).decode()
catalog={}
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
 for uri,text in pool.map(index,jobs):
  for paragraph in text.split('\n\n'):
   fields={line.split(': ',1)[0]:line.split(': ',1)[1] for line in paragraph.splitlines() if ': ' in line and not line.startswith(' ')}
   if 'Package' in fields:fields['uri']=uri;catalog[fields['Package']]=fields
print('Verified repository indexes; packages:',len(catalog),flush=True)
installed=set()
for line in subprocess.check_output(['dpkg-query','-W','-f=${binary:Package}\t${Status}\t${Provides}\n'],text=True).splitlines():
 p,status,*provides=line.split('\t')
 if status!='install ok installed':continue
 installed.add(p.split(':')[0])
 for item in ','.join(provides).split(','):
  if item.strip():installed.add(item.strip().split()[0])
roots=['xvfb','xauth','webkit2gtk-driver','libwebkit2gtk-4.1-0','libjavascriptcoregtk-4.1-0','libsoup-3.0-0']
chosen={};pending=list(roots)
while pending:
 name=pending.pop()
 if name in chosen:continue
 if name in installed and name not in roots:continue
 if name not in catalog:raise RuntimeError('Unresolved package: '+name)
 row=catalog[name];chosen[name]=row
 for group in (row.get('Pre-Depends','')+','+row.get('Depends','')).split(','):
  alternatives=[re.split(r'[ (:\[]',a.strip(),1)[0] for a in group.split('|') if a.strip()]
  if not alternatives or any(a in installed for a in alternatives):continue
  dep=next((a for a in alternatives if a in catalog),None)
  if not dep:raise RuntimeError('Unresolved dependency: '+group)
  pending.append(dep)
packages=ROOT/'packages';packages.mkdir(exist_ok=True);sysroot=ROOT/'sysroot';sysroot.mkdir(exist_ok=True)
def package(item):
 name,row=item;path=packages/Path(row['Filename']).name;data=fetch(row['uri']+'/'+row['Filename'],path,row['SHA256'])
 return name,row,path,len(data)
manifest=[]
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
 for name,row,path,size in pool.map(package,chosen.items()):
  subprocess.run(['dpkg-deb','-x',str(path),str(sysroot)],check=True)
  manifest.append({'package':name,'version':row['Version'],'file':path.name,'sha256':row['SHA256'],'bytes':size,'source':row['uri']+'/'+row['Filename']})
  print('Extracted',name,flush=True)
(ROOT/'manifest.json').write_text(json.dumps({'method':'Signed Ubuntu snapshot metadata, SHA256 package verification, extract only; no system installation or maintainer scripts','packages':manifest},indent=2)+'\n')
print(json.dumps({'sysroot':str(sysroot),'packages':len(manifest),'verified':True}),flush=True)
