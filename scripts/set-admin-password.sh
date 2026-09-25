#!/usr/bin/env bash
# Set the ERPNext Administrator password from .env (ADMIN_PASSWORD).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f "$ROOT/.env" ]]; then
	echo "Missing $ROOT/.env — copy .env.example and set ADMIN_PASSWORD" >&2
	exit 1
fi

# shellcheck disable=SC1091
set -a
source "$ROOT/.env"
set +a

SITE_NAME="${SITE_NAME:-frontend}"
if [[ -z "${ADMIN_PASSWORD:-}" || "$ADMIN_PASSWORD" == "changeme" ]]; then
	echo "Set a real ADMIN_PASSWORD in .env first" >&2
	exit 1
fi

docker compose --project-directory "$ROOT" exec -T backend \
	bench --site "$SITE_NAME" set-admin-password "$ADMIN_PASSWORD"
echo "Administrator password updated for site $SITE_NAME"
