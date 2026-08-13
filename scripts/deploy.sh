#!/usr/bin/env bash
# Deploy latest code and keep standalone runtime healthy.
# Usage on Ubuntu:
#   bash ~/wacrm/scripts/deploy.sh

set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/wacrm}"
PM2_NAME="${PM2_NAME:-wacrm}"
PORT="${PORT:-3000}"

cd "$APP_DIR"

echo "==> Pull"
git fetch origin main
# Discard local lockfile/npm drift (common when npm install runs before pull).
git reset --hard origin/main

echo "==> Install"
npm install

echo "==> Build"
npm run build

echo "==> Sync standalone assets + env"
mkdir -p .next/standalone/.next
cp .env.local .next/standalone/.env.local
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public

# PDF/DOCX parsers are serverExternalPackages — ensure they land in
# standalone/node_modules even if file tracing misses a nested file.
mkdir -p .next/standalone/node_modules
for pkg in pdf-parse pdfjs-dist mammoth; do
  if [[ -d "node_modules/$pkg" ]]; then
    rm -rf ".next/standalone/node_modules/$pkg"
    cp -a "node_modules/$pkg" ".next/standalone/node_modules/$pkg"
  fi
done
# Worker is also inlined at runtime via pdf-parse/worker getData().

echo "==> Restart PM2 (standalone)"
APP_DIR="$APP_DIR" PM2_NAME="$PM2_NAME" PORT="$PORT" \
  pm2 startOrReload "$APP_DIR/scripts/ecosystem.config.cjs" --update-env
pm2 save
# Drop pre-deploy noise so healthcheck doesn't fail on old InvariantError lines.
pm2 flush "$PM2_NAME" >/dev/null 2>&1 || pm2 flush >/dev/null 2>&1 || true

echo "==> Wait for app on :${PORT}"
for i in $(seq 1 45); do
  if curl -sf --max-time 3 "http://127.0.0.1:${PORT}/api/health/runtime" >/dev/null; then
    echo "OK   App responding before healthcheck"
    break
  fi
  if (( i == 45 )); then
    echo "FAIL App never responded on :${PORT}"
    pm2 logs "$PM2_NAME" --lines 50 --nostream 2>/dev/null || true
    exit 1
  fi
  sleep 1
done

echo "==> Healthcheck"
bash "$APP_DIR/scripts/healthcheck.sh"
