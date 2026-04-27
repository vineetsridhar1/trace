# Trace

A unified AI-native platform that collapses project management, team communication, and AI-assisted development into a single product built on a shared event log.

## Core Idea

The distinction between chat, project management, and AI coding is artificial. Trace unifies them into a single event stream where humans and AI agents are first-class citizens operating through the same interfaces. Every action — a message sent, a session started, a ticket created — produces an immutable event in a shared log that powers real-time sync across all clients.

## Architecture

```
Web / Desktop / Electron  →  GraphQL  →  Service Layer  ←  Agent Runtime
                                              ↓
                                         Event Store (PostgreSQL)
```

- **Service layer is the product.** GraphQL resolvers are thin wrappers. The agent runtime calls services directly.
- **Events are the source of truth.** Mutations produce events; clients subscribe to events for state updates.
- **Agents are first-class.** No separate "agent mode" — agents use the same service layer as human users, distinguished only by `actor_type`.

## Monorepo Structure

```
apps/
├── server/        Apollo + Express, service layer, Prisma, WebSocket endpoints
├── web/           React + Vite + urql + Zustand, Tailwind CSS, shadcn/ui
└── desktop/       Electron shell + bridge client for local sessions

packages/
├── gql/           GraphQL schema, codegen, generated TypeScript types
└── shared/        CodingToolAdapter interfaces (Claude Code, Codex)
```

## Key Features

- **Channels** — Real-time messaging with multiple channel types (default, announcement, triage, feed)
- **Sessions** — AI coding sessions that run in the cloud (Fly.io) or locally (Electron bridge), with full lifecycle control (start, pause, resume, terminate)
- **Tickets** — Issue tracking with priority, status, and project linking
- **Event Log** — Immutable, append-only log powering all state changes and real-time sync
- **Session Lineage** — Fork and branch sessions with parent/child relationships
- **Multi-Repo Projects** — Link Git repositories to projects, link sessions and tickets to projects
- **Pluggable Adapters** — Swap coding tools (Claude Code, Codex), hosting modes (cloud, local), and LLM providers without changing core code

## Prerequisites

| Requirement | Version |
| ----------- | ------- |
| Node.js     | >= 22   |
| pnpm        | >= 10   |
| PostgreSQL  | >= 14   |

## Getting Started

### 1. Clone and install

```bash
git clone <repo-url> && cd trace
pnpm install
```

### 2. Set up environment variables

```bash
cp .env.example apps/server/.env
```

Edit `apps/server/.env` with your values:

```env
# Required
DATABASE_URL="postgresql://user:password@localhost:5432/trace"
GITHUB_CLIENT_ID="your-github-oauth-app-id"
GITHUB_CLIENT_SECRET="your-github-oauth-app-secret"

# Optional (defaults shown)
PORT=4000
JWT_SECRET="trace-dev-secret"
TRACE_WEB_URL="http://localhost:3000"
CORS_ALLOWED_ORIGINS=""                # Comma-separated origins for cross-origin deployments
TRACE_AUTH_COOKIE_SAME_SITE="lax"      # Use "none" for cross-site web/API deployments
```

