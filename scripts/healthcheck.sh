#!/usr/bin/env bash
# WACRM / ReplyFlow server health check.
# Usage (on the Ubuntu host):
#   bash ~/wacrm/scripts/healthcheck.sh
#   SITE_URL=https://replyflow.thewebpeople.co bash ~/wacrm/scripts/healthcheck.sh

set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/wacrm}"
SITE_URL="${SITE_URL:-https://replyflow.thewebpeople.co}"
PM2_NAME="${PM2_NAME:-wacrm}"
PORT="${PORT:-3000}"
DISK_WARN_PCT="${DISK_WARN_PCT:-85}"

pass=0
fail=0

ok() {
  echo "OK   $1"
  pass=$((pass + 1))
}

bad() {
  echo "FAIL $1"
  fail=$((fail + 1))
}

info() {
  echo "     $1"
}

echo "=== WACRM healthcheck ==="
echo "APP_DIR=$APP_DIR"
echo "SITE_URL=$SITE_URL"
echo

# 1) Disk
if command -v df >/dev/null 2>&1; then
  used=$(df -P "$APP_DIR" 2>/dev/null | awk 'NR==2 {gsub(/%/,"",$5); print $5}')
  avail=$(df -h "$APP_DIR" 2>/dev/null | awk 'NR==2 {print $4}')
  if [[ -n "${used:-}" ]]; then
    if (( used >= DISK_WARN_PCT )); then
      bad "Disk usage ${used}% (avail ${avail}) — free space before next build"
    else
      ok "Disk usage ${used}% (avail ${avail})"
    fi
  else
    bad "Could not read disk usage for $APP_DIR"
  fi
else
  bad "df not available"
fi

# 2) PM2 process (prefer JSON via node — pm2 describe table parsing is fragile)
if command -v pm2 >/dev/null 2>&1; then
  pm2_meta=$(pm2 jlist 2>/dev/null | node -e "
const name = process.argv[1];
let data = '';
process.stdin.on('data', c => data += c);
process.stdin.on('end', () => {
  try {
    const list = JSON.parse(data || '[]');
    const p = list.find(x => x.name === name);
    if (!p) { console.log('missing|||'); process.exit(0); }
    const env = p.pm2_env || {};
    const status = env.status || '';
    const script = env.pm_exec_path || p.pm_exec_path || '';
    const cwd = env.pm_cwd || '';
    console.log([status, script, cwd].join('|'));
  } catch (e) {
    console.log('error|||');
  }
});
" "$PM2_NAME" 2>/dev/null || echo "error|||")

  IFS='|' read -r status script cwd <<<"$pm2_meta"

  if [[ "$status" == "online" ]]; then
    ok "PM2 process '${PM2_NAME}' is online"
  else
    bad "PM2 process '${PM2_NAME}' not online (status: ${status:-unknown})"
  fi

  if [[ "$script" == *"/standalone/server.js" ]]; then
    ok "PM2 script is standalone server.js"
  else
    bad "PM2 script is not standalone server.js (got: ${script:-unknown})"
    info "Prefer: pm2 start $APP_DIR/.next/standalone/server.js --name $PM2_NAME --cwd $APP_DIR/.next/standalone"
  fi
  if [[ "$cwd" == *"/standalone" ]]; then
    ok "PM2 cwd is standalone folder"
  else
    bad "PM2 cwd is not standalone (got: ${cwd:-unknown})"
  fi
else
  bad "pm2 not found"
fi

# 3) Port listening
if command -v ss >/dev/null 2>&1; then
  if ss -tlnp 2>/dev/null | grep -q ":${PORT} "; then
    ok "Port ${PORT} is listening"
  else
    bad "Port ${PORT} is not listening"
  fi
else
  bad "ss not available"
fi

# 4) Env for standalone
if [[ -f "$APP_DIR/.next/standalone/.env.local" ]]; then
  ok "standalone/.env.local exists"
else
  bad "standalone/.env.local missing — copy with: cp $APP_DIR/.env.local $APP_DIR/.next/standalone/.env.local"
fi

if [[ -f "$APP_DIR/.env.local" ]]; then
  ok "repo .env.local exists"
else
  bad "repo .env.local missing"
fi

# 5) Build artifacts
if [[ -f "$APP_DIR/.next/standalone/server.js" ]]; then
  ok "standalone/server.js exists"
else
  bad "standalone/server.js missing — run npm run build"
fi

if [[ -d "$APP_DIR/.next/standalone/.next/static" ]]; then
  ok "standalone static assets present"
else
  bad "standalone/.next/static missing — copy with: cp -r $APP_DIR/.next/static $APP_DIR/.next/standalone/.next/static"
fi

# 6) HTTP checks
if command -v curl >/dev/null 2>&1; then
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$SITE_URL" || echo "000")
  if [[ "$code" =~ ^(200|301|302|307|308)$ ]]; then
    ok "GET $SITE_URL -> HTTP $code"
  else
    bad "GET $SITE_URL -> HTTP $code"
  fi

  code_flows=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$SITE_URL/flows" || echo "000")
  if [[ "$code_flows" =~ ^(200|301|302|307|308)$ ]]; then
    ok "GET $SITE_URL/flows -> HTTP $code_flows"
  else
    bad "GET $SITE_URL/flows -> HTTP $code_flows"
  fi

  local_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "http://127.0.0.1:${PORT}" || echo "000")
  if [[ "$local_code" =~ ^(200|301|302|307|308)$ ]]; then
    ok "Local http://127.0.0.1:${PORT} -> HTTP $local_code"
  else
    bad "Local http://127.0.0.1:${PORT} -> HTTP $local_code"
  fi
else
  bad "curl not available"
fi

# 7) Recent PM2 errors (informational)
if command -v pm2 >/dev/null 2>&1; then
  err_tail=$(pm2 logs "$PM2_NAME" --err --lines 15 --nostream 2>/dev/null | tail -n 20 || true)
  if echo "$err_tail" | grep -qiE "EADDRINUSE|ENOSPC|Server Reference ID|Unhandled|FATAL"; then
    bad "Recent PM2 error log still contains serious keywords"
    info "Run: pm2 logs $PM2_NAME --err --lines 40"
  else
    ok "No fresh critical keywords in last PM2 error lines"
  fi
fi

echo
echo "=== Summary: ${pass} OK, ${fail} FAIL ==="
if (( fail > 0 )); then
  exit 1
fi
exit 0
