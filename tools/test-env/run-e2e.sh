#!/usr/bin/env bash
# Fresh emulator (TEST backend code + fresh TEST copy) + TEST site build, then the end-to-end pass.
set -e
cd "$(dirname "$0")/../.."
PORT=${PORT:-8795}; SITE=/tmp/testsite-emu; GS=${GS:-/workspace/pcr-test-backend}
python3 tools/test-env/make-test-site.py "$SITE" "http://127.0.0.1:$PORT/exec" >/dev/null
pid=$(ss -ltnp 2>/dev/null | grep ":$PORT " | grep -o 'pid=[0-9]*' | cut -d= -f2 || true); [ -n "$pid" ] && kill "$pid" && sleep 1
setsid nohup node tools/test-env/gas-emulator.js --gs "$GS" --port "$PORT" --site "$SITE" > /tmp/emu.log 2>&1 < /dev/null &
for i in $(seq 1 30); do curl -sf "http://127.0.0.1:$PORT/exec?action=getVersion" >/dev/null && break; sleep 0.5; done
node tools/test-env/e2e-test-env.js "http://127.0.0.1:$PORT" "${1:-/workspace/v3-test-shots/e2e}"
