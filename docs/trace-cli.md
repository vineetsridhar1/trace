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
"$TRACE_CLI" session start [prompt] [--group ID | --channel ID | --repo ID | --kind KIND]
"$TRACE_CLI" session send [session-id] <message> [--self] [--queue]
"$TRACE_CLI" session run [session-id] [prompt] [--self]
"$TRACE_CLI" session stop [session-id] [--self]
"$TRACE_CLI" session archive [session-id] [--self]
"$TRACE_CLI" session events [session-id] [--limit 50] [--follow]
"$TRACE_CLI" artifact push <type> <file-or-directory> [--key KEY]
```

All commands accept `--json`. Commands with an optional session ID default to `TRACE_SESSION_ID`.
Starting without an explicit destination creates a sibling in `TRACE_SESSION_GROUP_ID`. Use
`session start --help` for all creation options. Session lists exclude merged and archived sessions
unless their include flags are supplied.

## Automation contract

With `--json`, each successful command prints exactly one JSON object followed by a newline. Event
follow mode prints the snapshot object first and then one `{ "event": ... }` object per event.

| Command          | JSON shape                                                                 |
| ---------------- | -------------------------------------------------------------------------- |
| `context`        | `{ serverUrl, organizationId, sessionId, sessionGroupId, authentication }` |
| resource lists   | `{ channels }`, `{ repos }`, or `{ projects }`                             |
| `session list`   | `{ sessions }`                                                               |
| `session get`    | `{ session }`                                                               |
| `session start`  | `{ session }`                                                               |
| `session send`   | `{ event }` or `{ queuedMessage }`                                         |
| lifecycle        | `{ session }` or `{ sessionGroup }`                                        |
| `session events` | `{ events: [...], following }`                                             |
| `artifact push`  | `{ artifact: { id, type, key } }`                                          |

Errors are written to stderr as `{ "error": { "category", "message" } }` in JSON mode. Exit
codes are stable: `2` authentication, `3` authorization, `4` validation, `5` connectivity, `6`
server, and `64` command usage. The legacy artifact video-validation path retains exit code `1`.

## Future public CLI

A user-installable CLI, interactive login or pairing, PATH installation, and broader human-level
permissions are intentionally deferred. They should be designed as a separate product surface if
external clients such as Codex need direct Trace access later.
