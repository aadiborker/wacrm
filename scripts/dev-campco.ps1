# Start Campco ReplyFlow locally on port 3001.
# Usage (from repo root):
#   powershell -File scripts/dev-campco.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not (Test-Path (Join-Path $root ".env.local"))) {
  Write-Error "Missing .env.local in $root. Copy scripts/env.campco.local.example to .env.local and fill Campco values."
}

$env:PORT = "3001"
Write-Host "Campco local: http://localhost:3001  (folder $root)"
npm run dev
