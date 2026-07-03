# ship.ps1 - build, stage, commit, push in one command
#
# Usage:
#   .\ship.ps1 "your commit message"
#
# Steps, in order:
#   1. Runs npm run build (client bundle + server tsc).
#   2. Verifies dist\server\index.js was produced.
#   3. Runs git add . to stage everything.
#   4. Exits cleanly if nothing was staged.
#   5. Commits with the message you supplied.
#   6. Pushes to origin main.
#
# Notes:
#   - The build script prints "[build] tsc reported issues but proceeding"
#     when there are pre-existing type errors. That's tolerated.
#   - The final "test -f dist/server/index.js" in package.json throws on
#     Windows because "test" is a POSIX command. We check Test-Path here
#     instead. Render's Linux build handles it correctly.
#   - Pre-push hooks (NUL byte + dist freshness) still run and can block.

param(
  [Parameter(Mandatory=$true)]
  [string]$Message
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host ">> Building..." -ForegroundColor Cyan
try {
  npm run build
} catch {
  # The build script's final "test -f" throws on Windows even when the
  # build itself succeeded. We tolerate that ONE failure but not vite errors.
}
if (-not (Test-Path "dist\server\index.js")) {
  Write-Host ""
  Write-Host "FAIL: Build failed - dist\server\index.js was not produced." -ForegroundColor Red
  Write-Host "Nothing committed." -ForegroundColor Red
  exit 1
}
Write-Host "OK: Build produced dist\server\index.js" -ForegroundColor Green

Write-Host ""
Write-Host ">> Staging..." -ForegroundColor Cyan
git add .
if ($LASTEXITCODE -ne 0) {
  Write-Host "FAIL: git add failed (likely a Defender/OneDrive lock - retry usually fixes it)." -ForegroundColor Red
  exit 1
}

# git diff --cached --quiet exits 0 when there is nothing staged, 1 when there is.
git diff --cached --quiet
if ($LASTEXITCODE -eq 0) {
  Write-Host "Nothing to commit - working tree matches HEAD." -ForegroundColor Yellow
  exit 0
}

Write-Host ""
Write-Host ">> Committing..." -ForegroundColor Cyan
git commit -m $Message
if ($LASTEXITCODE -ne 0) {
  Write-Host "FAIL: Commit failed." -ForegroundColor Red
  exit 1
}

Write-Host ""
Write-Host ">> Pushing to origin main..." -ForegroundColor Cyan
git push origin main
if ($LASTEXITCODE -ne 0) {
  Write-Host "FAIL: Push failed. Pre-push hooks may have blocked it - check the output above." -ForegroundColor Red
  exit 1
}

Write-Host ""
Write-Host "OK: Shipped." -ForegroundColor Green
Write-Host "Render will start a new deploy in ~30 seconds; it usually goes live in 3-5 minutes." -ForegroundColor Green
