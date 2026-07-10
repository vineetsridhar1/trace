# Local Docker Launcher (dev/QA)

App sessions are **cloud-only**: they run in a provisioned runtime container, not the local
Electron bridge. To exercise the full app-session flow (create → build → preview → publish) on your
own machine, you need a launcher that starts the runtime image locally. This is that launcher — a
zero-dependency Node service that maps Trace's provisioned lifecycle calls to `docker run` /
`docker rm` / `docker inspect`.

> DEV/QA ONLY. No isolation, quotas, or hardening. Do not expose it publicly.

## Prerequisites

- Docker Desktop (macOS/Windows) or Docker Engine (Linux) running
- The Trace monorepo checked out, dependencies installed (`pnpm install`)

## 1. Build the runtime image locally

The image bundles the bridge, the coding-tool CLIs, Redis + Postgres, and the baked app starter.
Its Dockerfile copies prebuilt `dist/` output, so build those packages first, then build from the
repo root (the build context must be the repo root):

```bash
pnpm --filter @trace/shared build
pnpm --filter @trace/container-bridge build   # or: pnpm -F "*container-bridge*" build
docker build -f apps/container-bridge/Dockerfile -t trace-agent-runtime:dev .
```

## 2. Start the dev server so a container can reach it

The runtime container connects back to the server's bridge and managed-git HTTP. From a container,
the host is reachable as `host.docker.internal`, which passes Trace's "bridge must be publicly
reachable" check (a literal `localhost`/private-IP would be rejected). Point the public URL and the
preview base host at the host, and run the normal dev stack:

```bash
# Reachable from inside containers; also used to build the managed-git origin URL and preview URLs.
export TRACE_SERVER_PUBLIC_URL=http://host.docker.internal:4000
# Preview URLs are matched by Host header on the same :4000 server, so include the port.
export TRACE_ENDPOINT_PREVIEW_BASE_HOST=preview.localhost:4000

pnpm dev:server   # Apollo on :4000 (binds 0.0.0.0, so the container can reach it)
pnpm dev:web      # Vite on :3000
```

`*.preview.localhost` resolves to `127.0.0.1` automatically in Chrome. In Firefox/Safari, add the
specific host to `/etc/hosts` when a preview URL is generated, or just use Chrome for QA.

## 3. Run this launcher

```bash
TRACE_RUNTIME_IMAGE=trace-agent-runtime:dev \
LAUNCHER_SECRET=dev-secret \
node examples/launchers/local-docker/server.mjs
# -> [local-docker] launcher on http://localhost:8787 (image: trace-agent-runtime:dev)
```

## 4. Configure a provisioned Agent Environment

In the web app: **Settings → Agent Environments → New**, adapter type **provisioned**. Set:

- Start URL: `http://localhost:8787/trace/start-session`
- Stop URL: `http://localhost:8787/trace/stop-session`
- Status URL: `http://localhost:8787/trace/session-status`
- Auth: bearer, backed by an **Org Secret** whose value is `dev-secret` (matching `LAUNCHER_SECRET`)
- Mark it the org default (so app sessions pick it up without extra selection)

Optionally set a `DATABASE_URL` runtime env on the environment to point at an external database; if
you don't, the image entrypoint starts a local Postgres and exports a default `DATABASE_URL`
(`postgresql:///app`).

## 5. Run the e2e flow

- Open the web app (`http://localhost:3000`), ⌘K → **New app session**, type a prompt
  (e.g. "a habit tracker with a Postgres-backed API"). Or use the sidebar **Apps → +**.
- Watch: the launcher logs `started trace-rt-…`; the session shows the workspace materialize from
  the baked starter; the dev server auto-starts (`pnpm install && pnpm dev`); the **preview**
  embeds once port 3000 is listening; logs and terminal stream.
- Ask the agent mid-session to install a package or use Redis/Postgres — exercises the cloud
  capabilities.
- Click **Publish** to flip the private preview to a public URL, and open it.
- The session appears under the sidebar **Apps** section; reloading and clicking it returns you to
  the running app.

Checkpoint **revert/resume is intentionally out of scope** right now — don't QA the restore-into-a-
new-session path yet.

## 6. Scripted smoke (optional)

The hosted smoke can also run against this local setup. It defaults to Chrome at the standard macOS
path; override with `TRACE_CHROMIUM_EXECUTABLE`. Skip the restore leg (out of scope):

```bash
TRACE_SMOKE_SERVER_URL=http://localhost:4000 \
TRACE_SMOKE_AUTH_TOKEN=<your session/bearer token> \
TRACE_SMOKE_ORG_ID=<your org id> \
TRACE_SMOKE_SKIP_RESTORE=1 \
pnpm smoke:cloud-app-session
```

Get an auth token from a logged-in web session (the `trace_token` cookie) or a created API key.

## Cleanup

```bash
docker ps --filter name=trace-rt- -q | xargs -r docker rm -f
```

## Troubleshooting

- **Container can't reach the server** — confirm `TRACE_SERVER_PUBLIC_URL=http://host.docker.internal:4000`
  and that the server bound `0.0.0.0`. On Linux, the launcher passes
  `--add-host host.docker.internal:host-gateway` automatically.
- **Preview shows "Process is not running" (503)** — the dev server is still installing/starting;
  the preview has a reload button, or wait and it reconnects. First `pnpm install` is fast because
  the image pre-warms the pnpm store.
- **`git push` to origin fails from the container** — the managed-git origin is built from
  `TRACE_SERVER_PUBLIC_URL`; it must be the container-reachable `host.docker.internal` form, not
  `localhost`.
- **Bridge URL rejected at start** — the server refuses `localhost`/private-IP bridge URLs; use the
  `host.docker.internal` public URL as above, or set `TRACE_CLOUD_BRIDGE_URL` explicitly.
