# backup.ps1 - Pathology LIS nightly backup (Windows Server, native PostgreSQL)
# All config is read from backend\.env - no hardcoded values
# Required keys in .env:
#   DATABASE_URL         postgresql+psycopg2://user:pass@host:port/dbname
#   BACKUP_ROOT          e.g. C:\LIS_Backup
#   BACKUP_PG_BIN        e.g. C:\Program Files\PostgreSQL\18\bin
#   SLACK_BACKUP_WEBHOOK https://hooks.slack.com/...  (optional)
#   BACKUP_KEEP          how many dated backups to retain (optional, default 14)

# ---------------------------------------------------------------------------
# LOAD .env
# ---------------------------------------------------------------------------

$ENV_FILE = Join-Path $PSScriptRoot "backend\.env"
if (-not (Test-Path $ENV_FILE)) { Write-Error "Not found: $ENV_FILE"; exit 1 }

$cfg = @{}
Get-Content $ENV_FILE | ForEach-Object {
    if ($_ -match '^\s*([^#\s][^=]*)=(.*)$') {
        # Trim quotes too: BACKUP_ROOT="D:\path" is valid in a .env file but
        # the quotes would end up inside the path.
        $cfg[$matches[1].Trim()] = $matches[2].Trim().Trim('"').Trim("'")
    }
}

foreach ($key in @("DATABASE_URL", "BACKUP_ROOT", "BACKUP_PG_BIN")) {
    if (-not $cfg[$key]) { Write-Error "$key not found in $ENV_FILE"; exit 1 }
}

if ($cfg["DATABASE_URL"] -match '://([^:]+):([^@]+)@([^:/]+):?(\d+)?/([^?]+)') {
    $DB_USER     = $matches[1]
    $DB_PASSWORD = $matches[2]
    $DB_HOST     = $matches[3]
    $DB_PORT     = if ($matches[4]) { $matches[4] } else { "5432" }
    $DB_NAME     = $matches[5]
} else { Write-Error "Invalid DATABASE_URL format"; exit 1 }

$PG_BIN        = $cfg["BACKUP_PG_BIN"]
$BACKUP_ROOT   = $cfg["BACKUP_ROOT"]
$SLACK_WEBHOOK = $cfg["SLACK_BACKUP_WEBHOOK"]
$STORAGE_DIR   = if ($cfg["STORAGE_DIR"]) { $cfg["STORAGE_DIR"] } else { Join-Path $PSScriptRoot "backend\uploads" }

# ---------------------------------------------------------------------------
# INTERNAL
# ---------------------------------------------------------------------------

$DATE_LABEL      = Get-Date -Format "yyyy-MM-dd HH:mm"
$STAMP           = Get-Date -Format "yyyy-MM-dd_HHmm"
$LOG_CSV         = Join-Path $BACKUP_ROOT "backup_log.csv"

# Dated filenames, not a single db_latest.dump that every run overwrites.
# Writing straight onto the previous backup destroys it the moment pg_dump
# starts: a run that dies halfway - disk full, network drop, database restart -
# used to leave no usable backup at all, and the failure alert would say "this
# run failed" without mentioning that yesterday's copy went with it.
#
# Each run writes to .part, is verified, and only then takes its final name.
$DB_DUMP_FILE    = Join-Path $BACKUP_ROOT "db_$STAMP.dump"
$STORAGE_ARCHIVE = Join-Path $BACKUP_ROOT "storage_$STAMP.zip"
$DB_DUMP_TMP     = "$DB_DUMP_FILE.part"
$STORAGE_TMP     = "$STORAGE_ARCHIVE.part"
$KEEP            = if ($cfg["BACKUP_KEEP"]) { [int]$cfg["BACKUP_KEEP"] } else { 14 }
$STATUS          = "SUCCESS"
$DETAIL          = ""
$DB_SIZE         = "-"
$FILES_SIZE      = "-"

function Write-Log($msg) { Write-Host "[$(Get-Date -Format 'HH:mm:ss')] $msg" }

function Log-Result {
    if (-not (Test-Path $LOG_CSV)) {
        "timestamp,status,db_size_mb,storage_size_mb,detail" | Out-File $LOG_CSV -Encoding utf8
    }
    # $DETAIL is free text and routinely contains commas, which would shift
    # every column after it.
    $safeDetail = '"' + ($DETAIL -replace '"', '""') + '"'
    "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss'),$STATUS,$DB_SIZE,$FILES_SIZE,$safeDetail" |
        Out-File $LOG_CSV -Encoding utf8 -Append
}

