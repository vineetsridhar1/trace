# trace CLI

A full Trace client for the terminal: login, list and act on sessions, send
channel messages, tail the event stream, and host the editor daemon that
powers [trace.nvim](../nvim/README.md).

## Requirements

- Node >= 22
- pnpm (build from the monorepo; the CLI is not published to npm yet — see
  [Distribution](#distribution))

## Install / build

```sh
pnpm install
pnpm --filter @trace/cli build
```

The bin is `apps/cli/dist/index.js`. For a `trace` command on your `$PATH`,
link it however you prefer, e.g.:

```sh
cat > ~/.local/bin/trace <<'SH'
#!/bin/sh
exec node "$HOME/Developer/trace/apps/cli/dist/index.js" "$@"
SH
chmod +x ~/.local/bin/trace
```

## Login

```sh
trace login                 # hosted servers: GitHub device flow (opens a URL + code)
trace login --local         # pnpm dev:local / self-hosted without OAuth
trace login --local --name "Your Name"
trace logout
trace whoami [--json]
trace org list | trace org switch <name-or-id>
```

Configuration lives in `~/.config/trace` (respects `XDG_CONFIG_HOME`):

- `config.json` — server URL, active org ID (plus client-core storage keys)
- `credentials.json` — bearer token, created with mode `0600`

Precedence for every command: `--server` flag → `TRACE_SERVER` env → stored
config → `http://localhost:4000`. `TRACE_TOKEN` overrides the stored
credential for reads; writes still go to the file.

## Commands

Every command supports a global `--json` (NDJSON for streaming commands) with
stable, snapshot-tested shapes. Human output is plain lines — no TUI.

```sh
trace sessions list [--status needs_input] [--repo <name>]
trace sessions new --repo <name> [--branch <b>] [--tool claude_code] [-m <prompt>]
trace sessions prompt <id-or-prefix> -m <text>    # queues when the agent is busy
trace sessions attach <id-or-prefix>              # streaming transcript; stdin prompts; Ctrl-C detaches
trace sessions stop <id-or-prefix>

trace channels list
trace channel <name> [--limit N] [--follow]
trace tickets list [--status todo]
trace send <channel> -m <text>

trace events tail [--scope session:<id>|channel:<id|name>|chat:<id>] [--types a,b]
trace daemon --stdio                              # the editor protocol host
```

Examples:

```sh
trace --json sessions list | jq '.[] | select(.sessionStatus == "needs_input").id'
trace --json sessions attach 0f9b2ad1 | jq -r 'select(.kind == "agent_text").text'
trace events tail --types message_sent --json
```

Mutations are fire-and-forget: the exit code reflects acceptance, and state
updates flow back through subscriptions — the same rule as every Trace client.

## Editor daemon

`trace daemon --stdio` speaks NDJSON JSON-RPC 2.0 over stdin/stdout — the
contract trace.nvim (or any editor) builds against. The complete reference —
framing, error codes, the `initialize` version policy, every method and
notification with payload shapes — is [PROTOCOL.md](./PROTOCOL.md).

## Local runtime hosting (`trace runtime up`)

Not shipped yet (milestone M3, tickets 13–14): sessions currently execute on
runtimes hosted by the desktop app or the cloud. `trace runtime up` will let
this machine host sessions with no Electron involved.

## Distribution

V1 is built from the monorepo; publishing the CLI to npm is deferred until
there are users outside this repo (that is the revisit trigger).
