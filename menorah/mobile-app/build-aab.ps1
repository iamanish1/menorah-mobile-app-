# Menorah Health Android 2.7.0 guarded EAS build launcher.
# Run only from the mobile-app directory after exact-SHA approval.

$ErrorActionPreference = "Stop"

if (-not (Test-Path "package.json") -or -not (Test-Path "eas.json")) {
    Write-Error "Run this script from the Menorah mobile-app directory."
    exit 1
}

if (-not $env:PLAY_HIGHEST_VERSION_CODE -or $env:PLAY_HIGHEST_VERSION_CODE -notmatch '^\d+$') {
    Write-Error "Set PLAY_HIGHEST_VERSION_CODE from a fresh Play Console check before requesting a build."
    exit 1
}

if ([int64]$env:PLAY_HIGHEST_VERSION_CODE -ge 15) {
    Write-Error "VersionCode 15 is not greater than Play. Increment every coupled build value and re-approve the candidate."
    exit 1
}

if (-not $env:MENORAH_APPROVED_RELEASE_SHA -or $env:MENORAH_APPROVED_RELEASE_SHA -cnotmatch '^[0-9a-f]{40}$') {
    Write-Error "Set MENORAH_APPROVED_RELEASE_SHA to the independently approved full lowercase release SHA."
    exit 1
}

$headSha = (git rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $headSha -cne $env:MENORAH_APPROVED_RELEASE_SHA) {
    Write-Error "The checked-out commit does not match MENORAH_APPROVED_RELEASE_SHA."
    exit 1
}

$branch = (git branch --show-current).Trim()
if ($LASTEXITCODE -ne 0 -or $branch -cne 'release/android-2.7.0-20260803') {
    Write-Error "Build only from release/android-2.7.0-20260803."
    exit 1
}

$dirty = git status --porcelain
if ($LASTEXITCODE -ne 0 -or $dirty) {
    Write-Error "The release worktree must be clean before EAS archive creation."
    exit 1
}

$eas = Get-Command eas -ErrorAction SilentlyContinue
if (-not $eas) {
    Write-Error "Install the approved EAS CLI version before continuing."
    exit 1
}

$easVersion = (eas --version).Trim()
if ($LASTEXITCODE -ne 0 -or $easVersion -notmatch '(^|/)21\.4\.0($|\s)') {
    Write-Error "Use the reviewed EAS CLI version 21.4.0."
    exit 1
}

npm run validate:release-config
if ($LASTEXITCODE -ne 0) {
    Write-Error "Repository release validation failed."
    exit 1
}

Write-Host "Local gates passed. EAS must independently provide GOOGLE_SERVICES_JSON and PLAY_HIGHEST_VERSION_CODE." -ForegroundColor Yellow
eas build --platform android --profile production-android --non-interactive
exit $LASTEXITCODE
