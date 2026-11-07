#!/usr/bin/env python3
"""Send one command to a live isolated native session; retain uncertain requests."""
import argparse
import datetime
import json
from pathlib import Path
import sys
import time


def send(package_root, command):
    active = Path(package_root) / 'runtime' / 'active-session.json'
    state = json.loads(active.read_text())
    directory = Path(state['sessionDirectory'])
    closed = directory / 'closed.json'
    if closed.exists():
        raise RuntimeError('NATIVE_SESSION_CLOSED: no command sent; start a fresh session')
    root = Path(state['commands'])
    name = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%f')
    request = root / (name + '.request.json')
    response = root / (name + '.response.json')
    request.write_text(json.dumps(command, ensure_ascii=False))
    deadline = time.monotonic() + float(command.get('timeout', 45)) + 5
    while True:
        # A completed response is authoritative even if shutdown followed it.
        if response.exists():
            return response.read_text()
        if closed.exists():
            raise RuntimeError('NATIVE_SESSION_CLOSED: command outcome unknown; request retained at ' + str(request))
        current = json.loads(active.read_text())
        if current.get('sessionDirectory') != state['sessionDirectory']:
            raise RuntimeError('NATIVE_SESSION_REPLACED: command outcome unknown; request retained at ' + str(request))
        if time.monotonic() >= deadline:
            raise TimeoutError('NATIVE_QUEUE_TIMEOUT: command outcome unknown; request retained at ' + str(request))
        time.sleep(.1)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--package-root', type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    try:
        print(send(args.package_root, json.load(sys.stdin)))
    except (OSError, ValueError, KeyError, RuntimeError, TimeoutError) as error:
        raise SystemExit(str(error))