function Notify-Slack($text) {
    if (-not $SLACK_WEBHOOK) { return }
    try {
        $body = @{ text = $text } | ConvertTo-Json -Compress
        Invoke-RestMethod -Uri $SLACK_WEBHOOK -Method Post -Body $body `
            -ContentType "application/json" -TimeoutSec 10 | Out-Null
    } catch { Write-Log "[WARN] Slack failed: $_" }
}

function Fail($msg) {
    $script:STATUS = "FAILED"; $script:DETAIL = $msg
    # Leave no half-written .part behind to be mistaken for a real backup.
    foreach ($tmp in @($DB_DUMP_TMP, $STORAGE_TMP)) {
        if ($tmp -and (Test-Path $tmp)) { Remove-Item $tmp -Force -ErrorAction SilentlyContinue }
    }
    Write-Log "[ERROR] $msg"
    Log-Result
    Notify-Slack ":x: *Pathology LIS Backup FAILED* - $DATE_LABEL`n- Reason: $msg"
    exit 1
}

# ---------------------------------------------------------------------------
# MAIN
# ---------------------------------------------------------------------------

Write-Log "=== Pathology LIS Backup: $DATE_LABEL ==="

New-Item -ItemType Directory -Path $BACKUP_ROOT -Force | Out-Null

# 1. Backup Database
Write-Log "[1/3] Dumping PostgreSQL..."
$pgDump    = Join-Path $PG_BIN "pg_dump.exe"
$pgRestore = Join-Path $PG_BIN "pg_restore.exe"
if (-not (Test-Path $pgDump))    { Fail "pg_dump.exe not found: $pgDump" }
if (-not (Test-Path $pgRestore)) { Fail "pg_restore.exe not found: $pgRestore" }

$env:PGPASSWORD = $DB_PASSWORD
& $pgDump -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME --format=custom --compress=9 -f $DB_DUMP_TMP
$dumpExit = $LASTEXITCODE
Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
if ($dumpExit -ne 0) { Fail "pg_dump failed (exit $dumpExit)" }

# Verify before promoting. A dump nobody has read back is not yet a backup:
# pg_restore -l parses the archive's table of contents, so a truncated or
# corrupt file fails here instead of on the day it is needed.
$toc = & $pgRestore -l $DB_DUMP_TMP 2>&1
if ($LASTEXITCODE -ne 0) { Fail "dump is unreadable by pg_restore -l" }
$tableCount = ($toc | Select-String "TABLE DATA").Count
if ($tableCount -lt 1) { Fail "dump contains no table data" }

Move-Item -Path $DB_DUMP_TMP -Destination $DB_DUMP_FILE -Force
$DB_SIZE = [math]::Round((Get-Item $DB_DUMP_FILE).Length / 1MB, 2)
Write-Log "    -> $DB_DUMP_FILE ($DB_SIZE MB, $tableCount tables verified)"

# 2. Backup Storage
Write-Log "[2/3] Archiving storage..."
if (Test-Path $STORAGE_DIR) {
    # Compress-Archive is built on .NET ZipArchive and cannot produce a valid
    # zip past 2 GB on Windows PowerShell 5.1 - it fails, or worse writes an
    # archive that only turns out to be unreadable when someone tries to
    # restore from it. Prefer 7-Zip when present; refuse rather than gamble.
    $sevenZip = @(
        "C:\Program Files\7-Zip\7z.exe",
        "C:\Program Files (x86)\7-Zip\7z.exe"
    ) | Where-Object { Test-Path $_ } | Select-Object -First 1

    $rawBytes = (Get-ChildItem $STORAGE_DIR -Recurse -File -ErrorAction SilentlyContinue |
                 Measure-Object -Property Length -Sum).Sum
    $rawGB = [math]::Round($rawBytes / 1GB, 2)

    if ($sevenZip) {
        & $sevenZip a -tzip -mx5 $STORAGE_TMP "$STORAGE_DIR\*" | Out-Null
        if ($LASTEXITCODE -ne 0) { Fail "7-Zip failed (exit $LASTEXITCODE)" }
    }
    elseif ($rawBytes -ge 2GB) {
        Fail ("storage is $rawGB GB, past the 2 GB limit of Compress-Archive. " +
              "Install 7-Zip (the script uses it automatically) or archive this directory another way.")
    }
    else {
        if ($rawBytes -ge 1.5GB) {
            Write-Log "    [WARN] storage is $rawGB GB and approaching the 2 GB Compress-Archive limit - install 7-Zip before it is reached"
        }
        Compress-Archive -Path "$STORAGE_DIR\*" -DestinationPath $STORAGE_TMP -CompressionLevel Optimal
        if (-not $?) { Fail "Compress-Archive failed" }
    }

    Move-Item -Path $STORAGE_TMP -Destination $STORAGE_ARCHIVE -Force
    $FILES_SIZE = [math]::Round((Get-Item $STORAGE_ARCHIVE).Length / 1MB, 2)
    Write-Log "    -> $STORAGE_ARCHIVE ($FILES_SIZE MB)"
} else {
    $DETAIL = "storage dir not found: $STORAGE_DIR"
    Write-Log "    [WARN] $DETAIL"
}

# 3. Prune old backups - only ever after a successful, verified run, so a run
# of failures can never age out the last good copy.
Write-Log "[3/3] Pruning to the newest $KEEP of each..."
foreach ($pattern in @("db_*.dump", "storage_*.zip")) {
    Get-ChildItem -Path $BACKUP_ROOT -Filter $pattern -File |
        Sort-Object LastWriteTime -Descending |
        Select-Object -Skip $KEEP |
        ForEach-Object {
            Write-Log "    removing $($_.Name)"
            Remove-Item $_.FullName -Force -ErrorAction SilentlyContinue
        }
}

# 4. Log + Slack
Log-Result
Notify-Slack ":white_check_mark: *Pathology LIS Backup OK* - $DATE_LABEL`n- DB: $DB_SIZE MB`n- Storage: $FILES_SIZE MB"
Write-Log "=== Done. Log: $LOG_CSV ==="
