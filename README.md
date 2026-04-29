<h1 align="center">Trace</h1>

<p align="center">
  <strong>Open-source control plane for multiplayer AI coding sessions and reviews.</strong>
</p>

<p align="center">
  Run Claude Code, Codex, and other coding tools locally or in the cloud. Inspect
  progress from web, desktop, and mobile.
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

# A shared cockpit for AI coding work

Trace is a self-hosted workspace for running, monitoring, and collaborating on
AI coding sessions. It gives every session a durable home: status, files,
terminal output, branch state, checkpoints, runtime access, and history.

Instead of keeping AI coding work scattered across terminal tabs and local
folders, Trace makes each session visible to the team. Start a session on a repo,
watch it work, inspect the files it touched, hand it off, resume it later, or
check in from your phone.

**Run many coding sessions without losing track of any of them.**

|        | Flow            | Example                                                                 |
| ------ | --------------- | ----------------------------------------------------------------------- |
| **01** | Connect a repo  | Register a local checkout or a hosted repository.                       |
| **02** | Start a session | Launch Claude Code, Codex, or another coding tool against a branch.     |
| **03** | Follow along    | Watch status, terminal output, file changes, checkpoints, and runtimes. |
| **04** | Collaborate     | Review, hand off, resume, archive, or continue from mobile.             |

<br/>

<div align="center">
<table>
  <tr>
    <td align="center"><strong>Works with</strong></td>
    <td align="center"><strong>Claude Code</strong><br/><sub>coding tool adapter</sub></td>
    <td align="center"><strong>Codex</strong><br/><sub>coding tool adapter</sub></td>
    <td align="center"><strong>Desktop</strong><br/><sub>local sessions</sub></td>
    <td align="center"><strong>Containers</strong><br/><sub>cloud sessions</sub></td>
    <td align="center"><strong>Web</strong><br/><sub>control surface</sub></td>
    <td align="center"><strong>Mobile</strong><br/><sub>monitor and approve</sub></td>
  </tr>
</table>

<em>Bring your coding tool. Trace manages the session lifecycle around it.</em>

</div>

<br/>

## Trace is right for you if

- You run multiple AI coding sessions and need a clear view of what each one is doing.
- You want coding sessions to be shared, resumable, and inspectable by a team.
- You want local sessions through a desktop bridge and cloud sessions through containers.
- You want to review branches, files, terminals, and checkpoints from one place.
- You want mobile access for checking progress and responding while away from your desk.
- You want a pluggable runtime layer instead of hardcoding one coding tool or host.

<br/>

## Features

<table>
<tr>
<td width="33%" valign="top">
<h3>Session Control</h3>
Start, pause, resume, terminate, archive, fork, and inspect AI coding sessions
with durable status and history.
</td>
<td width="33%" valign="top">
<h3>Multiplayer Review</h3>
Share the same session surface across the team so people can follow progress,
review changes, and continue work from the same context.
</td>
<td width="33%" valign="top">
<h3>Local Desktop Bridge</h3>
Run sessions against local repos through Electron with controlled access to
worktrees, terminals, files, and branch sync.
</td>
</tr>
<tr>
<td valign="top">
<h3>Cloud Runtimes</h3>
Run container-backed sessions for hosted work, using the same session model as
local desktop sessions.
</td>
<td valign="top">
<h3>Mobile Monitoring</h3>
Use the Expo mobile client to check session state, inspect activity, and keep
work moving away from your laptop.
</td>
<td valign="top">
<h3>File and Terminal Visibility</h3>
Open files, view diffs, inspect terminal output, and keep runtime state attached
to the session instead of a disposable tab.
</td>
</tr>
<tr>
<td valign="top">
<h3>Session Lineage</h3>
Fork, branch, merge, archive, and restore sessions while preserving where each
piece of work came from.
</td>
<td valign="top">
<h3>Runtime Access Controls</h3>
Approve local runtime access and bridge permissions explicitly, with scoped
session and terminal capabilities.
</td>
<td valign="top">
<h3>Adapter Architecture</h3>
Swap coding tools, hosting modes, and model providers without rewriting the
core session layer.
</td>
</tr>
</table>

<br/>

## Problems Trace solves

