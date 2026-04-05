FROM node:22-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends git ca-certificates curl openssh-client \
    python3 make g++ gpg && \
    curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
      | gpg --dearmor -o /usr/share/keyrings/githubcli-archive-keyring.gpg && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
      > /etc/apt/sources.list.d/github-cli.list && \
    apt-get update && \
    apt-get install -y --no-install-recommends gh && \
    rm -rf /var/lib/apt/lists/*

# Install coding tool CLIs
RUN npm install -g @anthropic-ai/claude-code @openai/codex

WORKDIR /app

# Install runtime dependencies directly (avoids workspace: protocol issue)
RUN npm init -y && npm install ws node-pty && \
    (chmod +x node_modules/node-pty/prebuilds/linux-*/spawn-helper 2>/dev/null || true)

# Copy pre-built shared package as a node_modules dependency
COPY packages/shared/dist/ ./node_modules/@trace/shared/dist/
COPY packages/shared/package.json ./node_modules/@trace/shared/

# Copy pre-built container-bridge
COPY apps/container-bridge/dist/ ./dist/

# Create non-root user — Claude Code refuses --dangerously-skip-permissions as root
RUN useradd -m -s /bin/bash coder && \
    mkdir -p /workspace /repos /workspaces && \
    chown -R coder:coder /workspace /repos /workspaces /app
USER coder
RUN mkdir -p /home/coder/.ssh && chmod 700 /home/coder/.ssh

CMD ["node", "dist/index.js"]
