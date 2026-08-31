#!/usr/bin/env bash
# Deploy the Campco ReplyFlow instance (separate folder, port, PM2 name).
# Does not touch ~/wacrm or replyflow.thewebpeople.co.
#
# First-time clone:
#   git clone https://github.com/aadiborker/wacrm.git ~/wacrm-campco
#   cp ~/wacrm-campco/.env.local.example ~/wacrm-campco/.env.local
#   # fill Campco-only secrets, then:
#   bash ~/wacrm-campco/scripts/deploy-campco.sh

set -euo pipefail

export APP_DIR="${APP_DIR:-$HOME/wacrm-campco}"
export PM2_NAME="${PM2_NAME:-wacrm-campco}"
export PORT="${PORT:-3001}"
SITE_URL="${SITE_URL:-https://campco.thewebpeople.co}"

if [[ ! -d "$APP_DIR" ]]; then
  echo "FAIL $APP_DIR does not exist. Clone the repo there first."
  exit 1
fi

if [[ ! -f "$APP_DIR/.env.local" ]]; then
  echo "FAIL $APP_DIR/.env.local is missing. Copy .env.local.example and fill Campco secrets."
  exit 1
fi

bash "$APP_DIR/scripts/deploy.sh"

echo
echo "==> Campco instance"
echo "    APP_DIR=$APP_DIR"
echo "    PM2_NAME=$PM2_NAME"
echo "    PORT=$PORT"
echo "    SITE_URL=$SITE_URL"
echo "    Health: SITE_URL=$SITE_URL PM2_NAME=$PM2_NAME PORT=$PORT bash $APP_DIR/scripts/healthcheck.sh"
