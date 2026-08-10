---
name: trace-session
description: Discover and control Trace sessions from a Trace-managed AI session.
---

# Trace session control

Use this skill when the user asks you to find, create, message, run, stop, monitor, or archive Trace sessions.

## Invocation and safety

- Invoke the CLI as `"$TRACE_CLI"`; do not assume `trace` is on `PATH`.
- Prefer `--json` when reading command output programmatically.
- Never print, log, or pass `$TRACE_INVOCATION_TOKEN` yourself. The CLI reads it automatically.
- Your credential acts with the owning user's organization membership and visibility, but only exposes the allowlisted session workflow. It is tied to the active invocation and expires.
- Starting, messaging, running, stopping, and archiving sessions change shared Trace state. Do them only when they are requested or are a necessary part of the requested workflow.
- Do not create recursive agent loops or repeatedly spawn sessions unless the user explicitly authorizes that behavior.

## Discover commands

The CLI exposes its registered command surface as JSON. When the request needs a Trace capability
that is not documented below, inspect the catalog instead of guessing command names or options:

```sh
"$TRACE_CLI" --help --json
"$TRACE_CLI" <command> <subcommand> --help --json
```

If the catalog does not contain the capability, report that it is unavailable. Do not substitute
an unrelated command or call Trace's GraphQL API directly.

## Discover context and destinations

```sh
"$TRACE_CLI" context --json
"$TRACE_CLI" channel list --json
"$TRACE_CLI" channel list --member-only --json
"$TRACE_CLI" repo list --json
"$TRACE_CLI" session list --json
"$TRACE_CLI" session list --status active --limit 50 --json
"$TRACE_CLI" session get <session-id> --json
"$TRACE_CLI" session events <session-id> --limit 50 --json
```

Session lists exclude merged and archived sessions by default. Add `--include-merged` or `--include-archived` when needed. Other filters are `--tool`, `--repo`, and `--channel`.

## Start sessions

The simplest command starts a new session group in the current session's channel with a concrete task prompt:

```sh
"$TRACE_CLI" session start "Implement the API tests" --json
```

Bare `session start` never joins the current session group. To add a sibling to an existing group,
pass `--group <group-id>` explicitly; use the `sessionGroupId` returned by `context` for the current
group. Do not combine `--group` with group-level options such as `--hosting`, `--runtime`,
`--environment`, `--branch`, `--visibility`, or `--defer` because the new session inherits them.

For a new group, omitted values default from the current session: kind and visibility; channel and
repo; tool, model, and reasoning effort; and hosting plus
the agent environment (or local runtime for older sessions without an environment). Explicit flags
always win. Trace intentionally creates a fresh branch for the new group instead of reusing the
current worktree branch.

Every new coding session needs a task prompt and a channel. Use `--channel` to choose a destination
other than the current one; if it is omitted, Trace inherits the current session's channel when one
exists. A channel supplies its linked repo; if it has none, also pass `--repo`. A repository alone
is not a session destination.

Select another existing group or an explicit destination when appropriate:

```sh
"$TRACE_CLI" session start "Review this work" --group <group-id> --tool codex --json
"$TRACE_CLI" session start "Fix the login flow" --channel <channel-id> --tool claude_code --json
"$TRACE_CLI" session start "Refactor the parser" --channel <channel-id> --repo <repo-id> --hosting cloud --json
"$TRACE_CLI" session start "Build the dashboard" --kind app --hosting cloud --json
```

`session start` with a prompt requests the initial run in the same operation. The returned session
may temporarily have `agentStatus: "not_started"` while its runtime is provisioning. Do not call
`session run` with the same prompt: that can duplicate the work. Inspect `runRequested` and monitor
the session or its events instead.

The JSON result includes `session`, `runRequested`, `uiPath`, and `idempotencyKey`. The CLI retries
a transient empty/server response once with the same key. If the command still fails and reports a
key, reuse it with `--idempotency-key <key>` so a manual retry returns the original session instead
of creating a duplicate.

Useful options include `--model`, `--reasoning`, `--hosting`, `--runtime`, `--environment`,
`--branch`, `--ticket`, `--visibility`, `--interaction-mode`, and `--defer`. Explicit
cloud hosting fails when cloud is unavailable; it is never silently changed to local. Use
`session start --help` for the complete syntax.

## Message and lifecycle

When a general conversation becomes one focused coding task, convert it in place so the existing
conversation and session identity are preserved:

```sh
"$TRACE_CLI" session convert --kind coding --repo <repo-id> --json
```

Add `--project`, `--tool`, `--model`, `--reasoning`, or `--runtime` when the destination needs an
explicit override. Conversion targets the current session by default; use `--session <session-id>`
only when explicitly acting on another session. Prefer conversion over `session start` for the
current conversation. A successful current-session conversion prepares the repository workspace
and resumes the request there automatically. Treat a nonzero exit or JSON `error` as a failed
conversion: surface its exact message and never claim the session changed. Start a separate session
only for independent or parallel work.

```sh
"$TRACE_CLI" session send <session-id> "Please also cover migrations" --json
"$TRACE_CLI" session send <session-id> "Do this next" --queue --json
"$TRACE_CLI" session run <session-id> "Continue with the revised scope" --json
"$TRACE_CLI" session stop <session-id> --json
"$TRACE_CLI" session archive <session-id> --json
```

Use `--self` instead of an ID to target the current session. Be careful: stopping or archiving `--self` can end your own ability to continue. If another session is actively running, queueing is normally the least disruptive way to add follow-up work.

For monitoring, take bounded snapshots with `session events`. Use `--follow` only when continuous monitoring is actually requested, and stop following once the requested condition is met. If follow mode reports that its replay window exceeded 1,000 events, rerun the command to take a fresh snapshot and follow from its latest cursor.

Artifact uploads return an `idempotencyKey` in JSON mode and retry transient failures once. If a
manual retry is needed, pass that value with `artifact push --idempotency-key <key>` to recover the
original upload instead of creating a duplicate.
