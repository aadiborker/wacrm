#!/usr/bin/env bash
# Deploy latest code and keep standalone runtime healthy.
# Usage on Ubuntu:
#   bash ~/wacrm/scripts/deploy.sh

set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/wacrm}"
PM2_NAME="${PM2_NAME:-wacrm}"

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
pm2 delete "$PM2_NAME" >/dev/null 2>&1 || true
PORT="${PORT:-3000}" HOSTNAME="${HOSTNAME:-0.0.0.0}" KEEP_ALIVE_TIMEOUT="${KEEP_ALIVE_TIMEOUT:-180000}" \
  pm2 start "$APP_DIR/.next/standalone/server.js" \
  --name "$PM2_NAME" \
  --cwd "$APP_DIR/.next/standalone"
pm2 save
# Drop pre-deploy noise so healthcheck doesn't fail on old InvariantError lines.
pm2 flush "$PM2_NAME" >/dev/null 2>&1 || pm2 flush >/dev/null 2>&1 || true

echo "==> Healthcheck"
bash "$APP_DIR/scripts/healthcheck.sh"
