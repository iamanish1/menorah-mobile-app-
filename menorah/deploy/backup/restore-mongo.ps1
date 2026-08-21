param(
  [Parameter(Mandatory = $true)]
  [string]$Archive
)

if (-not $env:MONGODB_RESTORE_TEST_URI) {
  throw "MONGODB_RESTORE_TEST_URI is required"
}

$inputArchive = $Archive
$tmpFile = $null

if ($Archive.EndsWith(".enc")) {
  if (-not $env:BACKUP_ENCRYPTION_PASSWORD) {
    throw "BACKUP_ENCRYPTION_PASSWORD is required for encrypted backups"
  }
  $tmpFile = [System.IO.Path]::GetTempFileName()
  openssl enc -d -aes-256-cbc -pbkdf2 -in "$Archive" -out "$tmpFile" -pass env:BACKUP_ENCRYPTION_PASSWORD
  $inputArchive = $tmpFile
}

mongorestore --uri="$env:MONGODB_RESTORE_TEST_URI" --archive="$inputArchive" --gzip --drop

if ($tmpFile) {
  Remove-Item -LiteralPath $tmpFile -Force
}

Write-Host "Restore completed into restore-test MongoDB"
