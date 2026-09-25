# Deploy: ERPNext on this Ubuntu host (Docker)

This repo’s [docker-compose.yml](docker-compose.yml) is the production-like stack for site `frontend` (`https://erp.poddar.me`, host port **8090**). TLS stays on the reverse proxy in front of 8090.

Image pin: `frappe/erpnext:v16.32.3`. The bind-mount of this tree is a **custom fork**, not an ERPNext 17 upgrade.

## First-time / secrets

```bash
cp .env.example .env   # already done on this host
# Edit ADMIN_PASSWORD. Keep MYSQL_ROOT_PASSWORD=admin until you rotate MariaDB
# (the db-data volume was initialized with that password).
docker compose up -d
```

Administrator login: **Administrator** / value of `ADMIN_PASSWORD` in `.env`.

Rotate the Desk password later:

```bash
./scripts/set-admin-password.sh
```

Do not change `MYSQL_ROOT_PASSWORD` in `.env` without also updating the live MariaDB user; Compose env alone will not rewrite an existing volume.

## New site (empty volume only)

`create-site` installs **erpnext** and **poddar_os**. If `sites/$SITE_NAME` already exists, it is left alone.

## Backup (sites + MariaDB)

```bash
./scripts/backup-erpnext.sh
```

Writes to `/home/upoddar/backups/erpnext/<timestamp>/` (bench files + `mariadb-all.sql`). Keeps 14 days.

Weekly cron (Sunday 02:00):

```bash
(crontab -l 2>/dev/null | grep -v backup-erpnext.sh; cat scripts/erpnext-backup.cron | grep -v '^#' | grep -v '^SHELL' | grep -v '^PATH' | grep -v '^$') | crontab -
```

Or: `crontab scripts/erpnext-backup.cron` if this user has no other cron jobs.

## Migrate Poddar OS (roles, workflows, departments)

```bash
docker compose exec backend bench --site frontend migrate
docker compose exec backend bench --site frontend clear-cache
```

## Staff users

Fill `poddar_os/fixtures/staff.example.csv`, copy to `staff.csv`, then:

```bash
docker compose exec backend bench --site frontend execute poddar_os.setup.staff.import_staff_csv --kwargs '{"path": "/home/frappe/frappe-bench/apps/poddar_os/fixtures/staff.csv"}'
```

## Banking UI

Team bank reconciliation stays at `/banking`. Build the SPA only when that frontend changes: `yarn --cwd banking build`.
