#!/usr/bin/env python3
"""Verify the extracted payload against MANIFEST.json, without running it."""
import hashlib,json,pathlib,sys
root=pathlib.Path(__file__).resolve().parents[1];manifest=json.loads((root/'MANIFEST.json').read_text());errors=[]
for entry in manifest['files']:
 relative=pathlib.PurePosixPath(entry['path'])
 if relative.is_absolute() or '..' in relative.parts:errors.append(entry['path']+' unsafe path');continue
 path=root/relative
 if not path.is_file():errors.append(entry['path']+' missing');continue
 h=hashlib.sha256()
 with path.open('rb') as f:
  for block in iter(lambda:f.read(1024*1024),b''):h.update(block)
 if path.stat().st_size!=entry['size'] or h.hexdigest()!=entry['sha256']:errors.append(entry['path']+' changed')
print(json.dumps({'verifiedFiles':len(manifest['files']),'errors':errors},ensure_ascii=False,indent=2));raise SystemExit(bool(errors))
