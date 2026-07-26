param(
  [string]$OutputDir = "C:\menorah\deploy-bundles",
  [string]$Ref = "HEAD"
)

$ErrorActionPreference = "Stop"

$repoRoot = git rev-parse --show-toplevel
if (-not $repoRoot) {
  throw "Run this from inside the git repository"
}

$branch = git rev-parse --abbrev-ref HEAD
$shortSha = git rev-parse --short $Ref
$timestamp = (Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmssZ")
$bundleName = "menorah-$($branch -replace '[^A-Za-z0-9._-]', '-')-$shortSha-$timestamp.zip"
$bundlePath = Join-Path $OutputDir $bundleName

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

git -C $repoRoot diff --check
git -C $repoRoot archive --format=zip --output="$bundlePath" $Ref

Write-Host "Created deploy bundle: $bundlePath"
Write-Host "Copy it to the host, then unzip into /opt/menorah/releases/$shortSha or your chosen release directory."
