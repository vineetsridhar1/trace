#!/usr/bin/env bash
# Bring up the backing services an app session expects, then hand off to the
# bridge. Everything here is best-effort: a failure to start a local service
# must not stop the bridge from connecting (the agent can always start its own).
set -u

# Redis — preinstalled; start it so the app can use it without manual steps.
if command -v redis-server >/dev/null 2>&1; then
  redis-server --daemonize yes >/dev/null 2>&1 || true
fi

# Postgres — start the cluster and ensure a superuser role for the runtime user
# plus a default `app` database, so a fresh app has a working DATABASE_URL. The
# launcher can still inject its own DATABASE_URL (an org secret); we only set a
# default when none was provided.
if command -v pg_ctlcluster >/dev/null 2>&1; then
  sudo service postgresql start >/dev/null 2>&1 || true
  RUNTIME_USER="$(id -un)"
  sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='${RUNTIME_USER}'" 2>/dev/null | grep -q 1 \
    || sudo -u postgres createuser -s "${RUNTIME_USER}" >/dev/null 2>&1 || true
  psql -tAc "SELECT 1 FROM pg_database WHERE datname='app'" postgres 2>/dev/null | grep -q 1 \
    || createdb app >/dev/null 2>&1 || true
  export DATABASE_URL="${DATABASE_URL:-postgresql:///app?host=/var/run/postgresql}"
fi

exec node dist/index.js
