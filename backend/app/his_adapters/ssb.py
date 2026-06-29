"""
SSB HIS Adapter — Deprecated Template

This file is kept only as a migration notice.

Previously, hospitals using SSB were expected to edit this file directly,
which caused conflicts when pulling updates from the main repository.

RECOMMENDED APPROACH:
  Use HIS_TYPE=custom with hospital-specific SQL files in backend/data/
  (which is gitignored, so git pull will never overwrite it).

Setup:
  1. In .env:
       HIS_TYPE=custom
       HIS_DATABASE_URL=mysql+pymysql://user:password@host:3306/dbname?charset=utf8

  2. Copy the example SQL files and fill in your SSB table/column names:
       cp backend/data/his_surgical.sql.example  backend/data/his_surgical.sql
       cp backend/data/his_gyne.sql.example      backend/data/his_gyne.sql
       cp backend/data/his_nongyne.sql.example   backend/data/his_nongyne.sql

  3. Edit the .sql files to match your SSB database schema.
     The example files already contain a generic query — just change
     the table names and column names to match SSB.
"""

# Raise a clear error if someone accidentally sets HIS_TYPE=ssb
# so they get an actionable message instead of a confusing ImportError.


class SSBAdapter:
    def __init__(self):
        raise NotImplementedError(
            "SSBAdapter is no longer maintained as a tracked Python template.\n"
            "Use HIS_TYPE=custom with data/his_surgical.sql instead.\n"
            "See backend/data/his_surgical.sql.example for setup instructions."
        )
