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
- a non-root `coder` user
- a user-writable npm global prefix

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

The launcher still needs to inject the Trace bootstrap environment values from the start-session
request:

```txt
TRACE_SESSION_ID
TRACE_ORG_ID
TRACE_RUNTIME_INSTANCE_ID
TRACE_RUNTIME_TOKEN
TRACE_BRIDGE_URL
```

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

## Operational Notes

- Make the GHCR base image package public if external launchers need to pull it.
- Pin production launchers to version tags, not `latest`.
- Keep provider credentials in the launcher or cloud runtime secrets, not in the Dockerfile.
- Keep the derived image build in the launcher's CI or infrastructure repo.
- Rebuild derived images when Trace publishes a new base runtime tag you want to adopt.
