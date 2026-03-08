#!/usr/bin/env bash
set -euo pipefail

PORT="${1:-8000}"

if command -v python3 >/dev/null 2>&1; then
  PYTHON_BIN="python3"
elif command -v python >/dev/null 2>&1; then
  PYTHON_BIN="python"
else
  echo "Error: Python ist nicht installiert. Installiere Python 3 und versuche es erneut." >&2
  exit 1
fi

echo "Lokaler Server startet auf http://localhost:${PORT}/index.html"
echo "Beenden mit Ctrl+C"
"${PYTHON_BIN}" -m http.server "${PORT}"
