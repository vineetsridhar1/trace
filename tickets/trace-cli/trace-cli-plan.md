# Trace CLI and Neovim Plugin

## Status

Planned. Build the CLI client engine first, then the editor daemon protocol, then the Neovim plugin as a thin Lua renderer on top of the daemon. Local runtime hosting from the CLI ships after the read/write client works end to end.

## Goal

Bring Trace's session, channel, and event patterns into the terminal and into Neovim.

Two deliverables, one architecture:

- **`trace` CLI** (`apps/cli`) — a full Trace client for the terminal: login, list/create/attach sessions, send channel messages, tail the event stream. Human-usable commands with `--json` output, plus a long-running daemon mode that exposes a machine protocol for editors.
- **`trace.nvim`** (`apps/nvim`) — a Lua plugin that spawns `trace daemon --stdio` and renders Trace inside Neovim: session switcher, session transcript + prompting, channel views, needs-input notifications, statusline badges.

The target workflow this replaces: juggling multiple coding-agent sessions in floating terminals. Instead, Neovim becomes a Trace client — sessions are entities with status, transcripts, and prompts, and swapping between them is a picker keystroke, not terminal window management.

The architecture must follow Trace's core model:

- everything meaningful is an event
- the service layer owns business logic; GraphQL is the external interface the CLI consumes
- mutations are fire-and-forget; state updates flow back through event subscriptions
- events are partitioned by scope; subscriptions are viewport-driven
- the CLI is just another client — no server-side special-casing beyond small auth generalizations

## North Star UX (Neovim)

- `<leader>tt` opens a floating session switcher: every session in the org with status glyphs (`active`, `needs_input`, `done`, `failed`), sorted with needs-input first. Enter opens the session view.
- The session view is a floating window (or split): the transcript rendered from session nodes (prompts, agent text, tool use, plans, questions), with a prompt input at the bottom. Sending a prompt is fire-and-forget; the transcript updates when the `session_output` events stream back.
- `<leader>tn` jumps straight to the next session that needs input.
- A statusline component shows counts: sessions needing input, unread mentions.
- `:Trace new` starts a session on a repo/branch without leaving the editor.
- For sessions running on a local runtime, `<leader>tw` opens a floating terminal cd'd into the session's worktree — the escape hatch back to raw terminal access when needed.
- Channel views work the same way: read the message stream, send messages, see agent/session activity inline.

## Why a CLI Engine Instead of a Pure Lua Client

Neovim's Lua runtime has no WebSocket client, no `graphql-ws` implementation, and no access to `@trace/client-core`. A pure Lua client would mean reimplementing auth, transport, reconnection, and event normalization — a second client core that drifts from the web's.

Instead, mirror the web architecture exactly:

```txt
Web:    urql transport + Zustand store  →  React components
Nvim:   trace daemon (client-core)      →  Lua UI
```

The daemon owns transport, auth, the entity store, and event normalization by reusing `@trace/client-core`. Neovim owns rendering and input. The boundary between them is a small NDJSON-RPC protocol, playing the role Zustand selectors play on the web.

This also makes the CLI valuable standalone: the same engine powers human commands (`trace sessions list`), scripting (`--json`), and any future editor client (the daemon protocol is editor-agnostic — an IntelliJ or Zed plugin could consume it unchanged).

## Current Baseline (verified in code)

The repo already contains almost everything a non-browser client needs:

