#!/bin/sh
set -eu

ROLE="${ROLE:-backend}"

echo "[trace] Starting role: ${ROLE}"

case "$ROLE" in
  backend)
    echo "[trace] Running Prisma migrations..."
    cd /app/apps/server
    npx prisma migrate deploy
    echo "[trace] Starting backend server..."
    exec node /app/apps/server/dist/index.js
    ;;
  web)
    echo "[trace] Serving frontend on port 3000..."
    exec node /app/apps/web/serve.mjs
    ;;
  *)
    echo "[trace] ERROR: Unknown ROLE '$ROLE'. Use: backend, web"
    exit 1
    ;;
esac
