param(
  [Parameter(Mandatory = $true)]
  [string]$Archive
)

if (-not $env:MONGODB_RESTORE_TEST_URI) {
  throw "MONGODB_RESTORE_TEST_URI is required"
}

$inputArchive = $Archive
$tmpFile = $null
$configPath = $null

try {
  if ($Archive.EndsWith(".enc")) {
    if (-not $env:BACKUP_ENCRYPTION_PASSWORD) {
      throw "BACKUP_ENCRYPTION_PASSWORD is required for encrypted backups"
    }
    $tmpFile = [System.IO.Path]::GetTempFileName()
    openssl enc -d -aes-256-cbc -pbkdf2 -in "$Archive" -out "$tmpFile" -pass env:BACKUP_ENCRYPTION_PASSWORD
    if ($LASTEXITCODE -ne 0) { throw "Backup decryption failed with exit code $LASTEXITCODE" }
    $inputArchive = $tmpFile
  }

  $uri = $env:MONGODB_RESTORE_TEST_URI
  if ($uri.Contains("`r") -or $uri.Contains("`n")) {
    throw "MONGODB_RESTORE_TEST_URI must contain one MongoDB URI"
  }
  $escapedUri = $uri.Replace('\', '\\').Replace('"', '\"')
  $configPath = Join-Path ([System.IO.Path]::GetTempPath()) "menorah-mongo-$([guid]::NewGuid().ToString('N')).yml"
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($configPath, "uri: `"$escapedUri`"`n", $utf8NoBom)
  & mongorestore "--config=$configPath" "--archive=$inputArchive" --gzip --drop
  if ($LASTEXITCODE -ne 0) { throw "mongorestore failed with exit code $LASTEXITCODE" }
} finally {
  if ($configPath) { Remove-Item -LiteralPath $configPath -Force -ErrorAction SilentlyContinue }
  if ($tmpFile) { Remove-Item -LiteralPath $tmpFile -Force -ErrorAction SilentlyContinue }
}

Write-Host "Restore completed into restore-test MongoDB"
