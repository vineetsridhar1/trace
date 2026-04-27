<h1 align="center">Trace</h1>

<p align="center">
  <strong>Open-source work OS for humans and AI agents.</strong>
</p>

<p align="center">
  Chat, tickets, project management, and AI coding sessions in one shared event log.
</p>

<p align="center">
  <a href="#quickstart"><strong>Quickstart</strong></a> &middot;
  <a href="#architecture"><strong>Architecture</strong></a> &middot;
  <a href="#development"><strong>Development</strong></a> &middot;
  <a href="https://github.com/vineetsridhar1/trace"><strong>GitHub</strong></a> &middot;
  <a href="CONTRIBUTING.md"><strong>Contributing</strong></a>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-blue" alt="AGPL-3.0 License" /></a>
  <img src="https://img.shields.io/badge/node-%3E%3D22-43853d" alt="Node.js >= 22" />
  <img src="https://img.shields.io/badge/pnpm-%3E%3D10-f69220" alt="pnpm >= 10" />
</p>

<br/>

## What is Trace?

# A shared workspace where every action is an event

Trace is a communication, project management, and AI development platform built
around a single idea: **the difference between chat, tickets, and coding sessions
is mostly artificial**.

A message, a ticket update, an agent decision, a terminal event, and a session
state change are all events in the same append-only log. Humans and agents use
the same service layer, the same permissions model, and the same workspace.

It looks like a team workspace. Under the hood it is an event-sourced control
plane for human and agent work.

**Manage the work, the conversation, and the agent runtime in one place.**

|        | Flow              | Example                                                                 |
| ------ | ----------------- | ----------------------------------------------------------------------- |
| **01** | Talk              | Discuss a bug, feature, incident, or decision in a channel.             |
| **02** | Turn it into work | Create tickets, link repos, start sessions, and preserve context.       |
| **03** | Let agents help   | Run Claude Code, Codex, or another coding tool locally or in the cloud. |
| **04** | Audit everything  | Follow the event log from conversation to code to review.               |

<br/>

<div align="center">
<table>
  <tr>
    <td align="center"><strong>Works with</strong></td>
    <td align="center"><strong>Claude Code</strong><br/><sub>coding tool adapter</sub></td>
    <td align="center"><strong>Codex</strong><br/><sub>coding tool adapter</sub></td>
    <td align="center"><strong>Electron</strong><br/><sub>local sessions</sub></td>
    <td align="center"><strong>Fly.io</strong><br/><sub>cloud sessions</sub></td>
    <td align="center"><strong>OpenAI</strong><br/><sub>LLM adapter</sub></td>
    <td align="center"><strong>Anthropic</strong><br/><sub>LLM adapter</sub></td>
  </tr>
</table>

<em>Adapters are pluggable. The core system does not depend on one model, host, or coding tool.</em>

</div>

<br/>

## Trace is right for you if

- You want one place for **team communication, tickets, and AI coding sessions**.
- You run multiple coding agents and need to know **what each one did and why**.
- You want agents to operate as first-class actors, not as a separate sidecar mode.
- You care about event history, auditability, permissions, and real-time sync.
- You want local sessions through a desktop bridge and cloud sessions through a container runtime.
- You want to build on a service layer that clients and agents both use directly.

<br/>

## Features

<table>
<tr>
<td width="33%" valign="top">
<h3>Shared Event Log</h3>
Every meaningful action becomes an immutable event. The UI, API, subscriptions,
agent runtime, and stores all derive state from the same stream.
</td>
<td width="33%" valign="top">
<h3>First-Class Agents</h3>
Agents are actors with the same service-layer access pattern as users. The
difference is metadata, not a separate architecture.
</td>
<td width="33%" valign="top">
<h3>AI Coding Sessions</h3>
Start, pause, resume, terminate, fork, and inspect coding sessions. Run them
locally through Electron or in cloud containers.
</td>
</tr>
<tr>
<td valign="top">
<h3>Channels and Chats</h3>
Use channels, DMs, session threads, and scoped event views to keep discussion
and work history connected.
</td>
<td valign="top">
<h3>Tickets and Projects</h3>
Track work with priorities, statuses, repos, projects, links, and suggestions
generated from the same workspace context.
</td>
<td valign="top">
<h3>Pluggable Boundaries</h3>
Session adapters, coding tool adapters, and LLM adapters keep vendors out of
the core business logic.
</td>
</tr>
<tr>
<td valign="top">
<h3>Desktop Bridge</h3>
The Electron app runs local sessions and exposes controlled access to local
repos, worktrees, terminals, and files.
</td>
<td valign="top">
<h3>Mobile Client</h3>
An Expo client shares the same client-core stores and GraphQL operations as the
web app.
</td>
<td valign="top">
<h3>Thin GraphQL API</h3>
GraphQL is the external interface. Resolvers call services. Business logic
lives in the service layer.
</td>
</tr>
</table>

