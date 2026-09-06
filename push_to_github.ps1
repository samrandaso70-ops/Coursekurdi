param(
    [Parameter(Mandatory=$true)]
    [string]$Token
)

$GITHUB_USER = "samrandaso70-ops"
$GITHUB_REPO = "Course_kurdi"
$BRANCH      = "main"

$headers = @{
    Authorization = "token $Token"
    Accept        = "application/vnd.github.v3+json"
    "User-Agent"  = "PayVault-Pusher"
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  PayVault -> GitHub Pusher (API-based)    " -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Verify token & repo
Write-Host "Checking repository access..." -ForegroundColor Yellow
$repoExists = $false
try {
    $repoCheck = Invoke-RestMethod -Uri "https://api.github.com/repos/$GITHUB_USER/$GITHUB_REPO" -Headers $headers -ErrorAction Stop
    Write-Host "Repository found: $($repoCheck.full_name)" -ForegroundColor Green
    $repoExists = $true
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    if ($statusCode -eq 404) {
        Write-Host "Repository not found - creating it..." -ForegroundColor Yellow
        $newRepoBody = '{"name":"' + $GITHUB_REPO + '","description":"PayVault - Multi-Course & Multi-Year Customer Payment Database","private":false,"auto_init":false}'
        try {
            $created = Invoke-RestMethod -Uri "https://api.github.com/user/repos" -Method POST -Headers $headers -Body $newRepoBody -ContentType "application/json"
            Write-Host "Repository created: $($created.full_name)" -ForegroundColor Green
            $repoExists = $true
        } catch {
            Write-Host "ERROR creating repo: $($_.Exception.Message)" -ForegroundColor Red
            exit 1
        }
    } elseif ($statusCode -eq 401) {
        Write-Host "ERROR: Invalid token (401 Unauthorized). Please check your PAT." -ForegroundColor Red
        exit 1
    } else {
        Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
        exit 1
    }
}

if (-not $repoExists) { exit 1 }

# Files to upload
$projectDir = $PSScriptRoot
$filesToUpload = @("index.html", "style.css", "app.js", "README.md", ".gitignore")

Write-Host ""
Write-Host "Uploading files to github.com/$GITHUB_USER/$GITHUB_REPO ..." -ForegroundColor Yellow
Write-Host ""

$successCount = 0
foreach ($fileName in $filesToUpload) {
    $filePath = Join-Path $projectDir $fileName
    if (-not (Test-Path $filePath)) {
        Write-Host "  [SKIP] $fileName (not found locally)" -ForegroundColor DarkGray
        continue
    }

    $fileBytes     = [System.IO.File]::ReadAllBytes($filePath)
    $base64Content = [Convert]::ToBase64String($fileBytes)

    # Check if file already exists on GitHub to get its SHA
    $existingSHA = $null
    try {
        $existing    = Invoke-RestMethod -Uri "https://api.github.com/repos/$GITHUB_USER/$GITHUB_REPO/contents/$fileName" -Headers $headers -ErrorAction Stop
        $existingSHA = $existing.sha
    } catch { }

    $commitMsg = if ($existingSHA) { "Update $fileName" } else { "Add $fileName - PayVault Course Payment Database" }

    $putBody = @{
        message = $commitMsg
        content = $base64Content
        branch  = $BRANCH
    }
    if ($existingSHA) { $putBody.sha = $existingSHA }
    $putBodyJson = $putBody | ConvertTo-Json -Compress

    try {
        $null = Invoke-RestMethod -Uri "https://api.github.com/repos/$GITHUB_USER/$GITHUB_REPO/contents/$fileName" `
            -Method PUT -Headers $headers -Body $putBodyJson -ContentType "application/json"
        $actionWord = if ($existingSHA) { "Updated" } else { "Added  " }
        Write-Host "  OK $actionWord $fileName" -ForegroundColor Green
        $successCount++
    } catch {
        $errMsg = $_.Exception.Message
        Write-Host "  FAIL $fileName : $errMsg" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "Done! Uploaded $successCount of $($filesToUpload.Count) files." -ForegroundColor Cyan
Write-Host "View your repo at: https://github.com/$GITHUB_USER/$GITHUB_REPO" -ForegroundColor Green
Write-Host ""