| Without Trace                                                                            | With Trace                                                                                       |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| You have several Claude Code or Codex terminals open and cannot tell which one did what. | Every session has status, branch state, files, terminal output, and history in one place.        |
| Work disappears when a terminal closes or a machine reboots.                             | Sessions are durable workspace entities that can be resumed, reviewed, archived, or forked.      |
| Teammates cannot inspect what a coding tool is doing without screen sharing.             | The session surface is multiplayer and visible from web, desktop, and mobile.                    |
| Local and cloud coding runs behave like different products.                              | Local desktop sessions and cloud container sessions share the same lifecycle and data model.     |
| File changes, checkpoints, and runtime logs live in separate places.                     | Trace keeps files, diffs, terminal state, checkpoints, and runtime metadata attached to session. |
| Adding a new coding tool requires product-specific plumbing everywhere.                  | Coding tools plug in through adapters around a stable session model.                             |

<br/>

## Why Trace is different

Trace treats AI coding sessions as collaborative, durable workspace objects.

|                                      |                                                                                                     |
| ------------------------------------ | --------------------------------------------------------------------------------------------------- |
| **Sessions are first-class.**        | A run is not just a terminal process; it has lifecycle, history, files, runtime state, and lineage. |
| **Local and cloud share one model.** | Desktop bridges and hosted containers both connect through the same session router.                 |
| **The UI is multiplayer.**           | Web, desktop, and mobile clients subscribe to the same workspace state.                             |
| **Runtime boundaries are explicit.** | Local filesystem and terminal access are granted through bridge permissions and scoped capability.  |
| **Adapters keep tools replaceable.** | Claude Code, Codex, container hosts, and model providers live behind interfaces.                    |
| **GraphQL stays thin.**              | Resolvers call services; services own validation, authorization, persistence, and event emission.   |

<br/>

## What Trace is not

|                               |                                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------------------ |
| **Not a coding tool.**        | Trace runs and coordinates coding tools; it does not replace Claude Code, Codex, or your editor. |
| **Not an IDE.**               | It is a control plane for sessions, files, branches, terminals, and review.                      |
| **Not a single-tab wrapper.** | Trace is for many sessions, many repos, and many people following work together.                 |
| **Not vendor-locked.**        | Coding tools, hosting modes, and model providers are adapters.                                   |

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

Trace uses `pgvector` for indexing and retrieval features. Enable it before
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
Web / Mobile / Desktop  ->  GraphQL  ->  Service Layer  <-  Session Runtimes
                                             |
                                      Event Store
                                      PostgreSQL
```

The service layer owns validation, authorization, session lifecycle, persistence,
event creation, and broadcasting. External clients use GraphQL. Local and cloud
runtimes connect through the session router and bridge protocols.

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
  client-core/        Client stores, GraphQL operations, session event handling
  shared/             Adapter interfaces and runtime protocol types
```

### Core rules

- Schema source of truth: `packages/gql/src/schema.graphql`.
- Resolvers are thin wrappers around services.
- Services own session lifecycle and event creation.
- Clients and runtimes never write event rows directly.
- Zustand owns client state; urql is transport only.
- Session events are partitioned by scope in the client store.
- Vendor-specific code belongs inside adapter implementations.

<br/>

## Tech stack

| Area     | Stack                                                                |
| -------- | -------------------------------------------------------------------- |
| Server   | Apollo Server, Express, Prisma, PostgreSQL, Redis, WebSockets        |
| Web      | React, Vite, urql, Zustand, Tailwind CSS, shadcn/ui, framer-motion   |
| Mobile   | Expo, React Native, Expo Router, shared client-core stores           |
| Desktop  | Electron, WebSocket bridge, local repo/session control               |
| Runtimes | Session router, bridge protocol, coding tool adapters, LLM adapters  |
| Codegen  | GraphQL Code Generator, Prisma Client, TypeScript project references |

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
Only if you want to run sessions with those tools locally. Trace is built around
coding tool adapters, so additional tools can be added without changing the core
session model.

**Can teammates follow a session from another machine?**
Yes. Session state is stored on the server and rendered through the web and
mobile clients. Local filesystem access still goes through the approved desktop
bridge.

**Can I run sessions in the cloud?**
Yes. The container bridge provides the hosted runtime path. Local desktop and
cloud sessions share the same lifecycle model.

**Can I self-host production?**
Yes. The repo includes a Dockerfile and example EC2/Caddy deployment files under
`deploy/`. Use your own PostgreSQL, Redis, object storage, OAuth credentials,
and model/tool API keys.

<br/>

## Roadmap

- Broader coding tool adapter support.
- Richer multiplayer review workflows for active sessions.
- Better mobile flows for monitoring and approving session work.
- More deployment templates for local and cloud runtimes.
- Public docs for adapter development.
- Stronger observability around runtime health, session cost, and branch state.

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
  <sub>Built for teams running more AI coding sessions than one terminal can hold.</sub>
</p>
