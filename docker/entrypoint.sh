#!/bin/sh
set -e

cd /app

if [ "${RUN_MIGRATIONS_ON_START:-true}" = "true" ]; then
  echo "[medflow] Running prisma migrate deploy..."
  ./node_modules/.bin/prisma migrate deploy
fi

echo "[medflow] Starting application..."
if [ "$(id -u)" = "0" ] && command -v su-exec >/dev/null 2>&1; then
  exec su-exec nextjs "$@"
fi
exec "$@"
