param(
  [string]$BackupRoot = $(if ($env:BACKUP_ROOT) { $env:BACKUP_ROOT } else { ".\backups" })
)

if (-not $env:MONGODB_BACKUP_URI) {
  throw "MONGODB_BACKUP_URI is required"
}

$stamp = (Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmssZ")
$outDir = Join-Path $BackupRoot "mongo\$stamp"
$archive = Join-Path $outDir "menorah-mongo-$stamp.archive.gz"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$uri = $env:MONGODB_BACKUP_URI
if ($uri.Contains("`r") -or $uri.Contains("`n")) {
  throw "MONGODB_BACKUP_URI must contain one MongoDB URI"
}
$escapedUri = $uri.Replace('\', '\\').Replace('"', '\"')
$configPath = Join-Path ([System.IO.Path]::GetTempPath()) "menorah-mongo-$([guid]::NewGuid().ToString('N')).yml"
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($configPath, "uri: `"$escapedUri`"`n", $utf8NoBom)
try {
  & mongodump "--config=$configPath" "--archive=$archive" --gzip
  if ($LASTEXITCODE -ne 0) { throw "mongodump failed with exit code $LASTEXITCODE" }
} finally {
  Remove-Item -LiteralPath $configPath -Force -ErrorAction SilentlyContinue
}

if ($env:BACKUP_ENCRYPTION_PASSWORD) {
  $encrypted = "$archive.enc"
  openssl enc -aes-256-cbc -pbkdf2 -salt -in "$archive" -out "$encrypted" -pass env:BACKUP_ENCRYPTION_PASSWORD
  Remove-Item -LiteralPath $archive
  $archive = $encrypted
}

Get-FileHash -Algorithm SHA256 -Path $archive |
  ForEach-Object { "$($_.Hash.ToLower())  $(Split-Path -Leaf $archive)" } |
  Set-Content -Path "$archive.sha256"

@{
  createdAt = $stamp
  archive = Split-Path -Leaf $archive
  encrypted = $archive.EndsWith(".enc")
} | ConvertTo-Json | Set-Content -Path (Join-Path $outDir "metadata.json")

Write-Host "MongoDB backup written to $archive"