- **`packages/client-core` is framework-agnostic.** `src/platform.ts` defines a `Platform` interface (`apiUrl`, `clientSource`, `authMode: "cookie" | "bearer"`, `storage`, `secureStorage`, `fetch`, `createWebSocket`) injected via `setPlatform()`. `createGqlClient()` builds an urql + `graphql-ws` client with exponential-backoff reconnect. The Zustand stores (`useEntityStore`, `useAuthStore`) and event handlers (`handleOrgEvent`, `handleSessionEvent`, `routeSessionOutput`, `buildSessionNodes`) are pure store logic — usable from Node without React via `store.getState()` / `store.subscribe()`.
- **Bearer auth already works.** `apps/server/src/lib/auth.ts` supports `Authorization: Bearer <jwt>` alongside cookies. Existing endpoints in `apps/server/src/routes/auth.ts`: `/auth/local/login` (local mode), `/auth/github/device/start` + `/auth/github/device/poll` (GitHub device flow for hosted servers), `/auth/mobile/pairing-token` + `/auth/mobile/pair` (pair a device from an authenticated web/desktop session), `/auth/me`, `/auth/logout`, and `/auth/bridge-token?instanceId=` (mints a short-lived `bridge_auth` JWT for `/bridge` connections).
- **GraphQL surface is complete for a client.** `packages/gql/src/schema.graphql`: subscriptions `orgEvents`, `channelEvents`, `sessionEvents`, `sessionStatusChanged`, `chatEvents`; queries `sessions`, `sessionTimeline(beforeEventId)`, `sessionPromptIndex`, `channels`, `events`, `myBridgeRuntimes`; mutations `startSession`, `runSession`, `sendSessionMessage`, `queueSessionMessage`, `terminateSession`, `sendMessage`, `createTicket`, etc.
- **The bridge protocol is shared and the desktop client is portable.** `packages/shared/src/bridge.ts` defines the full runtime protocol (`runtime_hello`, `prepare`/`run`/`send`/`terminate`, file ops, terminal multiplexing by `terminalId`, heartbeats). `apps/desktop/src/bridge.ts` (~1,660 lines) implements the local runtime host with **zero Electron imports** — it is extractable. `apps/container-bridge` is already a standalone Node runtime host (`ws` + `node-pty`) for cloud containers.
- **The agent-environments work** (`tickets/agent-environments/`) formalizes local runtimes as first-class environments — a CLI-hosted local runtime slots into the same `LocalRuntimeAdapter` path the desktop uses.

## Architecture

```txt
Neovim (trace.nvim, Lua)          Terminal user
        │ stdio NDJSON-RPC                │ argv/stdout
        ▼                                 ▼
   trace daemon  ◄────────────────  trace CLI commands
        │
        ├── @trace/client-core (Node Platform impl)
        │     ├── HTTP  POST /graphql        queries + mutations
        │     └── WS    /ws (graphql-ws)     subscriptions → entity store
        │
        └── optional: WS /bridge            trace runtime up
              (local runtime host: worktrees, tool processes, terminals)
```

One process, three faces:

1. **Commands** — one-shot verbs for humans and scripts.
2. **Daemon** — long-running, holds the client-core store, speaks NDJSON-RPC to an editor.
3. **Runtime host** — optionally registers as a local runtime over `/bridge` so sessions can execute on this machine without the Electron app (M3).

## New Packages and Apps

- `apps/cli` — `@trace/cli`, bin name `trace`. TypeScript, `tsc -b` build like other apps, `tsx watch` for dev. Depends on `@trace/client-core`, `@trace/gql`, `@trace/shared`, `ws`, `graphql-ws`, and a minimal arg parser (recommend `commander`). Node >= 22.
- `packages/client-core` gains a React-free entrypoint (see below) — no new package.
- `packages/bridge-host` (M3) — the local runtime host logic extracted from `apps/desktop/src/bridge.ts`, consumed by both desktop and CLI.
- `apps/nvim` — `trace.nvim`, a pure Lua plugin (`lua/trace/…`). Not a pnpm workspace member (no `package.json`); installed into Neovim via local path during development.

### client-core headless entrypoint

`packages/client-core/package.json` lists `react` as a peer dependency and `src/index.ts` exports React hooks alongside the pure core. The CLI must not pull React. Add a subpath export (e.g. `@trace/client-core/headless`) that re-exports only the framework-agnostic surface: platform, stores, `createGqlClient`, event handlers, session node builders, scope-key helpers. The hooks entrypoint keeps its current behavior; web and mobile are untouched.

## Authentication Design

`trace login` supports the three server modes that exist today:

- **Hosted with GitHub OAuth**: drive `/auth/github/device/start` → print the user code + verification URL → poll `/auth/github/device/poll` until a bearer token is issued. Same flow mobile uses; no server changes.
- **Local mode** (`pnpm dev:local`, self-hosted without OAuth): `trace login --local` posts to `/auth/local/login`.
- **Pairing** (nice-to-have): `trace login --pair <code>` exchanges a pairing token generated from an authenticated web/desktop session. The existing endpoints are mobile-branded (`/auth/mobile/pair`, `installId`, push `platform`); generalizing them to accept a `cli` device kind is a small server ticket and can be deferred — the device flow and local login cover V1.

Storage and config:

- Token in `~/.config/trace/credentials.json` with `0600` perms; `TRACE_TOKEN` env override. OS keychain support is an open decision, not V1.
- Config in `~/.config/trace/config.json`: server URL, active org ID. `TRACE_SERVER` env override. `trace org switch <name>` persists the active org.
- All requests carry `Authorization: Bearer <token>` and the org ID header; WebSocket `connectionParams` carry `token` and `organizationId` exactly as `createGqlClient` already does. `clientSource: "cli"`.

