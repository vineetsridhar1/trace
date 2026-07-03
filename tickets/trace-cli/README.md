# Trace CLI and Neovim Plugin - Ticket Index

Tickets for bringing Trace's session, channel, and event patterns into the terminal and Neovim: a `trace` CLI client engine with an editor daemon protocol, and a `trace.nvim` plugin that renders Trace inside Neovim. Work through milestones in order. See [trace-cli-plan.md](trace-cli-plan.md) for the full product and engineering spec.

## M0 - CLI Foundation

Process skeleton, auth, and the headless client-core runtime everything else sits on.

| #   | Ticket                                                                        | What it does                                                                       |
| --- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 01  | [CLI Scaffold and Node Platform](01-cli-scaffold-and-node-platform.md)       | Creates `apps/cli`, config/credential storage, and the Node `Platform` implementation |
| 02  | [client-core Headless Entrypoint](02-client-core-headless-entrypoint.md)     | Adds a React-free `@trace/client-core/headless` subpath export                       |
| 03  | [Auth Commands](03-auth-commands.md)                                          | `login` (device flow + local), `logout`, `whoami`, `org list/switch`                 |
| 04  | [Headless Client Runtime](04-headless-client-runtime.md)                      | Boots client-core in Node: stores, gql client, always-on `orgEvents` subscription    |

## M1 - Command Surface

Human-usable and scriptable commands, proving the full client pipeline in the terminal.

| #   | Ticket                                          | What it does                                                              |
| --- | ------------------------------------------------ | -------------------------------------------------------------------------- |
| 05  | [Read Commands](05-read-commands.md)            | `sessions/channels/tickets list`, `channel <name>`, stable `--json` output |
| 06  | [Event Tailing](06-event-tailing.md)            | `events tail` and `channel --follow` via scoped subscriptions              |
| 07  | [Write Commands](07-write-commands.md)          | `send`, `sessions new/prompt/stop` — fire-and-forget mutations             |
| 08  | [Session Attach](08-session-attach.md)          | Streaming transcript + stdin prompting via `buildSessionNodes`             |
| 09  | [Pairing Login (Optional)](09-pairing-login.md) | Generalizes device pairing so `trace login --pair <code>` works            |

## M2 - Editor Daemon

The machine protocol Neovim (and any editor) consumes: `trace daemon --stdio`.

| #   | Ticket                                                                                | What it does                                                                     |
| --- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 10  | [Daemon RPC Core](10-daemon-rpc-core.md)                                              | NDJSON JSON-RPC framing, `initialize` handshake, error model, lifecycle             |
| 11  | [Snapshot, Scope, and Action Methods](11-snapshot-scope-and-action-methods.md)        | Store-backed list methods, refcounted `scope/subscribe`, fire-and-forget actions    |
| 12  | [Normalized Deltas](12-normalized-deltas.md)                                          | `entity/upserted`, `session/nodes`, `badge/update`, `session/timeline` pagination   |

## M3 - Local Runtime Hosting

Sessions execute on this machine without the Electron app. Fully parallel with M1/M2/M4.

| #   | Ticket                                                              | What it does                                                                |
| --- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 13  | [Extract Bridge Host Package](13-extract-bridge-host-package.md)    | Moves the Electron-free desktop bridge logic into `packages/bridge-host`       |
| 14  | [CLI Local Runtime (`trace runtime up`)](14-trace-runtime-up.md)    | Bridge token, `runtime_hello`, repo registration, tool spawn, terminals        |

## M4 - Neovim Plugin

`trace.nvim`: a thin Lua renderer over the daemon.

| #   | Ticket                                                                                        | What it does                                                                  |
| --- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 15  | [Neovim Plugin Scaffold and RPC Client](15-nvim-plugin-scaffold-and-rpc-client.md)             | Plugin skeleton, daemon spawn, NDJSON-RPC client, state module, `:checkhealth`    |
| 16  | [Session Switcher and Badges](16-session-switcher-and-badges.md)                               | Needs-input-first picker, jump mapping, statusline counts, notifications          |
| 17  | [Session View](17-session-view.md)                                                             | Transcript buffer, node rendering, prompt input, viewport subscriptions, paging   |
| 18  | [Channel View](18-channel-view.md)                                                             | Message stream + compose, reusing the session-view machinery                      |
| 19  | [Session Create and Worktree Terminal](19-session-create-and-worktree-terminal.md)             | `:Trace new` and the floating worktree `:terminal` escape hatch                   |
| 20  | [Docs and Install Guide](20-docs-and-install-guide.md)                                         | CLI + plugin READMEs, protocol reference, LunarVim install guide                  |

## Dependency graph

