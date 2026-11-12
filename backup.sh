#!/usr/bin/env bash
# =============================================================================
# backup.sh — Pathology LIS nightly backup (Linux + Docker)
#
# ไม่มีค่าใดถูก hardcode — ทุกอย่างอ่านจาก backend/.env
# Keys ที่ต้องมีใน .env:
#   DATABASE_URL          postgresql+psycopg2://user:pass@host:port/dbname
#   BACKUP_ROOT           /mnt/PATHOLOGY_BK/pathology_backup
#   DB_CONTAINER          pathology-db         (optional, default: pathology-db)
#   BACKEND_CONTAINER     pathology-backend    (optional, default: pathology-backend)
#   SLACK_BACKUP_WEBHOOK  https://hooks.slack.com/...  (optional)
#   BACKUP_SKIP_DISK_CHECK true  (optional — only when BACKUP_ROOT is meant to
#                         be on the system or Docker disk, see step 0 below)
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

# Read only the keys this script uses, the way python-dotenv and docker compose
# read them. backend/.env is not a shell script: `source` ran an unquoted value
# with spaces, such as `HOSXP_FORM_GYNE=PAP smear, liquid based ...` from
# .env.example, as a command, and under `set -e` that ended the script right
# there, before any CSV row or Slack alert, so the backup stopped silently.
env_get() {
  local line value quote
  line=$(grep -E "^[[:space:]]*(export[[:space:]]+)?$1[[:space:]]*=" "$ENV_FILE" | tail -n 1 || true)
  [[ -z "$line" ]] && return 0
  value="${line#*=}"
  value="${value%$'\r'}"                      # a file last saved on Windows
  value="${value#"${value%%[![:space:]]*}"}"  # leading whitespace
  quote="${value:0:1}"
  if [[ "$quote" == '"' || "$quote" == "'" ]]; then
    value="${value:1}"
    value="${value%%"$quote"*}"               # up to the closing quote
  else
    value="${value%%[[:space:]]#*}"           # an inline ` # comment`
    value="${value%"${value##*[![:space:]]}"}" # trailing whitespace
  fi
  printf '%s' "$value"
}

DATABASE_URL="$(env_get DATABASE_URL)"
BACKUP_ROOT="$(env_get BACKUP_ROOT)"
DB_CONTAINER="$(env_get DB_CONTAINER)"
BACKEND_CONTAINER="$(env_get BACKEND_CONTAINER)"
SLACK_BACKUP_WEBHOOK="$(env_get SLACK_BACKUP_WEBHOOK)"
BACKUP_KEEP="$(env_get BACKUP_KEEP)"
BACKUP_SKIP_DISK_CHECK="$(env_get BACKUP_SKIP_DISK_CHECK)"

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
BACKEND_CONTAINER="${BACKEND_CONTAINER:-pathology-backend}"
LOG_CSV="$BACKUP_ROOT/backup_log.csv"

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

# For a BACKUP_ROOT that is not usable: alert, but write no CSV row, since the
# CSV lives in BACKUP_ROOT and would land in the wrong place too.
fail_backup_root() {
  STATUS="FAILED"; DETAIL="$1"
  echo "[ERROR] $1" >&2
  notify_slack; exit 1
}

# Device number of the filesystem a path is on (GNU stat, then BSD stat).
fs_id() { stat -L -c %d "$1" 2>/dev/null || stat -L -f %d "$1" 2>/dev/null || true; }

# ---------------------------------------------------------------------------
# MAIN
# ---------------------------------------------------------------------------

echo "=== Pathology LIS Backup: $DATE_LABEL ==="

# 0. BACKUP_ROOT has to be on the backup disk itself.
# An unmounted HDD leaves its mount point behind as an ordinary folder on the
# system disk. This check used to be only `mkdir -p`, which succeeds there when
# cron runs as root (as it does to use docker), so the backup was written to
# the disk it exists to survive and reported as a success. BACKUP_ROOT, by its
# nearest existing parent so nothing is created first, may not share a
# filesystem with / or with the Docker data root, where postgres_data lives.
if [[ "${BACKUP_SKIP_DISK_CHECK:-}" != "true" ]]; then
  probe="$BACKUP_ROOT"
  while [[ ! -e "$probe" ]]; do probe="$(dirname "$probe")"; done
  backup_fs="$(fs_id "$probe")"
  docker_root="$(docker info --format '{{.DockerRootDir}}' 2>/dev/null || true)"
  for disk in / "$docker_root"; do
    # Docker Desktop reports a path inside its VM, not one on this host.
    [[ -n "$disk" && -d "$disk" ]] || continue
    if [[ -n "$backup_fs" && "$backup_fs" == "$(fs_id "$disk")" ]]; then
      fail_backup_root "BACKUP_ROOT ($BACKUP_ROOT) อยู่บน disk เดียวกับ $disk — HDD อาจยังไม่ได้ mount (ถ้าตั้งใจเก็บไว้บน disk นี้ ให้ตั้ง BACKUP_SKIP_DISK_CHECK=true)"
    fi
  done
fi
if ! mkdir -p "$BACKUP_ROOT" 2>/dev/null; then
  fail_backup_root "ไม่สามารถสร้าง BACKUP_ROOT: $BACKUP_ROOT (HDD อาจยังไม่ได้ mount)"
fi

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
# Uploads live in the backend container's uploads_data volume, not on the
# host, so they are archived from inside the container, as pg_dump is above.
# This used to tar the host's backend/data/storage, which the backend never
# wrote to: every run archived an empty folder and reported success.
echo "[2/3] Archiving storage..."
if ! docker ps --format '{{.Names}}' | grep -q "^${BACKEND_CONTAINER}$"; then
  fail "Docker container '$BACKEND_CONTAINER' is not running"
fi

docker exec "$BACKEND_CONTAINER" tar -czf - -C /app uploads \
  > "$STORAGE_TMP" || fail "tar archive failed"
mv -f "$STORAGE_TMP" "$STORAGE_ARCHIVE"
FILES_SIZE=$(du -m "$STORAGE_ARCHIVE" | cut -f1)
echo "    -> $STORAGE_ARCHIVE (${FILES_SIZE} MB)"

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
