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
STAMP=$(date '+%Y-%m-%d_%H%M')

# Dated filenames, not a single db_latest.dump that every run overwrites.
# `pg_dump > file` truncates the target the instant the redirect is set up, so
# the previous backup was destroyed before the new one had written a byte: a
# run that died halfway left nothing usable, and the alert said only that this
# run had failed. Each run now writes to .part, is verified, then renamed.
DB_DUMP_FILE="$BACKUP_ROOT/db_${STAMP}.dump"
STORAGE_ARCHIVE="$BACKUP_ROOT/storage_${STAMP}.tar.gz"
DB_DUMP_TMP="${DB_DUMP_FILE}.part"
STORAGE_TMP="${STORAGE_ARCHIVE}.part"
KEEP="${BACKUP_KEEP:-14}"
STATUS="SUCCESS"
DETAIL=""
DB_SIZE="-"
FILES_SIZE="-"

log_result() {
  if [[ ! -f "$LOG_CSV" ]]; then
    echo "timestamp,status,db_size_mb,storage_size_mb,detail" >> "$LOG_CSV"
  fi
  # DETAIL is free text and routinely contains commas, which would shift every
  # column after it.
  local safe_detail="\"${DETAIL//\"/\"\"}\""
  echo "$(date '+%Y-%m-%d %H:%M:%S'),$STATUS,$DB_SIZE,$FILES_SIZE,$safe_detail" >> "$LOG_CSV"
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
  # Leave no half-written .part behind to be mistaken for a real backup.
  rm -f "${DB_DUMP_TMP:-}" "${STORAGE_TMP:-}" 2>/dev/null || true
  echo "[ERROR] $1" >&2
  log_result; notify_slack; exit 1
}

# ---------------------------------------------------------------------------
# MAIN
# ---------------------------------------------------------------------------

echo "=== Pathology LIS Backup: $DATE_LABEL ==="

# 1. Backup Database (ทับไฟล์เดิม)
echo "[1/3] Dumping PostgreSQL..."
if ! docker ps --format '{{.Names}}' | grep -q "^${DB_CONTAINER}$"; then
  fail "Docker container '$DB_CONTAINER' is not running"
fi

docker exec -e PGPASSWORD="$DB_PASSWORD" "$DB_CONTAINER" \
  pg_dump -U "$DB_USER" -d "$DB_NAME" --format=custom --compress=9 \
  > "$DB_DUMP_TMP" || fail "pg_dump failed"

# Verify before promoting. A dump nobody has read back is not yet a backup:
# pg_restore -l parses the archive's table of contents, so a truncated or
# corrupt file fails here rather than on the day it is needed.
# pg_restore with no file argument reads the archive from stdin.
TABLE_COUNT=$(docker exec -i "$DB_CONTAINER" pg_restore -l < "$DB_DUMP_TMP" 2>/dev/null \
  | grep -c "TABLE DATA" || true)
[[ "${TABLE_COUNT:-0}" -ge 1 ]] || fail "dump is unreadable or contains no table data"

mv -f "$DB_DUMP_TMP" "$DB_DUMP_FILE"
DB_SIZE=$(du -m "$DB_DUMP_FILE" | cut -f1)
echo "    -> $DB_DUMP_FILE (${DB_SIZE} MB, ${TABLE_COUNT} tables verified)"

# 2. Backup Storage
echo "[2/3] Archiving storage..."
if [[ -d "$STORAGE_DIR" ]]; then
  tar -czf "$STORAGE_TMP" -C "$(dirname "$STORAGE_DIR")" "$(basename "$STORAGE_DIR")" \
    || fail "tar archive failed"
  mv -f "$STORAGE_TMP" "$STORAGE_ARCHIVE"
  FILES_SIZE=$(du -m "$STORAGE_ARCHIVE" | cut -f1)
  echo "    -> $STORAGE_ARCHIVE (${FILES_SIZE} MB)"
else
  DETAIL="storage dir not found: $STORAGE_DIR"
  echo "    [WARN] $DETAIL"
fi

# 3. Prune old backups - only after a successful, verified run, so a run of
# failures can never age out the last good copy.
echo "[3/3] Pruning to the newest $KEEP of each..."
for pattern in "db_*.dump" "storage_*.tar.gz"; do
  # shellcheck disable=SC2012  # filenames here are script-generated timestamps
  ls -1t "$BACKUP_ROOT"/$pattern 2>/dev/null | tail -n "+$((KEEP + 1))" | while read -r old_file; do
    echo "    removing $(basename "$old_file")"
    rm -f "$old_file"
  done
done

# 4. Log + Slack
log_result; notify_slack
echo "=== Done. Log: $LOG_CSV ==="
