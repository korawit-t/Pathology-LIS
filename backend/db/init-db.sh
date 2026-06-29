#!/bin/bash
# Runs once when the Docker volume is first created.
# Creates a least-privilege app role (lis_app_rw) so the FastAPI backend
# never connects as the Postgres superuser.  See SECURITY_CHECKLIST.md §5.
#
# Required env var: LIS_APP_PASSWORD
# docker-compose.yml passes it via the db service's environment block.

set -euo pipefail

if [ -z "${LIS_APP_PASSWORD:-}" ]; then
  echo "WARNING: LIS_APP_PASSWORD is not set — skipping lis_app_rw role creation." \
       "Set LIS_APP_PASSWORD in production to provision the least-privilege role." >&2
  exit 0
fi

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  -- Create role only if it doesn't exist yet (idempotent).
  DO \$\$
  BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'lis_app_rw') THEN
      CREATE ROLE lis_app_rw LOGIN PASSWORD '${LIS_APP_PASSWORD}';
      RAISE NOTICE 'Role lis_app_rw created.';
    ELSE
      RAISE NOTICE 'Role lis_app_rw already exists — skipping.';
    END IF;
  END
  \$\$;

  GRANT CONNECT ON DATABASE "$POSTGRES_DB" TO lis_app_rw;
  GRANT USAGE ON SCHEMA public TO lis_app_rw;

  -- Existing tables (if any were created before this script runs).
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO lis_app_rw;
  GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO lis_app_rw;

  -- Future tables created by Alembic migrations.
  ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO lis_app_rw;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO lis_app_rw;
EOSQL

echo "✅ lis_app_rw role provisioned."
