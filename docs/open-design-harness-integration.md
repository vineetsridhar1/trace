# Bringing Over the Open Design Harness

Status: integration plan (2026-07-08). Companion to `design-session-experience.md` ("Harness"
section). Based on reading [open-design](https://github.com/nexu-io/open-design) v0.14.1
source (Apache-2.0).

## Why this is cleaner than expected

Open Design's daemon is built to be driven by an external orchestrator:

- **It can work in a workspace we own.** `POST /api/import/folder` registers an existing
  absolute path (`baseDir`) as the project workspace — writes go in-place. The
  `orchestratorWorkspace: { kind: "scratch", writeback: "external" }` metadata is their
  explicit contract for "an outside system owns this directory and handles persistence" —
  which is exactly Trace's git worktree + checkpoint model. Open Design does no VCS of its
  own here.
- **One call runs and streams.** `POST /api/chat` creates a run and attaches SSE to the
  same response. Events arrive as `agent` records with `data.type ∈ status | text |
  tool_use | tool_result | tool_input_delta | thinking | result`, terminal `end` event with
  exit status, resumable via `Last-Event-ID`. This maps almost 1:1 onto Trace's
  `ToolOutput` union.
- **Skills/design systems bind via API params, not file copying.** `skillIds` +
  `designSystemId` on the run request; the daemon stacks `SKILL.md` bodies and the design
  system's `DESIGN.md`/`tokens.css`/`USAGE.md` into the composed system prompt. 163 skills
  and 153 design systems ship in-repo.
- **It spawns the agent CLIs we already have.** The daemon shells out to `claude -p
  --input-format stream-json --output-format stream-json --permission-mode
  bypassPermissions` (with `--resume` for multi-turn), parses the stream, and re-emits
  normalized events. Agent CLIs are intentionally not bundled — our runtime image already
  provides them, with Trace's existing tool auth.

Given this, skip the "skills-only stepping stone" from the experience doc — driving the
daemon over HTTP is the straightforward path and keeps prompt composition + critique
orchestration (the reason to use the harness at all) inside Open Design.

## Integration shape

```
container-bridge ──spawns/health-checks──▶ od daemon (127.0.0.1:7456)
       │                                        │ spawns `claude` in worktree
OpenDesignAdapter ──HTTP + SSE──▶ /api/chat     │ composes DESIGN.md + skills
       │                                        ▼
  ToolOutput ──▶ bridge ──▶ server ──▶ events   app dev server (auto-detected port)
```

### 1. Vendor + build into the runtime image

- **Pin an upstream release tag** (currently 0.14.1); no fork until we need divergent
  patches. Fast-moving 0.x — upgrades are deliberate, with the contract test below as the
  gate.
- Multi-stage build mirroring their `deploy/Dockerfile`: Node 24 (their hard requirement —
  note our image's base Node version), `python3 make g++` for `better-sqlite3`, build
  `@open-design/daemon`, `pnpm deploy --prod`, copy `skills/`, `design-systems/`,
  `prompt-templates/`, `plugins/_official`. **Skip the web UI build** — the daemon serves
  `/api` standalone.
- No Chromium/ffmpeg needed: media generation delegates to provider APIs and rasterized
  exports need the desktop runtime (we don't use either; our preview is the live app and
  checkpoint captures use our own headless browser).

### 2. Daemon lifecycle on the runtime

- For `kind: web_design` sessions, the container bridge starts the daemon at boot as a
  managed process: `node …/cli.js --no-open`, loopback bind (default `127.0.0.1:7456`),
  `OD_DATA_DIR=/var/trace/od-data`. Loopback means no `OD_API_TOKEN` needed and the daemon
  is unreachable from outside the machine.
- **Port auto-detection must blocklist the daemon port** (7456) — otherwise the design
  session's "detect the dev server and forward it" logic would happily publish the harness
  API. Keep an explicit denylist (daemon port + bridge port).
- Daemon state (SQLite, conversation logs) is ephemeral, machine-local, and disposable.
  Trace's event store stays the source of truth for the timeline; the managed git repo for
  code. If a machine dies, OD conversation history is lost — the adapter starts a fresh
  conversation, same degradation as today's `isMissingToolSessionError` path.

### 3. `OpenDesignAdapter` (packages/shared/src/adapters/open-design.ts)

Implements `CodingToolAdapter`; talks HTTP to loopback only (no OD imports — vendor code
stays inside the adapter per the architecture rules). Add `open_design` to the
`CodingTool` enum in `schema.graphql` + codegen; wire into the container bridge's
`createAdapter` switch (desktop bridge rejects it — design sessions are cloud-only anyway).

- **run(options)**:
  1. Health-check daemon; on first run, `POST /api/import/folder { baseDir: options.cwd,
     orchestratorWorkspace: { kind: "scratch", writeback: "external" } }` → `projectId`.
  2. `POST /api/chat { projectId, conversationId?, message: options.prompt,
     agentId: "claude", model: options.model, skillIds?, designSystemId? }`.
  3. Parse SSE and map to `ToolOutput`:

  | SSE `agent` event `data.type` | `ToolOutput` |
  |---|---|
  | `text` / `thinking` | `AssistantEvent` content blocks |
  | `tool_use` / `tool_input_delta` | `ToolUseBlock` |
  | `tool_result` | `ToolResultBlock` |
  | `result` | `ResultEvent` (usage/cost if present) |
  | `status` | swallow (drives internal state only) |
  | `error` event | `ErrorEvent` |
  | `end` event | `onComplete()` |

- **getSessionId()** → serialize `projectId:conversationId` into `toolSessionId`;
  subsequent runs reuse the conversation (the daemon's claude adapter handles `--resume`
  internally, so agent working memory carries across turns).
- **abort()** → `POST /api/runs/:id/cancel`.
- Mid-run SSE drop → reconnect `GET /api/runs/:id/events` with `Last-Event-ID`.

### 4. Trace-side plumbing

- `designSystemId` (and optional `skillIds`) are design-session settings: stored on the
  `SessionGroup` (settings JSON), passed through the run command payload into
  `RunOptions`. UI: a design-system picker in the design shell (the 153 shipped systems;
  org-custom `DESIGN.md` lands in the daemon's user `design-systems/` dir later).
- Everything downstream is untouched: bridge forwards `ToolOutput` as today, events flow
  through the service layer, the message list renders the same blocks.

### 5. Spike checklist (validates the risky bits first)

1. Build the image layer; boot daemon headless on a Fly machine; hit `/api/projects`.
2. Import a scratch git worktree via `/api/import/folder`; run `POST /api/chat` with a
   scaffold prompt; confirm files land in the worktree and `git status` sees them
   (checkpoint flow unaffected).
3. Record the SSE stream to a fixture; write the adapter's parser against it → this
   fixture becomes the **contract test** that gates future OD version bumps.
4. Confirm the dev server the agent starts is caught by port detection while 7456 is
   excluded; preview renders.
5. Multi-turn: second `POST /api/chat` on the same conversation; confirm resume.

## What we deliberately don't bring

Web UI / Electron shell (Trace's UI is authoritative), SQLite project store as truth
(ephemeral cache only), exports (need desktop Chromium), media generation, marketplace/
connectors/automations. Also **not** using `od mcp` as the primary path: in MCP mode our
agent would call `start_run` and the daemon would spawn a *second* agent — a recursive
shape with two prompts fighting. Direct HTTP driving keeps one agent, harness-composed.

## Risks

- **0.x API drift** — pinned tag + recorded-SSE contract test; upgrades are explicit PRs.
- **Node 24 requirement** — runtime image must ship Node 24 for the daemon even if other
  tooling targets an older Node.
- **`bypassPermissions` on the spawned claude** — acceptable only because design sessions
  are cloud-only on disposable machines; this is another reason the local variant stays
  out of scope.
- **Daemon boot adds to session cold-start** — start it in parallel with worktree setup;
  it's an Express boot, not a heavy service.
