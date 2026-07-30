#!/usr/bin/env bash
# Deploy latest code and keep standalone runtime healthy.
# Usage on Ubuntu:
#   bash ~/wacrm/scripts/deploy.sh

set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/wacrm}"
PM2_NAME="${PM2_NAME:-wacrm}"

cd "$APP_DIR"

echo "==> Pull"
git pull origin main

echo "==> Install"
npm install

echo "==> Build"
npm run build

echo "==> Sync standalone assets + env"
mkdir -p .next/standalone/.next
cp .env.local .next/standalone/.env.local
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public

echo "==> Restart PM2 (standalone)"
pm2 delete "$PM2_NAME" >/dev/null 2>&1 || true
pm2 start "$APP_DIR/.next/standalone/server.js" \
  --name "$PM2_NAME" \
  --cwd "$APP_DIR/.next/standalone"
pm2 save

echo "==> Healthcheck"
bash "$APP_DIR/scripts/healthcheck.sh"
