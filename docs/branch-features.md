# Branch Features

This branch adds the first end-to-end slice for managed per-session databases, plus a few supporting developer experience updates.

## Managed Session Databases

Trace sessions can now carry database state alongside workspace and connection state. The server persists that state on both `Session` and `SessionGroup`, exposes it through GraphQL, and broadcasts updates as regular `session_output` events. This keeps database state on the same event path as the rest of the session lifecycle.

The new database state model includes:

- `enabled`: whether Trace found a database-backed project for the workspace.
- `status`: one of `disabled`, `preparing`, `ready`, `recovering`, or `failed`.
- `framework`: the detected database framework, when available.
- `databaseName` and `port`: connection details for ready databases.
- `lastError`: a surfaced failure reason.
- `canReset`: whether the user can request a reset.
- `updatedAt`: the last status update timestamp.

When a workspace becomes ready, the bridge reports database status in the `workspace_ready` payload. If the database is not ready, the server skips channel setup scripts instead of running setup against an incomplete database environment.

## dbctl Runtime

The branch introduces a TypeScript-first `dbctl` subsystem:

- `packages/dbctl-protocol`: shared request, response, status, and runtime types.
- `packages/dbctl-core`: detection, daemon client helpers, database lifecycle logic, and local Postgres orchestration.
- `apps/dbctl-daemon`: Unix socket daemon that handles `dbctl` requests.
- `apps/dbctl-cli`: local CLI for manual inspection and reset workflows.

The daemon supports these request kinds:

- `ensure`: detect the workspace project and prepare a database if supported.
- `reset`: destroy and rebuild the database instance for a workspace.
- `destroy`: remove a workspace database instance.
- `status`: inspect current database state.
- `logs`: read recent Postgres logs.
- `gc`: remove database instances whose worktrees no longer exist.

The local runtime stores state under `~/.trace/dbctl` by default. The cloud runtime path is wired through the bridge protocol, but the actual cloud database backend is not configured yet. For supported database projects in cloud mode, `dbctl` currently reports a failed database state with a clear backend-not-configured error.

## Project Detection

`dbctl` detects common Postgres-backed frameworks and chooses migration and seed commands from local project conventions.

Supported detection paths include:

- Prisma
- Drizzle
- Sequelize
- Rails Active Record
- Django
- SQLAlchemy with Alembic
- Entity Framework Core with Npgsql
- Hibernate projects using Flyway or Liquibase

Database rebuilds are keyed from migration inputs, seed inputs, framework, runtime, repo identity, and Postgres version. Local builds use a reusable base database and clone it into per-worktree instances using filesystem reflinks. On local machines this requires full Postgres server binaries and a reflink-capable filesystem. `TRACE_DBCTL_PG_BIN_DIR` can point Trace at an explicit Postgres binary directory.

## Session Runtime Integration

Desktop and container bridges now start the `dbctl` daemon during startup and use it when preparing writable worktrees. Read-only sessions explicitly report managed databases as disabled.

When a managed database is ready, the bridge injects its connection environment into:

- coding tool processes, including Codex and Claude Code
- integrated terminal sessions

The injected environment includes standard Postgres variables such as `DATABASE_URL`, `PGHOST`, `PGPORT`, `PGDATABASE`, and `PGUSER`.

Worktree creation also mirrors common root `.env` files into the worktree and symlinks existing `node_modules` directories from the source checkout. This makes generated worktrees closer to the user's existing checkout without copying large dependency directories.

## Reset Flow

Users can reset a managed database from the session view when Trace reports a resettable database state. The new GraphQL mutation is:

```graphql
resetSessionDatabase(sessionId: ID!): Boolean!
```

The server marks the database as `preparing`, emits a `database_status` event, and routes a `database_reset` bridge command to the runtime that owns the session. The bridge performs the reset through `dbctl` and returns the resulting status as another `database_status` event.

If the reset command cannot be delivered to the runtime, the server marks the database as `failed` and includes the delivery failure in `lastError`.

## Web UI Updates

The session list, session detail view, session group detail view, merged sessions page, and archived sessions page now query and preserve `database` snapshots. Event handlers patch session database state from both `workspace_ready` and `database_status` events.

The session header surfaces managed database problems without adding them to the visible transcript:

- `preparing`: shows a reset-in-progress state.
- `recovering`: shows a recovery notice.
- `failed`: shows the failure reason and, when allowed, a reset action.

`database_status` events are hidden from the main session transcript while still updating the Zustand entity store through org events.

The file explorer also adds a small "Collapse all" control for expanded folders.

## API And Persistence Changes

Database state is persisted as JSON on:

- `Session.database`
- `SessionGroup.database`

GraphQL adds:

- `SessionDatabaseStatus`
- `SessionDatabase`
- `Session.database`
- `SessionGroup.database`
- `resetSessionDatabase`

The event trimming logic now preserves database fields in org-relevant session output payloads, and `database_status` is included in the org-wide relevant output subtype set.

## Developer Experience Updates

This branch also includes supporting development changes:

- Node is upgraded to version 24 across `package.json`, `.nvmrc`, and Docker images.
- Server scripts load the root `.env` with `--env-file-if-exists=../../.env`.
- README setup now points developers at a root `.env`.
- GitHub OAuth configuration failures are surfaced back to the login popup instead of failing silently.
- Root `.env.example` now includes GitHub OAuth and public server URL placeholders.
- Repo-local agent skill docs were added under `.agents/skills`.

## Manual Checks

Useful commands while validating this branch:

```bash
pnpm build
pnpm test:server
pnpm --filter @trace/dbctl-core build
pnpm --filter @trace/dbctl-daemon build
pnpm --filter @trace/dbctl-cli build
```

For manual `dbctl` inspection after building:

```bash
node apps/dbctl-cli/dist/index.js status /path/to/worktree
node apps/dbctl-cli/dist/index.js ensure /path/to/worktree
node apps/dbctl-cli/dist/index.js reset /path/to/worktree
node apps/dbctl-cli/dist/index.js logs /path/to/worktree
```