```text
M0 - CLI Foundation
01 CLI Scaffold and Node Platform
02 client-core Headless Entrypoint  (parallel with 01)
-- 03 Auth Commands  (needs 01)
-- 04 Headless Client Runtime  (needs 01, 02, 03)

M1 - Command Surface
05 Read Commands  (needs 04)
06 Event Tailing  (needs 04; coordinates with 05 on `channel --follow`)
07 Write Commands  (needs 04)
-- 08 Session Attach  (needs 05, 07)
09 Pairing Login  (needs 03; optional, independent)

M2 - Editor Daemon
10 Daemon RPC Core  (needs 04)
-- 11 Snapshot, Scope, and Action Methods  (needs 07, 10)
-- 12 Normalized Deltas  (needs 11)

M3 - Local Runtime Hosting
13 Extract Bridge Host Package  (independent)
-- 14 CLI Local Runtime  (needs 03, 13)

M4 - Neovim Plugin
15 Plugin Scaffold and RPC Client  (needs 10)
-- 16 Session Switcher and Badges  (needs 11, 12, 15)
-- 17 Session View  (needs 11, 12, 15)
-- 18 Channel View  (needs 11, 17)
-- 19 Session Create and Worktree Terminal  (needs 16, 17)
-- 20 Docs and Install Guide  (needs 15-19)
```

## Parallelization notes

- Tickets 01 and 02 are independent and can land in either order; 04 needs both.
- Tickets 05, 06, and 07 can run in parallel once 04 lands; 06 coordinates with 05 only on the `trace channel` command it extends.
- Ticket 09 is optional and never blocks anything.
- M3 (13 → 14) is fully parallel with M1, M2, and M4; ticket 13 can start immediately.
- Ticket 15 can start against ticket 10's handshake with stubbed methods before 11/12 land.
- Tickets 16 and 17 are parallel; 18 waits for 17's shared view machinery.

## Recommended V1 path

Per the plan's Recommended V1 Scope (plan lines 309-318): **01 → 02 → 03 → 04 → {05, 07} → 08 → 10 → 11 → 12 → 15 → {16, 17}**. That yields the daily-workflow win — switcher, badges, transcript, prompting in Neovim. Tickets 06, 09, 13-14, 18-20 layer on without rework.

## Plan coverage matrix

Every line of [trace-cli-plan.md](trace-cli-plan.md) has an owning ticket. Line ranges refer to the current plan file.

| Plan lines | Plan content | Owning ticket(s) |
| --- | --- | --- |
| 1-24 | Status, goal, deliverables, core-model rules | 01, 04, 10, 15 |
| 26-34 | North-star Neovim UX | 16, 17, 18, 19 |
| 36-49 | CLI-engine rationale, web-architecture mirror | 10, 12, 15 |
| 51-59 | Verified baseline: client-core, auth, GraphQL, bridge | 02, 03, 04, 05, 13, 14 |
| 61-81 | Architecture diagram and the three process faces | 01, 10, 14 |
| 83-92 | New packages/apps, headless entrypoint | 01, 02, 13, 15 |
| 94-106 | Auth flows, token/config storage, headers | 01, 03, 09 |
| 108-134 | Command surface and `--json` conventions | 03, 05, 06, 07, 08, 10, 14 |
| 136-143 | State and event rules (fire-and-forget, scopes, optimistic) | 04, 06, 07, 11, 12 |
| 145-176 | Daemon protocol: framing, methods, notifications, per-editor decision | 10, 11, 12 |
| 178-192 | Local runtime hosting | 13, 14 |
| 194-223 | Neovim plugin layout and implementation rules | 15, 16, 17, 18, 19, 20 |
| 225-231 | Server changes required | 09, 14 |
| 233-290 | Milestones and dependency graph | this README; 01-20 |
| 292-298 | Testing strategy | each ticket's How to test section; 10, 12, 13, 15 own the protocol/bridge/plugin harnesses |
| 300-307 | Open decisions | 01, 03, 09, 10, 13, 20 |
| 309-318 | Recommended V1 scope | this README (Recommended V1 path); 01-08, 10-12, 15-17 |

If the plan gains a new actionable requirement, add or update its owning ticket in the same change and keep this coverage matrix in sync.

## Scope guardrails

The intended V1 is:

- the CLI reuses `@trace/client-core` — no second client core, no CLI-side event parsing
- mutations are fire-and-forget; the store updates only from subscription events, exactly like the web client
- normalized nodes cross the daemon RPC boundary, not raw events — the Lua side never learns event types
- one daemon per editor instance over stdio; no shared unix socket in V1
- `react` never enters the CLI/daemon dependency graph
- no TUI framework in `apps/cli`; human output is plain text, machine output is `--json`/NDJSON
- the nvim plugin uses plain Neovim >= 0.10 APIs; telescope/lualine integrations are optional extras
- the bridge protocol (`packages/shared/src/bridge.ts`) is unchanged; the bridge-host extraction is behavior-preserving
- no server business-logic changes; the only server work is the additive pairing generalization (09) and small runtime-hosting gaps (14)

If you are tempted to parse raw events in Lua, add a TUI framework, or fork client behavior from the web's rules, the answer is in the daemon or client-core instead.
