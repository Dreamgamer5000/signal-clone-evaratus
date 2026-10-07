#!/bin/sh
set -e
if [ ! -f /data/app.db ]; then
  echo "Seeding /data/app.db ..."
  python -m seed.transform --out /data/app.db
fi
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
