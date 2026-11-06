#!/usr/bin/env python3
"""Capture a closed isolated native host, including every split settings shard.

Executable/extension dependencies stay at their pinned source identities. The
caller supplies metadata and control files; this command never uploads anything.
"""
import argparse
import datetime
import hashlib
import json
import shutil
from pathlib import Path

EXTENSIONS = Path('com.tauritavern.client/data/default-user/extensions')
REBUILDABLE = {'CacheStorage', 'WebKitCache'}


def capture(host, output, metadata, controls=None):
    host, output = Path(host).resolve(), Path(output).resolve()
    runtime = host / 'runtime'
    active = runtime / 'active-session.json'
    if active.exists():
        session = json.loads(active.read_text())
        directory = Path(session['sessionDirectory']).resolve()
        if runtime not in directory.parents or not (directory / 'closed.json').is_file():
            raise RuntimeError('Native host has no normal close receipt; stop before capture')
    if output.exists():
        raise FileExistsError('Use a new checkpoint directory')
    output.mkdir(parents=True)
    copied = []
    excluded = []
    for section in ('data', 'config'):
        root = runtime / section
        if not root.exists():
            continue
        for source in sorted(root.rglob('*')):
            relative = source.relative_to(root)
            if source.is_symlink():
                raise RuntimeError('Unexpected state symlink: ' + str(source))
            if not source.is_file():
                continue
            if section == 'data' and (relative == EXTENSIONS or EXTENSIONS in relative.parents or
                    (len(relative.parts) > 1 and relative.parts[1] in REBUILDABLE)):
                excluded.append(str(Path(section) / relative))
                continue
            target = output / section / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target)
            copied.append(str(Path(section) / relative))
    if not copied:
        raise RuntimeError('No native state files found')
    if controls is not None:
        shutil.copytree(controls, output / 'control')
    report = dict(metadata)
    report.update(captured_utc=datetime.datetime.now(datetime.timezone.utc).isoformat(),
                  captured_state_files=len(copied),
                  exclusions={'reason': 'Pinned extension source and rebuildable browser caches only',
                              'files': excluded})
    (output / 'CHECKPOINT.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    return seal(output)


def seal(directory):
    directory = Path(directory)
    manifest = []
    for p in sorted(directory.rglob('*')):
        if p.is_file() and p != directory / 'MANIFEST.json':
            manifest.append({'path': str(p.relative_to(directory)), 'bytes': p.stat().st_size,
                             'sha256': hashlib.sha256(p.read_bytes()).hexdigest()})
    (directory / 'MANIFEST.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    return manifest


def verify(directory):
    directory = Path(directory).resolve()
    manifest = json.loads((directory / 'MANIFEST.json').read_text())
    expected = {'MANIFEST.json'}
    for item in manifest:
        path = directory / item['path']
        if directory not in path.resolve().parents or path.is_symlink():
            raise RuntimeError('Invalid manifest path')
        if path.stat().st_size != item['bytes'] or hashlib.sha256(path.read_bytes()).hexdigest() != item['sha256']:
            raise RuntimeError('Checkpoint mismatch: ' + item['path'])
        expected.add(item['path'])
    actual = {str(p.relative_to(directory)) for p in directory.rglob('*') if p.is_file()}
    if actual != expected:
        raise RuntimeError('Checkpoint file set differs from manifest')
    return len(manifest)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--host-root', type=Path, required=True)
    parser.add_argument('--output-directory', type=Path, required=True)
    parser.add_argument('--metadata', type=Path, required=True)
    parser.add_argument('--controls', type=Path)
    args = parser.parse_args()
    capture(args.host_root, args.output_directory, json.loads(args.metadata.read_text()), args.controls)
    print(json.dumps({'verified_files': verify(args.output_directory), 'directory': str(args.output_directory)}))
