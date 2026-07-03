# Running Trace

Trace Cloud is invite-only while the hosted service is rolling out. You can run
Trace yourself today, either as a local development workspace or on your own
server.

## Local workspace

The easiest way to get set up is:

```bash
git clone https://github.com/vineetsridhar1/trace.git
cd trace
pnpm install
pnpm dev:local
```

`pnpm dev:local` starts the local database, API server, web app, and Electron
desktop bridge. It uses local auth, so you do not need a GitHub OAuth app or a
Trace Cloud invite.

`pnpm dev:local` also builds the shared workspace package before starting the
apps, so no extra first-run build step is needed. If you use the manual
`pnpm dev` path instead, run `pnpm build:shared` once after installing
dependencies.

Requirements:

- Node.js 22 or newer.
- pnpm 10 or newer.
- Docker, if your machine needs Prisma's local Postgres dev server.

Open `http://localhost:3000` after the command finishes starting the web app.

## Self-hosted server

Use this path when you want a persistent Trace instance for yourself or a team.
The repository includes a production Dockerfile plus example Caddy and Docker
Compose files under `deploy/`.

You need:

- A Linux server with Docker and Docker Compose.
- PostgreSQL. Fresh databases must support the `vector` extension because the
  historical migration chain still replays an old embedding migration before
  later migrations remove the extension.
- Redis.
- S3-compatible object storage for uploads in production.
- A GitHub OAuth app client ID. Enable device flow for the app.
- Strong values for `JWT_SECRET` and `TOKEN_ENCRYPTION_KEY`.

### Full setup script

Run this on a fresh Ubuntu server. Replace the `CHANGE_ME` values before
starting Trace.

```bash
#!/usr/bin/env bash
set -euo pipefail

TRACE_DOMAIN="trace.example.com"
TRACE_REPO="https://github.com/vineetsridhar1/trace.git"
TRACE_DIR="/opt/trace"
IMAGE_TAG="self-hosted"

sudo apt-get update
sudo apt-get install -y ca-certificates curl git openssl

if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sudo sh
fi

sudo mkdir -p "${TRACE_DIR}"
sudo chown "$USER":"$USER" "${TRACE_DIR}"

if [ ! -d "${TRACE_DIR}/.git" ]; then
  git clone "${TRACE_REPO}" "${TRACE_DIR}"
fi

cd "${TRACE_DIR}"
git pull --ff-only

cp deploy/docker-compose.ec2.yml docker-compose.yml
cp deploy/Caddyfile Caddyfile
sed -i "s/gettrace.org/${TRACE_DOMAIN}/g" Caddyfile

JWT_SECRET="$(openssl rand -base64 48)"
TOKEN_ENCRYPTION_KEY="$(openssl rand -base64 32)"

cat > .env <<EOF
TRACE_WEB_URL="https://${TRACE_DOMAIN}"
TRACE_SERVER_PUBLIC_URL="https://${TRACE_DOMAIN}"
CORS_ALLOWED_ORIGINS="https://${TRACE_DOMAIN}"
TRACE_AUTH_COOKIE_SAME_SITE="lax"

DATABASE_URL="postgresql://CHANGE_ME_USER:CHANGE_ME_PASSWORD@CHANGE_ME_POSTGRES_HOST:5432/trace?schema=public"
REDIS_URL="redis://CHANGE_ME_REDIS_HOST:6379"
JWT_SECRET="${JWT_SECRET}"
TOKEN_ENCRYPTION_KEY="${TOKEN_ENCRYPTION_KEY}"

S3_BUCKET="CHANGE_ME_BUCKET"
AWS_REGION="us-east-1"

ECR_REGISTRY="trace-local"
IMAGE_TAG="${IMAGE_TAG}"

GITHUB_CLIENT_ID="CHANGE_ME_GITHUB_CLIENT_ID"
GITHUB_CLIENT_SECRET=""
SLACK_CLIENT_ID=""
SLACK_CLIENT_SECRET=""
SLACK_SIGNING_SECRET=""
SLACK_REDIRECT_URI="https://${TRACE_DOMAIN}/slack/oauth/callback"
APPLE_TEAM_ID=""
VITE_AG_GRID_LICENSE_KEY=""

FLY_API_TOKEN=""
FLY_APP_NAME=""
CONTAINER_IMAGE=""
ANTHROPIC_API_KEY=""
OPENAI_API_KEY=""
GITHUB_TOKEN=""
EOF

docker build \
  --build-arg VITE_API_URL="https://${TRACE_DOMAIN}" \
  -t "trace-local/trace:${IMAGE_TAG}" .

docker compose --env-file .env up -d
docker compose logs -f backend
```

The included Docker image runs in two roles:

- `ROLE=backend` runs Prisma migrations and starts the API on port `4000`.
- `ROLE=web` serves the built Vite app on port `3000`.

The included Compose file puts Caddy in front of both services and requests TLS
certificates for the domain in `Caddyfile`.

## Minimal Docker Compose

If you already have a reverse proxy, PostgreSQL, Redis, and object storage, this
is the smaller shape to adapt:

```yaml
services:
  web:
    image: trace-local/trace:latest
    environment:
      ROLE: web
    expose:
      - "3000"
    restart: unless-stopped

  backend:
    image: trace-local/trace:latest
    environment:
      ROLE: backend
      NODE_ENV: production
      PORT: "4000"
      DATABASE_URL: ${DATABASE_URL}
      REDIS_URL: ${REDIS_URL}
      JWT_SECRET: ${JWT_SECRET}
      TOKEN_ENCRYPTION_KEY: ${TOKEN_ENCRYPTION_KEY}
      TRACE_WEB_URL: ${TRACE_WEB_URL}
      TRACE_SERVER_PUBLIC_URL: ${TRACE_SERVER_PUBLIC_URL}
      TRACE_AUTH_COOKIE_SAME_SITE: "lax"
      CORS_ALLOWED_ORIGINS: ${CORS_ALLOWED_ORIGINS}
      S3_BUCKET: ${S3_BUCKET}
      AWS_REGION: ${AWS_REGION}
      GITHUB_CLIENT_ID: ${GITHUB_CLIENT_ID}
      GITHUB_CLIENT_SECRET: ${GITHUB_CLIENT_SECRET:-}
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY:-}
      OPENAI_API_KEY: ${OPENAI_API_KEY:-}
    expose:
      - "4000"
    restart: unless-stopped
```

Build the image with the public API URL baked into the web app:

```bash
docker build \
  --build-arg VITE_API_URL="https://trace.example.com" \
  -t trace-local/trace:latest .
```

Then run migrations and the app through the backend container:

```bash
docker compose up -d
docker compose logs -f backend
```

## After sign-in

Hosted Trace requires an organization invite. Self-hosted Trace can create and
manage its own organizations once authentication and the database are configured.
For local development, `pnpm dev:local` is still the fastest path because it
uses local auth and creates the local workspace services for you.

## Terminal and Neovim clients

Trace also runs in the terminal and inside Neovim:

- **`trace` CLI** — login, session/channel/ticket commands, event tailing, and
  the editor daemon. See [apps/cli/README.md](../apps/cli/README.md) and the
  daemon protocol reference in [apps/cli/PROTOCOL.md](../apps/cli/PROTOCOL.md).
- **trace.nvim** — session switcher, transcripts, prompting, and channels in
  Neovim. See [apps/nvim/README.md](../apps/nvim/README.md).
