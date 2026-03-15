FROM node:20-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends git ca-certificates curl && \
    rm -rf /var/lib/apt/lists/*

# Install Claude Code CLI
RUN npm install -g @anthropic-ai/claude-code

WORKDIR /app

# Copy built bridge (assumes `pnpm build` ran before `docker build`)
COPY dist/ dist/
COPY package.json .
COPY node_modules/ node_modules/

CMD ["node", "dist/index.js"]
