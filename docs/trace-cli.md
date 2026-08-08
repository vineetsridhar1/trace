# Trace AI session CLI

Trace-managed AI sessions receive an internal `trace` command through the runtime. It is not a
user-installed CLI and does not require pairing, PATH setup, or a persistent credential store.

## Authentication and context

Each invocation receives these environment variables from the session service:

- `TRACE_CLI` — absolute path to the runtime-managed command
- `TRACE_SERVER_URL` and `TRACE_API_URL` — the Trace server for the current session
- `TRACE_ORGANIZATION_ID`, `TRACE_SESSION_ID`, and `TRACE_SESSION_GROUP_ID` — scoped context
- `TRACE_INVOCATION_TOKEN` — a short-lived, audience-bound credential for the active invocation

The server validates that the credential still matches the session's active invocation. It can
only read the current session and its events, send a message to that session, and upload artifacts.
It cannot be used for another session or for unrelated user APIs. No command prints the credential.

AI guidance should invoke `"$TRACE_CLI"`, not rely on `trace` being present on the user's PATH.

## Commands

```sh
"$TRACE_CLI" context
"$TRACE_CLI" session get
"$TRACE_CLI" session send --self <message>
"$TRACE_CLI" session events [--limit 50] [--follow]
"$TRACE_CLI" artifact push <type> <file-or-directory> [--key KEY]
```

All commands accept `--json`. Commands with an optional session ID default to `TRACE_SESSION_ID`;
the server still rejects attempts to access any other session.

## Automation contract

With `--json`, each successful command prints exactly one JSON object followed by a newline. Event
follow mode prints the snapshot object first and then one `{ "event": ... }` object per event.

| Command          | JSON shape                                                                 |
| ---------------- | -------------------------------------------------------------------------- |
| `context`        | `{ serverUrl, organizationId, sessionId, sessionGroupId, authentication }` |
| `session get`    | `{ session }`                                                               |
| `session send`   | `{ event }`                                                                 |
| `session events` | `{ events: [...], following }`                                             |
| `artifact push`  | `{ artifact: { id, type, key } }`                                          |

Errors are written to stderr as `{ "error": { "category", "message" } }` in JSON mode. Exit
codes are stable: `2` authentication, `3` authorization, `4` validation, `5` connectivity, `6`
server, and `64` command usage. The legacy artifact video-validation path retains exit code `1`.

## Future public CLI

A user-installable CLI, interactive login or pairing, PATH installation, and broader human-level
permissions are intentionally deferred. They should be designed as a separate product surface if
external clients such as Codex need direct Trace access later.
