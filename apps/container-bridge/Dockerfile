FROM node:22-slim AS base
RUN corepack enable && corepack prepare pnpm@10.7.0 --activate
WORKDIR /repo

FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/container-bridge/package.json apps/container-bridge/
RUN pnpm install --frozen-lockfile --ignore-scripts

COPY packages/shared/ packages/shared/
COPY apps/container-bridge/ apps/container-bridge/
RUN pnpm --filter @trace/shared build && pnpm --filter @trace/container-bridge build

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

# Copy built shared package as a node_modules dependency
COPY --from=build /repo/packages/shared/dist/ ./node_modules/@trace/shared/dist/
COPY --from=build /repo/packages/shared/package.json ./node_modules/@trace/shared/

# Copy built container-bridge
COPY --from=build /repo/apps/container-bridge/dist/ ./dist/

# Create non-root user — Claude Code refuses --dangerously-skip-permissions as root
RUN useradd -m -s /bin/bash coder && \
    mkdir -p /workspace /repos /workspaces && \
    chown -R coder:coder /workspace /repos /workspaces /app
USER coder
RUN mkdir -p /home/coder/.ssh && chmod 700 /home/coder/.ssh

CMD ["node", "dist/index.js"]
