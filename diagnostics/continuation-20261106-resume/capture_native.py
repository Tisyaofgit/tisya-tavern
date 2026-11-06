import pathlib,json,hashlib,shutil,tarfile,datetime,sys
root=pathlib.Path(__file__).parent
stage=root/'native-snapshot'
stage.mkdir(exist_ok=True)
def copy(src,dst):
    src=root/src;dst=stage/dst
    if src.is_dir():shutil.copytree(src,dst,dirs_exist_ok=True)
    else:dst.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(src,dst)
for name in ['stopped-state.json','final-state.json','valid-reply.png']:
    copy('native-evidence/'+name,'exports/'+name)
copy('native-dialog.png','evidence/endpoint-authorization.png')
copy('native-host/tools','harness')
for session in ['20261106T143641272825Z','20261106T143837041495Z']:
    copy('native-host/runtime/sessions/'+session,'sessions/'+session)
# Socket and authorization cookie are ephemeral, not recovery state.
for p in list((stage/'sessions').rglob('*')):
    if p.name=='Xauthority' or not p.is_file() and not p.is_dir():p.unlink(missing_ok=True)
data=pathlib.Path('native-host/runtime/data/com.tauritavern.client')
for name in ['databases','localstorage','security','data/default-user/chats','data/default-user/settings.json','data/default-user/characters/default_Seraphina.png','data/default-user/OpenAI Settings/Tisya.json']:
    copy(data/name,pathlib.Path('profile')/name)
binary=root/'native-host/app/linux-host/usr/bin/tauritavern'
meta={'utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'host':'TauriTavern 2.4.0 main fff9af0333be, Linux x86_64 WebKitGTK','binary_sha256':hashlib.sha256(binary.read_bytes()).hexdigest(),'source_tree':'e8a4e648200cac063d02dcac0192480fb3012d80','profile':'fresh isolated profile, no user chat or model credentials copied','fixture_provider':'deterministic local API, not real model','restore':'Extract archive; exports contain portable exact chat/metadata/config/bundle. profile contains native saved files and IndexedDB/localstorage after clean shutdown. Install extension from the checkpoint Git tree and use matching TT host. Do not merge this isolated profile into a user profile.'}
(stage/'provenance.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2))
manifest=[{'path':str(p.relative_to(stage)),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}for p in sorted(stage.rglob('*'))if p.is_file()]
(stage/'MANIFEST.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
out=root/'legacy-new/diagnostics/continuation-20261106-resume/native-host-state.tar.gz'
with tarfile.open(out,'w:gz')as t:
    for p in sorted(stage.rglob('*')):
        if p.is_file():t.add(p,arcname=str(p.relative_to(stage)),recursive=False)
restore=root/'native-snapshot-restore';restore.mkdir(exist_ok=True)
with tarfile.open(out)as t:t.extractall(restore,filter='data')
for item in manifest:
    p=restore/item['path'];assert p.stat().st_size==item['bytes'];assert hashlib.sha256(p.read_bytes()).hexdigest()==item['sha256']
receipt={'archive_bytes':out.stat().st_size,'sha256':hashlib.sha256(out.read_bytes()).hexdigest(),'restored_files':len(manifest),'verified':True,'utc':meta['utc']}
(root/'legacy-new/diagnostics/continuation-20261106-resume/native-restore.json').write_text(json.dumps(receipt,indent=2))
print(json.dumps(receipt))
