#!/bin/bash
#
# TPT Court — Backup Script
#
# Creates a PostgreSQL dump and optionally syncs it to S3-compatible storage.
# Designed to run as a Docker container with crond.
#
# Environment variables:
#   BACKUP_ENABLED          — set to "true" to enable (default: false)
#   BACKUP_S3_ENDPOINT      — S3-compatible endpoint (e.g. https://s3.wasabisys.com)
#   BACKUP_S3_REGION        — S3 region (default: us-east-1)
#   BACKUP_S3_BUCKET        — S3 bucket name
#   BACKUP_S3_ACCESS_KEY    — S3 access key
#   BACKUP_S3_SECRET_KEY    — S3 secret key
#   BACKUP_SCHEDULE         — cron schedule (default: "0 3 * * *" = daily at 3am)
#   BACKUP_RETENTION_DAYS   — days to keep backups on S3 (default: 30)
#   BACKUP_ENCRYPTION_KEY   — optional: encrypt dumps with openssl before upload
#   PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD — PostgreSQL connection
#
# This script is intended to run inside a Docker container.
# It does NOT run as a cron job by default — it runs once per invocation.
# The Dockerfile wraps it with crond for scheduled execution.

set -euo pipefail

# ── Config ──────────────────────────────────────────────────────────────────

BACKUP_ENABLED="${BACKUP_ENABLED:-false}"
BACKUP_S3_ENDPOINT="${BACKUP_S3_ENDPOINT:-}"
BACKUP_S3_REGION="${BACKUP_S3_REGION:-us-east-1}"
BACKUP_S3_BUCKET="${BACKUP_S3_BUCKET:-}"
BACKUP_S3_ACCESS_KEY="${BACKUP_S3_ACCESS_KEY:-}"
BACKUP_S3_SECRET_KEY="${BACKUP_S3_SECRET_KEY:-}"
BACKUP_SCHEDULE="${BACKUP_SCHEDULE:-0 3 * * *}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
BACKUP_ENCRYPTION_KEY="${BACKUP_ENCRYPTION_KEY:-}"

PGHOST="${PGHOST:-postgres}"
PGPORT="${PGPORT:-5432}"
PGDATABASE="${PGDATABASE:-tpt_court}"
PGUSER="${PGUSER:-postgres}"
PGPASSWORD="${PGPASSWORD:-postgres}"

export PGHOST PGPORT PGDATABASE PGUSER PGPASSWORD

TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_DIR="/backup"
BACKUP_FILE="tpt_court_${TIMESTAMP}.sql.gz"
BACKUP_PATH="${BACKUP_DIR}/${BACKUP_FILE}"

# ── Functions ────────────────────────────────────────────────────────────────

log() {
  echo "[$(date +%Y-%m-%dT%H:%M:%S)] $*"
}

create_backup() {
  log "Creating database dump: ${BACKUP_FILE}"
  pg_dump --no-owner --no-acl --compress=9 -f "${BACKUP_PATH}" "${PGDATABASE}"
  log "Dump size: $(du -h "${BACKUP_PATH}" | cut -f1)"
}

encrypt_backup() {
  if [ -n "${BACKUP_ENCRYPTION_KEY}" ]; then
    local encrypted="${BACKUP_PATH}.enc"
    log "Encrypting backup..."
    openssl enc -aes-256-cbc -salt -pbkdf2 -in "${BACKUP_PATH}" -out "${encrypted}" -pass pass:"${BACKUP_ENCRYPTION_KEY}"
    rm -f "${BACKUP_PATH}"
    BACKUP_PATH="${encrypted}"
    BACKUP_FILE="${BACKUP_FILE}.enc"
    log "Encrypted: ${BACKUP_FILE}"
  fi
}

sync_to_s3() {
  if [ -z "${BACKUP_S3_ENDPOINT}" ] || [ -z "${BACKUP_S3_BUCKET}" ] || [ -z "${BACKUP_S3_ACCESS_KEY}" ]; then
    log "S3 not configured — skipping remote sync"
    return 1
  fi

  log "Syncing to S3: ${BACKUP_S3_ENDPOINT}/${BACKUP_S3_BUCKET}/"

  # Build rclone config on the fly
  cat > /tmp/rclone.conf <<EOF
[remote]
type = s3
provider = Other
endpoint = ${BACKUP_S3_ENDPOINT}
region = ${BACKUP_S3_REGION}
access_key_id = ${BACKUP_S3_ACCESS_KEY}
secret_access_key = ${BACKUP_S3_SECRET_KEY}
acl = private
EOF

  # Upload
  rclone --config /tmp/rclone.conf copy "${BACKUP_PATH}" "remote:${BACKUP_S3_BUCKET}/postgres/"
  log "Upload complete"

  # Cleanup old backups (older than retention days)
  log "Cleaning backups older than ${BACKUP_RETENTION_DAYS} days..."
  rclone --config /tmp/rclone.conf delete "remote:${BACKUP_S3_BUCKET}/postgres/" --min-age "${BACKUP_RETENTION_DAYS}d" --quiet 2>/dev/null || true

  rm -f /tmp/rclone.conf
  log "Remote sync done"
}

cleanup_local() {
  log "Cleaning local backup files older than 7 days..."
  find "${BACKUP_DIR}" -name "tpt_court_*.sql.gz*" -mtime +7 -delete 2>/dev/null || true
}

# ── Main ────────────────────────────────────────────────────────────────────

mkdir -p "${BACKUP_DIR}"

if [ "${BACKUP_ENABLED}" != "true" ]; then
  log "Backups are disabled (BACKUP_ENABLED != true). Running in idle mode."
  log "Set BACKUP_ENABLED=true and configure BACKUP_S3_* to enable."

  # If crond is available, set up the schedule anyway for when it's enabled
  if command -v crond &>/dev/null; then
    # Write the cron entry that runs this script on schedule
    echo "${BACKUP_SCHEDULE} root /usr/local/bin/backup.sh >> /var/log/backup.log 2>&1" > /etc/crontabs/root
    echo "0 0 * * 0 root find /backup -name '*.sql.gz*' -mtime +7 -delete" >> /etc/crontabs/root
    log "Cron scheduled: ${BACKUP_SCHEDULE}"
    crond -f
  else
    # Sleep forever to keep container alive
    tail -f /dev/null
  fi
  exit 0
fi

log "=== Backup started ==="

create_backup
encrypt_backup
sync_to_s3
cleanup_local

log "=== Backup completed successfully ==="
log "File: ${BACKUP_FILE}"

# If running in cron mode, exit. Otherwise sleep until next run.
if [ -n "${RUN_ONCE}" ]; then
  exit 0
fi

# When no S3 is configured, just keep the container alive
if [ -z "${BACKUP_S3_ENDPOINT}" ]; then
  tail -f /dev/null
fi