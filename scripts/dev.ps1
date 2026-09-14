# Start SafiRoute on Windows
$root = Split-Path -Parent $PSScriptRoot
if (-not $root) { $root = Get-Location }

$backend = Join-Path $root "backend"
$frontend = Join-Path $root "frontend"

Start-Process powershell -ArgumentList @(
  "-NoExit",
  "-Command",
  "Set-Location '$backend'; if (Test-Path .\venv\Scripts\Activate.ps1) { .\venv\Scripts\Activate.ps1 }; python manage.py runserver 127.0.0.1:8877"
)

Set-Location $frontend
if (-not (Test-Path .env.local)) {
  Copy-Item .env.example .env.local
}
if (-not (Test-Path node_modules)) {
  npm install
}
npm run dev
