# trace-mcp

An [MCP](https://modelcontextprotocol.io) server for **[Trace](../trace)** — the
shared AI coding cockpit. It lets an AI agent **observe** and **drive** Trace's
AI coding sessions over Trace's GraphQL API.

## How to connect

The Trace backend hosts this server as a **Streamable-HTTP MCP endpoint** at
`POST /mcp` (e.g. `https://trace.infra.opendoor.com/mcp`). There is nothing to
install or bundle — point any MCP client at the URL and it authorizes over
OAuth.

**Claude Code** (`.mcp.json` / `claude mcp add`):

```json
{
  "mcpServers": {
    "trace": {
      "type": "http",
      "url": "https://trace.infra.opendoor.com/mcp"
    }
  }
}
```

No token in the config. On first use the client discovers Trace's OAuth
authorization server, opens a browser once for GitHub sign-in, and stores the
resulting access + refresh tokens itself. Access tokens are short-lived (1h) and
the client refreshes them silently — you never paste or rotate a token by hand.

**Codex** (`~/.codex/config.toml`):

```toml
[mcp_servers.trace]
url = "https://trace.infra.opendoor.com/mcp"
```

The endpoint is stateless — each request authenticates its own bearer, resolves
the caller's organization, and serves the same tool set.

### OAuth flow

Trace is both the OAuth authorization server and the resource server for `/mcp`,
delegating identity to GitHub:

1. An unauthenticated `POST /mcp` returns `401` with a `WWW-Authenticate` header
   pointing at `/.well-known/oauth-protected-resource/mcp`.
2. The client reads the resource + authorization-server metadata and registers
   itself via dynamic client registration (`POST /register`).
3. The client opens `/authorize`, which redirects to GitHub. After you approve,
   GitHub calls back to `/oauth/github/callback`, Trace resolves your user and
   organization, and issues a one-time authorization code.
4. The client exchanges the code at `/token` (PKCE-verified) for a short-lived
   access token and a long-lived, rotating refresh token. Expired access tokens
   are refreshed transparently; `/revoke` invalidates a refresh token.

### Pre-minted token (fallback / CI)

For non-interactive use (CI, scripts, Codex without a browser), a raw Trace JWT
still works as a plain bearer token:

```toml
[mcp_servers.trace]
url = "https://trace.infra.opendoor.com/mcp"
bearer_token_env_var = "TRACE_TOKEN"
```

Get a token from the GitHub device-flow `login` command below. This path has no
automatic refresh — the token expires on its own schedule.

A stdio entrypoint (`node dist/index.js`) is still shipped for local
development and the device-flow `login` command, but the hosted HTTP endpoint is
the primary integration path.

## What it does

The server exposes Trace capabilities as MCP tools.

**Observe (read-only)**

| Tool | Purpose |
| --- | --- |
| `list_sessions` | List sessions, filter by status/tool/repo/channel |
| `get_session` | Full detail for one session (status, branch, cost, tokens, connection) |
| `search_sessions` | Full-text search across sessions and session groups |
| `session_timeline` | Recent events/output for a session |
| `session_branch_diff` | Files changed on a session group's branch |
| `read_session_file` | Read a file from a session group's working tree |
| `list_channels` | List channels |
| `list_repos` | List registered repositories |

**Drive (actions)**

| Tool | Purpose |
| --- | --- |
| `start_session` | Start a new coding session from a prompt |
| `run_session` | Run / resume an existing session |
| `send_session_message` | Send a message into a running session |
| `queue_session_message` | Queue a message for after the current turn |
| `fork_session` | Fork a session from a timeline event |
| `terminate_session` | Stop a running session |

## Setup

This package is part of the Trace pnpm workspace. From the repo root:

```bash
pnpm install
pnpm --filter @trace/mcp build
```

## Authentication

The server defaults to the hosted Trace instance at
`https://trace.infra.opendoor.com`. Authenticate once via GitHub device flow:

```bash
node dist/index.js login
```

This prints a code and a `https://github.com/login/device` URL. Authorize in
the browser; the resulting JWT is saved to
`~/.config/trace-mcp/credentials.json` (mode 0600, keyed by server URL) and
reused on every run.

The MCP server resolves a credential in this order:

1. `TRACE_TOKEN` env var (a pre-minted JWT, sent as `Authorization: Bearer`).
2. The saved credentials file (written by `login`).
3. **localhost only:** `POST /auth/local/login` — convenience for a local-mode
   dev server (`pnpm dev:local`).
4. Otherwise re-authentication kicks in automatically (see below).

Auth is lazy (on first tool call), so `tools/list` works without credentials.
The organization id is read from `/auth/me` (override with `TRACE_ORG_ID`).

### Automatic re-authentication

When a token expires (Trace returns `401`), the server self-heals without you
re-running the `login` script:

1. It first adopts a fresher token if one exists (e.g. you ran `login` in
   another terminal, or a background login already finished) and retries
   transparently.
2. Otherwise it **starts a GitHub device flow automatically** and returns the
   code + verification URL in the tool response (the code is also written to
   stderr). Authorize once in the browser; the new token is saved and polled in
   the background, so the next tool call succeeds automatically.

GitHub device flow always requires a one-time browser authorization — there is
no silent refresh token — but you never need to manually run the CLI again.

Set `TRACE_AUTO_LOGIN=0` to disable the automatic device flow (the server then
just returns a "run `login`" hint on expiry). Auto re-auth is also off when
`TRACE_TOKEN` is set, since you manage that credential yourself.

### Configuration (env vars)

| Variable | Default | Purpose |
| --- | --- | --- |
| `TRACE_BASE_URL` | `https://trace.infra.opendoor.com` | Trace server URL (use `http://localhost:4000` for local dev) |
| `TRACE_TOKEN` | _(none)_ | Pre-minted JWT (Bearer); skips interactive login |
| `TRACE_ORG_ID` | _(from `/auth/me`)_ | Override the organization id |
| `TRACE_LOCAL_USER` | _(most recent)_ | Local user name (localhost local-login only) |
| `TRACE_CREDENTIALS_PATH` | `~/.config/trace-mcp/credentials.json` | Where the login token is stored |
| `TRACE_AUTO_LOGIN` | `1` | Set to `0` to disable automatic device-flow re-auth on expiry |
| `TRACE_CHANNEL_ID` | _(none)_ | Default channel for `start_session` when no channel/repo/group is given |

## Development

```bash
pnpm --filter @trace/mcp dev        # tsc --watch
pnpm --filter @trace/mcp typecheck  # type-check only
```

Smoke-test the protocol without Trace running:

```bash
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"t","version":"0"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' \
  | node dist/index.js
```

## Architecture notes

- Trace's API is a single GraphQL endpoint (`POST /graphql`); this server is a
  thin GraphQL client. The schema source of truth is
  `../trace/packages/gql/src/schema.graphql`.
- Subscriptions (live event streams) are intentionally **not** exposed in v1 —
  poll `session_timeline` to follow progress.
- Trace treats agents as first-class actors through the same service layer as
  human users, so an MCP client needs no special API surface.