## CLI Command Surface

Every command supports `--json` (NDJSON for streaming commands) so scripts and the nvim plugin's one-shot calls get stable output. Human output is compact tables/lines, no TUI framework.

```txt
trace login [--local | --pair <code>]      authenticate, store token
trace logout / trace whoami                token lifecycle
trace org list / trace org switch <name>   active organization

trace sessions list [--status needs_input] [--repo <name>]
trace sessions new --repo <name> [--branch <b>] [--tool claude_code] [-m <prompt>]
trace sessions attach <id>                 stream transcript, prompt from stdin
trace sessions prompt <id> -m <text>       one-shot prompt (fire-and-forget)
trace sessions stop <id>

trace channels list
trace channel <name> [--follow]            print recent messages, optionally tail
trace send <channel> -m <text>

trace tickets list [--status open]
trace events tail [--scope session:<id>] [--types session_output,...]

trace daemon --stdio                       editor RPC mode (M2)
trace runtime up                           host local sessions (M3)
```

`trace sessions attach` is the terminal proof of the whole pipeline: subscribe `sessionEvents`, normalize through client-core, render nodes as they stream, read prompt lines from stdin. It is deliberately minimal — the rich experience lives in Neovim.

## State and Event Rules (parity with web)

The CLI follows the same rules `CLAUDE.md` sets for the web client:

- **Mutations are fire-and-forget.** The daemon never updates its store from mutation results. The `orgEvents` subscription (plus scoped subscriptions) delivers the resulting events, and `handleOrgEvent`/`handleSessionEvent` upsert entities — the same handlers the web uses.
- **Events are partitioned by scope** using `eventScopeKey()`; the daemon store mirrors the web's `eventsByScope` shape.
- **Subscriptions are viewport-driven.** The editor tells the daemon which scope is visible (`scope/subscribe`, `scope/unsubscribe` RPC calls); the daemon opens/closes `sessionEvents`/`channelEvents` subscriptions accordingly. Only the ambient tier — `orgEvents` filtered to status/mention/badge event types — stays always-on.
- **Optimistic updates** reuse `optimisticallyInsertSessionMessage`/`reconcileOptimisticSessionMessage` so a sent prompt appears in the nvim transcript immediately.

## Editor Daemon Protocol

`trace daemon --stdio` speaks JSON-RPC 2.0, one JSON object per line (NDJSON), over stdin/stdout. Line framing keeps the Lua side trivial (`vim.json.decode` per line); LSP-style `Content-Length` framing is not needed.

Requests (editor → daemon):

```txt
initialize            { protocolVersion, clientInfo }  → { serverVersion, user, org, connectionState }
orgs/list, org/switch
channels/list, sessions/list, tickets/list             → snapshots from the store
session/timeline      { sessionId, beforeEventId?, limit }  → paginated, normalized nodes
session/prompt        { sessionId, text }              → fire-and-forget ack
session/create        { repoId, branch?, tool?, prompt? }
session/stop          { sessionId }
channel/send          { channelId, text }
scope/subscribe       { scopeType, scopeId }           viewport enters a view
scope/unsubscribe     { scopeType, scopeId }           viewport leaves
shutdown
```

Notifications (daemon → editor):

```txt
entity/upserted       { type, entity }                 store delta after an event lands
session/nodes         { sessionId, appended | patched nodes }
badge/update          { needsInputCount, mentionCount }
connection/state      { state: connected | reconnecting | disconnected }
```

Design decision: **normalized data crosses the boundary, not raw events.** The daemon runs `buildSessionNodes` / `routeSessionOutput` and pushes render-ready node lists (kind: `user_prompt`, `agent_text`, `tool_use`, `plan`, `question`, …). The Lua side stays a dumb renderer and never learns Trace's 80+ event types. If a new event type ships, the daemon's client-core dependency handles it; the plugin updates only if a new node kind needs new rendering.

One daemon per editor instance, owned via `jobstart` — no shared socket, no lifecycle daemon-management problems. A shared unix-socket daemon (multiple nvim instances, one connection) is a post-V1 open decision.

## Local Runtime Hosting (`trace runtime up`)

Lets sessions execute on this machine without the Electron desktop app — Neovim plus one terminal command becomes a complete Trace setup.

```txt
trace runtime up
  → GET /auth/bridge-token?instanceId=<cli-instance-id>
  → connect ws://server/bridge
  → runtime_hello { hostingMode: "local", supportedTools, registeredRepoIds }
  → handle prepare (worktree creation), run/send (tool spawn), terminals, heartbeats
```

