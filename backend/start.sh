#!/bin/bash
set -e

if [ -f "$(dirname "$0")/.env" ]; then
    export $(grep -v '^#' "$(dirname "$0")/.env" | xargs)
fi

echo "Running alembic upgrade head..."
alembic upgrade head

echo "Starting server..."
uvicorn main:app --host 0.0.0.0 --port 8000
