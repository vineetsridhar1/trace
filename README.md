# Trace

An Electron desktop app for monitoring and managing Claude Code sessions.

## Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [PostgreSQL](https://www.postgresql.org/) running locally on port 5432
- **macOS:** Xcode Command Line Tools (`xcode-select --install`) — required by `node-pty` native bindings
- **Linux:** `make`, `python3`, and `build-essential`
- **Windows:** Python 3 and a C++ compiler (e.g. via `npm install -g windows-build-tools`)

## Getting Started

### 1. Install dependencies

Install dependencies for all workspace packages:

```bash
pnpm install
```

### 2. Set up the database

Create a PostgreSQL database called `trace`:

```bash
createdb trace
```

### 3. Configure environment variables

Create a `.env` file in the server app directory:

```bash
cp apps/server/.env.example apps/server/.env
```

Then edit `apps/server/.env` and fill in your API keys:

```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/trace?schema=public"
PORT=3100

# AI Provider: "openai" or "anthropic" (defaults to "openai")
AI_PROVIDER=openai

# OpenAI (required if AI_PROVIDER=openai)
OPENAI_API_KEY=sk-...

# Anthropic (required if AI_PROVIDER=anthropic)
ANTHROPIC_API_KEY=sk-ant-...
```

### 4. Run database migrations, generate the Prisma client, and seed

```bash
cd apps/server
pnpm prisma migrate dev
pnpm prisma generate
pnpm prisma db seed
```

This creates all tables, generates the Prisma client, and seeds a default server and channel.

### 5. Generate GraphQL types

Run codegen for both the server and client:

```bash
# Server - generates resolver types from schema
pnpm --filter trace-server codegen

# Web client - generates React Apollo hooks and types
pnpm --filter trace-web codegen

# Desktop app - generates React Apollo hooks and types
pnpm --filter trace codegen
```

### 6. Start the app

You need to run at least **two processes**: the backend server and either the web or desktop client.

**Terminal 1 — Server:**

```bash
pnpm dev:server
```

The server starts on `http://localhost:3100`.

**Terminal 2 — Web app:**

```bash
pnpm dev:web
```

The web app starts on Vite's configured dev port.

**Terminal 2 — Desktop app:**

```bash
pnpm dev:desktop
```

**Option 3 -- Render:**

```bash
TRACE_PROD=1 pnpm dev:desktop
```
