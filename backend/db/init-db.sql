-- PostgreSQL initialisation script
-- Runs once when the Docker volume is first created (postgres entrypoint convention).
--
-- Creates a least-privilege application role so the app never connects as the
-- superuser.  See SECURITY_CHECKLIST.md §5 and SECURITY_AUDIT.md C3.
--
-- Usage:
--   1. Set LIS_APP_PASSWORD in your environment (or root .env).
--   2. The docker-compose.yml mounts this file into
--      /docker-entrypoint-initdb.d/ so Postgres runs it automatically.
--   3. Point DATABASE_URL at lis_app_rw:
--        DATABASE_URL=postgresql+psycopg2://lis_app_rw:<password>@db:5432/<POSTGRES_DB>

-- Create the role only if it does not already exist.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'lis_app_rw') THEN
    EXECUTE format(
      'CREATE ROLE lis_app_rw LOGIN PASSWORD %L',
      current_setting('app.lis_app_password', true)
    );
  END IF;
END
$$;

-- Allow the role to connect to the application database.
-- POSTGRES_DB is expanded by the entrypoint before the script runs.
GRANT CONNECT ON DATABASE :"POSTGRES_DB" TO lis_app_rw;

-- Schema-level access.
GRANT USAGE ON SCHEMA public TO lis_app_rw;

-- Grant DML on all *existing* tables and sequences.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO lis_app_rw;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO lis_app_rw;

-- Ensure future tables and sequences created by Alembic are also accessible.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO lis_app_rw;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO lis_app_rw;
