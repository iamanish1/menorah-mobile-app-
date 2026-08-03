param(
  [Parameter(Mandatory = $true)]
  [string]$Host,

  [string]$RemoteDir = "/opt/menorah/releases",
  [string]$OutputDir = "C:\menorah\deploy-bundles"
)

$ErrorActionPreference = "Stop"

$bundleOutput = & "$PSScriptRoot\export-dev-bundle.ps1" -OutputDir $OutputDir
$bundlePath = ($bundleOutput | Select-String "Created deploy bundle:").ToString().Replace("Created deploy bundle:", "").Trim()

if (-not (Test-Path $bundlePath)) {
  throw "Bundle was not created: $bundlePath"
}

scp "$bundlePath" "${Host}:${RemoteDir}/"
Write-Host "Copied $bundlePath to ${Host}:${RemoteDir}/"
