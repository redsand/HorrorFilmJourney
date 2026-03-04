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
  ,
  [string]$Season2MasteredFile = "",
  [switch]$ImportSeason2Mastered,
  [string]$Season1SnapshotFile = "",
  [switch]$ImportSeason1Snapshot,
  [switch]$UpdateSeasons,
  [switch]$PublishSeason2
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

if (-not [string]::IsNullOrWhiteSpace($CatalogBackupFile) -and -not $Bootstrap.IsPresent) {
  throw "Catalog restore is only allowed during initial deployment. Use -CatalogBackupFile only together with -Bootstrap."
}

if ($ImportSeason2Mastered.IsPresent -and [string]::IsNullOrWhiteSpace($Season2MasteredFile)) {
  throw "ImportSeason2Mastered requires -Season2MasteredFile."
}

if ($ImportSeason1Snapshot.IsPresent -and [string]::IsNullOrWhiteSpace($Season1SnapshotFile)) {
  throw "ImportSeason1Snapshot requires -Season1SnapshotFile."
}

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

Write-Host "Ensuring remote Node.js 22+"
$ensureNodeLocal = "scripts/deploy/ensure-node22.sh"
$ensureNodeRemote = "/tmp/ensure-node22.sh"
Exec-OrThrow "scp -i `"$resolvedKey`" `"$ensureNodeLocal`" ${User}@${HostName}:$ensureNodeRemote"
Exec-OrThrow "ssh -i `"$resolvedKey`" ${User}@${HostName} `"chmod +x $ensureNodeRemote && bash $ensureNodeRemote`""

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

if ($ImportSeason2Mastered.IsPresent) {
  if (-not (Test-Path $Season2MasteredFile)) {
    throw "Season 2 mastered file not found: $Season2MasteredFile"
  }
  $season2Name = [System.IO.Path]::GetFileName($Season2MasteredFile)
  $season2RemoteDir = "$RemoteAppRoot/shared/backups"
  $season2RemotePath = "$season2RemoteDir/$season2Name"
  Write-Host "Uploading Season 2 mastered file to remote: $season2Name"
  Exec-OrThrow "ssh -i `"$resolvedKey`" ${User}@${HostName} `"mkdir -p $season2RemoteDir`""
  Exec-OrThrow "scp -i `"$resolvedKey`" `"$Season2MasteredFile`" ${User}@${HostName}:$season2RemotePath"
  Write-Host "Importing Season 2 mastered file on remote"
  Exec-OrThrow "ssh -i `"$resolvedKey`" ${User}@${HostName} `"set -a; . $RemoteAppRoot/shared/.env; set +a; cd $RemoteAppRoot/current; npm run import:season2:cult -- --input $season2RemotePath`""
}

if ($ImportSeason1Snapshot.IsPresent) {
  if (-not (Test-Path $Season1SnapshotFile)) {
    throw "Season 1 snapshot file not found: $Season1SnapshotFile"
  }
  $season1Name = [System.IO.Path]::GetFileName($Season1SnapshotFile)
  $season1RemoteDir = "$RemoteAppRoot/shared/backups"
  $season1RemotePath = "$season1RemoteDir/$season1Name"
  Write-Host "Uploading Season 1 snapshot file to remote: $season1Name"
  Exec-OrThrow "ssh -i `"$resolvedKey`" ${User}@${HostName} `"mkdir -p $season1RemoteDir`""
  Exec-OrThrow "scp -i `"$resolvedKey`" `"$Season1SnapshotFile`" ${User}@${HostName}:$season1RemotePath"
  Write-Host "Importing Season 1 snapshot file on remote"
  Exec-OrThrow "ssh -i `"$resolvedKey`" ${User}@${HostName} `"set -a; . $RemoteAppRoot/shared/.env; set +a; cd $RemoteAppRoot/current; npm run import:season1:snapshot -- --input $season1RemotePath`""
}

if ($UpdateSeasons.IsPresent) {
  Write-Host "Running season update pipeline on remote"
  $publishFlag = if ($PublishSeason2.IsPresent) { "PUBLISH_SEASON2_ON_UPDATE=true" } else { "PUBLISH_SEASON2_ON_UPDATE=false" }
  Exec-OrThrow "ssh -i `"$resolvedKey`" ${User}@${HostName} `"set -a; . $RemoteAppRoot/shared/.env; set +a; cd $RemoteAppRoot/current; $publishFlag npm run update:seasons`""
}

Write-Host "Cleaning local archive"
Remove-Item -Force $archivePath

Write-Host "Deployment complete."
