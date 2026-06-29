# backup.ps1 - Pathology LIS nightly backup (Windows Server, native PostgreSQL)
# All config is read from backend\.env - no hardcoded values
# Required keys in .env:
#   DATABASE_URL         postgresql+psycopg2://user:pass@host:port/dbname
#   BACKUP_ROOT          e.g. C:\LIS_Backup
#   BACKUP_PG_BIN        e.g. C:\Program Files\PostgreSQL\18\bin
#   SLACK_BACKUP_WEBHOOK https://hooks.slack.com/...  (optional)

# ---------------------------------------------------------------------------
# LOAD .env
# ---------------------------------------------------------------------------

$ENV_FILE = Join-Path $PSScriptRoot "backend\.env"
if (-not (Test-Path $ENV_FILE)) { Write-Error "Not found: $ENV_FILE"; exit 1 }

$cfg = @{}
Get-Content $ENV_FILE | ForEach-Object {
    if ($_ -match '^\s*([^#\s][^=]*)=(.*)$') {
        $cfg[$matches[1].Trim()] = $matches[2].Trim()
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
$LOG_CSV         = Join-Path $BACKUP_ROOT "backup_log.csv"
$DB_DUMP_FILE    = Join-Path $BACKUP_ROOT "db_latest.dump"
$STORAGE_ARCHIVE = Join-Path $BACKUP_ROOT "storage_latest.zip"
$STATUS          = "SUCCESS"
$DETAIL          = ""
$DB_SIZE         = "-"
$FILES_SIZE      = "-"

function Write-Log($msg) { Write-Host "[$(Get-Date -Format 'HH:mm:ss')] $msg" }

function Log-Result {
    if (-not (Test-Path $LOG_CSV)) {
        "timestamp,status,db_size_mb,storage_size_mb,detail" | Out-File $LOG_CSV -Encoding utf8
    }
    "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss'),$STATUS,$DB_SIZE,$FILES_SIZE,$DETAIL" |
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

# 1. Backup Database (overwrite previous file)
Write-Log "[1/2] Dumping PostgreSQL..."
$pgDump = Join-Path $PG_BIN "pg_dump.exe"
if (-not (Test-Path $pgDump)) { Fail "pg_dump.exe not found: $pgDump" }

$env:PGPASSWORD = $DB_PASSWORD
& $pgDump -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME --format=custom --compress=9 -f $DB_DUMP_FILE
Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
if ($LASTEXITCODE -ne 0) { Fail "pg_dump failed (exit $LASTEXITCODE)" }

$DB_SIZE = [math]::Round((Get-Item $DB_DUMP_FILE).Length / 1MB, 2)
Write-Log "    -> $DB_DUMP_FILE ($DB_SIZE MB)"

# 2. Backup Storage (overwrite previous file)
Write-Log "[2/2] Archiving storage..."
if (Test-Path $STORAGE_DIR) {
    if (Test-Path $STORAGE_ARCHIVE) { Remove-Item $STORAGE_ARCHIVE -Force }
    Compress-Archive -Path "$STORAGE_DIR\*" -DestinationPath $STORAGE_ARCHIVE -CompressionLevel Optimal
    if (-not $?) { Fail "Compress-Archive failed" }
    $FILES_SIZE = [math]::Round((Get-Item $STORAGE_ARCHIVE).Length / 1MB, 2)
    Write-Log "    -> $STORAGE_ARCHIVE ($FILES_SIZE MB)"
} else {
    $DETAIL = "storage dir not found: $STORAGE_DIR"
    Write-Log "    [WARN] $DETAIL"
}

# 3. Log + Slack
Log-Result
Notify-Slack ":white_check_mark: *Pathology LIS Backup OK* - $DATE_LABEL`n- DB: $DB_SIZE MB`n- Storage: $FILES_SIZE MB"
Write-Log "=== Done. Log: $LOG_CSV ==="
