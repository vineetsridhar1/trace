FROM node:22-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends git ca-certificates curl openssh-client \
    python3 make g++ gpg sudo redis-server tini \
    postgresql postgresql-client sqlite3 && \
    curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
      | gpg --dearmor -o /usr/share/keyrings/githubcli-archive-keyring.gpg && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
      > /etc/apt/sources.list.d/github-cli.list && \
    apt-get update && \
    apt-get install -y --no-install-recommends gh && \
    rm -rf /var/lib/apt/lists/*

# Install coding tool CLIs
RUN npm install -g pnpm@10.7.0 @anthropic-ai/claude-code @openai/codex @earendil-works/pi-coding-agent

WORKDIR /app

# Install runtime dependencies directly (avoids workspace: protocol issue)
RUN npm init -y && npm install ws node-pty && \
    (chmod +x node_modules/node-pty/prebuilds/linux-*/spawn-helper 2>/dev/null || true)

# Copy pre-built shared package as a node_modules dependency
COPY packages/shared/dist/ ./node_modules/@trace/shared/dist/
COPY packages/shared/package.json ./node_modules/@trace/shared/

# Copy pre-built container-bridge
COPY apps/container-bridge/dist/ ./dist/

# Entrypoint boots the app-session backing services (Redis, Postgres) before the bridge.
COPY apps/container-bridge/docker-entrypoint.sh /usr/local/bin/trace-entrypoint
RUN chmod +x /usr/local/bin/trace-entrypoint

# Bake the pinned full-stack starter into the image so every app session
# materializes from a reproducible, lockfile-pinned scaffold rather than a
# floating-version fallback.
COPY apps/container-bridge/app-starter/ /opt/trace/app-starter/

# Create non-root user — Claude Code refuses --dangerously-skip-permissions as root.
# Scope sudo to exactly the Postgres bootstrap commands the entrypoint runs. App
# child processes run as this same user, so a blanket NOPASSWD:ALL would make any
# RCE in a previewed (agent-written) app trivially container-root and able to read
# every stripped secret via /proc/1/environ. Only these commands are permitted.
RUN useradd -m -s /bin/bash coder && \
    mkdir -p /workspace /repos /workspaces /home/coder/.npm-global && \
    chown -R coder:coder /workspace /repos /workspaces /app /home/coder/.npm-global /opt/trace && \
    printf '%s\n' \
      'coder ALL=(root) NOPASSWD: /usr/sbin/service postgresql start' \
      'coder ALL=(postgres) NOPASSWD: /usr/bin/psql, /usr/bin/createuser' \
      > /etc/sudoers.d/trace-coder && \
    chmod 0440 /etc/sudoers.d/trace-coder
ENV NPM_CONFIG_PREFIX=/home/coder/.npm-global
ENV PATH=/home/coder/.npm-global/bin:$PATH
USER coder
RUN mkdir -p /home/coder/.ssh && chmod 700 /home/coder/.ssh

# Pre-warm the pnpm content-addressed store from the starter lockfile so the
# first `pnpm install` in a session hardlinks from cache instead of hitting the
# registry cold. Keep the store; drop the throwaway node_modules.
RUN cd /opt/trace/app-starter && \
    pnpm install --ignore-workspace --frozen-lockfile && \
    rm -rf node_modules

# Run under tini as PID 1 so orphaned grandchildren of killed dev-server process
# trees (pnpm/vite) and the daemonized redis/postgres are reaped instead of
# accumulating as zombies across session restarts.
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/trace-entrypoint"]