Implementation is an extraction, not a rewrite: `apps/desktop/src/bridge.ts` already implements all of this in Electron-free Node. Move the shared host logic into `packages/bridge-host`, have desktop consume it (behavior-preserving refactor), and give the CLI a thin wrapper plus a repo-registration config (`trace runtime add-repo <path>`, persisted in `~/.config/trace/`). Terminal multiplexing by `terminalId` must be preserved per the agent-environments plan.

This milestone is independent of the daemon/nvim work and can ship before or after it. Users who already run the desktop app or provisioned cloud runtimes get full value from M0–M2 + M4 without it.

## Neovim Plugin Design

```txt
apps/nvim/
  lua/trace/
    init.lua          setup(opts), commands, keymaps
    config.lua        defaults + user overrides
    rpc.lua           jobstart, NDJSON framing, request/response correlation,
                      notification dispatch, vim.schedule wrapping
    state.lua         entity tables mirroring daemon pushes (sessions, channels, badges)
    ui/
      switcher.lua    session/channel picker (vim.ui.select-compatible; telescope
                      extension optional, not required)
      session.lua     transcript buffer + prompt input window
      channel.lua     message stream buffer + compose input
      statusline.lua  needs_input / mention counts for statusline consumers
      notify.lua      vim.notify on needs_input / mentions
    health.lua        :checkhealth trace — binary found, version handshake, auth state
  plugin/trace.lua    command registration
```

Key implementation rules:

- **All state lives in `state.lua`, updated only from daemon notifications** — the Zustand rule, transplanted. UI modules read state and re-render; they never own data.
- **Transcript rendering**: one buffer per session view, appended via `nvim_buf_set_lines`, highlights and node chrome via extmarks. Timeline pagination maps to `session/timeline { beforeEventId }` on scroll-to-top. Neovim buffers handle large transcripts natively — no virtualization layer needed.
- **Viewport-driven subscriptions**: opening a session view sends `scope/subscribe`; closing the window/buffer sends `scope/unsubscribe`. `BufWinLeave`/`WinClosed` autocmds own this.
- **Session switcher UX is the product**: sorted needs-input-first, status glyphs, `<CR>` to open, and a dedicated jump-to-needs-input mapping. This is the direct replacement for floating-terminal juggling.
- **Worktree terminal escape hatch**: for local sessions, the daemon exposes the worktree path (from session/connection metadata); `ui` opens a standard floating `:terminal` cd'd there.
- **Compatibility**: plain Neovim ≥ 0.10 APIs (`vim.system`/`jobstart`, `vim.json`, `vim.ui.select`, extmarks). Works under LunarVim without depending on it. Telescope/lualine integrations are optional extras.
- **Distribution**: during development, install by local path (`dir = "~/Developer/trace/apps/nvim"` in lazy.nvim). Publishing a mirror repo (`trace.nvim`) for plugin managers is a post-V1 decision. The plugin checks the daemon's `initialize` handshake version and reports mismatches via `:checkhealth`.

## Server Changes Required

Deliberately minimal — the service layer + GraphQL already serve any client:

1. **None for V1 core.** Bearer auth, device flow, subscriptions, and all needed queries/mutations exist.
2. *(Optional, M1)* Generalize device pairing: accept a `cli` device kind on `/auth/mobile/pair` (or add a generic alias route) so `trace login --pair` works. Pure additive.
3. *(M3)* Whatever small gaps the bridge-host extraction reveals (e.g. CLI runtime labels). The agent-environments work already covers local runtime registration.

## Milestones

### M0 — CLI Foundation

| # | Ticket | What it does |
|---|--------|--------------|
| 01 | CLI scaffold and Node platform | `apps/cli` package, `trace` bin, config/credential files, Node `Platform` impl (`ws` WebSocket, file `secureStorage`, bearer mode) |
| 02 | client-core headless entrypoint | React-free subpath export; web/mobile untouched |
| 03 | Auth commands | `login` (device flow + local), `logout`, `whoami`, `org list/switch` |
| 04 | Headless client runtime | Instantiate stores + `createGqlClient` in Node, `orgEvents` subscription wired to `handleOrgEvent`, reconnect handling |

### M1 — Command Surface

