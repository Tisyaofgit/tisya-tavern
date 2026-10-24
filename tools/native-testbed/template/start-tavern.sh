#!/usr/bin/env bash
set -euo pipefail
TAVERN_PACKAGE_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
exec python3 "$TAVERN_PACKAGE_ROOT/tools/native_session.py" "$@"
