# Launcher Runtime Image Handoff

Trace now supports a base-runner-image model for provisioned runtimes.

## What Trace Publishes

Trace publishes the base runtime image to GHCR:

```txt
ghcr.io/<trace-owner>/trace-agent-runtime:<tag>
```

Use a pinned runtime tag for production launchers, for example:

```txt
ghcr.io/<trace-owner>/trace-agent-runtime:runtime-v1.2.3
```

Use `latest` only for development or testing:

```txt
ghcr.io/<trace-owner>/trace-agent-runtime:latest
```

The base image contains:

- the Trace container bridge
- git and workspace setup dependencies
- default coding-tool CLIs
- a non-root `coder` user with passwordless `sudo` (so the agent can install any additional OS packages)
- a user-writable npm global prefix, plus `pnpm`
- backing services for app sessions: Redis and PostgreSQL, started by the image entrypoint
- a pinned, lockfile-reproducible full-stack starter baked at `/opt/trace/app-starter`, with the
  pnpm store pre-warmed so the first `pnpm install` in a session is fast and offline-capable

### App-session services and database

The image entrypoint (`trace-entrypoint`) starts Redis and PostgreSQL before launching the bridge.
It ensures a superuser role for the runtime user (with a password) and a default `app` database,
and — unless the launcher already injected `DATABASE_URL` via `bootstrapEnv` — exports a
credentialed TCP URL `DATABASE_URL=postgresql://<user>:<pass>@localhost:5432/app` plus
`REDIS_URL=redis://localhost:6379`. The TCP-with-credentials form is deliberate: Unix-socket URLs
(`postgresql:///app?host=…`) break most drivers, which send an empty username instead of the OS
user, so the agent would waste time reverse-engineering auth. A launcher that provisions an external
managed database should inject its own `DATABASE_URL` as an org secret; the entrypoint will not
overwrite it.

Derived images MUST preserve this `ENTRYPOINT` (or invoke `trace-entrypoint` themselves) so the
services and database defaults are available; overriding it with a bare `node dist/index.js` skips
service startup.

## What The Launcher Should Do

The launcher should treat the runtime image as configuration.

For Fly, this is already:

```bash
TRACE_RUNTIME_IMAGE=ghcr.io/<trace-owner>/trace-agent-runtime:runtime-v1.2.3
```

For ECS, set the task definition image to either the Trace base image or an organization-derived
image.

For Kubernetes, set the Job container image to either the Trace base image or an
organization-derived image.

## How To Bake In Organization Tools

If every runtime needs the same tools, build a derived image from the Trace base image:

```dockerfile
FROM ghcr.io/<trace-owner>/trace-agent-runtime:runtime-v1.2.3

USER root
RUN apt-get update \
  && apt-get install -y --no-install-recommends jq ripgrep postgresql-client \
  && rm -rf /var/lib/apt/lists/*

USER coder
RUN npm install -g @acme/internal-cli @acme/custom-agent
```

Publish that image to the organization's registry:

```bash
docker build -t registry.acme.com/trace-runtime:platform-tools .
docker push registry.acme.com/trace-runtime:platform-tools
```

Then configure the launcher to start the derived image:

```bash
TRACE_RUNTIME_IMAGE=registry.acme.com/trace-runtime:platform-tools
```

## Required Runtime Environment

The launcher must inject every entry in the start-session request's `bootstrapEnv` object into the
runtime container. That object always contains the Trace bootstrap values:

```txt
TRACE_SESSION_ID
TRACE_ORG_ID
TRACE_RUNTIME_INSTANCE_ID
TRACE_RUNTIME_TOKEN
TRACE_BRIDGE_URL
```

It can also contain organization-secret-backed runtime variables configured on the Agent
Environment, such as `DATABASE_URL`. Trace decrypts only the explicitly selected secrets for that
environment and sends their values inside `bootstrapEnv`; the launcher must not log or persist
those values.

It should also pass through tool and repo values when present:

```txt
TRACE_TOOL
TRACE_MODEL
TRACE_REASONING_EFFORT
TRACE_REPO_URL
TRACE_REPO_BRANCH
```

## Runtime Setup Commands

`TRACE_RUNTIME_SETUP_COMMANDS` is still available for small or temporary startup installs:

```bash
TRACE_RUNTIME_SETUP_COMMANDS='npm install -g @acme/experimental-cli'
```

Do not use it for tools needed by every session. Those should go into a derived Docker image so
installs happen once at build time instead of on every runtime start.

Setup commands are logged verbatim to the runtime's container logs. Do not put secrets inline in
the command string — reference them through environment variables that the launcher injects
separately:

```bash
# Good — token comes from env, the logged command is safe
TRACE_RUNTIME_SETUP_COMMANDS='npm config set //registry.acme.com/:_authToken=$ACME_NPM_TOKEN && npm install -g @acme/internal-cli'

# Bad — secret ends up in container logs and any log aggregator
TRACE_RUNTIME_SETUP_COMMANDS='npm config set //registry.acme.com/:_authToken=abc123secret && npm install -g @acme/internal-cli'
```

## Operational Notes

- Make the GHCR base image package public if external launchers need to pull it.
- Pin production launchers to version tags, not `latest`.
- Keep provider credentials in the launcher or cloud runtime secrets, not in the Dockerfile.
- Keep the derived image build in the launcher's CI or infrastructure repo.
- Rebuild derived images when Trace publishes a new base runtime tag you want to adopt.
