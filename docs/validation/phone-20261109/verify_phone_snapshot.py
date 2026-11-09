#!/usr/bin/env python3
"""Create and restore exact Git-backed working-tree snapshots without writing the repo.

Use `manifest` only after the owning writer has frozen the intended source.
All commands reject symlinks, missing files, unsafe paths, and changed bytes.
The restore target must not exist. Build caches are explicitly excluded.
"""
import argparse
import datetime as dt
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import stat
import subprocess
import tarfile

BASE_COMMIT = '72522564bfe75a80298396d4636c48c6f34f7d57'
BASE_TREE = '4996dce81ff2723f5b450363b96826237d68bb72'
SKIP_PARTS = {'.git', 'node_modules', '__pycache__'}


def utc():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def git(repo, *args):
    return subprocess.check_output(['git', '-C', str(repo), *args])


def safe_path(name):
    p = PurePosixPath(name)
    if not name or p.is_absolute() or '..' in p.parts or str(p) != name or '\\' in name:
        raise ValueError('Unsafe relative path: ' + repr(name))
    return name


def excluded(name, extra=()):
    p = PurePosixPath(name)
    return bool(SKIP_PARTS.intersection(p.parts)) or p.suffix == '.pyc' or any(name == x or name.startswith(x.rstrip('/') + '/') for x in extra)


def regular_read(root, name):
    safe_path(name)
    p = root / name
    for q in (p, *p.parents):
        if q == root.parent:
            break
        if q.is_symlink():
            raise ValueError('Symlink in source path: ' + name)
    before = p.stat()
    if not stat.S_ISREG(before.st_mode):
        raise ValueError('Not a regular file: ' + name)
    data = p.read_bytes()
    after = p.stat()
    if (before.st_size, before.st_mtime_ns, before.st_ino) != (after.st_size, after.st_mtime_ns, after.st_ino):
        raise ValueError('File changed while reading: ' + name)
    return data, '100755' if after.st_mode & 0o111 else '100644'


def record(name, data, mode):
    return {'path': name, 'size_bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(),
            'git_blob_sha1': hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest(),
            'mode': mode}


def source_inventory(repo, extra=()):
    paths = git(repo, 'ls-files', '-z', '--cached', '--others', '--exclude-standard').decode('utf-8').split('\0')
    paths = sorted({safe_path(p) for p in paths if p and not excluded(p, extra)})
    files, deleted = [], []
    for name in paths:
        if not (repo / name).exists() and not (repo / name).is_symlink():
            deleted.append(name)
            continue
        data, mode = regular_read(repo, name)
        files.append(record(name, data, mode))
    return files, deleted


def load_manifest(path):
    m = json.loads(Path(path).read_text('utf-8'))
    if m.get('schema') != 'tisya-phone-source-snapshot/1':
        raise ValueError('Unknown manifest schema')
    names = [safe_path(f['path']) for f in m['files']]
    if len(set(names)) != len(names):
        raise ValueError('Duplicate manifest paths')
    if any(excluded(n, m.get('excludes', [])) for n in names):
        raise ValueError('Manifest includes an excluded path')
    return m


def write_json(path, value):
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    temp = p.with_name(p.name + '.tmp-' + str(os.getpid()))
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    os.replace(temp, p)


def create_manifest(repo, extra, phase):
    repo = Path(repo).resolve()
    actual_base_tree = git(repo, 'rev-parse', BASE_COMMIT + '^{tree}').decode().strip()
    if actual_base_tree != BASE_TREE:
        raise ValueError('Recorded base commit does not resolve to the expected tree')
    first, deleted = source_inventory(repo, extra)
    second, deleted_second = source_inventory(repo, extra)
    if first != second or deleted != deleted_second:
        raise ValueError('Working tree changed between two independent inventories; freeze writer first')
    now = dt.datetime.now(dt.timezone.utc)
    return {'schema': 'tisya-phone-source-snapshot/1', 'phase': phase,
            'captured_utc': now.isoformat(),
            'captured_beijing': now.astimezone(dt.timezone(dt.timedelta(hours=8))).isoformat(),
            'source_root': str(repo), 'base_commit': BASE_COMMIT, 'base_tree': BASE_TREE,
            'head_commit': git(repo, 'rev-parse', 'HEAD').decode().strip(),
            'head_tree': git(repo, 'rev-parse', 'HEAD^{tree}').decode().strip(),
            'branch': git(repo, 'branch', '--show-current').decode().strip(),
            'status_porcelain': git(repo, 'status', '--porcelain=v1', '--untracked-files=all').decode(),
            'excluded_directory_parts': sorted(SKIP_PARTS), 'excluded_suffixes': ['.pyc'],
            'excludes': list(extra), 'deleted_tracked_paths': deleted,
            'file_count': len(first), 'total_bytes': sum(x['size_bytes'] for x in first),
            'two_pass_consistency': True, 'files': first}


