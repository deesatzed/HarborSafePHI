#!/bin/sh
set -eu
if [ -d /workspace ]; then
  cd /workspace
else
  cd "$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
fi
if curl -sf -o /dev/null --max-time 2 http://127.0.0.1:8080/; then
  exit 0
fi
npm run dev >>/tmp/app-startup.log 2>&1 &
