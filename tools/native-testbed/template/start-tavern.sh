#!/usr/bin/env bash
set -euo pipefail
TAVERN_PACKAGE_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "$TAVERN_PACKAGE_ROOT/provenance/local-helper-dependency-routes.json" ]]; then
  exec python3 "$TAVERN_PACKAGE_ROOT/tools/native_session_local_assets.py" "$@"
fi
exec python3 "$TAVERN_PACKAGE_ROOT/tools/native_session.py" "$@"
