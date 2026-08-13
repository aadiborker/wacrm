#!/usr/bin/env bash
# Restart PM2 without a full rebuild — use when the app is down but build exists.
# Usage: bash ~/wacrm/scripts/recover.sh

set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/wacrm}"
PM2_NAME="${PM2_NAME:-wacrm}"
PORT="${PORT:-3000}"

cd "$APP_DIR"

if [[ ! -f "$APP_DIR/.next/standalone/server.js" ]]; then
  echo "ERROR: .next/standalone/server.js missing — run: bash scripts/deploy.sh"
  exit 1
fi

if [[ ! -f "$APP_DIR/.next/standalone/.env.local" ]]; then
  echo "==> Copy .env.local into standalone"
  cp "$APP_DIR/.env.local" "$APP_DIR/.next/standalone/.env.local"
fi

echo "==> Start / restart PM2 via ecosystem"
APP_DIR="$APP_DIR" PM2_NAME="$PM2_NAME" PORT="$PORT" \
  pm2 startOrReload "$APP_DIR/scripts/ecosystem.config.cjs" --update-env
pm2 save

echo "==> Wait for port ${PORT}"
for i in $(seq 1 30); do
  if curl -sf --max-time 2 "http://127.0.0.1:${PORT}/api/health/runtime" >/dev/null; then
    echo "OK   App responding on :${PORT}"
    curl -s "http://127.0.0.1:${PORT}/api/health/runtime"
    echo
    exit 0
  fi
  sleep 1
done

echo "FAIL App did not respond on :${PORT} after 30s"
pm2 logs "$PM2_NAME" --lines 40 --nostream 2>/dev/null || true
exit 1