| # | Ticket | What it does |
|---|--------|--------------|
| 05 | Read commands | `sessions/channels/tickets list`, `channel <name>`, `--json` everywhere |
| 06 | Event tailing | `events tail`, `channel --follow` (scoped subscriptions from the CLI) |
| 07 | Write commands | `send`, `sessions new/prompt/stop` (fire-and-forget + event confirmation) |
| 08 | Session attach | Streaming transcript via `buildSessionNodes` + stdin prompting |
| 09 | Pairing login (optional) | Generalize pairing endpoint, `trace login --pair` |

### M2 — Editor Daemon

| # | Ticket | What it does |
|---|--------|--------------|
| 10 | Daemon RPC core | `daemon --stdio`, NDJSON JSON-RPC framing, `initialize` handshake, error model |
| 11 | Snapshot, scope, and action methods | List methods from store, `scope/subscribe`/`unsubscribe` driving GraphQL subscriptions, action methods delegating to ticket 07's mutation helpers |
| 12 | Normalized deltas | `entity/upserted`, `session/nodes`, `badge/update`, `session/timeline` pagination |

### M3 — Local Runtime Hosting

| # | Ticket | What it does |
|---|--------|--------------|
| 13 | Extract `packages/bridge-host` | Move desktop bridge logic to a shared package; desktop consumes it, behavior-preserving |
| 14 | `trace runtime up` | Bridge token, `runtime_hello`, repo registration config, tool spawn, terminals, heartbeats |

### M4 — Neovim Plugin

| # | Ticket | What it does |
|---|--------|--------------|
| 15 | Plugin scaffold + RPC client | `apps/nvim`, jobstart/NDJSON framing, state module, `:checkhealth` |
| 16 | Session switcher + badges | Picker sorted needs-input-first, statusline component, notifications |
| 17 | Session view | Transcript buffer, node rendering, prompt input, viewport subscribe/unsubscribe, pagination |
| 18 | Channel view | Message stream + compose |
| 19 | Session create + worktree terminal | `:Trace new`, floating `:terminal` in local session worktrees |
| 20 | Docs + install guide | README, LunarVim/lazy.nvim setup, keymap reference |

### Dependency graph

```txt
M0: 01 → 02 → 04, 01 → 03
M1: 05,06,07 (need 04) → 08 (needs 05,07); 09 independent after 03
M2: 10 (needs 04) → 11 (also needs 07) → 12
M3: 13 (independent of M1/M2) → 14 (needs 03 for bridge token)
M4: 15 (needs 10) → 16,17 (need 11,12) → 18,19 → 20
```

Parallelization: M3 is fully parallel to M1/M2/M4. Ticket 05–07 can run in parallel after 04. The nvim scaffold (15) can start against ticket 10's handshake before deltas (12) land.

## Testing

- **Unit**: NDJSON-RPC framing/correlation, config + credential handling, command output shapes (`--json` snapshots), headless store updates from fixture events.
- **Integration**: run against `pnpm dev:local` (local Postgres + server): login, list, send, session lifecycle, subscription-driven store updates. Reuse fixture patterns from `apps/server` tests where possible.
- **Daemon protocol**: golden-transcript tests — scripted RPC request sequences against a daemon connected to the dev server, asserting notification streams.
- **Nvim plugin**: `plenary.nvim` busted specs run headless (`nvim --headless`), with a stub daemon speaking canned NDJSON for UI logic; one smoke test against the real daemon.
- **Bridge host (M3)**: the extraction ticket must keep desktop behavior — verify `prepare`/`run`/`workspace_ready`/terminal flows against a local server per the agent-environments test checklist.

## Open Decisions

- OS keychain vs `0600` file for token storage (file for V1).
- Shared unix-socket daemon for multiple editor instances vs one daemon per editor (per-editor for V1).
- Whether to publish `trace.nvim` as a mirror repo for plugin managers or keep local-path install (local for V1).
- Whether `trace runtime up` reuses the extracted desktop bridge (recommended) or wraps `apps/container-bridge`'s host loop.
- Arg parser choice (`commander` recommended; anything boring and typed).
- Whether pairing-code login (ticket 09) is worth generalizing the mobile endpoints or GitHub device flow + local login suffice indefinitely.

## Recommended V1 Scope

The smallest slice that changes the daily workflow:

- M0 complete (auth, headless client runtime)
- Tickets 05, 07, 08 from M1 (list, write, attach — skip pairing)
- M2 complete (the daemon is the nvim contract)
- Tickets 15–17 from M4 (switcher, badges, session view)

That yields: open Neovim, see every session with status, jump to the one that needs input, read its transcript, send it a prompt — without leaving the editor. Channels (18), session creation + worktree terminals (19), and CLI-hosted runtimes (M3) layer on without rework.
