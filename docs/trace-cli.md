# Trace CLI

The first-party `trace` CLI is another Trace client. It uses the same GraphQL operations, event
subscriptions, service-layer actions, and authorization rules as the web, desktop, and mobile apps.

## Authentication

There are two credential classes:

- **Human pairing** — create a pairing code from a signed-in Trace app, then run
  `trace auth pair <code> --server https://your-trace.example --name "Work laptop"`. The opaque
  device secret is stored in macOS Keychain or Linux Secret Service when available. The fallback is
  `~/.config/trace/credentials.json`, with its directory set to mode `0700` and file to `0600`.
- **Trace-managed session authentication** — coding tools receive `TRACE_SERVER_URL`,
  `TRACE_ORGANIZATION_ID`, `TRACE_SESSION_ID`, `TRACE_SESSION_GROUP_ID`, and a short-lived
  `TRACE_INVOCATION_TOKEN`. The CLI uses them automatically. The credential is audience-bound,
  invocation-bound, and session-bound, and stops working when the invocation is replaced or the
  session is no longer eligible.

Human device credentials carry the paired user's normal permissions. Session credentials use the
same CLI but have a server-enforced capability allowlist for their own session. Environment context
selects defaults; it never proves authority.

No command prints a credential. `trace auth logout` revokes a human CLI device on the server and
removes its local credential.

## Commands

```sh
trace auth pair [pairing-code] [--server URL] [--name NAME]
trace auth status
trace auth logout
trace context
trace org list
trace session list --org "$ORG_ID"
trace session get [session-id]
trace session start [prompt] [--channel ID|--group ID|--repo ID]
trace session send <session-id> <message>
trace session send --self <message>
trace session run [session-id] [prompt]
trace session stop [session-id]
trace session archive [session-id]
trace session events [session-id] [--limit 50] [--follow]
trace artifact push <type> <file-or-directory> [--key KEY]
```

Inside a Trace-launched session, commands that accept an optional session ID default to
`TRACE_SESSION_ID`. `--server`, `--org`, and `--json` are global options and may appear anywhere.

## Automation contract

With `--json`, each successful command prints exactly one JSON object followed by a newline. Event
follow mode prints the snapshot object first and then one `{ "event": ... }` object per event.
Stable top-level keys are:

| Command                      | JSON shape                                                                 |
| ---------------------------- | -------------------------------------------------------------------------- |
| `auth pair`                  | `{ authenticated, serverUrl, organizationId, deviceId, deviceName }`       |
| `auth status`                | `{ authenticated, mode, serverUrl, organizationId, user }`                 |
| `auth logout`                | `{ authenticated, revoked }`                                               |
| `context`                    | `{ serverUrl, organizationId, sessionId, sessionGroupId, authentication }` |
| `org list`                   | `{ organizations: [...] }`                                                 |
| `session list`               | `{ sessions: [...] }`                                                      |
| `session get/start/run/stop` | `{ session }`                                                              |
| `session send`               | `{ event }`                                                                |
| `session archive`            | `{ sessionGroup }`                                                         |
| `session events`             | `{ events: [...], following }`                                             |
| `artifact push`              | `{ artifact: { id, type, key } }`                                          |

Errors are written to stderr as `{ "error": { "category", "message" } }` in JSON mode. Exit codes
are stable: `2` authentication, `3` authorization, `4` validation, `5` connectivity, `6` server,
and `64` command usage.
The legacy `artifact push` validation path retains exit code `1` for runtime compatibility.

## Adding command families

Each command is a `Command` object with `path`, `usage`, `description`, and `run`. Put a new family
under `packages/cli/src/commands/`, export its commands, and register them in the `commands` array in
`packages/cli/src/main.ts`. Terminal, Git, provider, and browser work should follow this pattern and
reuse `TraceClient`; do not create another binary or authentication flow.

Mutating commands must call existing GraphQL mutations. When the schema lacks an action, add the
service method first, expose it through a thin resolver, and then add the CLI adapter. Events remain
service-layer side effects.
