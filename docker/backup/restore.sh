#!/bin/bash
#
# TPT Court — Restore Script
#
# Downloads the latest backup from S3-compatible storage and restores it.
#
# Usage:
#   docker compose exec backup restore.sh
#   docker compose exec backup restore.sh tpt_court_20250101_030000.sql.gz
#
# Environment (same as backup.sh):
#   BACKUP_S3_ENDPOINT, BACKUP_S3_BUCKET, BACKUP_S3_ACCESS_KEY, BACKUP_S3_SECRET_KEY
#   BACKUP_ENCRYPTION_KEY (if the backup was encrypted)
#   PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD

set -euo pipefail

BACKUP_S3_ENDPOINT="${BACKUP_S3_ENDPOINT:-}"
BACKUP_S3_REGION="${BACKUP_S3_REGION:-us-east-1}"
BACKUP_S3_BUCKET="${BACKUP_S3_BUCKET:-}"
BACKUP_S3_ACCESS_KEY="${BACKUP_S3_ACCESS_KEY:-}"
BACKUP_S3_SECRET_KEY="${BACKUP_S3_SECRET_KEY:-}"
BACKUP_ENCRYPTION_KEY="${BACKUP_ENCRYPTION_KEY:-}"

PGHOST="${PGHOST:-postgres}"
PGPORT="${PGPORT:-5432}"
PGDATABASE="${PGDATABASE:-tpt_court}"
PGUSER="${PGUSER:-postgres}"
PGPASSWORD="${PGPASSWORD:-postgres}"

export PGHOST PGPORT PGDATABASE PGUSER PGPASSWORD

log() {
  echo "[$(date +%Y-%m-%dT%H:%M:%S)] $*"
}

# Check if S3 is configured
if [ -z "${BACKUP_S3_ENDPOINT}" ] || [ -z "${BACKUP_S3_BUCKET}" ] || [ -z "${BACKUP_S3_ACCESS_KEY}" ]; then
  log "ERROR: S3 not configured. Set BACKUP_S3_ENDPOINT, BACKUP_S3_BUCKET, BACKUP_S3_ACCESS_KEY."
  exit 1
fi

# Build rclone config
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

# If a specific file was passed, use it. Otherwise grab the latest.
if [ $# -ge 1 ]; then
  REMOTE_FILE="$1"
  log "Using specified backup: ${REMOTE_FILE}"
else
  log "Finding latest backup..."
  REMOTE_FILE=$(rclone --config /tmp/rclone.conf ls "remote:${BACKUP_S3_BUCKET}/postgres/" | sort -k2 | tail -1 | awk '{print $2}')
  if [ -z "${REMOTE_FILE}" ]; then
    log "ERROR: No backups found in remote:${BACKUP_S3_BUCKET}/postgres/"
    exit 1
  fi
  log "Latest backup: ${REMOTE_FILE}"
fi

# Download
LOCAL_FILE="/tmp/$(basename "${REMOTE_FILE}")"
log "Downloading..."
rclone --config /tmp/rclone.conf copy "remote:${BACKUP_S3_BUCKET}/postgres/${REMOTE_FILE}" "/tmp/" -P

# Decrypt if needed
if [[ "${LOCAL_FILE}" == *.enc ]]; then
  if [ -z "${BACKUP_ENCRYPTION_KEY}" ]; then
    log "ERROR: Backup is encrypted but BACKUP_ENCRYPTION_KEY is not set"
    exit 1
  fi
  DECRYPTED="${LOCAL_FILE%.enc}"
  log "Decrypting..."
  openssl enc -d -aes-256-cbc -pbkdf2 -in "${LOCAL_FILE}" -out "${DECRYPTED}" -pass pass:"${BACKUP_ENCRYPTION_KEY}"
  LOCAL_FILE="${DECRYPTED}"
fi

# Confirm
log "WARNING: This will OVERWRITE the database '${PGDATABASE}' on ${PGHOST}:${PGPORT}"
read -rp "Continue? (yes/no): " CONFIRM
if [ "${CONFIRM}" != "yes" ]; then
  log "Restore cancelled"
  exit 0
fi

# Restore
log "Dropping existing connections..."
psql -c "SELECT pg_terminate_backend(pg_stat_activity.pid) FROM pg_stat_activity WHERE pg_stat_activity.datname = '${PGDATABASE}' AND pid <> pg_backend_pid();" 2>/dev/null || true

log "Restoring from: ${LOCAL_FILE}"
if [[ "${LOCAL_FILE}" == *.gz ]]; then
  gunzip -c "${LOCAL_FILE}" | psql
else
  psql -f "${LOCAL_FILE}"
fi

log "Restore completed successfully"
rm -f /tmp/rclone.conf