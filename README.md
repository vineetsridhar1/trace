# Trace

Trace is an AI-native collaboration stack that combines chat, tickets, repos, and coding sessions on top of a shared event stream.

## System Overview

```text
Web app / Electron shell
          |
          v
Apollo GraphQL API + service layer
          |
          +--> PostgreSQL (domain state + event log)
          |
          +--> Redis (org-scoped event streams / agent worker)
          |
          +--> Local bridge (Electron) or cloud bridge (Fly Machines)
```

- Humans and agents operate through the same service layer.
- The server owns session lifecycle, auth, GraphQL, websocket transport, and runtime routing.
- The background agent worker consumes org events from Redis Streams.
- Sessions can run locally through the desktop bridge or remotely through the container bridge.

## Workspace Layout

```text
apps/
  server/            Apollo Server + Express, Prisma, auth, websocket endpoints
  web/               React 19 + Vite PWA client
  desktop/           Electron shell for local session bridging
  container-bridge/  Runtime image used for cloud-hosted coding sessions

packages/
  gql/               GraphQL schema and generated TypeScript types
  shared/            Shared adapter/runtime utilities

tickets/
  ai-agent/          Design notes and implementation tracking for the agent runtime
```

## Requirements

| Tool       | Version  |
| ---------- | -------- |
| Node.js    | 22.14.0+ |
| pnpm       | 10+      |
| PostgreSQL | 14+      |
| Redis      | 7+       |

`docker-compose.yml` provisions Redis for local development. PostgreSQL is expected separately.

## Configuration

Copy the checked-in example to the server app before starting the API or agent worker:

```bash
cp .env.example apps/server/.env
```

The checked-in example only includes the local DB/Redis/web defaults. Add the rest of the values below to `apps/server/.env` as needed.

### Required for local sign-in and API startup

| Variable               | Required | Notes                                                       |
| ---------------------- | -------- | ----------------------------------------------------------- |
| `DATABASE_URL`         | Yes      | PostgreSQL connection string used by Prisma                 |
| `REDIS_URL`            | Yes      | Redis connection used by pub/sub and the agent worker       |
| `GITHUB_CLIENT_ID`     | Yes      | GitHub OAuth app client ID                                  |
| `GITHUB_CLIENT_SECRET` | Yes      | GitHub OAuth app client secret                              |
| `PORT`                 | No       | Defaults to `4000`                                          |
| `TRACE_WEB_URL`        | No       | Defaults to `http://localhost:3000`; used by auth redirects |
| `JWT_SECRET`           | No       | Defaults to `trace-dev-secret`                              |
| `CORS_ALLOWED_ORIGINS` | No       | Comma-separated list; defaults to permissive local CORS     |

### Optional for cloud sessions, stored tokens, and integrations

| Variable                  | When to set it                              | Notes                                                |
| ------------------------- | ------------------------------------------- | ---------------------------------------------------- |
| `TOKEN_ENCRYPTION_KEY`    | If users will save provider tokens in Trace | Must be a 64-character hex key for AES-256-GCM       |
| `WEBHOOK_BASE_URL`        | If registering GitHub PR webhooks           | Public base URL for `/webhooks/github`               |
| `TRACE_SERVER_PUBLIC_URL` | If enabling cloud-hosted sessions           | Used to build the public websocket bridge URL        |
| `FLY_API_TOKEN`           | If enabling cloud-hosted sessions           | Fly Machines API token                               |
| `FLY_APP_NAME`            | If enabling cloud-hosted sessions           | Fly app that hosts the bridge containers             |
| `CONTAINER_IMAGE`         | If enabling cloud-hosted sessions           | Image deployed for `apps/container-bridge`           |
| `ANTHROPIC_API_KEY`       | Optional fallback for cloud runtimes        | Used when the user has not stored an Anthropic token |
| `OPENAI_API_KEY`          | Optional fallback for cloud runtimes        | Used when the user has not stored an OpenAI token    |
| `GITHUB_TOKEN`            | Optional fallback for cloud runtimes        | Used for git operations in cloud sessions            |

