# Runtime Runner Images

Trace publishes a base runner image for provisioned runtimes:

```txt
ghcr.io/<trace-owner>/trace-agent-runtime:<tag>
```

This image contains the container bridge, core runtime dependencies, and default coding-tool CLIs.
Launchers should treat it as the base runtime contract.

## Publish Flow

The `Publish Runtime Base Image` GitHub Actions workflow builds `apps/container-bridge/Dockerfile`
and pushes it to GHCR.

If launchers outside the GitHub owner need to pull the base image, make the GHCR package public in
GitHub package settings after the first publish.

It publishes:

- `latest` from the default branch
- branch tags for branch builds
- git SHA tags such as `sha-<commit>`
- release tags when pushing tags like `runtime-v1.2.3`

## Org-Derived Images

Organizations that need extra packages should build their own image from the Trace base image:

```dockerfile
FROM ghcr.io/<trace-owner>/trace-agent-runtime:runtime-v1.2.3

USER root
RUN apt-get update \
  && apt-get install -y --no-install-recommends jq ripgrep postgresql-client \
  && rm -rf /var/lib/apt/lists/*

USER coder
RUN npm install -g @acme/internal-cli
```

Then configure the launcher to start the derived image:

```bash
TRACE_RUNTIME_IMAGE=registry.acme.com/trace-runtime:platform-tools
```

## When To Use Runtime Setup Commands

Use Docker image builds for tools that should always exist. Use `TRACE_RUNTIME_SETUP_COMMANDS` only
for small, temporary, or frequently changing installs.
