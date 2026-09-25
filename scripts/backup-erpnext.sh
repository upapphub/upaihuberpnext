#!/usr/bin/env bash
# Weekly (or on-demand) backup of the ERPNext site + MariaDB volume.
# Cron example (Sundays 02:00):
#   0 2 * * 0 /home/upoddar/upaihuberpnext/scripts/backup-erpnext.sh >> /home/upoddar/backups/erpnext/cron.log 2>&1
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f "$ROOT/.env" ]]; then
	# shellcheck disable=SC1091
	set -a
	source "$ROOT/.env"
	set +a
fi

SITE_NAME="${SITE_NAME:-frontend}"
BACKUP_DIR="${BACKUP_DIR:-/home/upoddar/backups/erpnext}"
KEEP_DAYS="${KEEP_DAYS:-14}"
STAMP="$(date +%Y%m%d-%H%M%S)"
DEST="$BACKUP_DIR/$STAMP"
COMPOSE=(docker compose --project-directory "$ROOT")

mkdir -p "$DEST"

echo "[backup] bench backup --with-files ($SITE_NAME)"
"${COMPOSE[@]}" exec -T backend bench --site "$SITE_NAME" backup --with-files

BENCH_BACKUPS="/home/frappe/frappe-bench/sites/${SITE_NAME}/private/backups"
mkdir -p "$DEST/bench"
docker cp "upaihuberpnext-backend-1:${BENCH_BACKUPS}/." "$DEST/bench/" 2>/dev/null || \
	"${COMPOSE[@]}" cp "backend:${BENCH_BACKUPS}/." "$DEST/bench/"

echo "[backup] mariadb dump"
"${COMPOSE[@]}" exec -T db mariadb-dump -uroot -p"${MYSQL_ROOT_PASSWORD:-admin}" \
	--single-transaction --routines --all-databases > "$DEST/mariadb-all.sql"

echo "[backup] prune older than ${KEEP_DAYS} days"
find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -mtime "+${KEEP_DAYS}" -exec rm -rf {} +

echo "[backup] done: $DEST"
ls -lh "$DEST"
