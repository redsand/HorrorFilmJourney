param(
  [Parameter(Mandatory = $true)]
  [string]$HostName,

  [string]$User = "root",
  [string]$KeyPath = "~/.ssh/djvalet.key",
  [string]$RemoteAppRoot = "/opt/cinemacodex",
  [switch]$Bootstrap,
  [switch]$SetupPostgres,
  [switch]$SetupCatalogCron,
  [string]$EnvFile = ".env.production",
  [string]$CatalogBackupFile = "",
  [string]$Domain = "cinemacodex.com",
  [string]$DomainAliases = "www.cinemacodex.com",
  [string]$LetsEncryptEmail = ""
)

$ErrorActionPreference = "Stop"

function Exec-OrThrow {
  param([string]$Command)
  Write-Host ">> $Command"
  Invoke-Expression $Command
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed with exit code ${LASTEXITCODE}: $Command"
  }
}

$timestamp = Get-Date -Format "yyyyMMddHHmmss"
$archiveName = "cinemacodex-$timestamp.tar.gz"
$archivePath = Join-Path $PWD $archiveName
$remoteArchive = "/tmp/$archiveName"
$resolvedKey = (Resolve-Path $KeyPath).Path
$envFileExists = (Test-Path $EnvFile)

Write-Host "Creating release archive: $archivePath"
Exec-OrThrow "git archive --format=tar.gz --output `"$archivePath`" HEAD"

if ($Bootstrap.IsPresent) {
  if ([string]::IsNullOrWhiteSpace($LetsEncryptEmail)) {
    throw "When using -Bootstrap, you must provide -LetsEncryptEmail."
  }

  $bootstrapLocal = "scripts/deploy/bootstrap-ubuntu24.sh"
  $bootstrapRemote = "/tmp/bootstrap-ubuntu24.sh"

  Exec-OrThrow "scp -i `"$resolvedKey`" `"$bootstrapLocal`" ${User}@${HostName}:$bootstrapRemote"
  Exec-OrThrow "ssh -i `"$resolvedKey`" ${User}@${HostName} `"chmod +x $bootstrapRemote && DOMAIN='$Domain' DOMAIN_ALIASES='$DomainAliases' LETSENCRYPT_EMAIL='$LetsEncryptEmail' bash $bootstrapRemote`""
}

if ($envFileExists) {
  Write-Host "Uploading environment file to shared .env"
  Exec-OrThrow "scp -i `"$resolvedKey`" `"$EnvFile`" ${User}@${HostName}:$RemoteAppRoot/shared/.env"
  Exec-OrThrow "ssh -i `"$resolvedKey`" ${User}@${HostName} `"chmod 600 $RemoteAppRoot/shared/.env`""
}
elseif ($SetupPostgres.IsPresent) {
  throw "SetupPostgres requires a valid -EnvFile (default .env.production)."
}

if ($SetupPostgres.IsPresent) {
  $pgSetupLocal = "scripts/deploy/setup-postgres-ubuntu24.sh"
  $pgSetupRemote = "/tmp/setup-postgres-ubuntu24.sh"
  Exec-OrThrow "scp -i `"$resolvedKey`" `"$pgSetupLocal`" ${User}@${HostName}:$pgSetupRemote"
  Exec-OrThrow "ssh -i `"$resolvedKey`" ${User}@${HostName} `"chmod +x $pgSetupRemote && ENV_FILE='$RemoteAppRoot/shared/.env' bash $pgSetupRemote`""
}

if ($SetupCatalogCron.IsPresent) {
  $cronSetupLocal = "scripts/deploy/setup-nightly-catalog-cron.sh"
  $cronSetupRemote = "/tmp/setup-nightly-catalog-cron.sh"
  Exec-OrThrow "scp -i `"$resolvedKey`" `"$cronSetupLocal`" ${User}@${HostName}:$cronSetupRemote"
  Exec-OrThrow "ssh -i `"$resolvedKey`" ${User}@${HostName} `"chmod +x $cronSetupRemote && APP_NAME='cinemacodex' APP_USER='cinemacodex' APP_ROOT='$RemoteAppRoot' bash $cronSetupRemote`""
}

Write-Host "Uploading remote deploy script"
$deployScriptLocal = "scripts/deploy/deploy-release.sh"
$deployScriptRemote = "$RemoteAppRoot/bin/deploy-release.sh"
Exec-OrThrow "scp -i `"$resolvedKey`" `"$deployScriptLocal`" ${User}@${HostName}:$deployScriptRemote"
Exec-OrThrow "ssh -i `"$resolvedKey`" ${User}@${HostName} `"chmod +x $deployScriptRemote`""

Write-Host "Uploading release archive to $HostName"
Exec-OrThrow "scp -i `"$resolvedKey`" `"$archivePath`" ${User}@${HostName}:$remoteArchive"

Write-Host "Deploying release on remote host"
Exec-OrThrow "ssh -i `"$resolvedKey`" ${User}@${HostName} `"bash $RemoteAppRoot/bin/deploy-release.sh $remoteArchive`""

if (-not [string]::IsNullOrWhiteSpace($CatalogBackupFile)) {
  if (-not (Test-Path $CatalogBackupFile)) {
    throw "Catalog backup file not found: $CatalogBackupFile"
  }
  $backupName = [System.IO.Path]::GetFileName($CatalogBackupFile)
  $remoteBackupDir = "$RemoteAppRoot/shared/backups"
  $remoteBackupPath = "$remoteBackupDir/$backupName"
  Write-Host "Uploading catalog backup to remote: $backupName"
  Exec-OrThrow "ssh -i `"$resolvedKey`" ${User}@${HostName} `"mkdir -p $remoteBackupDir`""
  Exec-OrThrow "scp -i `"$resolvedKey`" `"$CatalogBackupFile`" ${User}@${HostName}:$remoteBackupPath"
  Write-Host "Restoring catalog backup on remote"
  Exec-OrThrow "ssh -i `"$resolvedKey`" ${User}@${HostName} `"set -a; . $RemoteAppRoot/shared/.env; set +a; cd $RemoteAppRoot/current; npm run catalog:restore -- --input $remoteBackupPath`""
}

Write-Host "Cleaning local archive"
Remove-Item -Force $archivePath

Write-Host "Deployment complete."
