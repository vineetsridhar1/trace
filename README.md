# Trace

A unified AI-native platform that collapses project management, team communication, and AI-assisted development into a single product. Built as a monorepo with a GraphQL backend, web frontend, and Electron desktop app.

## Architecture

- **Backend:** Express + Apollo GraphQL server with PostgreSQL + Prisma ORM
- **Web Client:** React + Vite + urql + Zustand + Tailwind CSS
- **Desktop Client:** Electron app with local session bridge
- **Shared UI:** React component library used by both web and desktop clients

The server provides a GraphQL API and WebSocket support for real-time subscriptions. Both OpenAI and Anthropic are supported as AI providers.

## Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [PostgreSQL](https://www.postgresql.org/) running locally on port 5432
- **macOS:** Xcode Command Line Tools (`xcode-select --install`) — required by `node-pty` native bindings
- **Linux:** `make`, `python3`, and `build-essential`
- **Windows:** Python 3 and a C++ compiler (e.g. via `npm install -g windows-build-tools`)

## Quick Start

### 1. Install dependencies

```bash
pnpm install
```

### 2. Set up the database

Create a PostgreSQL database called `trace`:

```bash
createdb trace
```

### 3. Configure environment variables

Copy the example env file and add your API keys:

```bash
cp apps/server/.env.example apps/server/.env
```

Edit `apps/server/.env`:

```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/trace?schema=public"
PORT=3100

# AI Provider: "openai" or "anthropic"
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...

# Or for OpenAI:
# AI_PROVIDER=openai
# OPENAI_API_KEY=sk-...
```

### 4. Set up the database schema

```bash
cd apps/server
pnpm prisma migrate dev
pnpm prisma generate
pnpm prisma db seed
```

### 5. Generate GraphQL types

```bash
# Server
pnpm --filter trace-server codegen

# Web client
pnpm --filter trace-web codegen

# Desktop app
pnpm --filter trace codegen
```

### 6. Start the development servers

Open three terminal tabs:

**Terminal 1 — Backend server:**

```bash
pnpm dev:server
```

Server runs on `http://localhost:3100`.

**Terminal 2 — Web client:**

```bash
pnpm dev:web
```

Web app runs on Vite's default dev port (usually `http://localhost:5173`).

**Terminal 3 — Desktop app:**

```bash
pnpm dev:desktop
```

Or for production build testing:

```bash
TRACE_PROD=1 pnpm dev:desktop
```

## Development

### Useful commands

```bash
pnpm dev              # Run all services in parallel
pnpm dev:server       # Backend only
pnpm dev:web          # Web frontend only
pnpm dev:desktop      # Electron app only
pnpm build            # Build all packages
```

### Project structure

```
apps/
  server/             # Express + Apollo GraphQL backend
  web/                # React web client
  desktop/            # Electron desktop client
packages/
  shared-ui/          # Shared React components
```

### GraphQL Development

- Schema source: `apps/server/src/schema/`
- Run `pnpm codegen` in each app to regenerate types from schema changes
- The server reads the generated schema at startup

## Cloud Agent Architecture

The Electron desktop app communicates with the server via a dedicated **Instance Relay** system for remote command execution:

### How it works

1. **Instance Registration** — When the Electron app starts, it registers itself with the server via WebSocket (`/instance` endpoint)
   - Sends: `{ type: 'register', instanceId, serverId, instanceName }`
   - Server persists the instance to the database as an `electronInstance`

2. **Heartbeat** — Server pings connected instances every 30 seconds; instances reply with `pong`
   - If no pong within 90 seconds, the instance is considered offline

3. **Command Relay** — The server can send actions to instances:
   - Sends: `{ id, type: 'action', action, params }`
   - Instance processes the action and replies: `{ id, type: 'action-result', success, data? }`
   - Commands timeout after 30 seconds by default

4. **Status Tracking** — Web/desktop clients query `myInstances()` to see which Electron instances are online
   - The relay tracks connectivity in-memory; the DB is the source of truth for persisted instance metadata

### Key files

- `apps/server/src/ws/instanceSocket.ts` — WebSocket handler for instance registration and messaging
- `apps/server/src/services/instanceRelay.ts` — In-memory relay that routes commands to connected instances
- `apps/server/src/services/instanceService.ts` — Database operations for instance metadata (name, password)

The relay allows the web app to trigger actions on any user's Electron instance(s) and receive results, enabling cloud-coordinated agent workflows.

## Notes

- All code changes should follow the patterns in `CLAUDE.md`
- The Electron app includes an IPC bridge for local session control and a WebSocket relay for cloud commands
- The server uses JWT tokens for authentication
- Real-time updates flow through GraphQL subscriptions for web clients and WebSocket for the Electron relay
