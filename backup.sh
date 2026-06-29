#!/usr/bin/env bash
# =============================================================================
# backup.sh — Pathology LIS nightly backup (Linux + Docker)
#
# ไม่มีค่าใดถูก hardcode — ทุกอย่างอ่านจาก backend/.env
# Keys ที่ต้องมีใน .env:
#   DATABASE_URL          postgresql+psycopg2://user:pass@host:port/dbname
#   BACKUP_ROOT           /mnt/PATHOLOGY_BK/pathology_backup
#   DB_CONTAINER          pathology-db         (optional, default: pathology-db)
#   SLACK_BACKUP_WEBHOOK  https://hooks.slack.com/...  (optional)
#
# วิธีใช้:
#   chmod +x backup.sh && ./backup.sh
#
# ตั้ง cron (ทุกวันเที่ยงคืน):
#   0 0 * * * /opt/pathology/backup.sh >> /var/log/pathology_backup.log 2>&1
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# LOAD .env
# ---------------------------------------------------------------------------

ENV_FILE="$(dirname "$0")/backend/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "[ERROR] ไม่พบ $ENV_FILE" >&2; exit 1
fi
# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a

# --- required ---
if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "[ERROR] DATABASE_URL ไม่พบใน $ENV_FILE" >&2; exit 1
fi
if [[ -z "${BACKUP_ROOT:-}" ]]; then
  echo "[ERROR] BACKUP_ROOT ไม่พบใน $ENV_FILE" >&2; exit 1
fi

# parse DATABASE_URL = postgresql+psycopg2://user:pass@host:port/dbname
_URL="${DATABASE_URL#*://}"
DB_USER="${_URL%%:*}"
_URL="${_URL#*:}"; DB_PASSWORD="${_URL%%@*}"
_URL="${_URL#*@}"; DB_HOST="${_URL%%:*}"
_URL="${_URL#*:}"; DB_PORT="${_URL%%/*}"
DB_NAME="${_URL#*/}"; DB_NAME="${DB_NAME%%\?*}"

DB_CONTAINER="${DB_CONTAINER:-pathology-db}"
SLACK_BACKUP_WEBHOOK="${SLACK_BACKUP_WEBHOOK:-}"
STORAGE_DIR="$(dirname "$0")/backend/data/storage"
LOG_CSV="$BACKUP_ROOT/backup_log.csv"

# ตรวจสอบว่า BACKUP_ROOT เข้าถึงได้จริง (HDD mount แล้วหรือยัง)
if ! mkdir -p "$BACKUP_ROOT" 2>/dev/null; then
  echo "[ERROR] ไม่สามารถสร้าง BACKUP_ROOT: $BACKUP_ROOT (HDD อาจยังไม่ได้ mount)" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# INTERNAL
# ---------------------------------------------------------------------------

DATE_LABEL=$(date '+%Y-%m-%d %H:%M')
DB_DUMP_FILE="$BACKUP_ROOT/db_latest.dump"
STORAGE_ARCHIVE="$BACKUP_ROOT/storage_latest.tar.gz"
STATUS="SUCCESS"
DETAIL=""
DB_SIZE="-"
FILES_SIZE="-"

log_result() {
  if [[ ! -f "$LOG_CSV" ]]; then
    echo "timestamp,status,db_size_mb,storage_size_mb,detail" >> "$LOG_CSV"
  fi
  echo "$(date '+%Y-%m-%d %H:%M:%S'),$STATUS,$DB_SIZE,$FILES_SIZE,$DETAIL" >> "$LOG_CSV"
}

notify_slack() {
  [[ -z "$SLACK_BACKUP_WEBHOOK" ]] && return 0
  local text
  if [[ "$STATUS" == "SUCCESS" ]]; then
    text=":white_check_mark: *Pathology LIS Backup สำเร็จ* — ${DATE_LABEL}\n• DB: ${DB_SIZE} MB\n• Storage: ${FILES_SIZE} MB"
  else
    text=":x: *Pathology LIS Backup ล้มเหลว* — ${DATE_LABEL}\n• สาเหตุ: ${DETAIL}"
  fi
  curl -s -X POST "$SLACK_BACKUP_WEBHOOK" \
    -H "Content-Type: application/json" \
    -d "{\"text\": \"${text}\"}" \
    --max-time 10 || true
}

fail() {
  STATUS="FAILED"; DETAIL="$1"
  echo "[ERROR] $1" >&2
  log_result; notify_slack; exit 1
}

# ---------------------------------------------------------------------------
# MAIN
# ---------------------------------------------------------------------------

echo "=== Pathology LIS Backup: $DATE_LABEL ==="

# 1. Backup Database (ทับไฟล์เดิม)
echo "[1/2] Dumping PostgreSQL..."
if ! docker ps --format '{{.Names}}' | grep -q "^${DB_CONTAINER}$"; then
  fail "Docker container '$DB_CONTAINER' is not running"
fi

PGPASSWORD="$DB_PASSWORD" docker exec -e PGPASSWORD="$DB_PASSWORD" "$DB_CONTAINER" \
  pg_dump -U "$DB_USER" -d "$DB_NAME" --format=custom --compress=9 \
  > "$DB_DUMP_FILE" || fail "pg_dump failed"

DB_SIZE=$(du -m "$DB_DUMP_FILE" | cut -f1)
echo "    -> $DB_DUMP_FILE (${DB_SIZE} MB)"

# 2. Backup Storage (ทับไฟล์เดิม)
echo "[2/2] Archiving storage..."
if [[ -d "$STORAGE_DIR" ]]; then
  tar -czf "$STORAGE_ARCHIVE" -C "$(dirname "$STORAGE_DIR")" "$(basename "$STORAGE_DIR")" \
    || fail "tar archive failed"
  FILES_SIZE=$(du -m "$STORAGE_ARCHIVE" | cut -f1)
  echo "    -> $STORAGE_ARCHIVE (${FILES_SIZE} MB)"
else
  DETAIL="storage dir not found: $STORAGE_DIR"
  echo "    [WARN] $DETAIL"
fi

# 3. Log + Slack
log_result; notify_slack
echo "=== Done. Log: $LOG_CSV ==="
