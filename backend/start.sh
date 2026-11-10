#!/bin/bash
set -e

# alembic.ini and main.py are here; run from anywhere.
cd "$(dirname "$0")"

# backend/.env is not exported here: the backend and alembic/env.py both load
# it themselves (python-dotenv), the same way docker compose reads it. An
# `export $(grep ... .env | xargs)` used to sit here and split every unquoted
# value with spaces, such as `HOSXP_FORM_GYNE=PAP smear, liquid based ...`
# from .env.example, into words, so `set -e` stopped the script on
# "export: `smear,': not a valid identifier" before the server ever started.

echo "Running alembic upgrade head..."
alembic upgrade head

echo "Starting server..."
uvicorn main:app --host 0.0.0.0 --port 8000
