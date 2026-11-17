# auto-push.ps1 — pushes new local commits on `main` to GitHub (→ Render deploys).
#
# Set up by Tony on 2026-11-18 so Claude's tested commits go live without a
# manual `git push`. Runs every 5 minutes from Windows Task Scheduler.
#
# Safety:
#   • Only ever pushes branch `main`, never force-pushes.
#   • Skips if `main` has diverged from GitHub (someone pushed elsewhere) —
#     that needs a human.
#   • Skips while a merge/rebase is in progress or another push is running.
#   • Logs every run to .auto-push.log (not committed).
#
# Turn off:  Unregister-ScheduledTask -TaskName "WorkAbroadHub Auto Push" -Confirm:$false

$ErrorActionPreference = "Continue"   # git writes progress to stderr; "Stop" would treat that as an error in PowerShell 5.1
$repo = Split-Path -Parent $PSScriptRoot
$log  = Join-Path $repo ".auto-push.log"
$lock = Join-Path $repo ".auto-push.lock"

function Log($msg) {
  $line = "{0}  {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $msg
  Add-Content -Path $log -Value $line
  # keep the log small
  $all = Get-Content $log -ErrorAction SilentlyContinue
  if ($all.Count -gt 500) { $all | Select-Object -Last 300 | Set-Content $log }
}

Set-Location $repo

if (Test-Path $lock) {
  $age = (Get-Date) - (Get-Item $lock).LastWriteTime
  if ($age.TotalMinutes -lt 15) { exit 0 }   # another run is busy
  Remove-Item $lock -Force
}
New-Item -ItemType File -Path $lock -Force | Out-Null

try {
  if ((Test-Path ".git/MERGE_HEAD") -or (Test-Path ".git/rebase-merge") -or (Test-Path ".git/rebase-apply")) {
    Log "skip: merge/rebase in progress"; exit 0
  }
  $branch = (git rev-parse --abbrev-ref HEAD).Trim()
  if ($branch -ne "main") { exit 0 }

  git fetch origin main --quiet 2>$null
  if ($LASTEXITCODE -ne 0) { Log "skip: could not reach GitHub"; exit 0 }

  $ahead  = [int](git rev-list --count origin/main..main)
  $behind = [int](git rev-list --count main..origin/main)
  if ($ahead -eq 0) { exit 0 }
  if ($behind -gt 0) { Log "skip: main has diverged from GitHub (ahead $ahead, behind $behind) — needs Tony"; exit 0 }

  $subjects = (git log --format="%h %s" origin/main..main | ForEach-Object { $_.Substring(0, [Math]::Min(90, $_.Length)) }) -join " | "
  $out = git push origin main 2>&1
  if ($LASTEXITCODE -eq 0) { Log "pushed $ahead commit(s): $subjects" }
  else { Log ("push FAILED: " + (($out | Out-String).Trim() -replace "\s+", " ")) }
}
catch { Log ("error: " + $_.Exception.Message) }
finally { Remove-Item $lock -Force -ErrorAction SilentlyContinue }
