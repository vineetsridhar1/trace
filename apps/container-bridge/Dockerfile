ARG PG_MAJOR=18
FROM node:22-slim
ARG PG_MAJOR

RUN apt-get update && \
    apt-get install -y --no-install-recommends git ca-certificates curl openssh-client \
    python3 make g++ gpg sudo redis-server tini chromium chromium-sandbox ffmpeg \
    postgresql-common sqlite3 && \
    curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
      | gpg --dearmor -o /usr/share/keyrings/postgresql-archive-keyring.gpg && \
    . /etc/os-release && \
    echo "deb [signed-by=/usr/share/keyrings/postgresql-archive-keyring.gpg] https://apt.postgresql.org/pub/repos/apt ${VERSION_CODENAME}-pgdg main" \
      > /etc/apt/sources.list.d/pgdg.list && \
    curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
      | gpg --dearmor -o /usr/share/keyrings/githubcli-archive-keyring.gpg && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
      > /etc/apt/sources.list.d/github-cli.list && \
    apt-get update && \
    apt-get install -y --no-install-recommends gh \
      "postgresql-${PG_MAJOR}" \
      "postgresql-client-${PG_MAJOR}" \
      "postgresql-${PG_MAJOR}-pgvector" && \
    rm -rf /var/lib/apt/lists/*

# Install coding tool CLIs and the exact Playwright CLI/media runtime validated by
# the image smoke below. Browser downloads stay disabled: Trace uses Debian's
# system Chromium and installs only Playwright's matching FFmpeg build.
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright
RUN npm install -g pnpm@11.10.0 @anthropic-ai/claude-code \
    @earendil-works/pi-coding-agent @playwright/cli@0.1.18 \
    playwright@1.63.0-alpha-2026-08-05 && \
    playwright install ffmpeg && \
    chmod -R a+rX /opt/ms-playwright && \
    mv /usr/local/bin/playwright-cli /usr/local/bin/playwright-cli-raw

# Codex ships its native executable as a platform-specific optional dependency.
# Install it explicitly with optional dependencies enabled, then exercise the
# launcher so an incomplete architecture package cannot reach a cloud session.
RUN npm install -g --include=optional @openai/codex && codex --version

WORKDIR /app

# Install runtime dependencies directly (avoids workspace: protocol issue)
RUN npm init -y && npm install ws node-pty && \
    (chmod +x node_modules/node-pty/prebuilds/linux-*/spawn-helper 2>/dev/null || true)

# Copy pre-built shared package as a node_modules dependency
COPY packages/shared/dist/ ./node_modules/@trace/shared/dist/
COPY packages/shared/package.json ./node_modules/@trace/shared/

# Copy pre-built container-bridge
COPY apps/container-bridge/dist/ ./dist/
COPY apps/container-bridge/playwright-cli.config.json /opt/trace/playwright-cli.config.json
COPY apps/container-bridge/playwright-cli.build-smoke.config.json /opt/trace/playwright-cli.build-smoke.config.json
COPY apps/container-bridge/bin/playwright-cli /usr/local/bin/playwright-cli
COPY apps/container-bridge/bin/trace-browser-video-validate /usr/local/bin/trace-browser-video-validate
RUN chmod 0755 /usr/local/bin/playwright-cli /usr/local/bin/trace-browser-video-validate

# Entrypoint boots the app-session backing services (Redis, Postgres) before the bridge.
COPY apps/container-bridge/docker-entrypoint.sh /usr/local/bin/trace-entrypoint
RUN chmod +x /usr/local/bin/trace-entrypoint

# Bake the pinned full-stack starter into the image so every app session
# materializes from a reproducible, lockfile-pinned scaffold rather than a
# floating-version fallback.
COPY apps/container-bridge/app-starter/ /opt/trace/app-starter/

