# Trace

An Electron desktop app for monitoring and managing Claude Code sessions.

## Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [PostgreSQL](https://www.postgresql.org/) running locally on port 5432

## Getting Started

### 1. Install dependencies

Install dependencies for both the Electron app and the server:

```bash
npm install
cd server && npm install
```

### 2. Set up the database

Create a PostgreSQL database called `trace`:

```bash
createdb trace
```

### 3. Configure environment variables

Create a `.env` file in the `server/` directory:

```bash
cp server/.env.example server/.env
```

Then edit `server/.env` and fill in your API key:

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

### 4. Run database migrations and generate the Prisma client

```bash
cd server
npx prisma migrate dev
npx prisma generate
```

### 5. Start the app

You need to run **two processes** — the backend server and the Electron app:

**Terminal 1 — Server:**

```bash
cd server
npm run dev
```

The server starts on `http://localhost:3100`.

**Terminal 2 — Electron app:**

```bash
npm start
```
