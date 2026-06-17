#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if command -v python3 >/dev/null 2>&1; then
  exec python3 server.py
fi

if command -v python >/dev/null 2>&1; then
  exec python server.py
fi

echo "Python 3 is required to run this app."
exit 1