<br/>

## Problems Trace solves

| Without Trace                                                                  | With Trace                                                                                         |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| AI coding sessions live in terminal tabs with little shared memory.            | Sessions are workspace entities with status, lineage, events, files, terminals, and messages.      |
| Chat, tickets, and code work drift apart.                                      | Conversations, tickets, sessions, repos, and projects are linked peers in the same organization.   |
| Agents need custom backchannels to update state.                               | Agents use the same service layer as humans and emit the same event types.                         |
| Real-time clients refetch or maintain competing caches.                        | Mutations produce events, subscriptions deliver them, and Zustand stores derive state from events. |
| Adding a new coding tool or hosting mode requires touching core product logic. | Adapters isolate coding tools, session hosts, and LLM providers.                                   |
| It is hard to reconstruct why work happened.                                   | The event log records actor, scope, payload, and resulting state transitions.                      |

<br/>

## Why Trace is different

Trace treats the service layer as the product.

|                                     |                                                                                                     |
| ----------------------------------- | --------------------------------------------------------------------------------------------------- |
| **Events are the source of truth.** | Clients request actions. Services validate, authorize, mutate, append events, and broadcast them.   |
| **Agents are not special cases.**   | Agent actors and human actors go through the same authorization and business logic.                 |
| **Entities are flat.**              | Channels, sessions, tickets, repos, and projects are organization-scoped peers linked by relations. |
| **GraphQL stays thin.**             | Resolvers parse input, call services, and format output. They do not own business rules.            |
| **Adapters keep vendors outside.**  | Cloud hosts, local bridges, coding tools, and LLMs are replaceable implementation details.          |
| **Client state is predictable.**    | urql transports data; Zustand owns state; event handlers normalize updates.                         |

<br/>

## What Trace is not

|                             |                                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------------- |
| **Not just a chatbot.**     | Chat is one event surface. The product model also includes work, code sessions, repos, and audit. |
| **Not a ticket wrapper.**   | Tickets are part of the event model, not the center of the system.                                |
| **Not an agent framework.** | Trace coordinates agents and runtimes; it does not require one agent implementation.              |
| **Not GraphQL-first.**      | GraphQL is the public API boundary. The service layer is the source of product behavior.          |
| **Not vendor-locked.**      | Claude Code, Codex, Anthropic, OpenAI, Fly.io, and Electron are adapters, not core assumptions.   |

<br/>

## Quickstart

Open source. Self-hosted. No Trace cloud account required.

```bash
git clone https://github.com/vineetsridhar1/trace.git
cd trace
pnpm install
pnpm dev:local
```

`pnpm dev:local` starts a local Trace workspace:

- Creates or reuses a local Prisma Postgres dev server.
- Enables `pgvector`.
- Syncs the Prisma schema and seeds baseline data.
- Generates the Prisma client.
- Starts the API server on `http://localhost:4000`.
- Starts the web app on `http://localhost:3000`.
- Opens the Electron desktop bridge for local sessions.

The local mode path does not require a GitHub OAuth app. State is stored in the
OS application-support directory for the current checkout.

> Requirements: Node.js 22+, pnpm 10+.

<br/>

## Manual setup

Use this path when you want to run against your own PostgreSQL database and
GitHub OAuth app.

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure the server

```bash
cp .env.example apps/server/.env
```

Edit `apps/server/.env`:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/trace?schema=public"
GITHUB_CLIENT_ID="your-github-oauth-app-id"
GITHUB_CLIENT_SECRET="your-github-oauth-app-secret"

PORT=4000
JWT_SECRET="replace-me"
TOKEN_ENCRYPTION_KEY="replace-me"
TRACE_WEB_URL="http://localhost:3000"
CORS_ALLOWED_ORIGINS=""
TRACE_AUTH_COOKIE_SAME_SITE="lax"
```

Create a GitHub OAuth app at
[github.com/settings/developers](https://github.com/settings/developers):

- Homepage URL: `http://localhost:3000`
- Authorization callback URL: `http://localhost:4000/auth/github/callback`

Trace uses `pgvector` for semantic memory and summaries. Enable it before
migrating:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### 3. Prepare the database and generated types

```bash
pnpm db:migrate
pnpm codegen
```

### 4. Run the apps

```bash
pnpm dev
```

Or run individual processes:

```bash
pnpm dev:server       # API on http://localhost:4000
pnpm dev:web          # Web on http://localhost:3000
pnpm dev:desktop      # Electron desktop bridge
```

