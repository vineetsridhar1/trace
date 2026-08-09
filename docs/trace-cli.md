# Trace AI session CLI

Trace-managed AI sessions receive an internal `trace` command through the runtime. It is not a
user-installed CLI and does not require pairing, PATH setup, or a persistent credential store.

## Authentication and context

Each invocation receives these environment variables from the session service:

- `TRACE_CLI` — absolute path to the runtime-managed command
- `TRACE_SERVER_URL` and `TRACE_API_URL` — the Trace server for the current session
- `TRACE_ORGANIZATION_ID`, `TRACE_SESSION_ID`, and `TRACE_SESSION_GROUP_ID` — scoped context
- `TRACE_INVOCATION_TOKEN` — a short-lived, audience-bound credential for the active invocation

The server validates that the credential still matches the session's active invocation. It acts as
the session owner inside the current organization, using the same service-layer visibility and
authorization checks as the app. The credential only permits the allowlisted workflow: discover
channels, repos, projects, and sessions; create, read, message, queue, run, stop, archive, and watch
sessions; and upload artifacts. It cannot call unrelated user or administration APIs. No command
prints the credential.

AI guidance should invoke `"$TRACE_CLI"`, not rely on `trace` being present on the user's PATH.

## Commands

```sh
"$TRACE_CLI" context
"$TRACE_CLI" channel list [--member-only]
"$TRACE_CLI" repo list
"$TRACE_CLI" project list [--repo ID]
"$TRACE_CLI" session list [--status STATUS] [--tool TOOL] [--repo ID] [--channel ID]
"$TRACE_CLI" session get [session-id]
"$TRACE_CLI" session start [prompt] [--group ID | --channel ID | --project ID | --repo ID | --kind KIND]
"$TRACE_CLI" session send [session-id] <message> [--self] [--queue]
"$TRACE_CLI" session run [session-id] [prompt] [--self]
"$TRACE_CLI" session stop [session-id] [--self]
"$TRACE_CLI" session archive [session-id] [--self]
"$TRACE_CLI" session events [session-id] [--limit 50] [--follow]
"$TRACE_CLI" artifact push <type> <file-or-directory> [--key KEY] [--idempotency-key KEY]
```

All commands accept `--json`. Commands with an optional session ID default to `TRACE_SESSION_ID`.
Starting without `--group` creates a new session group. With no explicit destination, the CLI
derives the current session's channel and repo; use `--channel`, `--project`, or `--repo` to choose
another destination. Prefer a channel for normal UI visibility. A channel or project's linked repo
is derived automatically, and a destination without one requires `--repo`. Joining an existing
group requires explicit `--group`; those sessions inherit the group's hosting, runtime,
environment, branch, and visibility. Use `session start --help` for all creation options. Session
lists exclude merged and archived sessions unless their include flags are supplied.

New groups also default omitted kind, visibility, single-project association, tool, model, reasoning
effort, hosting, and agent environment from the current session. Older local sessions without an
environment reuse their local runtime. Explicit flags override these defaults. Branch is the
intentional exception: every new group receives a fresh workspace branch rather than trying to
check out the current group's branch twice.

A prompt passed to `session start` requests its run immediately. The returned session can remain
`not_started` while runtime provisioning is in progress; do not repeat the prompt with `session
run`. The CLI automatically attaches an idempotency key and retries transient empty/server
responses once. If a retry is still necessary, reuse the reported key with `--idempotency-key`.
Explicit cloud requests fail if cloud is unavailable and are never downgraded to local.

## Automation contract

With `--json`, each successful command prints exactly one JSON object followed by a newline. Event
follow mode prints the snapshot object first and then one `{ "event": ... }` object per event.
If more than 1,000 events accumulated after the snapshot cursor, follow mode asks the caller to take
a new snapshot instead of replaying an unbounded history.

| Command          | JSON shape                                                                 |
| ---------------- | -------------------------------------------------------------------------- |
| `context`        | `{ serverUrl, organizationId, sessionId, sessionGroupId, authentication }` |
| resource lists   | `{ channels }`, `{ repos }`, or `{ projects }`                             |
| `session list`   | `{ sessions }`                                                             |
| `session get`    | `{ session }`                                                              |
| `session start`  | `{ session, runRequested, uiPath, idempotencyKey }`                        |
| `session send`   | `{ event }` or `{ queuedMessage }`                                         |
| lifecycle        | `{ session }` or `{ sessionGroup }`                                        |
| `session events` | `{ events: [...], following }`                                             |
| `artifact push`  | `{ artifact: { id, type, key }, idempotencyKey }`                          |

Errors are written to stderr as `{ "error": { "category", "message" } }` in JSON mode. Exit
codes are stable: `2` authentication, `3` authorization, `4` validation, `5` connectivity, `6`
server, and `64` command usage. The legacy artifact video-validation path retains exit code `1`.

## Future public CLI

A user-installable CLI, interactive login or pairing, PATH installation, and broader human-level
permissions are intentionally deferred. They should be designed as a separate product surface if
external clients such as Codex need direct Trace access later.
