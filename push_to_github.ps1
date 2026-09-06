param(
    [string]$Message = ""
)

$GITHUB_USER = "samrandaso70-ops"
$GITHUB_REPO = "Coursekurdi"
$BRANCH      = "main"

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  PayVault -> GitHub Pusher (git-based)    " -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

Set-Location $PSScriptRoot

# --- 1. Stage all changes ---
Write-Host "Staging all changes..." -ForegroundColor Yellow
git add .
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: git add failed." -ForegroundColor Red
    exit 1
}

# --- 2. Check if there is anything to commit ---
$status = git status --porcelain
if (-not $status) {
    Write-Host "Nothing to commit - everything is up to date." -ForegroundColor Green
    Write-Host ""
    Write-Host "Repo: https://github.com/$GITHUB_USER/$GITHUB_REPO" -ForegroundColor Cyan
    exit 0
}

# --- 3. Build commit message ---
if (-not $Message) {
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm"
    $Message = "Update PayVault [$timestamp]"
}

Write-Host "Committing: $Message" -ForegroundColor Yellow
git commit -m $Message
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: git commit failed." -ForegroundColor Red
    exit 1
}

# --- 4. Push ---
Write-Host ""
Write-Host "Pushing to github.com/$GITHUB_USER/$GITHUB_REPO ..." -ForegroundColor Yellow
git push origin $BRANCH
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: git push failed. Check your internet connection or token." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Done! All changes pushed successfully." -ForegroundColor Green
Write-Host "View your repo at: https://github.com/$GITHUB_USER/$GITHUB_REPO" -ForegroundColor Cyan
Write-Host ""