<br/>

## Architecture

```text
Web / Mobile / Desktop  ->  GraphQL  ->  Service Layer  <-  Agent Runtime
                                             |
                                      Event Store
                                      PostgreSQL
```

The service layer owns validation, authorization, business logic, persistence,
event creation, and broadcasting. External clients use GraphQL. The agent
runtime calls services directly.

### Monorepo layout

```text
apps/
  server/             Apollo + Express, service layer, Prisma, WebSocket endpoints
  web/                React + Vite + urql + Zustand, Tailwind CSS, shadcn/ui
  mobile/             Expo + React Native client
  desktop/            Electron shell and local bridge
  container-bridge/   Container bridge runtime for cloud sessions

packages/
  gql/                GraphQL schema, codegen, generated TypeScript types
  client-core/        Client stores, GraphQL operations, event handling
  shared/             Adapter interfaces and runtime protocol types
```

### Core rules

- Schema source of truth: `packages/gql/src/schema.graphql`.
- Resolvers are thin wrappers around services.
- Services are the only layer that creates events.
- Clients and agents never write events directly.
- Zustand owns client state; urql is transport only.
- Events are partitioned by scope in the client store.
- Vendor-specific code belongs inside adapter implementations.

<br/>

## Tech stack

| Area    | Stack                                                                |
| ------- | -------------------------------------------------------------------- |
| Server  | Apollo Server, Express, Prisma, PostgreSQL, Redis, WebSockets        |
| Web     | React, Vite, urql, Zustand, Tailwind CSS, shadcn/ui, framer-motion   |
| Mobile  | Expo, React Native, Expo Router, shared client-core stores           |
| Desktop | Electron, WebSocket bridge, local repo/session control               |
| Agents  | Service-layer runtime, policy pipeline, LLM adapters, tool adapters  |
| Codegen | GraphQL Code Generator, Prisma Client, TypeScript project references |

Trace can use AG Grid Enterprise for data-dense tables. Local development works
without a committed license key. Production builds should provide
`VITE_AG_GRID_LICENSE_KEY` through CI or deployment secrets.

<br/>

## Development

```bash
pnpm dev              # Run all apps in parallel
pnpm dev:local        # One-command local workspace
pnpm dev:server       # Server only
pnpm dev:web          # Web only
pnpm dev:desktop      # Desktop only
pnpm build            # Build all packages
pnpm lint             # Typecheck all packages
pnpm lint:eslint      # Run ESLint
pnpm test             # Run tests
pnpm format           # Format with Prettier
pnpm format:check     # Check formatting
pnpm gql:codegen      # Regenerate GraphQL types
pnpm codegen          # Prisma generate + GraphQL codegen + gql build
pnpm db:migrate       # Run Prisma migrations
pnpm db:generate      # Generate Prisma client
```

### CI

GitHub Actions runs on pushes and pull requests to `main`:

1. Install dependencies with the frozen lockfile.
2. Generate GraphQL and Prisma types.
3. Typecheck all packages.
4. Validate the Prisma schema.
5. Run ESLint and Prettier checks.

Production deployment workflows are manual (`workflow_dispatch`).

<br/>

## FAQ

**Can Trace run completely locally?**
Yes. `pnpm dev:local` runs a local database, web app, API server, and Electron
bridge. Local mode uses local auth instead of GitHub OAuth.

**Do I need Claude Code or Codex installed?**
Only if you want to run sessions with those tools locally. The platform is built
around coding tool adapters, so additional tools can be added without changing
the core service model.

**Can agents modify Trace state directly?**
No. Agents call services. Services validate permissions, perform mutations,
append events, and broadcast updates.

**Why not use GraphQL for the agent runtime?**
GraphQL is the external client API. The agent runtime runs inside the system and
calls the same services directly, avoiding duplicate business logic.

**Can I self-host production?**
Yes. The repo includes a Dockerfile and example EC2/Caddy deployment files under
`deploy/`. Use your own PostgreSQL, Redis, object storage, OAuth credentials,
and model/tool API keys.

<br/>

## Roadmap

- Broader coding tool adapter support.
- Richer agent autonomy controls and review workflows.
- Better mobile workflows for monitoring and approving agent work.
- More deployment templates.
- Public docs for adapter development.
- Stronger observability around cost, runtime health, and event processing.

<br/>

## Contributing

Contributions are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md), and
please read [SECURITY.md](SECURITY.md) before reporting vulnerabilities.

<br/>

## License

Trace is open source under the [GNU Affero General Public License v3.0](LICENSE).

<br/>

---

<p align="center">
  <sub>Built for teams where humans and agents work in the same room.</sub>
</p>
