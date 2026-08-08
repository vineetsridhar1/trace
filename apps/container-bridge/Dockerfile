FROM node:22-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends git ca-certificates curl openssh-client \
    python3 make g++ gpg sudo redis-server tini chromium \
    postgresql postgresql-client sqlite3 && \
    curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
      | gpg --dearmor -o /usr/share/keyrings/githubcli-archive-keyring.gpg && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
      > /etc/apt/sources.list.d/github-cli.list && \
    apt-get update && \
    apt-get install -y --no-install-recommends gh && \
    rm -rf /var/lib/apt/lists/*

# Install coding tool CLIs and the exact Playwright CLI/media runtime validated by
# the image smoke below. Browser downloads stay disabled: Trace uses Debian's
# system Chromium and installs only Playwright's matching FFmpeg build.
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright
RUN npm install -g pnpm@10.7.0 @anthropic-ai/claude-code @openai/codex \
    @earendil-works/pi-coding-agent @playwright/cli@0.1.18 \
    playwright@1.63.0-alpha-2026-08-05 && \
    playwright install ffmpeg && \
    chmod -R a+rX /opt/ms-playwright

WORKDIR /app

# Install runtime dependencies directly (avoids workspace: protocol issue)
RUN npm init -y && npm install ws node-pty tar-stream && \
    (chmod +x node_modules/node-pty/prebuilds/linux-*/spawn-helper 2>/dev/null || true)

# Copy pre-built shared package as a node_modules dependency
COPY packages/shared/dist/ ./node_modules/@trace/shared/dist/
COPY packages/shared/package.json ./node_modules/@trace/shared/

# Copy pre-built container-bridge
COPY apps/container-bridge/dist/ ./dist/
COPY apps/container-bridge/playwright-cli.config.json /opt/trace/playwright-cli.config.json

# Entrypoint boots the app-session backing services (Redis, Postgres) before the bridge.
COPY apps/container-bridge/docker-entrypoint.sh /usr/local/bin/trace-entrypoint
RUN chmod +x /usr/local/bin/trace-entrypoint

# Bake the pinned full-stack starter into the image so every app session
# materializes from a reproducible, lockfile-pinned scaffold rather than a
# floating-version fallback.
COPY apps/container-bridge/app-starter/ /opt/trace/app-starter/
COPY apps/container-bridge/design-starter/ /opt/trace/design-starter/
COPY apps/container-bridge/design-system-starter/ /opt/trace/design-system-starter/
COPY apps/container-bridge/design-default-package/ /opt/trace/design-default-package/
COPY apps/container-bridge/pdf-starter/ /opt/trace/pdf-starter/
COPY apps/container-bridge/animation-starter/ /opt/trace/animation-starter/
COPY .claude/skills/author-design-system/ /opt/trace/skills/author-design-system/
# The bridge installs and atomically replaces this directory at startup.
# Declare its eventual skills location without pre-populating the directory.
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
RUN mkdir -p /home/coder/.claude/skills /home/coder/.codex/skills && \
    cp -R /opt/trace/skills/author-design-system /home/coder/.claude/skills/author-design-system && \
    cp -R /opt/trace/skills/author-design-system /home/coder/.codex/skills/author-design-system
RUN mkdir -p /home/coder/.ssh && chmod 700 /home/coder/.ssh

# Fail the image build if system Chromium, the pinned CLI, or FFmpeg recording
# cannot work together without downloading anything during an agent session.
# Chromium's process sandbox is disabled in its config because Depot BuildKit and
# the deployed machine deny the nested PID/network namespaces it requires. The
# browser still runs as non-root inside the per-session machine boundary.
RUN set -eu; \
    smoke_dir=/tmp/trace-playwright-image-smoke; \
    mkdir -p "$smoke_dir"; \
    export PLAYWRIGHT_CLI_SESSION=trace-image-smoke; \
    export PLAYWRIGHT_MCP_OUTPUT_DIR="$smoke_dir"; \
    playwright-cli --config=/opt/trace/playwright-cli.config.json open about:blank; \
    playwright-cli video-start "$smoke_dir/smoke.webm"; \
    playwright-cli run-code "async (page) => { await page.setContent('<main><button>Record</button></main>'); await page.getByRole('button').click(); await page.waitForTimeout(250); }"; \
    playwright-cli video-stop; \
    test -s "$smoke_dir/smoke.webm"; \
    playwright-cli close; \
    playwright-cli delete-data; \
    rm -rf "$smoke_dir"

# Pre-warm the pnpm content-addressed store from the starter lockfile so the
# first `pnpm install` in a session hardlinks from cache instead of hitting the
# registry cold. Keep the store; drop the throwaway node_modules.
RUN cd /opt/trace/app-starter && \
    pnpm install --ignore-workspace --frozen-lockfile && \
    rm -rf node_modules && \
    cd /opt/trace/design-starter && \
    pnpm install --ignore-workspace --frozen-lockfile && \
    rm -rf node_modules && \
    cd /opt/trace/design-system-starter && \
    pnpm install --ignore-workspace --frozen-lockfile && \
    rm -rf node_modules && \
    cd /opt/trace/pdf-starter && \
    pnpm install --ignore-workspace --frozen-lockfile && \
    rm -rf node_modules && \
    cd /opt/trace/animation-starter && \
    pnpm install --ignore-workspace --frozen-lockfile && \
    rm -rf node_modules

# Run under tini as PID 1 so orphaned grandchildren of killed dev-server process
# trees (pnpm/vite) and the daemonized redis/postgres are reaped instead of
# accumulating as zombies across session restarts.
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/trace-entrypoint"]