def verify(root, m, exact=True):
    root = Path(root).resolve()
    for expected in m['files']:
        data, mode = regular_read(root, expected['path'])
        actual = record(expected['path'], data, mode)
        if actual != expected:
            raise ValueError('Byte or mode mismatch: ' + expected['path'])
    if exact:
        actual_names = set()
        for directory, dirs, files in os.walk(root, followlinks=False):
            rel = Path(directory).relative_to(root)
            dirs[:] = [n for n in dirs if not excluded((rel / n).as_posix(), m.get('excludes', []))]
            for n in dirs:
                if (Path(directory) / n).is_symlink():
                    raise ValueError('Unexpected directory symlink')
            for n in files:
                name = (rel / n).as_posix()
                if not excluded(name, m.get('excludes', [])):
                    actual_names.add(name)
        expected_names = {x['path'] for x in m['files']}
        if actual_names != expected_names:
            raise ValueError('Inventory differs: missing=' + repr(sorted(expected_names-actual_names)) + ', extra=' + repr(sorted(actual_names-expected_names)))
    return {'verified_utc': utc(), 'exact_inventory': exact, 'file_count': len(m['files']),
            'bytes': sum(x['size_bytes'] for x in m['files']), 'all_bytes_sha256_blob_sha1_and_modes_match': True}


def restore_source(source, dest, m):
    source, dest = Path(source).resolve(), Path(dest).absolute()
    if dest.exists() or dest.is_symlink():
        raise ValueError('Restore destination already exists')
    temp = dest.with_name(dest.name + '.restoring-' + str(os.getpid()))
    temp.mkdir(parents=True, exist_ok=False)
    for expected in m['files']:
        data, mode = regular_read(source, expected['path'])
        if record(expected['path'], data, mode) != expected:
            raise ValueError('Source changed since snapshot: ' + expected['path'])
        p = temp / expected['path']
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(data)
        p.chmod(0o755 if mode == '100755' else 0o644)
    proof = verify(temp, m)
    if dest.exists():
        raise ValueError('Restore destination appeared during operation')
    temp.rename(dest)
    proof.update(method='manifest-copy', destination=str(dest), source=str(source))
    return proof


def restore_archive(repo, commit, dest, m):
    dest = Path(dest).absolute()
    if dest.exists() or dest.is_symlink():
        raise ValueError('Restore destination already exists')
    raw = git(repo, 'archive', '--format=tar', commit)
    temp = dest.with_name(dest.name + '.restoring-' + str(os.getpid()))
    temp.mkdir(parents=True, exist_ok=False)
    seen = set()
    with tarfile.open(fileobj=io.BytesIO(raw), mode='r:') as archive:
        for member in archive:
            name = safe_path(member.name.rstrip('/'))
            if excluded(name, m.get('excludes', [])):
                continue
            if name in seen:
                raise ValueError('Duplicate archive member: ' + name)
            seen.add(name)
            p = temp / name
            if member.isdir():
                p.mkdir(parents=True, exist_ok=True)
            elif member.isfile():
                p.parent.mkdir(parents=True, exist_ok=True)
                p.write_bytes(archive.extractfile(member).read())
                p.chmod(0o755 if member.mode & 0o111 else 0o644)
            else:
                raise ValueError('Non-regular archive member: ' + name)
    proof = verify(temp, m)
    if dest.exists():
        raise ValueError('Restore destination appeared during operation')
    temp.rename(dest)
    proof.update(method='git-archive', destination=str(dest), commit=commit,
                 archive_sha256=hashlib.sha256(raw).hexdigest())
    return proof


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    sub = ap.add_subparsers(dest='command', required=True)
    p = sub.add_parser('manifest')
    p.add_argument('--repo', required=True)
    p.add_argument('--output', required=True)
    p.add_argument('--exclude', action='append', default=[])
    p.add_argument('--phase', choices=['provisional', 'frozen'], default='provisional')
    p = sub.add_parser('verify')
    p.add_argument('--manifest', required=True)
    p.add_argument('--source', required=True)
    p.add_argument('--report', required=True)
    p = sub.add_parser('restore')
    p.add_argument('--manifest', required=True)
    p.add_argument('--source', required=True)
    p.add_argument('--destination', required=True)
    p.add_argument('--report', required=True)
    p = sub.add_parser('archive')
    p.add_argument('--manifest', required=True)
    p.add_argument('--repo', required=True)
    p.add_argument('--commit', required=True)
    p.add_argument('--destination', required=True)
    p.add_argument('--report', required=True)
    a = ap.parse_args()
    if a.command == 'manifest':
        result = create_manifest(a.repo, a.exclude, a.phase)
        write_json(a.output, result)
        print(json.dumps({k: v for k, v in result.items() if k not in ('files', 'status_porcelain')}, ensure_ascii=False))
        return
    m = load_manifest(a.manifest)
    if a.command == 'verify':
        result = verify(a.source, m)
    elif a.command == 'restore':
        result = restore_source(a.source, a.destination, m)
    else:
        result = restore_archive(a.repo, a.commit, a.destination, m)
    write_json(a.report, result)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    main()
