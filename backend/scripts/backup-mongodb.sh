#!/usr/bin/env bash
set -euo pipefail

# MongoDB Backup Script — run via cron: 0 2 * * * /path/to/backup-mongodb.sh
BACKUP_DIR="${BACKUP_PATH:-./backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
MONGO_URI="${MONGODB_URI:-mongodb://localhost:27017/acustock}"

mkdir -p "$BACKUP_DIR"

echo "Starting MongoDB backup at $TIMESTAMP..."
mongodump --uri="$MONGO_URI" --gzip --out="$BACKUP_DIR/dump_$TIMESTAMP"

# Retain last 7 daily backups
find "$BACKUP_DIR" -name "dump_*" -type d -mtime +7 -exec rm -rf {} + 2>/dev/null || true

echo "Backup complete: $BACKUP_DIR/dump_$TIMESTAMP"
