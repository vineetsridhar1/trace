#!/bin/sh
set -eu

ROLE="${ROLE:-backend}"

echo "[trace] Starting role: ${ROLE}"

configure_database_url() {
  if [ -n "${DATABASE_URL:-}" ]; then
    return
  fi
  : "${DATABASE_HOST:?DATABASE_HOST is required when DATABASE_URL is unset}"
  : "${DATABASE_USER:?DATABASE_USER is required when DATABASE_URL is unset}"
  : "${DATABASE_PASSWORD:?DATABASE_PASSWORD is required when DATABASE_URL is unset}"
  export DATABASE_URL
  DATABASE_URL="$(node -e '
    const user = encodeURIComponent(process.env.DATABASE_USER);
    const password = encodeURIComponent(process.env.DATABASE_PASSWORD);
    const host = process.env.DATABASE_HOST;
    const port = process.env.DATABASE_PORT || "5432";
    const database = encodeURIComponent(process.env.DATABASE_NAME || "trace");
    process.stdout.write(`postgresql://${user}:${password}@${host}:${port}/${database}?schema=public&sslmode=require`);
  ')"
}

case "$ROLE" in
  backend)
    configure_database_url
    echo "[trace] Starting backend server..."
    exec node /app/apps/server/dist/index.js
    ;;
  migrate)
    configure_database_url
    echo "[trace] Running Prisma migrations..."
    cd /app/apps/server
    exec npx prisma migrate deploy
    ;;
  web)
    echo "[trace] Serving frontend on port 3000..."
    exec serve /app/apps/web/dist --single --listen 3000 --no-clipboard
    ;;
  *)
    echo "[trace] ERROR: Unknown ROLE '$ROLE'. Use: backend, migrate, web"
    exit 1
    ;;
esac