### Shell env overrides used by the desktop or web dev servers

| Variable           | Notes                                                                     |
| ------------------ | ------------------------------------------------------------------------- |
| `TRACE_PORT`       | Applies a shared port offset: web `3000 + offset`, server `4000 + offset` |
| `TRACE_SERVER_URL` | Overrides the server URL used by the Electron app                         |
| `TRACE_WEB_URL`    | Overrides the web URL loaded by Electron                                  |

### GitHub OAuth app

Create a GitHub OAuth app with:

- Homepage URL: `http://localhost:3000`
- Authorization callback URL: `http://localhost:4000/auth/github/callback`

## Local Development

### 1. Install dependencies

```bash
pnpm install
```

### 2. Start Redis and prepare Postgres

```bash
docker compose up -d redis
createdb tracev2
```

If your Postgres database already exists, skip `createdb`.

### 3. Configure env

```bash
cp .env.example apps/server/.env
```

Then add your OAuth and optional integration values to `apps/server/.env`.

### 4. Run migrations and code generation

```bash
pnpm db:migrate
pnpm codegen
```

### 5. Start the stack

Recommended web-first workflow:

```bash
pnpm dev:server
pnpm dev:agent
pnpm dev:web
```

Desktop app:

```bash
pnpm dev:desktop
```

Full workspace mode:

```bash
pnpm dev
```

`pnpm dev` starts all workspace `dev` scripts plus the dedicated agent worker, which means it also launches Electron and the `container-bridge` watcher.

Open `http://localhost:3000` and sign in with GitHub.

## Scripts

| Command                     | What it does                                                      |
| --------------------------- | ----------------------------------------------------------------- |
| `pnpm dev`                  | Starts all workspace dev processes plus the server agent worker   |
| `pnpm dev:server`           | Starts the GraphQL/API server                                     |
| `pnpm dev:agent`            | Starts the Redis-backed agent worker                              |
| `pnpm dev:web`              | Starts the Vite web app on port `3000`                            |
| `pnpm dev:desktop`          | Starts the Electron shell                                         |
| `pnpm dev:web:prod`         | Runs the web app against the hosted API                           |
| `pnpm dev:desktop:prod`     | Runs Electron against the hosted API and local web                |
| `pnpm dev:desktop:prod-web` | Runs Electron against hosted API and hosted web                   |
| `pnpm build`                | Builds all workspaces                                             |
| `pnpm lint`                 | Typechecks all workspaces                                         |
| `pnpm lint:eslint`          | Runs ESLint across the repo                                       |
| `pnpm format`               | Formats the repo with Prettier                                    |
| `pnpm format:check`         | Checks Prettier formatting                                        |
| `pnpm test`                 | Runs all available tests                                          |
| `pnpm test:coverage`        | Runs coverage-enabled test targets where present                  |
| `pnpm test:server`          | Runs server unit tests                                            |
| `pnpm test:server:coverage` | Runs server unit tests with coverage enforcement                  |
| `pnpm gql:codegen`          | Regenerates GraphQL types                                         |
| `pnpm db:migrate`           | Runs Prisma migrations in `apps/server`                           |
| `pnpm db:generate`          | Regenerates the Prisma client                                     |
| `pnpm codegen`              | Runs Prisma generate, GraphQL codegen, and the `@trace/gql` build |

## Runtime Notes

- The GraphQL schema lives in `packages/gql/src/schema.graphql`.
- The API server exposes GraphQL over `/graphql`, subscriptions over `/ws`, the runtime bridge over `/bridge`, and terminal relay over `/terminal`.
- `apps/container-bridge` is the runtime image deployed to Fly for cloud sessions.
- `apps/desktop` maintains a bridge connection back to the server so local repos can back coding sessions.

## CI and Deployment

- `.github/workflows/ci.yml` installs dependencies, regenerates GraphQL and Prisma artifacts, typechecks, validates Prisma, runs ESLint, and checks formatting.
- `.github/workflows/deploy-container-bridge.yml` deploys the cloud runtime image when the bridge or shared adapter code changes on `main`.