# Session instructions load bundled guidance from this stable path. The bridge
# installs the skills itself via ensureTraceRuntime before any session reads
# them, so the image must NOT bake this directory: a pre-existing /trace/runtime
# in a lower image layer cannot be renamed aside on overlayfs, which breaks the
# install swap and takes down session startup.
ENV TRACE_SKILLS_DIR=/trace/runtime/skills/

# Create non-root user — Claude Code refuses --dangerously-skip-permissions as root.
# Scope sudo to exactly the Postgres bootstrap commands the entrypoint runs. App
# child processes run as this same user, so a blanket NOPASSWD:ALL would make any
# RCE in a previewed (agent-written) app trivially container-root and able to read
# every stripped secret via /proc/1/environ. Only these commands are permitted.
RUN useradd -m -s /bin/bash coder && \
    mkdir -p /trace /workspace /repos /workspaces /sources /home/coder/.npm-global && \
    chown -R coder:coder /trace /workspace /repos /workspaces /sources /app /home/coder/.npm-global /opt/trace && \
    printf '%s\n' \
      'coder ALL=(root) NOPASSWD: /usr/sbin/service postgresql start' \
      'coder ALL=(postgres) NOPASSWD: /usr/bin/psql, /usr/bin/createuser' \
      > /etc/sudoers.d/trace-coder && \
    chmod 0440 /etc/sudoers.d/trace-coder
ENV NPM_CONFIG_PREFIX=/home/coder/.npm-global
ENV PATH=/home/coder/.npm-global/bin:$PATH
USER coder
RUN mkdir -p /home/coder/.ssh && chmod 700 /home/coder/.ssh

# Fail the image build if system Chromium, the pinned CLI, or FFmpeg recording
# cannot work together without downloading anything during an agent session.
# Neither Depot BuildKit nor the PSS-restricted runtime pod can give Chromium a
# sandbox: the pod sets allowPrivilegeEscalation=false and drops ALL capabilities
# (so the setuid helper cannot elevate) and exposes user.max_user_namespaces=0
# (so the namespace sandbox cannot start either). Both configs therefore pass
# --no-sandbox; the container itself is the isolation boundary.
RUN set -eu; \
    smoke_dir=/tmp/trace-playwright-image-smoke; \
    mkdir -p "$smoke_dir"; \
    export PLAYWRIGHT_CLI_SESSION=trace-image-smoke; \
    export PLAYWRIGHT_MCP_OUTPUT_DIR="$smoke_dir"; \
    export PLAYWRIGHT_CLI_CONFIG=/opt/trace/playwright-cli.build-smoke.config.json; \
    playwright-cli --config="$PLAYWRIGHT_CLI_CONFIG" open about:blank; \
    playwright-cli snapshot --filename="$smoke_dir/snapshot.yml"; \
    playwright-cli screenshot --filename="$smoke_dir/screenshot.png"; \
    playwright-cli console warning; \
    playwright-cli requests; \
    playwright-cli video-start "$smoke_dir/smoke.webm"; \
    playwright-cli run-code "async (page) => { await page.setContent('<main><button>Record</button></main>'); await page.getByRole('button').click(); await page.waitForTimeout(250); }"; \
    playwright-cli video-stop; \
    TRACE_BROWSER_VIDEO_DIR="$smoke_dir" trace-browser-video-validate "$smoke_dir/smoke.webm"; \
    playwright-cli close; \
    playwright-cli delete-data; \
    rm -rf "$smoke_dir"

# Pre-warm the pnpm content-addressed store from the starter lockfile so the
# first `pnpm install` in a session hardlinks from cache instead of hitting the
# registry cold. Keep the store; drop the throwaway node_modules.
RUN cd /opt/trace/app-starter && \
    pnpm fetch

# Run under tini as PID 1 so orphaned grandchildren of killed dev-server process
# trees (pnpm/vite) and the daemonized redis/postgres are reaped instead of
# accumulating as zombies across session restarts.
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/trace-entrypoint"]