**GitHub OAuth App setup:** Create a GitHub OAuth App at [github.com/settings/developers](https://github.com/settings/developers) with:

- **Homepage URL:** `http://localhost:3000`
- **Authorization callback URL:** `http://localhost:4000/auth/github/callback`

### 3. Set up the database

```bash
pnpm db:migrate    # Run Prisma migrations
pnpm db:generate   # Generate Prisma client
```

### 4. Generate types

```bash
pnpm gql:codegen   # Generate TypeScript types from GraphQL schema
```

Or run all codegen in one step:

```bash
pnpm codegen       # Prisma generate + GraphQL codegen + build types package
```

### 5. Run the development servers

```bash
pnpm dev           # Start all apps in parallel
```

Or run them individually:

```bash
pnpm dev:server    # Apollo server on http://localhost:4000
pnpm dev:web       # Vite dev server on http://localhost:3000 (proxies API to :4000)
pnpm dev:desktop   # Electron app (loads web from :3000)
```

Open [http://localhost:3000](http://localhost:3000) and sign in with GitHub.

### Running against production

For developing the web or desktop app against the production server:

```bash
pnpm dev:web:prod      # Web app → production API
pnpm dev:desktop:prod  # Desktop → production API + local web
```

## Tech Stack

### Server

| Layer     | Technology                                              |
| --------- | ------------------------------------------------------- |
| API       | Apollo Server 4, Express 5                              |
| Database  | PostgreSQL via Prisma ORM                               |
| Real-time | WebSocket (graphql-ws for subscriptions, ws for bridge) |
| Auth      | GitHub OAuth + JWT (httpOnly cookies)                   |
| Schema    | Single GraphQL schema with codegen                      |

### Web

| Layer     | Technology                                        |
| --------- | ------------------------------------------------- |
| Framework | React 19, Vite 6                                  |
| State     | Zustand 5 (single source of truth, no urql cache) |
| Transport | urql 4 (GraphQL client, cache disabled)           |
| Styling   | Tailwind CSS 4, shadcn/ui components              |
| Animation | framer-motion                                     |

Trace uses AG Grid Enterprise for data-dense tables. Local development can run
without a committed license key. Production builds should provide
`VITE_AG_GRID_LICENSE_KEY` through CI or deployment secrets.

### Desktop

| Layer       | Technology                                           |
| ----------- | ---------------------------------------------------- |
| Shell       | Electron 33 (electron-forge)                         |
| Bridge      | WebSocket client to server for local session control |
| Local tools | CodingToolAdapter (Claude Code, Codex)               |

## GraphQL API

The schema lives in `packages/gql/src/schema.graphql`. Key operations:

**Queries** — `organization`, `channels`, `sessions`, `tickets`, `events`, `repos`, `projects`

**Mutations** — `sendMessage`, `startSession`, `pauseSession`, `resumeSession`, `terminateSession`, `createTicket`, `updateTicket`, `createChannel`, `createRepo`, `createProject`, `linkEntityToProject`

**Subscriptions** — `orgEvents` (org-wide event stream), `channelEvents`, `ticketEvents`, `sessionStatusChanged`, `sessionPortsChanged`

## Data Model

All entities are scoped to an **Organization** and are flat peers — no nesting. Relationships are links.

- **User** — GitHub-authenticated members with roles (admin, member, observer)
- **Channel** — Communication groups with typed messages
- **Session** — AI coding sessions with full lifecycle and cloud/local hosting
- **Ticket** — Issues with priority (urgent/high/medium/low) and kanban status
- **Event** — Immutable log entries with actor, scope, and type metadata
- **Repo** / **Project** — Git repositories and project groupings that link to channels, sessions, and tickets

## Available Scripts

```bash
pnpm dev              # Run all apps in parallel
pnpm build            # Build all packages
pnpm lint             # Typecheck all apps
pnpm lint:eslint      # Run ESLint
pnpm format           # Format with Prettier
pnpm format:check     # Check formatting
pnpm gql:codegen      # Regenerate GraphQL types
pnpm codegen          # Full codegen (Prisma + GraphQL + build)
pnpm db:migrate       # Run Prisma migrations
pnpm db:generate      # Generate Prisma client
```

## CI

GitHub Actions runs on every push and PR (`.github/workflows/ci.yml`):

1. Install dependencies (frozen lockfile)
2. Generate GraphQL and Prisma types
3. Typecheck all packages
4. Validate Prisma schema
5. ESLint + Prettier checks

Production deploy workflows are manual (`workflow_dispatch`) so publishing the
repository does not automatically deploy from public branch activity.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development and pull request
guidelines.

## Security

See [SECURITY.md](SECURITY.md) for vulnerability reporting.

## License

Trace is released under the [MIT License](LICENSE).
